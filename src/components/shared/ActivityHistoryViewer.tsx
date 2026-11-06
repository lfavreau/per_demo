"use client";

import { useMemo, useState, useTransition } from "react";
import { reopenValidationAction, requestCorrectionAction } from "@/app/actions/itinerary";
import NativeInstrumentForm from "@/components/per/NativeInstrumentForm";
import { renderInstrumentContent } from "@/components/coordinator/renderInstrumentContent";
import { getStepByActivityKey } from "@/lib/instrument-itinerary";
import { mapStageToLabel } from "@/lib/nomenclatures";
import type { ActivityHistoryItem } from "@/server/services/itinerary.service";

const STATUS_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  ENVIADA: "En revisión",
  EN_REVISION: "En revisión",
  VALIDADA: "Validada",
  DEVUELTA: "Devuelta",
  NO_APLICA: "No aplica",
  CANCELADA: "Cancelada",
};

const STATUS_TONE: Record<string, string> = {
  VALIDADA: "bg-emerald-100 text-emerald-800",
  ENVIADA: "bg-blue-100 text-blue-800",
  EN_REVISION: "bg-blue-100 text-blue-800",
  DEVUELTA: "bg-rose-100 text-rose-800",
  PENDIENTE: "bg-slate-100 text-slate-600",
  EN_CURSO: "bg-slate-100 text-slate-600",
};

const ACTOR_LABEL: Record<string, string> = {
  PER: "PER",
  COORDINATOR: "Coordinación",
  ADMIN: "Administración",
  SISTEMA: "Sistema",
};

interface ActivityHistoryViewerProps {
  mode: "PER" | "COORD";
  caseId: string;
  items: ActivityHistoryItem[];
  /** Prioridad de cada ámbito (Actividad 3), para colorear el selector de ámbitos al editar la Actividad 4. */
  domainPriorities?: Record<string, string>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

/** Coordinación corrige una validación hecha por error: a revisión otra vez o pidiendo la edición al PER. */
function CorrectValidation({ item, onDone }: { item: ActivityHistoryItem; onDone: () => void }) {
  const [mode, setMode] = useState<"REVIEW" | "REQUEST_EDIT">("REVIEW");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3 text-xs">
      <p className="font-bold text-amber-900">¿Validaste esta actividad por error?</p>
      <div className="space-y-2">
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name={`mode-${item.taskId}`} checked={mode === "REVIEW"} onChange={() => setMode("REVIEW")} className="mt-0.5" />
          <span>
            <strong>Dejarla en revisión.</strong> Vuelve a «En revisión» para que decidas de nuevo (validar o devolver). El PER
            no recibe aviso.
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name={`mode-${item.taskId}`} checked={mode === "REQUEST_EDIT"} onChange={() => setMode("REQUEST_EDIT")} className="mt-0.5" />
          <span>
            <strong>Pedir al PER que la edite.</strong> Le aparece destacada en rosa antes de su actividad activa y recibe un aviso.
          </span>
        </label>
      </div>
      <div>
        <label className="block text-amber-900 mb-1 font-bold text-[10px] uppercase">Motivo (obligatorio)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          disabled={isPending}
          className="w-full p-2 bg-white border border-amber-300 rounded-lg outline-none resize-none"
        />
      </div>
      {result && (
        <p
          role="status"
          className={`px-3 py-2 rounded-lg border font-semibold ${
            result.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {result.message}
        </p>
      )}
      <p className="text-[10px] text-amber-800">
        Esto no deshace lo que la validación ya provocó (por ejemplo, un avance de etapa).
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={isPending || !reason.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await reopenValidationAction(item.taskId, mode, reason);
              setResult(res);
              if (res.ok) setTimeout(onDone, 900);
            })
          }
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold cursor-pointer"
        >
          {isPending ? "Guardando…" : mode === "REVIEW" ? "Dejar en revisión" : "Pedir edición al PER"}
        </button>
      </div>
    </div>
  );
}

/** Coordinación devuelve al PER una actividad ya enviada, con el texto de lo que falta corregir. */
function RequestCorrection({ item, onDone }: { item: ActivityHistoryItem; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3 text-xs">
      <p className="font-bold text-rose-900">Devolver al PER para corregir</p>
      <p className="text-rose-800 leading-relaxed">
        Escribe qué falta o qué hay que cambiar. El PER lo ve dentro de la actividad y recibe un aviso; al reenviarla vuelve a
        tu revisión.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        disabled={isPending}
        placeholder="Ej. Falta detallar las expectativas concretas y la fecha del encuentro."
        className="w-full p-2 bg-white border border-rose-300 rounded-lg outline-none resize-none"
      />
      {result && (
        <p
          role="status"
          className={`px-3 py-2 rounded-lg border font-semibold ${
            result.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {result.message}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={isPending || !reason.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await requestCorrectionAction(item.taskId, reason);
              setResult(res);
              if (res.ok) setTimeout(onDone, 900);
            })
          }
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold cursor-pointer"
        >
          {isPending ? "Enviando…" : "Devolver al PER"}
        </button>
      </div>
    </div>
  );
}

/**
 * Visor de historial de las actividades del caso: se elige la etapa y la actividad, y se abre en un modal con
 * su contenido y su historial de estados. El PER puede editar desde ahí; coordinación puede corregir una
 * validación hecha por error. Es el mismo componente para ambos roles.
 */
export default function ActivityHistoryViewer({ mode, caseId, items, domainPriorities = {} }: ActivityHistoryViewerProps) {
  const stages = useMemo(() => [...new Set(items.map((i) => i.stage))], [items]);
  const [stage, setStage] = useState<string>(stages[0] ?? "");
  const stageItems = items.filter((i) => i.stage === stage);
  const [taskId, setTaskId] = useState<string>("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const selectedId = stageItems.some((i) => i.taskId === taskId) ? taskId : (stageItems[0]?.taskId ?? "");
  const open = items.find((i) => i.taskId === openTaskId) ?? null;

  function close() {
    setOpenTaskId(null);
    setEditing(false);
  }

  if (items.length === 0) {
    return (
      <div className="p-4 bg-card border border-border rounded-2xl shadow-sm text-xs text-slate-400">
        Aún no hay actividades en el historial de este caso.
      </div>
    );
  }

  const step = open ? getStepByActivityKey(open.activityKey) : undefined;
  const perCanEdit =
    mode === "PER" && !!open && open.submissionMode === "NATIVE_FORM" && ["ENVIADA", "VALIDADA", "DEVUELTA"].includes(open.status);

  return (
    <div className="p-5 bg-card border border-border rounded-2xl shadow-sm space-y-3 text-xs">
      <div>
        <h3 className="font-bold text-sm text-slate-800">📚 Historial del proceso</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Elige la etapa y la actividad para ver lo que se registró{mode === "PER" ? " y editarlo si hace falta" : ""}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
        <label className="block">
          <span className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Etapa</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {mapStageToLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Actividad</span>
          <select
            value={selectedId}
            onChange={(e) => setTaskId(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
          >
            {stageItems.map((i) => (
              <option key={i.taskId} value={i.taskId}>
                {i.title} — {STATUS_LABEL[i.status] ?? i.status}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedId}
          onClick={() => {
            setEditing(false);
            setOpenTaskId(selectedId);
          }}
          className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold cursor-pointer"
        >
          Cargar
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={close}
          onKeyDown={(e) => e.key === "Escape" && close()}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={open.title}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col text-slate-800"
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-start gap-3 bg-slate-50 sticky top-0">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">{open.title}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>Etapa {mapStageToLabel(open.stage)}</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${STATUS_TONE[open.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABEL[open.status] ?? open.status}
                  </span>
                  {open.reopened && <span className="px-2 py-0.5 rounded bg-pink-100 text-pink-800 font-bold">✏️ Reabierta</span>}
                </p>
              </div>
              <button type="button" onClick={close} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {editing && step ? (
                <>
                  <p className="px-3 py-2 rounded-xl bg-pink-50 border border-pink-200 text-pink-900 font-semibold">
                    {open.status === "VALIDADA"
                      ? "Esta actividad ya fue validada. Al guardar vuelve a revisión de coordinación."
                      : open.status === "ENVIADA"
                        ? "Esta actividad está en revisión. Al guardar, coordinación recibe un aviso con los cambios."
                        : "Corrige la actividad y envíala de nuevo."}
                  </p>
                  <NativeInstrumentForm
                    taskId={open.taskId}
                    caseId={caseId}
                    title={open.title}
                    contentTarget={step.contentTarget ?? "TASK_JSON"}
                    fields={step.fields ?? []}
                    existingContentJson={open.contentJson}
                    domainPriorities={domainPriorities}
                    submitLabel="Guardar cambios"
                    onSubmitted={close}
                  />
                </>
              ) : (
                <>
                  <div className="space-y-2 text-xs">
                    {open.submissionMode === "EXTERNAL_LINK" && open.googleUrl ? (
                      <a href={open.googleUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-bold">
                        Abrir enlace enviado ↗
                      </a>
                    ) : (
                      (renderInstrumentContent(open.activityKey, open.contentJson) ?? (
                        <p className="text-slate-400">Todavía no hay contenido enviado en esta actividad.</p>
                      ))
                    )}
                  </div>

                  {open.events.length > 0 && (
                    <div>
                      <h4 className="font-bold text-[10px] uppercase text-slate-500 mb-1.5">Historial de la actividad</h4>
                      <ol className="space-y-1.5 border-l-2 border-slate-200 pl-3">
                        {open.events.map((e, idx) => (
                          <li key={idx} className="text-[11px] leading-snug">
                            <span className="text-slate-400">{formatDate(e.at)}</span> ·{" "}
                            <span className="font-semibold">{ACTOR_LABEL[e.by] ?? e.by}</span>:{" "}
                            {STATUS_LABEL[e.fromStatus] ?? (e.fromStatus === "NONE" ? "Creada" : e.fromStatus)} →{" "}
                            <strong>{STATUS_LABEL[e.toStatus] ?? e.toStatus}</strong>
                            {e.note && <span className="block text-slate-600">«{e.note}»</span>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {mode === "PER" && (
                    <div className="flex justify-end">
                      {perCanEdit ? (
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold cursor-pointer"
                        >
                          ✏️ Editar esta actividad
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          {["PENDIENTE", "EN_CURSO"].includes(open.status)
                            ? "Es tu actividad activa: complétala en el formulario de arriba."
                            : "Esta actividad ya no admite cambios."}
                        </span>
                      )}
                    </div>
                  )}

                  {mode === "COORD" && open.status === "ENVIADA" && <RequestCorrection item={open} onDone={close} />}
                  {mode === "COORD" && open.status === "VALIDADA" && <CorrectValidation item={open} onDone={close} />}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
