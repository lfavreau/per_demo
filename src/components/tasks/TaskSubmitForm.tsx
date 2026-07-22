"use client";

import React, { useState } from "react";
import { submitTaskAction } from "@/app/actions/per";

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  status: string;
  priority: string;
  googleUrl: string | null;
  paCase: { code: string } | null;
  feedbacks: Array<{ text: string; createdAt: Date }>;
}

interface TaskSubmitFormProps {
  tasks: TaskItem[];
}

export default function TaskSubmitForm({ tasks }: TaskSubmitFormProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ taskId: string; type: "success" | "error"; text: string } | null>(null);

  const handleUrlChange = (taskId: string, val: string) => {
    setUrls({ ...urls, [taskId]: val });
  };

  const handleSubmit = async (taskId: string) => {
    const url = urls[taskId];
    if (!url) {
      setMsg({ taskId, type: "error", text: "Por favor, ingresa el enlace de Google Drive" });
      return;
    }

    setSubmittingId(taskId);
    setMsg(null);

    const res = await submitTaskAction(taskId, url);
    setSubmittingId(null);

    if (res.success) {
      setMsg({ taskId, type: "success", text: "Tarea enviada para validación" });
      setUrls({ ...urls, [taskId]: "" });
    } else {
      setMsg({ taskId, type: "error", text: res.error || "Error al enviar tarea" });
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm text-slate-800">
        Agenda de Tareas y Pendientes
      </h3>

      <div className="space-y-4">
        {tasks.map((task) => {
          const isPending = ["PENDIENTE", "EN_CURSO", "DEVUELTA", "ATRASADA"].includes(task.status);
          const isReturned = task.status === "DEVUELTA";
          const isOverdue = task.status === "ATRASADA";

          return (
            <div
              key={task.id}
              className={`p-4 bg-card border rounded-2xl shadow-sm space-y-3 ${
                isReturned
                  ? "border-destructive/20 bg-destructive/[0.02]"
                  : isOverdue
                  ? "border-amber-500/20 bg-amber-500/[0.02]"
                  : "border-border"
              }`}
            >
              {/* Task Header */}
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-xs text-slate-800">
                      {task.title}
                    </h4>
                    {task.paCase && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-bold">
                        {task.paCase.code}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{task.description}</p>
                </div>
                
                {/* Badges */}
                <div className="flex gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                      task.priority === "CRITICA"
                        ? "bg-destructive/10 text-destructive animate-pulse"
                        : task.priority === "ALTA"
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-slate-100 text-slate-650"
                    }`}
                  >
                    Prioridad: {task.priority === "CRITICA" ? "Hito Obligatorio" : task.priority === "ALTA" ? "Alta" : "Media"}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                      task.status === "VALIDADA"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : task.status === "ENVIADA"
                        ? "bg-primary/10 text-primary"
                        : isReturned
                        ? "bg-destructive/10 text-destructive"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    Estado: {
                      task.status === "VALIDADA" ? "Validada" :
                      task.status === "ENVIADA" ? "Enviado a Revisión" :
                      task.status === "EN_REVISION" ? "En Revisión" :
                      task.status === "DEVUELTA" ? "Devuelta con Observaciones" :
                      task.status === "ATRASADA" ? "Atrasada" :
                      task.status === "PENDIENTE" ? "Pendiente" : task.status
                    }
                  </span>
                </div>
              </div>

              {/* Task Metadata */}
              <div className="flex gap-4 text-[10px] text-slate-400 pt-1">
                {task.dueDate && (
                  <div>
                    📅 Vence: <span className="font-semibold">{new Date(task.dueDate).toLocaleDateString("es-CL")}</span>
                  </div>
                )}
              </div>

              {/* Coordinator Feedback Thread */}
              {isReturned && task.feedbacks.length > 0 && (
                <div className="p-3 bg-destructive/[0.04] border border-destructive/10 rounded-xl space-y-1">
                  <span className="block text-[10px] font-bold text-destructive">
                    🔴 Observaciones de Coordinación:
                  </span>
                  <p className="text-[10px] text-slate-600 italic">
                    &quot;{task.feedbacks[task.feedbacks.length - 1].text}&quot;
                  </p>
                </div>
              )}

              {/* Action submission form */}
              {isPending && (
                <div className="space-y-2 pt-2 border-t border-border/30">
                  {msg?.taskId === task.id && (
                    <div
                      className={`p-2.5 rounded-lg text-[10px] font-semibold ${
                        msg.type === "success"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {msg.text}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      placeholder="Pegar enlace del documento de Google Drive..."
                      value={urls[task.id] || ""}
                      onChange={(e) => handleUrlChange(task.id, e.target.value)}
                      className="px-3 py-2 bg-background border border-border rounded-xl text-xs flex-1 outline-none focus:border-primary"
                    />
                    <button
                      onClick={() => handleSubmit(task.id)}
                      disabled={submittingId === task.id}
                      className="py-2 px-4 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/95 transition cursor-pointer text-center"
                    >
                      {submittingId === task.id ? "Enviando..." : "Enviar a Revisión"}
                    </button>
                  </div>
                </div>
              )}

              {/* If already submitted, display evidence url */}
              {!isPending && task.googleUrl && (
                <div className="pt-2 border-t border-border/30 text-[10px]">
                  <a
                    href={task.googleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:underline flex items-center gap-1.5"
                  >
                    📂 Ver Enlace Enviado
                  </a>
                </div>
              )}
            </div>
          );
        })}

        {tasks.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">
            🎉 No tienes tareas pendientes. ¡Todo al día!
          </p>
        )}
      </div>
    </div>
  );
}
