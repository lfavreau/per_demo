"use client";

import React, { useState, useEffect, useRef } from "react";
import { submitItineraryStepAction, syncOfflineItineraryStepsAction } from "@/app/actions/itinerary";
import { RECOVERY_DOMAINS, type ItineraryFieldDef } from "@/lib/instrument-itinerary";
import { MAX_PLAN_WEEK, REQUIRE_TEXT_FIELDS } from "@/lib/program-config";
import { PRIORITY_LEVELS, getPriority, priorityRank, type PriorityValue } from "@/lib/priority";

interface DomainRow {
  recoveryDomainId: string;
  needs: string;
  strengths: string;
  importance: PriorityValue;
}

interface GoalRow {
  /** Id del objetivo ya guardado; se conserva al editar para no duplicarlo ni soltar sus registros. */
  id?: string;
  recoveryDomainId: string;
  objective: string;
  resources: string;
  activities: string;
  /** Semana del acompañamiento (texto del campo numérico; vacío = sin semana). */
  targetWeek: string;
}

function emptyGoalRow(): GoalRow {
  return { recoveryDomainId: RECOVERY_DOMAINS[0], objective: "", resources: "", activities: "", targetWeek: "" };
}

function initialGoalRows(existing: any): GoalRow[] {
  if (!Array.isArray(existing?.goals) || existing.goals.length === 0) return [emptyGoalRow()];
  return existing.goals.map((g: any) => ({
    id: g.id,
    recoveryDomainId: g.recoveryDomainId,
    objective: g.objective ?? "",
    resources: g.resources ?? "",
    activities: g.activities ?? "",
    targetWeek: g.targetWeek != null ? String(g.targetWeek) : "",
  }));
}

/** Prioridad de un ámbito: tres opciones con color y texto (Alta roja, Media amarilla, Baja verde). */
function PriorityPicker({ value, onChange, name }: { value: PriorityValue; onChange: (v: PriorityValue) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={`Prioridad de ${name}`} className="flex gap-1.5">
      {PRIORITY_LEVELS.map((level) => {
        const active = value === level.value;
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(level.value)}
            className={`flex-1 px-2 py-2 rounded-lg border font-bold text-[11px] cursor-pointer transition ${
              active ? level.selected : level.chip
            }`}
          >
            Prioridad {level.label}
          </button>
        );
      })}
    </div>
  );
}

/** Elige el ámbito de un objetivo mostrando la prioridad de cada uno; los de prioridad alta van primero. */
function DomainChoice({
  value,
  priorities,
  onChange,
}: {
  value: string;
  priorities: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const ordered = [...RECOVERY_DOMAINS].sort((a, b) => priorityRank(priorities[a]) - priorityRank(priorities[b]));
  return (
    <div role="radiogroup" aria-label="Ámbito de recuperación" className="flex flex-wrap gap-1.5">
      {ordered.map((domain) => {
        const priority = getPriority(priorities[domain]);
        const active = value === domain;
        return (
          <button
            key={domain}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(domain)}
            title={priority ? `Prioridad ${priority.label}` : "Sin prioridad definida"}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition ${
              active ? "bg-slate-800 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${priority ? priority.dot : "bg-slate-300"}`} aria-hidden="true" />
            {domain}
            {priority && <span className="text-[9px] opacity-80">· {priority.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface OfflineStep {
  id: string;
  taskId: string;
  title: string;
  fieldValues: Record<string, unknown>;
}

/** Borrador de una actividad en este dispositivo: se restaura al volver a abrirla y se borra al enviarla. */
interface LocalDraft {
  fieldValues: Record<string, unknown>;
  savedAt: string;
}

function readDraft(key: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: LocalDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Almacenamiento lleno o bloqueado: el formulario sigue funcionando sin borrador.
  }
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
  /** Prioridad de cada ámbito según la Actividad 3; colorea el selector de ámbito de la Actividad 4. */
  domainPriorities?: Record<string, string>;
  /** Se llama poco después de un envío exitoso (por ejemplo para cerrar el modal en que se edita). */
  onSubmitted?: () => void;
  /** Texto del botón de envío (por defecto "Enviar a Coordinación"). */
  submitLabel?: string;
}

export default function NativeInstrumentForm({
  taskId,
  caseId,
  title,
  contentTarget,
  fields,
  existingContentJson,
  domainPriorities = {},
  onSubmitted,
  submitLabel = "Enviar a Coordinación",
}: NativeInstrumentFormProps) {
  const existing = existingContentJson ? safeParse(existingContentJson) : null;

  // Estado del formulario a partir de valores guardados (envío anterior o borrador local).
  function stateFromValues(values: any) {
    return {
      flat: contentTarget === "TASK_JSON" ? { ...emptyFlatValues(fields), ...(values || {}) } : ({} as Record<string, string>),
      domains: (contentTarget === "IAP_DOMAIN_MAP" && Array.isArray(values?.domains) ? values.domains : defaultDomainRows()) as DomainRow[],
      goals: contentTarget === "IAP_GOAL" ? initialGoalRows(values) : [emptyGoalRow()],
      date: typeof values?.date === "string" ? (values.date as string) : "",
    };
  }
  const initial = stateFromValues(existing);

  const [flatValues, setFlatValues] = useState<Record<string, string>>(initial.flat);
  const [domainRows, setDomainRows] = useState<DomainRow[]>(initial.domains);
  const [goalRows, setGoalRows] = useState<GoalRow[]>(initial.goals);
  const [mapDate, setMapDate] = useState<string>(initial.date);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  // Valores con que se abrió el formulario: el autoguardado solo actúa si algo cambió respecto de ellos.
  const baseline = useRef<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineStep[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const storageKey = `per_offline_itinerary_${caseId}`;
  const draftKey = `per_draft_${taskId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const stored = localStorage.getItem(storageKey);
    if (stored) setOfflineDrafts(JSON.parse(stored));

    // Si esta actividad tenía un borrador en el dispositivo, se restaura.
    const draft = readDraft(draftKey);
    if (draft) {
      const restored = stateFromValues(draft.fieldValues);
      setFlatValues(restored.flat);
      setDomainRows(restored.domains);
      setGoalRows(restored.goals);
      setMapDate(restored.date);
      setDraftSavedAt(draft.savedAt);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // Solo debe correr al abrir la actividad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, draftKey]);

  function buildFieldValues(): Record<string, unknown> {
    if (contentTarget === "IAP_DOMAIN_MAP") return { date: mapDate, domains: domainRows };
    if (contentTarget === "IAP_GOAL") {
      return { goals: goalRows.map((r) => ({ ...r, targetWeek: r.targetWeek === "" ? null : Number(r.targetWeek) })) };
    }
    return flatValues;
  }

  /** Guarda el borrador de esta actividad (uno por actividad; reemplaza al anterior). */
  function saveDraft(): string {
    const fieldValues = buildFieldValues();
    const previous = readDraft(draftKey);
    // Si el contenido es el mismo del borrador ya guardado (p. ej. recién restaurado), se conserva su hora.
    if (previous && JSON.stringify(previous.fieldValues) === JSON.stringify(fieldValues)) {
      setDraftSavedAt(previous.savedAt);
      return previous.savedAt;
    }
    const savedAt = new Date().toISOString();
    writeDraft(draftKey, { fieldValues, savedAt });
    setDraftSavedAt(savedAt);
    return savedAt;
  }

  // Autoguardado: tras unos instantes sin escribir se guarda solo, para que recargar no pierda nada.
  useEffect(() => {
    const current = JSON.stringify(buildFieldValues());
    if (baseline.current === null) baseline.current = current;
    if (current === baseline.current) return; // sin cambios: no se crea un borrador vacío
    autosaveTimer.current = setTimeout(saveDraft, 800);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatValues, domainRows, goalRows, mapDate]);

  function handleSaveDraft() {
    saveDraft();
    // Sin conexión, además queda en la cola para enviarse al volver (ver "Borradores guardados sin conexión").
    if (!isOnline) {
      const queued: OfflineStep = { id: `draft_${Date.now()}`, taskId, title, fieldValues: buildFieldValues() };
      const updated = [...offlineDrafts.filter((d) => d.taskId !== taskId), queued];
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setOfflineDrafts(updated);
      setMsg({ type: "success", text: "Sin conexión: el borrador quedó en el dispositivo y se podrá enviar al volver." });
      return;
    }
    setMsg({ type: "success", text: "Borrador guardado en este dispositivo. Se restaura si recargas o vuelves a abrir la actividad." });
  }

  function handleDiscardDraft() {
    writeDraft(draftKey, null);
    const fresh = stateFromValues(existing);
    setFlatValues(fresh.flat);
    setDomainRows(fresh.domains);
    setGoalRows(fresh.goals);
    setMapDate(fresh.date);
    setDraftSavedAt(null);
    setMsg({ type: "success", text: "Borrador descartado." });
  }

  async function handleSubmitOnline(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMsg(null);

    const res = await submitItineraryStepAction(taskId, buildFieldValues());
    setIsSubmitting(false);

    if (res.success) {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      writeDraft(draftKey, null);
      setDraftSavedAt(null);
      setMsg({ type: "success", text: "Instrumento enviado a coordinación exitosamente" });
      if (onSubmitted) setTimeout(onSubmitted, 900);
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
      for (const d of offlineDrafts) {
        if (!res.errors?.some((e) => e.id === d.id)) writeDraft(`per_draft_${d.taskId}`, null);
      }
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
            <h4 className="font-bold text-xs text-amber-500">Borradores guardados sin conexión</h4>
            <p className="text-[10px] text-slate-400">
              {offlineDrafts.length} borrador(es) guardado(s) sin conexión esperan ser enviados a coordinación.
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
        {draftSavedAt && (
          <div className="px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-[11px] flex flex-wrap items-center justify-between gap-2">
            <span>
              📝 Borrador guardado en este dispositivo ({new Date(draftSavedAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}). Aún no se envió a coordinación.
            </span>
            <button type="button" onClick={handleDiscardDraft} className="font-bold underline decoration-dotted cursor-pointer">
              Descartar borrador
            </button>
          </div>
        )}
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
                          required={field.required && REQUIRE_TEXT_FIELDS}
                          rows={3}
                          className="w-full p-2.5 bg-background border border-border rounded-xl outline-none resize-none focus:border-primary"
                        />
                      ) : (
                        <input
                          type={field.type === "date" ? "date" : "text"}
                          value={flatValues[field.key] || ""}
                          onChange={(e) => setFlatValues({ ...flatValues, [field.key]: e.target.value })}
                          required={field.required && (field.type === "date" || REQUIRE_TEXT_FIELDS)}
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
              <div>
                <label className="block text-slate-500 mb-1.5">Fecha</label>
                <input
                  type="date"
                  value={mapDate}
                  onChange={(e) => setMapDate(e.target.value)}
                  required
                  className="w-full sm:w-56 p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Completa necesidades, fortalezas y prioridad (Alta, Media o Baja) para cada ámbito de recuperación. La
                prioridad marca con color qué ámbitos conviene atender primero.
              </p>
              {domainRows.map((row, i) => (
                <div key={row.recoveryDomainId} className="p-3 border border-border rounded-xl space-y-2">
                  <div className="font-bold text-slate-700 flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getPriority(row.importance)?.dot ?? "bg-slate-300"}`} aria-hidden="true" />
                    {row.recoveryDomainId}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
                  </div>
                  <PriorityPicker
                    name={row.recoveryDomainId}
                    value={row.importance}
                    onChange={(importance) => {
                      const next = [...domainRows];
                      next[i] = { ...row, importance };
                      setDomainRows(next);
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {contentTarget === "IAP_GOAL" && (
            <div className="space-y-3">
              <p className="text-[10px] text-slate-400">
                Agrega un objetivo por cada ámbito que se vaya a trabajar. Los ámbitos llevan el color de la prioridad que
                se definió en la Actividad 3. En «Semana» indica en qué semana del acompañamiento se espera lograrlo.
              </p>
              {goalRows.map((row, i) => (
                <div key={i} className="p-3 border border-border rounded-xl space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <DomainChoice
                      value={row.recoveryDomainId}
                      priorities={domainPriorities}
                      onChange={(recoveryDomainId) => {
                        const next = [...goalRows];
                        next[i] = { ...row, recoveryDomainId };
                        setGoalRows(next);
                      }}
                    />
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
                    required={REQUIRE_TEXT_FIELDS}
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
                      type="number"
                      min={1}
                      max={MAX_PLAN_WEEK}
                      step={1}
                      inputMode="numeric"
                      placeholder="Semana del acompañamiento"
                      aria-label="Semana del acompañamiento"
                      value={row.targetWeek}
                      onChange={(e) => {
                        const next = [...goalRows];
                        next[i] = { ...row, targetWeek: e.target.value };
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
                  setGoalRows([...goalRows, emptyGoalRow()])
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
              💾 Guardar borrador
            </button>
            <button
              type="submit"
              disabled={!isOnline || isSubmitting}
              className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold shadow hover:bg-primary/95 disabled:bg-slate-800 disabled:text-slate-500 transition cursor-pointer"
            >
              {isSubmitting ? "Enviando..." : submitLabel}
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
