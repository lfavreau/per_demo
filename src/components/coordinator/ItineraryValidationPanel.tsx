"use client";

import { useState, useTransition } from "react";
import {
  validateItineraryStepAction,
  returnItineraryStepAction,
  markStepNotApplicableAction,
} from "@/app/actions/itinerary";
import { getStepByActivityKey } from "@/lib/instrument-itinerary";

export interface ItineraryStepStateView {
  activityKey: string;
  title: string;
  kind: "COMPLETED" | "CURRENT" | "UPCOMING";
  taskId?: string;
  status?: string;
  contentJson?: string | null;
  googleUrl?: string | null;
  submissionMode: "EXTERNAL_LINK" | "NATIVE_FORM";
  optional: boolean;
}

interface ItineraryValidationPanelProps {
  stageLabel: string;
  steps: ItineraryStepStateView[];
}

function renderContent(activityKey: string, contentJson?: string | null) {
  if (!contentJson) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return null;
  }
  const step = getStepByActivityKey(activityKey);

  if (Array.isArray(parsed.domains)) {
    return (
      <div className="space-y-1.5">
        {parsed.domains.map((d: any) => (
          <div key={d.recoveryDomainId} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="font-bold">{d.recoveryDomainId}</span> — Importancia: {d.importance || "—"}
            {d.needs && <div>Necesidades: {d.needs}</div>}
            {d.strengths && <div>Fortalezas: {d.strengths}</div>}
          </div>
        ))}
      </div>
    );
  }

  if (Array.isArray(parsed.goals)) {
    return (
      <div className="space-y-1.5">
        {parsed.goals.map((g: any, i: number) => (
          <div key={i} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="font-bold">{g.recoveryDomainId}</span>: {g.objective}
            {g.deadline && <span className="text-slate-400"> · plazo {g.deadline}</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {Object.entries(parsed).map(([key, value]) => {
        const label = step?.fields?.find((f) => f.key === key)?.label || key;
        if (!value) return null;
        return (
          <div key={key} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="font-bold block text-[9px] uppercase text-slate-400">{label}</span>
            <span className="whitespace-pre-wrap">{String(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ItineraryValidationPanel({ stageLabel, steps }: ItineraryValidationPanelProps) {
  const [feedbackByTask, setFeedbackByTask] = useState<Record<string, string>>({});
  const [notApplicableReasonByTask, setNotApplicableReasonByTask] = useState<Record<string, string>>({});
  const [showNotApplicableForm, setShowNotApplicableForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const completed = steps.filter((s) => s.kind === "COMPLETED");
  const current = steps.find((s) => s.kind === "CURRENT");
  const upcoming = steps.filter((s) => s.kind === "UPCOMING");

  const handleValidate = (taskId: string) => {
    startTransition(async () => {
      await validateItineraryStepAction(taskId);
    });
  };

  const handleReturn = (taskId: string) => {
    const feedback = feedbackByTask[taskId];
    if (!feedback?.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("taskId", taskId);
      formData.append("feedback", feedback);
      await returnItineraryStepAction(formData);
      setFeedbackByTask({ ...feedbackByTask, [taskId]: "" });
    });
  };

  const handleMarkNotApplicable = (taskId: string) => {
    const reason = notApplicableReasonByTask[taskId];
    if (!reason?.trim()) return;
    startTransition(async () => {
      await markStepNotApplicableAction(taskId, reason);
      setNotApplicableReasonByTask({ ...notApplicableReasonByTask, [taskId]: "" });
      setShowNotApplicableForm(false);
    });
  };

  return (
    <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
      <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
        Itinerario de Instrumentos — Etapa {stageLabel}
      </h4>

      {completed.length > 0 && (
        <div className="text-[10px] text-slate-400">
          ✔ {completed.length} instrumento(s) validado(s) en esta etapa.
        </div>
      )}

      {current ? (
        <div className="p-4 border border-blue-200 bg-blue-50/30 rounded-xl space-y-3 text-xs">
          <div className="flex justify-between items-center">
            <span className="font-bold text-slate-800">{current.title}</span>
            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-bold text-slate-500">
              {current.status}
            </span>
          </div>

          {current.status === "ENVIADA" ? (
            <>
              {current.submissionMode === "EXTERNAL_LINK" && current.googleUrl ? (
                <a
                  href={current.googleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline font-bold text-[11px]"
                >
                  Abrir enlace enviado ↗
                </a>
              ) : (
                renderContent(current.activityKey, current.contentJson)
              )}

              <div className="space-y-1.5 pt-2 border-t border-blue-100">
                <label className="block text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  Observaciones de Devolución
                </label>
                <textarea
                  value={feedbackByTask[current.taskId!] || ""}
                  onChange={(e) => setFeedbackByTask({ ...feedbackByTask, [current.taskId!]: e.target.value })}
                  placeholder="Motivo si vas a devolver..."
                  rows={2}
                  disabled={isPending}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none text-xs resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => handleReturn(current.taskId!)}
                  disabled={isPending || !feedbackByTask[current.taskId!]?.trim()}
                  className="px-3 py-1.5 text-red-700 font-bold rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-[11px] cursor-pointer"
                >
                  ❌ Devolver
                </button>
                <button
                  type="button"
                  onClick={() => handleValidate(current.taskId!)}
                  disabled={isPending}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                >
                  ✅ Validar
                </button>
              </div>
            </>
          ) : (
            <p className="text-[10px] text-slate-400">
              {current.status === "DEVUELTA"
                ? "Devuelto al PER, esperando reenvío."
                : "El PER aún no ha enviado este instrumento."}
            </p>
          )}

          <div className="pt-2 border-t border-blue-100">
            {showNotApplicableForm ? (
              <div className="space-y-1.5">
                <label className="block text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  Motivo (por qué no aplica para este caso)
                </label>
                <textarea
                  value={notApplicableReasonByTask[current.taskId!] || ""}
                  onChange={(e) =>
                    setNotApplicableReasonByTask({ ...notApplicableReasonByTask, [current.taskId!]: e.target.value })
                  }
                  placeholder="Ej. persona acompañada ya cubrió este contenido en el proceso anterior..."
                  rows={2}
                  disabled={isPending}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none text-xs resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setShowNotApplicableForm(false)}
                    disabled={isPending}
                    className="px-3 py-1.5 text-slate-500 font-bold rounded-lg text-[11px] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkNotApplicable(current.taskId!)}
                    disabled={isPending || !notApplicableReasonByTask[current.taskId!]?.trim()}
                    className="px-3 py-1.5 text-amber-800 font-bold rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-[11px] cursor-pointer"
                  >
                    Confirmar: Marcar como resuelto (No Aplica)
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNotApplicableForm(true)}
                disabled={isPending}
                className="text-[10px] text-slate-400 hover:text-amber-700 font-semibold underline decoration-dotted cursor-pointer"
              >
                Marcar como resuelto (no aplica)…
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-slate-400">No hay instrumentos pendientes de acción en esta etapa.</p>
      )}

      {upcoming.length > 0 && (
        <div className="text-[10px] text-slate-400">
          Próximos: {upcoming.map((s) => s.title).join(", ")}
        </div>
      )}
    </div>
  );
}
