"use client";

import React, { useState, useEffect } from "react";
import { logSessionAction, syncOfflineSessionsAction } from "@/app/actions/per";

interface SessionLogFormProps {
  cases: Array<{ id: string; code: string }>;
  domains: string[];
}

interface OfflineSession {
  id: string;
  paCaseId: string;
  paCaseCode: string;
  date: string;
  modality: string;
  durationMinutes: number;
  recoveryDomainId: string;
  summary: string;
  agreements: string;
  difficulties: string;
  nextAction: string;
  perEmotion: string;
  perReflection: string;
  attendance: string;
}

export default function SessionLogForm({ cases, domains }: SessionLogFormProps) {
  const [formData, setFormData] = useState({
    paCaseId: "",
    date: new Date().toISOString().split("T")[0],
    modality: "PRESENCIAL",
    durationMinutes: 60,
    recoveryDomainId: "Apoyo social",
    summary: "",
    agreements: "",
    difficulties: "",
    nextAction: "",
    perEmotion: "BIEN",
    perReflection: "",
    attendance: "REALIZADA",
  });

  const [isOnline, setIsOnline] = useState(true);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineSession[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Monitor network status and load local drafts
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      // Load drafts
      const stored = localStorage.getItem("per_offline_sessions");
      if (stored) {
        setOfflineDrafts(JSON.parse(stored));
      }

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSaveDraft = () => {
    if (!formData.paCaseId) {
      setMsg({ type: "error", text: "Por favor selecciona un caso antes de guardar borrador" });
      return;
    }

    const selectedCase = cases.find((c) => c.id === formData.paCaseId);
    const draft: OfflineSession = {
      ...formData,
      id: `draft_${Date.now()}`,
      paCaseCode: selectedCase?.code || "PA-GEN",
    };

    const updated = [...offlineDrafts, draft];
    localStorage.setItem("per_offline_sessions", JSON.stringify(updated));
    setOfflineDrafts(updated);

    setFormData({
      paCaseId: "",
      date: new Date().toISOString().split("T")[0],
      modality: "PRESENCIAL",
      durationMinutes: 60,
      recoveryDomainId: "Apoyo social",
      summary: "",
      agreements: "",
      difficulties: "",
      nextAction: "",
      perEmotion: "BIEN",
      perReflection: "",
      attendance: "REALIZADA",
    });

    setMsg({ type: "success", text: "Borrador de bitácora guardado localmente" });
  };

  const handleSubmitOnline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.paCaseId) {
      setMsg({ type: "error", text: "Por favor selecciona un caso" });
      return;
    }

    setIsSubmitting(true);
    setMsg(null);

    const res = await logSessionAction({
      ...formData,
      status: "ENVIADA",
    });

    setIsSubmitting(false);

    if (res.success) {
      setFormData({
        paCaseId: "",
        date: new Date().toISOString().split("T")[0],
        modality: "PRESENCIAL",
        durationMinutes: 60,
        recoveryDomainId: "Apoyo social",
        summary: "",
        agreements: "",
        difficulties: "",
        nextAction: "",
        perEmotion: "BIEN",
        perReflection: "",
        attendance: "REALIZADA",
      });
      setMsg({ type: "success", text: "Bitácora enviada a coordinación exitosamente" });
    } else {
      setMsg({ type: "error", text: res.error || "Error al enviar bitácora" });
    }
  };

  const handleSyncDrafts = async () => {
    if (offlineDrafts.length === 0) return;
    setIsSubmitting(true);
    setMsg(null);

    const res = await syncOfflineSessionsAction(offlineDrafts);
    setIsSubmitting(false);

    if (res && "error" in res && res.error) {
      setMsg({ type: "error", text: res.error });
    } else if (res && res.success) {
      if (res.errors && res.errors.length > 0) {
        // Keep failed drafts
        const failedIds = res.errors.map((e: any) => e.id);
        const remaining = offlineDrafts.filter((d) => failedIds.includes(d.id));
        localStorage.setItem("per_offline_sessions", JSON.stringify(remaining));
        setOfflineDrafts(remaining);
        setMsg({
          type: "error",
          text: `Sincronizados ${res.syncedCount} bitácoras. Fallaron ${res.errors.length} debido a errores.`,
        });
      } else {
        localStorage.removeItem("per_offline_sessions");
        setOfflineDrafts([]);
        setMsg({ type: "success", text: "Todos los borradores locales han sido sincronizados" });
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Offline drafts status banner */}
      {offlineDrafts.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-1">
            <h4 className="font-bold text-xs text-amber-500">Bitácoras Offline Pendientes</h4>
            <p className="text-[10px] text-slate-400">
              Tienes {offlineDrafts.length} borrador(es) guardado(s) localmente en este dispositivo.
            </p>
          </div>
          <button
            onClick={handleSyncDrafts}
            disabled={!isOnline || isSubmitting}
            className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            🔄 {isOnline ? "Sincronizar ahora" : "Requiere Conexión"}
          </button>
        </div>
      )}

      {/* Main Form Box */}
      <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-border/50 pb-3">
          <h3 className="font-bold text-sm text-slate-800">
            Nueva Bitácora (Registro IAP)
          </h3>
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
            
            {/* Case Selection */}
            <div>
              <label className="block text-slate-500 mb-1.5">Caso Acompañado</label>
              <select
                name="paCaseId"
                value={formData.paCaseId}
                onChange={handleChange}
                required
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
              >
                <option value="">-- Seleccionar --</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Selection */}
            <div>
              <label className="block text-slate-500 mb-1.5">Fecha de Sesión</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none"
              />
            </div>

            {/* Attendance Status */}
            <div>
              <label className="block text-slate-500 mb-1.5">Asistencia</label>
              <select
                name="attendance"
                value={formData.attendance}
                onChange={handleChange}
                required
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none"
              >
                <option value="REALIZADA">REALIZADA</option>
                <option value="NO_ASISTE_PA">PA No Asiste</option>
                <option value="NO_ASISTE_PER">PER No Asiste</option>
                <option value="REAGENDADA">Reagendada</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </div>

            {/* Modality */}
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

            {/* Recovery Domain */}
            <div>
              <label className="block text-slate-500 mb-1.5">Ámbito Trabajado (IAP)</label>
              <select
                name="recoveryDomainId"
                value={formData.recoveryDomainId}
                onChange={handleChange}
                required
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none"
              >
                {domains.map((dom) => (
                  <option key={dom} value={dom}>
                    {dom}
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-slate-500 mb-1.5">Duración (minutos)</label>
              <input
                type="number"
                name="durationMinutes"
                value={formData.durationMinutes}
                onChange={handleChange}
                min={1}
                required
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none"
              />
            </div>

          </div>

          {/* Session Emotion selector */}
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

          {/* Details & Summaries */}
          <div className="space-y-3">
            <div>
              <label className="block text-slate-500 mb-1.5">Resumen de la Sesión</label>
              <textarea
                name="summary"
                value={formData.summary}
                onChange={handleChange}
                required
                rows={3}
                placeholder="Principales temas conversados, avances, hitos..."
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none focus:border-primary"
              ></textarea>
            </div>

            <div>
              <label className="block text-slate-500 mb-1.5">Acuerdos del Encuentro</label>
              <textarea
                name="agreements"
                value={formData.agreements}
                onChange={handleChange}
                rows={2}
                placeholder="Compromisos adquiridos por la participante y el acompañante..."
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none"
              ></textarea>
            </div>

            <div>
              <label className="block text-slate-500 mb-1.5">Dificultades y Retos</label>
              <textarea
                name="difficulties"
                value={formData.difficulties}
                onChange={handleChange}
                rows={2}
                placeholder="Obstáculos de adherencia, salud, sociales..."
                className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none"
              ></textarea>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-500 mb-1.5">Próximas Acciones</label>
                <textarea
                  name="nextAction"
                  value={formData.nextAction}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Tareas concretas antes del siguiente encuentro..."
                  className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none"
                ></textarea>
              </div>

              <div>
                <label className="block text-slate-500 mb-1.5">Reflexión Personal del PER</label>
                <textarea
                  name="perReflection"
                  value={formData.perReflection}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Tus impresiones sobre el vínculo y avances..."
                  className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none"
                ></textarea>
              </div>
            </div>
          </div>

          {/* Form Actions */}
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
              {isSubmitting ? "Sincronizando..." : "Enviar a Coordinación"}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
