"use client";

import { useState, useTransition } from "react";
import {
  validateItineraryStepAction,
  returnItineraryStepAction,
  markStepNotApplicableAction,
  triggerIntermediateEvaluationAction,
} from "@/app/actions/itinerary";
import { getStepByActivityKey } from "@/lib/instrument-itinerary";
import { MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION } from "@/lib/program-config";

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
  caseId: string;
  stageLabel: string;
  steps: ItineraryStepStateView[];
  continuousStep?: { activityKey: string; title: string; validatedSessionLogCount?: number } | null;
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

export default function ItineraryValidationPanel({ caseId, stageLabel, steps, continuousStep }: ItineraryValidationPanelProps) {
  const [feedbackByTask, setFeedbackByTask] = useState<Record<string, string>>({});
  const [notApplicableReasonByTask, setNotApplicableReasonByTask] = useState<Record<string, string>>({});
  const [showNotApplicableForm, setShowNotApplicableForm] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  const completed = steps.filter((s) => s.kind === "COMPLETED");
  const current = steps.find((s) => s.kind === "CURRENT");
  const upcoming = steps.filter((s) => s.kind === "UPCOMING");
  const pendingIntermediateEval = upcoming.find((s) => s.activityKey === "ACTIVIDAD_5_INTERMEDIA");
  const validatedSessions = continuousStep?.validatedSessionLogCount ?? 0;

  const handleTriggerIntermediateEvaluation = () => {
    startTransition(async () => {
      await triggerIntermediateEvaluationAction(caseId);
    });
  };

  const handleValidate = (taskId: string) => {
    startTransition(async () => {
      await validateItineraryStepAction(taskId);
      setShowDetailModal(false);
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
      setShowDetailModal(false);
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
            <div
              onClick={() => setShowDetailModal(true)}
              className="p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-blue-400 hover:shadow-sm transition flex justify-between items-center"
            >
              <span className="text-[10px] text-slate-500">El PER envió este instrumento — revisá el detalle antes de validar.</span>
              <span className="font-semibold text-blue-600 text-[10px] whitespace-nowrap ml-3">Ver detalle 🔍</span>
            </div>
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

      {pendingIntermediateEval && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-[10px] text-slate-500">
          <p>
            Se habilita sola al validar {MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION} sesiones de Registro de
            Acompañamiento ({validatedSessions}/{MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION} validadas). Si a tu
            criterio ya corresponde antes, podés habilitarla ahora.
          </p>
          <button
            type="button"
            onClick={handleTriggerIntermediateEvaluation}
            disabled={isPending}
            className="px-3 py-1.5 text-slate-700 font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-[11px] cursor-pointer"
          >
            Habilitar Evaluación Intermedia ahora
          </button>
        </div>
      )}

      {showDetailModal && current && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[90vh] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>📝</span> {current.title}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Etapa {stageLabel}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1 px-2.5 rounded-lg bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 text-xs text-slate-700">
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
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl space-y-4">
              <div className="space-y-1.5">
                <label className="block text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  Observaciones de Devolución
                </label>
                <textarea
                  value={feedbackByTask[current.taskId!] || ""}
                  onChange={(e) => setFeedbackByTask({ ...feedbackByTask, [current.taskId!]: e.target.value })}
                  placeholder="Motivo si vas a devolver..."
                  rows={2}
                  disabled={isPending}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl outline-none text-xs resize-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setShowDetailModal(false)}
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition text-xs cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleReturn(current.taskId!)}
                  disabled={isPending || !feedbackByTask[current.taskId!]?.trim()}
                  className="w-full sm:w-auto px-4 py-2 text-red-700 font-bold rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition text-xs cursor-pointer text-center"
                >
                  ❌ Devolver
                </button>
                <button
                  type="button"
                  onClick={() => handleValidate(current.taskId!)}
                  disabled={isPending}
                  className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center shadow-md shadow-blue-500/10"
                >
                  ✅ Validar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
