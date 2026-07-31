"use client";

import React, { useState, useEffect } from "react";
import { submitItineraryStepAction, syncOfflineItineraryStepsAction } from "@/app/actions/itinerary";
import { RECOVERY_DOMAINS, type ItineraryFieldDef } from "@/lib/instrument-itinerary";

interface DomainRow {
  recoveryDomainId: string;
  needs: string;
  strengths: string;
  importance: "ALTO" | "MEDIO" | "BAJO";
}

interface GoalRow {
  recoveryDomainId: string;
  objective: string;
  resources: string;
  activities: string;
  deadline: string;
}

interface OfflineStep {
  id: string;
  taskId: string;
  title: string;
  fieldValues: Record<string, unknown>;
}

function emptyFlatValues(fields: ItineraryFieldDef[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) values[f.key] = "";
  return values;
}

function defaultDomainRows(): DomainRow[] {
  return RECOVERY_DOMAINS.map((d) => ({ recoveryDomainId: d, needs: "", strengths: "", importance: "MEDIO" }));
}

interface NativeInstrumentFormProps {
  taskId: string;
  caseId: string;
  title: string;
  contentTarget: "TASK_JSON" | "IAP_DOMAIN_MAP" | "IAP_GOAL" | null;
  fields: ItineraryFieldDef[];
  /** contentJson de un envío anterior (ej. tras DEVUELTA), para precargar el formulario. */
  existingContentJson?: string | null;
}

export default function NativeInstrumentForm({
  taskId,
  caseId,
  title,
  contentTarget,
  fields,
  existingContentJson,
}: NativeInstrumentFormProps) {
  const existing = existingContentJson ? safeParse(existingContentJson) : null;

  const [flatValues, setFlatValues] = useState<Record<string, string>>(
    contentTarget === "TASK_JSON" ? { ...emptyFlatValues(fields), ...(existing || {}) } : {}
  );
  const [domainRows, setDomainRows] = useState<DomainRow[]>(
    contentTarget === "IAP_DOMAIN_MAP" && Array.isArray(existing?.domains) ? existing.domains : defaultDomainRows()
  );
  const [goalRows, setGoalRows] = useState<GoalRow[]>(
    contentTarget === "IAP_GOAL" && Array.isArray(existing?.goals)
      ? existing.goals
      : [{ recoveryDomainId: RECOVERY_DOMAINS[0], objective: "", resources: "", activities: "", deadline: "" }]
  );

  const [isOnline, setIsOnline] = useState(true);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineStep[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const storageKey = `per_offline_itinerary_${caseId}`;

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
  }, [storageKey]);

  function buildFieldValues(): Record<string, unknown> {
    if (contentTarget === "IAP_DOMAIN_MAP") return { domains: domainRows };
    if (contentTarget === "IAP_GOAL") return { goals: goalRows };
    return flatValues;
  }

  function handleSaveDraft() {
    const draft: OfflineStep = {
      id: `draft_${Date.now()}`,
      taskId,
      title,
      fieldValues: buildFieldValues(),
    };
    const updated = [...offlineDrafts, draft];
    localStorage.setItem(storageKey, JSON.stringify(updated));
    setOfflineDrafts(updated);
    setMsg({ type: "success", text: "Borrador guardado localmente" });
  }

  async function handleSubmitOnline(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMsg(null);

    const res = await submitItineraryStepAction(taskId, buildFieldValues());
    setIsSubmitting(false);

    if (res.success) {
      setMsg({ type: "success", text: "Instrumento enviado a coordinación exitosamente" });
    } else {
      setMsg({ type: "error", text: res.error || "Error al enviar el instrumento" });
    }
  }

  async function handleSyncDrafts() {
    if (offlineDrafts.length === 0) return;
    setIsSubmitting(true);
    setMsg(null);

    const res = await syncOfflineItineraryStepsAction(offlineDrafts);
    setIsSubmitting(false);

    if (res && "error" in res && res.error) {
      setMsg({ type: "error", text: res.error });
      return;
    }
    if (res && res.success) {
      if (res.errors && res.errors.length > 0) {
        const failedIds = res.errors.map((e) => e.id);
        const remaining = offlineDrafts.filter((d) => failedIds.includes(d.id));
        localStorage.setItem(storageKey, JSON.stringify(remaining));
        setOfflineDrafts(remaining);
        setMsg({ type: "error", text: `Sincronizados ${res.syncedCount}. Fallaron ${res.errors.length}.` });
      } else {
        localStorage.removeItem(storageKey);
        setOfflineDrafts([]);
        setMsg({ type: "success", text: "Borradores sincronizados" });
      }
    }
  }

  return (
    <div className="space-y-4">
      {offlineDrafts.length > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="space-y-1">
            <h4 className="font-bold text-xs text-amber-500">Borradores Offline Pendientes</h4>
            <p className="text-[10px] text-slate-400">
              Tienes {offlineDrafts.length} borrador(es) de instrumentos guardados en este dispositivo.
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
          <h3 className="font-bold text-sm text-slate-800">▶ {title}</h3>
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
          {contentTarget === "TASK_JSON" && (
            <div className="space-y-3">
              {fields.map((field, idx) => {
                const showSectionHeading = field.section && field.section !== fields[idx - 1]?.section;
                return (
                  <React.Fragment key={field.key}>
                    {showSectionHeading && (
                      <h4 className="pt-2 first:pt-0 text-[11px] font-bold uppercase tracking-wide text-primary/80 border-b border-border/40 pb-1">
                        {field.section}
                      </h4>
                    )}
                    <div>
                      <label className="block text-slate-500 mb-1.5">{field.label}</label>
                      {field.type === "textarea" ? (
                        <textarea
                          value={flatValues[field.key] || ""}
                          onChange={(e) => setFlatValues({ ...flatValues, [field.key]: e.target.value })}
                          required={field.required}
                          rows={3}
                          className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none focus:border-primary"
                        />
                      ) : (
                        <input
                          type={field.type === "date" ? "date" : "text"}
                          value={flatValues[field.key] || ""}
                          onChange={(e) => setFlatValues({ ...flatValues, [field.key]: e.target.value })}
                          required={field.required}
                          className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
                        />
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {contentTarget === "IAP_DOMAIN_MAP" && (
            <div className="space-y-3 overflow-x-auto">
              <p className="text-[10px] text-slate-400">
                Completa necesidades, fortalezas e importancia para cada ámbito de recuperación.
              </p>
              {domainRows.map((row, i) => (
                <div key={row.recoveryDomainId} className="p-3 border border-border rounded-xl space-y-2">
                  <div className="font-bold text-slate-700">{row.recoveryDomainId}</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Necesidades"
                      value={row.needs}
                      onChange={(e) => {
                        const next = [...domainRows];
                        next[i] = { ...row, needs: e.target.value };
                        setDomainRows(next);
                      }}
                      className="p-2 bg-background border border-border rounded-lg outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Fortalezas"
                      value={row.strengths}
                      onChange={(e) => {
                        const next = [...domainRows];
                        next[i] = { ...row, strengths: e.target.value };
                        setDomainRows(next);
                      }}
                      className="p-2 bg-background border border-border rounded-lg outline-none"
                    />
                    <select
                      value={row.importance}
                      onChange={(e) => {
                        const next = [...domainRows];
                        next[i] = { ...row, importance: e.target.value as DomainRow["importance"] };
                        setDomainRows(next);
                      }}
                      className="p-2 bg-background border border-border rounded-lg outline-none"
                    >
                      <option value="ALTO">Importancia: Alto</option>
                      <option value="MEDIO">Importancia: Medio</option>
                      <option value="BAJO">Importancia: Bajo</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {contentTarget === "IAP_GOAL" && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-400">
                Agrega un objetivo por cada ámbito que se vaya a trabajar.
              </p>
              {goalRows.map((row, i) => (
                <div key={i} className="p-3 border border-border rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <select
                      value={row.recoveryDomainId}
                      onChange={(e) => {
                        const next = [...goalRows];
                        next[i] = { ...row, recoveryDomainId: e.target.value };
                        setGoalRows(next);
                      }}
                      className="p-2 bg-background border border-border rounded-lg outline-none font-bold"
                    >
                      {RECOVERY_DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    {goalRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setGoalRows(goalRows.filter((_, idx) => idx !== i))}
                        className="text-destructive text-[10px] font-bold cursor-pointer"
                      >
                        ✕ Quitar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Objetivo"
                    required
                    value={row.objective}
                    onChange={(e) => {
                      const next = [...goalRows];
                      next[i] = { ...row, objective: e.target.value };
                      setGoalRows(next);
                    }}
                    className="w-full p-2 bg-background border border-border rounded-lg outline-none"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Recursos"
                      value={row.resources}
                      onChange={(e) => {
                        const next = [...goalRows];
                        next[i] = { ...row, resources: e.target.value };
                        setGoalRows(next);
                      }}
                      className="p-2 bg-background border border-border rounded-lg outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Actividades"
                      value={row.activities}
                      onChange={(e) => {
                        const next = [...goalRows];
                        next[i] = { ...row, activities: e.target.value };
                        setGoalRows(next);
                      }}
                      className="p-2 bg-background border border-border rounded-lg outline-none"
                    />
                    <input
                      type="date"
                      value={row.deadline}
                      onChange={(e) => {
                        const next = [...goalRows];
                        next[i] = { ...row, deadline: e.target.value };
                        setGoalRows(next);
                      }}
                      className="p-2 bg-background border border-border rounded-lg outline-none"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setGoalRows([
                    ...goalRows,
                    { recoveryDomainId: RECOVERY_DOMAINS[0], objective: "", resources: "", activities: "", deadline: "" },
                  ])
                }
                className="text-primary text-[10px] font-bold cursor-pointer"
              >
                + Agregar objetivo
              </button>
            </div>
          )}

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

function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
