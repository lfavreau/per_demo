"use client";

import React, { useState, useEffect } from "react";
import { logSessionAction, syncOfflineSessionsAction } from "@/app/actions/per";

interface GoalOption {
  id: string;
  objective: string;
  recoveryDomainId: string;
}

interface RegistroAcompanamientoFormProps {
  caseId: string;
  caseCode: string;
  domains: string[];
  goals: GoalOption[];
  nextSessionNumber: number;
}

interface OfflineRecord {
  id: string;
  paCaseId: string;
  paCaseCode: string;
  date: string;
  modality: string;
  recoveryDomainId: string;
  iapGoalId: string;
  summary: string;
  perEmotion: string;
  perReflection: string;
  attendance: string;
}

function initialFormData(domains: string[], goals: GoalOption[]) {
  return {
    date: new Date().toISOString().split("T")[0],
    modality: "PRESENCIAL",
    recoveryDomainId: domains[0] || "",
    iapGoalId: goals[0]?.id || "",
    summary: "",
    perEmotion: "BIEN",
    perReflection: "",
  };
}

export default function RegistroAcompanamientoForm({
  caseId,
  caseCode,
  domains,
  goals,
  nextSessionNumber,
}: RegistroAcompanamientoFormProps) {
  const [formData, setFormData] = useState(initialFormData(domains, goals));
  const [isOnline, setIsOnline] = useState(true);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const storageKey = "per_offline_sessions";

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const stored = localStorage.getItem(storageKey);
    if (stored) setOfflineDrafts(JSON.parse(stored));

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  function handleSaveDraft() {
    const draft: OfflineRecord = {
      ...formData,
      id: `draft_${Date.now()}`,
      paCaseId: caseId,
      paCaseCode: caseCode,
      attendance: "REALIZADA",
    };
    const updated = [...offlineDrafts, draft];
    localStorage.setItem(storageKey, JSON.stringify(updated));
    setOfflineDrafts(updated);
    setFormData(initialFormData(domains, goals));
    setMsg({ type: "success", text: "Borrador guardado localmente" });
  }

  async function handleSubmitOnline(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMsg(null);

    const res = await logSessionAction({
      paCaseId: caseId,
      date: formData.date,
      modality: formData.modality,
      recoveryDomainId: formData.recoveryDomainId || undefined,
      iapGoalId: formData.iapGoalId || undefined,
      summary: formData.summary,
      perEmotion: formData.perEmotion,
      perReflection: formData.perReflection,
      attendance: "REALIZADA",
      status: "ENVIADA",
    });

    setIsSubmitting(false);

    if (res.success) {
      setFormData(initialFormData(domains, goals));
      setMsg({ type: "success", text: "Registro enviado a coordinación exitosamente" });
    } else {
      setMsg({ type: "error", text: res.error || "Error al enviar el registro" });
    }
  }

  async function handleSyncDrafts() {
    if (offlineDrafts.length === 0) return;
    setIsSubmitting(true);
    setMsg(null);

    const res = await syncOfflineSessionsAction(offlineDrafts);
    setIsSubmitting(false);

    if (res && "error" in res && res.error) {
      setMsg({ type: "error", text: res.error });
      return;
    }
    if (res && res.success) {
      if (res.errors && res.errors.length > 0) {
        const failedIds = res.errors.map((e: any) => e.id);
        const remaining = offlineDrafts.filter((d) => failedIds.includes(d.id));
        localStorage.setItem(storageKey, JSON.stringify(remaining));
        setOfflineDrafts(remaining);
        setMsg({ type: "error", text: `Sincronizados ${res.syncedCount}. Fallaron ${res.errors.length}.` });
      } else {
        localStorage.removeItem(storageKey);
        setOfflineDrafts([]);
        setMsg({ type: "success", text: "Registros sincronizados" });
      }
    }
  }

  return (
    <div className="space-y-4">
      {offlineDrafts.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-1">
            <h4 className="font-bold text-xs text-amber-500">Registros Offline Pendientes</h4>
            <p className="text-[10px] text-slate-400">
              Tienes {offlineDrafts.length} registro(s) guardado(s) localmente en este dispositivo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSyncDrafts}
            disabled={!isOnline || isSubmitting}
            className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            🔄 {isOnline ? "Sincronizar ahora" : "Requiere Conexión"}
          </button>
        </div>
      )}

      <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-border/50 pb-3">
          <h3 className="font-bold text-sm text-slate-800">Registro de Acompañamiento · Sesión #{nextSessionNumber}</h3>
          <span
            className={`px-2 py-0.5 rounded text-[9px] font-bold ${
              isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
            }`}
          >
            {isOnline ? "CONECTADO" : "DESCONECTADO"}
          </span>
        </div>

        {msg && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold ${
              msg.type === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
            }`}
          >
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSubmitOnline} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-500 mb-1.5">Fecha</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1.5">Modalidad</label>
              <select
                name="modality"
                value={formData.modality}
                onChange={handleChange}
                required
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none"
              >
                <option value="PRESENCIAL">Presencial</option>
                <option value="TELEFONICA">Llamada Telefónica</option>
                <option value="VIDEOLLAMADA">Videollamada</option>
                <option value="MENSAJERIA">Mensajería</option>
                <option value="OTRA">Otra</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-500 mb-1.5">Ámbito de Recuperación</label>
              <select
                name="recoveryDomainId"
                value={formData.recoveryDomainId}
                onChange={handleChange}
                required
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none"
              >
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-500 mb-1.5">Objetivo</label>
              {goals.length > 0 ? (
                <select
                  name="iapGoalId"
                  value={formData.iapGoalId}
                  onChange={handleChange}
                  className="w-full p-2.5 bg-background border border-border rounded-xl outline-none"
                >
                  <option value="">-- Sin objetivo asociado --</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.objective}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[10px] text-slate-400 p-2.5 border border-dashed border-border rounded-xl">
                  Aún no hay objetivos definidos (Actividad 4).
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-slate-500 mb-2">Tu Registro Emocional (PER)</label>
            <div className="flex gap-2">
              {[
                { val: "BIEN", label: "😊 Bien", activeClass: "bg-emerald-600 border-emerald-600 text-white font-bold" },
                { val: "NEUTRO", label: "😐 Neutro", activeClass: "bg-slate-500 border-slate-500 text-white font-bold" },
                { val: "TRISTE", label: "😢 Triste", activeClass: "bg-blue-600 border-blue-600 text-white font-bold" },
                { val: "MOLESTO", label: "😠 Molesto", activeClass: "bg-rose-600 border-rose-600 text-white font-bold" },
              ].map((em) => (
                <button
                  key={em.val}
                  type="button"
                  onClick={() => setFormData({ ...formData, perEmotion: em.val })}
                  className={`flex-1 py-2.5 px-3 rounded-xl border text-center font-semibold transition cursor-pointer text-xs ${
                    formData.perEmotion === em.val
                      ? em.activeClass
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  {em.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-slate-500 mb-1.5">Descripción</label>
              <textarea
                name="summary"
                value={formData.summary}
                onChange={handleChange}
                required
                rows={3}
                placeholder="Principales temas conversados, avances, hitos..."
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1.5">Reflexión Personal</label>
              <textarea
                name="perReflection"
                value={formData.perReflection}
                onChange={handleChange}
                rows={2}
                placeholder="Tus impresiones sobre el vínculo y avances..."
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border/30">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="w-full sm:flex-1 py-3 px-4 rounded-xl border border-border hover:bg-secondary/40 font-semibold transition cursor-pointer text-center"
            >
              💾 Guardar Borrador Local
            </button>
            <button
              type="submit"
              disabled={!isOnline || isSubmitting}
              className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold shadow hover:bg-primary/95 disabled:bg-slate-800 disabled:text-slate-500 transition cursor-pointer"
            >
              {isSubmitting ? "Enviando..." : "Enviar a Coordinación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
