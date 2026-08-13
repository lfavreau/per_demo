"use client";

import { useState, useTransition } from "react";
import { validateItineraryStepAction, returnItineraryStepAction } from "@/app/actions/itinerary";
import { renderInstrumentContent } from "./renderInstrumentContent";

export interface PendingTaskView {
  id: string;
  title: string;
  description: string | null;
  contentJson: string | null;
  googleUrl: string | null;
  paCase: { code: string } | null;
  assignedTo: { name: string };
  instrument: { activityKey: string | null; submissionMode: string } | null;
}

interface TaskValidationQueueProps {
  pendingTasks: PendingTaskView[];
}

// Mismo patrón de tarjeta + modal que SessionValidationQueue: antes solo el Registro de
// Acompañamiento tenía vista de detalle antes de validar, el resto de hitos del itinerario
// (Primer Encuentro, Actividades 1-6, etc.) se aprobaban a ciegas desde esta bandeja.
export default function TaskValidationQueue({ pendingTasks }: TaskValidationQueueProps) {
  const [selectedTask, setSelectedTask] = useState<PendingTaskView | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleApprove = (taskId: string) => {
    startTransition(async () => {
      await validateItineraryStepAction(taskId);
      setSelectedTask(null);
    });
  };

  const handleReturn = (taskId: string) => {
    if (!feedback.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("taskId", taskId);
      formData.append("feedback", feedback);
      await returnItineraryStepAction(formData);
      setSelectedTask(null);
      setFeedback("");
    });
  };

  return (
    <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
      <h4 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
        Hitos y Entregables en Espera de Validación ({pendingTasks.length})
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pendingTasks.map((task) => (
          <div
            key={task.id}
            onClick={() => {
              setSelectedTask(task);
              setFeedback("");
            }}
            className="p-4 border border-slate-200 bg-slate-50 rounded-xl space-y-2 text-xs cursor-pointer hover:border-blue-400 hover:shadow-md transition duration-200"
          >
            <div className="flex justify-between items-start gap-2 flex-wrap">
              <span className="font-bold text-slate-800">{task.title}</span>
              {task.paCase && (
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold text-[9px] shrink-0">
                  {task.paCase.code}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400">
              Entregado por: <span className="font-semibold text-slate-600">{task.assignedTo.name}</span>
            </div>
            <div className="pt-1 flex justify-end">
              <span className="font-semibold text-blue-600 text-[10px]">Ver detalle y responder 🔍</span>
            </div>
          </div>
        ))}

        {pendingTasks.length === 0 && (
          <p className="col-span-full text-xs text-slate-400 py-4 text-center">
            No hay hitos pendientes de validación.
          </p>
        )}
      </div>

      {selectedTask && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[90vh] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>📝</span> {selectedTask.title}
                  {selectedTask.paCase && (
                    <span className="text-blue-700">— {selectedTask.paCase.code}</span>
                  )}
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Entregado por {selectedTask.assignedTo.name}
                </p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 px-2.5 rounded-lg bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 text-xs text-slate-700">
              {selectedTask.instrument?.submissionMode === "EXTERNAL_LINK" && selectedTask.googleUrl ? (
                <a
                  href={selectedTask.googleUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline font-bold text-[11px]"
                >
                  Abrir enlace enviado ↗
                </a>
              ) : selectedTask.instrument?.activityKey ? (
                renderInstrumentContent(selectedTask.instrument.activityKey, selectedTask.contentJson)
              ) : (
                <p className="text-slate-500">{selectedTask.description || "Sin descripción."}</p>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl space-y-4">
              <div className="space-y-1.5">
                <label className="block text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  Observaciones de Devolución
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Motivo si vas a devolver..."
                  rows={2}
                  disabled={isPending}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl outline-none text-xs resize-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition text-xs cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleReturn(selectedTask.id)}
                  disabled={isPending || !feedback.trim()}
                  className="w-full sm:w-auto px-4 py-2 text-red-700 font-bold rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition text-xs cursor-pointer text-center"
                >
                  ❌ Devolver
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(selectedTask.id)}
                  disabled={isPending}
                  className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center shadow-md shadow-blue-500/10"
                >
                  ✅ Aprobar y Validar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
