"use client";

import { useState, useTransition } from "react";
import { editItineraryStepAsStaffAction, reopenValidationAction, requestCorrectionAction } from "@/app/actions/itinerary";
import NativeInstrumentForm from "@/components/per/NativeInstrumentForm";
import { renderInstrumentContent } from "@/components/coordinator/renderInstrumentContent";
import { getStepByActivityKey } from "@/lib/instrument-itinerary";
import { formatStageHeading } from "@/lib/nomenclatures";
import type { ActivityHistoryItem } from "@/server/services/itinerary.service";

export const STATUS_LABEL: Record<string, string> = {
  NONE: "Creada",
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  ENVIADA: "Enviada",
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function ResultNote({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`px-3 py-2 rounded-lg border font-semibold ${
        result.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
      }`}
    >
      {result.message}
    </p>
  );
}

/** Coordinación reenvía al PER una actividad ya validada (o la deja de nuevo en revisión), siempre con un motivo. */
function CorrectValidation({ item, onDone }: { item: ActivityHistoryItem; onDone: () => void }) {
  const [mode, setMode] = useState<"REVIEW" | "REQUEST_EDIT">("REQUEST_EDIT");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3 text-xs">
      <p className="font-bold text-amber-900">Reenviar al PER para edición</p>
      <div className="space-y-2">
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name={`mode-${item.taskId}`} checked={mode === "REQUEST_EDIT"} onChange={() => setMode("REQUEST_EDIT")} className="mt-0.5" />
          <span>
            <strong>Pedir al PER que la edite.</strong> Le aparece destacada en rosa antes de su actividad activa y recibe un aviso con tu texto.
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="radio" name={`mode-${item.taskId}`} checked={mode === "REVIEW"} onChange={() => setMode("REVIEW")} className="mt-0.5" />
          <span>
            <strong>Dejarla en revisión</strong> (validé por error). Vuelve a «En revisión» para que decidas de nuevo. El PER no recibe aviso.
          </span>
        </label>
      </div>
      <div>
        <label className="block text-amber-900 mb-1 font-bold text-[10px] uppercase">Motivo / qué falta (obligatorio)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          disabled={isPending}
          className="w-full p-2 bg-white border border-amber-300 rounded-lg outline-none resize-none"
        />
      </div>
      <ResultNote result={result} />
      <p className="text-[10px] text-amber-800">Esto no deshace lo que la validación ya provocó (por ejemplo, un avance de etapa).</p>
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
          {isPending ? "Guardando…" : mode === "REVIEW" ? "Dejar en revisión" : "Reenviar al PER para edición"}
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
      <p className="font-bold text-rose-900">Reenviar al PER para edición</p>
      <p className="text-rose-800 leading-relaxed">
        Escribe qué falta o qué hay que cambiar. El PER lo ve dentro de la actividad y recibe un aviso; al reenviarla vuelve a tu revisión.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        disabled={isPending}
        placeholder="Ej. Falta detallar las expectativas concretas y la fecha del encuentro."
        className="w-full p-2 bg-white border border-rose-300 rounded-lg outline-none resize-none"
      />
      <ResultNote result={result} />
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
          {isPending ? "Enviando…" : "Reenviar al PER para edición"}
        </button>
      </div>
    </div>
  );
}

interface ActivityModalProps {
  mode: "PER" | "COORD";
  caseId: string;
  item: ActivityHistoryItem;
  /** Abre directamente en edición (menú ⋮ → Editar) o solo en lectura (menú ⋮ → Ver). */
  startEditing?: boolean;
  /** Prioridad de cada ámbito (Actividad 3), para colorear el selector de ámbitos al editar la Actividad 4. */
  domainPriorities?: Record<string, string>;
  onClose: () => void;
}

/** ¿Se puede editar esta actividad desde este rol? Lo ya reformulado no se edita. */
export function canEditActivity(mode: "PER" | "COORD", item: ActivityHistoryItem): boolean {
  if (item.superseded) return false;
  if (mode === "PER" && item.submissionMode !== "NATIVE_FORM") return false;
  const statuses = mode === "PER" ? ["ENVIADA", "VALIDADA", "DEVUELTA"] : ["ENVIADA", "VALIDADA"];
  return statuses.includes(item.status);
}

/**
 * Modal de una actividad del itinerario: toda su información (contenido e historial de estados) o, al editar,
 * el formulario completo. El PER guarda sus cambios; coordinación guarda la edición (queda en revisión y el PER
 * recibe un aviso) o reenvía la actividad al PER con un texto.
 */
export default function ActivityModal({ mode, caseId, item, startEditing = false, domainPriorities = {}, onClose }: ActivityModalProps) {
  const [editing, setEditing] = useState(startEditing && canEditActivity(mode, item));
  const step = getStepByActivityKey(item.activityKey);
  const editable = canEditActivity(mode, item);
  const hasForm = item.submissionMode === "NATIVE_FORM" && !!step;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col text-slate-800"
      >
        <div className="p-5 border-b border-slate-200 flex justify-between items-start gap-3 bg-slate-50 sticky top-0 z-10">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">{item.title}</h3>
            <p className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
              <span>{formatStageHeading(item.stage)}</span>
              <span className={`px-2 py-0.5 rounded font-bold ${STATUS_TONE[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
              {item.reopened && <span className="px-2 py-0.5 rounded bg-pink-100 text-pink-800 font-bold">✏️ Reabierta</span>}
              {item.superseded && <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold">Reformulada</span>}
              <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-bold">{editing ? "Editando" : "Solo lectura"}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {editing ? (
            <>
              {hasForm && (
                <>
                  <p className="px-3 py-2 rounded-xl bg-pink-50 border border-pink-200 text-pink-900 font-semibold">
                    {mode === "COORD"
                      ? "Al guardar la edición, la actividad queda en revisión: tendrás que revalidarla y el PER recibe un aviso."
                      : item.status === "VALIDADA"
                        ? "Esta actividad ya fue validada. Al guardar vuelve a revisión de coordinación."
                        : item.status === "ENVIADA"
                          ? "Esta actividad está en revisión. Al guardar, coordinación recibe un aviso con los cambios."
                          : "Corrige la actividad y envíala de nuevo."}
                  </p>
                  <NativeInstrumentForm
                    taskId={item.taskId}
                    caseId={caseId}
                    title={item.title}
                    contentTarget={step!.contentTarget ?? "TASK_JSON"}
                    fields={step!.fields ?? []}
                    existingContentJson={item.contentJson}
                    domainPriorities={domainPriorities}
                    onSubmitted={onClose}
                    {...(mode === "COORD"
                      ? {
                          submitAction: editItineraryStepAsStaffAction,
                          submitLabel: "Guardar edición",
                          successMessage: "Edición guardada. La actividad quedó en revisión: revalídala desde el panel de validación.",
                          localDrafts: false,
                        }
                      : { submitLabel: "Guardar cambios" })}
                  />
                </>
              )}
              {mode === "COORD" && item.status === "ENVIADA" && <RequestCorrection item={item} onDone={onClose} />}
              {mode === "COORD" && item.status === "VALIDADA" && <CorrectValidation item={item} onDone={onClose} />}
            </>
          ) : (
            <>
              {item.superseded && (
                <p className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                  Esta planificación fue reformulada: la versión anterior ya no se edita y más adelante solo la verá administración.
                </p>
              )}
              <div className="space-y-2">
                {item.submissionMode === "EXTERNAL_LINK" && item.googleUrl ? (
                  <a href={item.googleUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-bold">
                    Abrir enlace enviado ↗
                  </a>
                ) : (
                  (renderInstrumentContent(item.activityKey, item.contentJson) ?? (
                    <p className="text-slate-400">Todavía no hay contenido enviado en esta actividad.</p>
                  ))
                )}
              </div>

              {item.events.length > 0 && (
                <div>
                  <h4 className="font-bold text-[10px] uppercase text-slate-500 mb-1.5">Historial de la actividad</h4>
                  <ol className="space-y-1.5 border-l-2 border-slate-200 pl-3">
                    {item.events.map((e, idx) => (
                      <li key={idx} className="text-[11px] leading-snug">
                        <span className="text-slate-400">{formatDate(e.at)}</span> · <span className="font-semibold">{ACTOR_LABEL[e.by] ?? e.by}</span>:{" "}
                        {STATUS_LABEL[e.fromStatus] ?? e.fromStatus} → <strong>{STATUS_LABEL[e.toStatus] ?? e.toStatus}</strong>
                        {e.note && <span className="block text-slate-600">«{e.note}»</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex justify-end items-center gap-3">
                {editable ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold cursor-pointer"
                  >
                    ✏️ Editar esta actividad
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">
                    {item.superseded
                      ? "Esta versión ya no admite cambios."
                      : ["PENDIENTE", "EN_CURSO"].includes(item.status)
                        ? mode === "PER"
                          ? "Es tu actividad activa: complétala en el formulario de arriba."
                          : "El PER aún no la ha enviado."
                        : mode === "COORD" && item.status === "DEVUELTA"
                          ? "Está devuelta: el PER la está corrigiendo."
                          : "Esta actividad ya no admite cambios."}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
