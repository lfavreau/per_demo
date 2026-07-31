"use client";

import { useState } from "react";
import { getStepByActivityKey } from "@/lib/instrument-itinerary";
import NativeInstrumentForm from "@/components/per/NativeInstrumentForm";
import ExternalLinkStepForm from "@/components/per/ExternalLinkStepForm";
import CompletedStepSummary from "@/components/per/CompletedStepSummary";

export interface ItineraryStepStateView {
  activityKey: string;
  title: string;
  kind: "COMPLETED" | "CURRENT" | "UPCOMING";
  taskId?: string;
  status?: string;
  contentJson?: string | null;
  submissionMode: "EXTERNAL_LINK" | "NATIVE_FORM";
  optional: boolean;
}

interface StageItineraryBoardProps {
  caseId: string;
  caseCode: string;
  stageLabel: string;
  metaLine: string;
  steps: ItineraryStepStateView[];
}

export default function StageItineraryBoard({ caseId, caseCode, stageLabel, metaLine, steps }: StageItineraryBoardProps) {
  const [showCompleted, setShowCompleted] = useState(false);

  const completed = steps.filter((s) => s.kind === "COMPLETED");
  const current = steps.find((s) => s.kind === "CURRENT");
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
            <NativeInstrumentForm
              taskId={current.taskId!}
              caseId={caseId}
              title={current.title}
              contentTarget={stepDef?.contentTarget ?? "TASK_JSON"}
              fields={stepDef?.fields ?? []}
              existingContentJson={current.status === "DEVUELTA" ? current.contentJson : null}
            />
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

      {!current && upcoming.length === 0 && completed.length > 0 && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-700 font-semibold text-center">
          🎉 Todos los instrumentos de esta etapa están completos. La coordinación revisará el avance de etapa.
        </div>
      )}
    </div>
  );
}
