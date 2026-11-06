"use client";

import { useState } from "react";
import { getStepByActivityKey } from "@/lib/instrument-itinerary";
import NativeInstrumentForm from "@/components/per/NativeInstrumentForm";
import ExternalLinkStepForm from "@/components/per/ExternalLinkStepForm";
import CompletedStepSummary from "@/components/per/CompletedStepSummary";
import ModalButton from "@/components/shared/ModalButton";

export interface ItineraryStepStateView {
  activityKey: string;
  title: string;
  kind: "COMPLETED" | "CURRENT" | "UPCOMING";
  taskId?: string;
  status?: string;
  contentJson?: string | null;
  submissionMode: "EXTERNAL_LINK" | "NATIVE_FORM";
  optional: boolean;
  /** Ya estuvo validada y se volvió a abrir: se muestra destacada antes de la actividad activa. */
  reopened?: boolean;
  returnNote?: string | null;
}

interface StageItineraryBoardProps {
  caseId: string;
  caseCode: string;
  stageLabel: string;
  metaLine: string;
  steps: ItineraryStepStateView[];
  domainPriorities?: Record<string, string>;
}

export default function StageItineraryBoard({
  caseId,
  caseCode,
  stageLabel,
  metaLine,
  steps,
  domainPriorities = {},
}: StageItineraryBoardProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const completed = steps.filter((s) => s.kind === "COMPLETED");
  // Las actividades reabiertas van aparte y primero: son ediciones que hay que atender para estar al día.
  const reopened = steps.filter((s) => s.kind === "CURRENT" && s.reopened);
  const current = steps.find((s) => s.kind === "CURRENT" && !s.reopened);
  const upcoming = steps.filter((s) => s.kind === "UPCOMING");

  return (
    <div className="space-y-4">
      <div className="p-5 bg-card border border-border rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-blue-700 text-sm">{caseCode}</span>
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">{stageLabel}</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">{metaLine}</p>
      </div>

      {completed.length > 0 && (
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm">
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="w-full flex justify-between items-center text-xs font-bold text-slate-700 cursor-pointer"
          >
            <span>✔ Completados de esta etapa ({completed.length})</span>
            <span className="text-slate-400">{showCompleted ? "▲" : "▼"}</span>
          </button>
          {showCompleted && (
            <div className="mt-3 space-y-2">
              {completed.map((s) => (
                <CompletedStepSummary key={s.activityKey} title={s.title} status={s.status || "VALIDADA"} contentJson={s.contentJson} />
              ))}
            </div>
          )}
        </div>
      )}

      {reopened.map((s) => {
        const stepDef = getStepByActivityKey(s.activityKey);
        if (s.status === "DEVUELTA") {
          return (
            <div key={s.activityKey} className="p-4 bg-pink-50 border-2 border-pink-300 rounded-2xl text-xs space-y-2">
              <p className="font-bold text-pink-900">✏️ Edición solicitada: {s.title}</p>
              {s.returnNote && <p className="text-pink-800 leading-relaxed">{s.returnNote}</p>}
              <p className="text-pink-700 text-[10px]">Atiéndela antes de seguir con tu actividad activa.</p>
              {s.submissionMode === "NATIVE_FORM" && (
                <ModalButton
                  label="✏️ Editar ahora"
                  title={s.title}
                  buttonClassName="py-2 px-4 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  <NativeInstrumentForm
                    taskId={s.taskId!}
                    caseId={caseId}
                    title={s.title}
                    contentTarget={stepDef?.contentTarget ?? "TASK_JSON"}
                    fields={stepDef?.fields ?? []}
                    existingContentJson={s.contentJson}
                    domainPriorities={domainPriorities}
                    submitLabel="Guardar cambios"
                  />
                </ModalButton>
              )}
            </div>
          );
        }
        return (
          <div key={s.activityKey} className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-700">
            <p className="font-bold">📤 {s.title}</p>
            <p className="mt-1">Editada y enviada de nuevo; coordinación la está revisando.</p>
          </div>
        );
      })}

      {current &&
        (() => {
          if (current.status === "ENVIADA") {
            return (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-700">
                <p className="font-bold">📤 {current.title}</p>
                <p className="mt-1">Enviado a coordinación, esperando validación.</p>
              </div>
            );
          }

          const stepDef = getStepByActivityKey(current.activityKey);
          if (current.submissionMode === "EXTERNAL_LINK") {
            return <ExternalLinkStepForm taskId={current.taskId!} title={current.title} />;
          }
          return (
            <div className="space-y-3">
              {current.status === "DEVUELTA" && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-1">
                  <p className="font-bold text-rose-900">↩️ Coordinación devolvió esta actividad para corregir</p>
                  {current.returnNote && <p className="text-rose-800 leading-relaxed whitespace-pre-wrap">{current.returnNote}</p>}
                </div>
              )}
              <NativeInstrumentForm
                taskId={current.taskId!}
                caseId={caseId}
                title={current.title}
                contentTarget={stepDef?.contentTarget ?? "TASK_JSON"}
                fields={stepDef?.fields ?? []}
                existingContentJson={current.status === "DEVUELTA" ? current.contentJson : null}
                domainPriorities={domainPriorities}
              />
            </div>
          );
        })()}

      {upcoming.length > 0 && (
        <div className="p-4 bg-card border border-border rounded-2xl shadow-sm">
          <h4 className="text-xs font-bold text-slate-500 mb-2">Próximos en esta etapa ({upcoming.length})</h4>
          <ul className="space-y-1.5 text-xs text-slate-400">
            {upcoming.map((s) => (
              <li key={s.activityKey} className="flex items-center gap-1.5">
                <span>•</span>
                <span>
                  {s.title}
                  {s.optional && <span className="text-slate-300"> (si aplica)</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!current && reopened.length === 0 && upcoming.length === 0 && completed.length > 0 && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-700 font-semibold text-center">
          🎉 Todos los instrumentos de esta etapa están completos. La coordinación revisará el avance de etapa.
        </div>
      )}
    </div>
  );
}
