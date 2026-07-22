"use client";

import React, { useState, useTransition } from "react";
import { validateSessionAction, returnSessionAction } from "@/app/actions/coordinator";
import { mapEmotionToLabel } from "@/lib/nomenclatures";

interface SessionLog {
  id: string;
  paCaseId: string;
  paCase: {
    code: string;
  };
  sessionNumber: number;
  date: Date | string;
  modality: string;
  durationMinutes: number | null;
  recoveryDomainId: string | null;
  summary: string;
  agreements: string | null;
  difficulties: string | null;
  nextAction: string | null;
  perEmotion: string | null;
  attendance: string;
  perReflection: string | null;
}

interface SessionValidationQueueProps {
  pendingSessions: SessionLog[];
}

export default function SessionValidationQueue({ pendingSessions }: SessionValidationQueueProps) {
  const [selectedSession, setSelectedSession] = useState<SessionLog | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleApprove = (sessionId: string) => {
    startTransition(async () => {
      await validateSessionAction(sessionId);
      setSelectedSession(null);
    });
  };

  const handleReturn = (sessionId: string) => {
    if (!feedback.trim()) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("feedback", feedback);
      await returnSessionAction(formData);
      setSelectedSession(null);
      setFeedback("");
    });
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
        <h4 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
          Bitácoras Pendientes de Revisión ({pendingSessions.length})
        </h4>

        {/* Preview Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pendingSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => {
                setSelectedSession(session);
                setFeedback("");
              }}
              className="p-4 border border-slate-200 bg-slate-50 rounded-xl space-y-3 text-xs flex flex-col justify-between hover:border-blue-400 hover:shadow-md hover:bg-blue-50/5 cursor-pointer transition duration-200"
            >
              <div className="space-y-2">
                <div className="flex justify-between border-b border-slate-200 pb-2 font-semibold flex-wrap gap-2">
                  <span className="text-blue-700">{session.paCase.code}</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 text-[10px]">
                      {mapEmotionToLabel(session.perEmotion || "BIEN")}
                    </span>
                    <span className="text-slate-500">Sesión #{session.sessionNumber}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-700 font-medium line-clamp-2">
                    <span className="font-bold text-slate-500">Resumen:</span> {session.summary}
                  </p>
                  {session.agreements && (
                    <p className="text-slate-500 line-clamp-1">
                      <span className="font-bold">Acuerdos:</span> {session.agreements}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-200/50 mt-1">
                <span>📅 {new Date(session.date).toLocaleDateString("es-CL")}</span>
                <span className="font-semibold text-blue-600 hover:underline">Ver detalle y responder 🔍</span>
              </div>
            </div>
          ))}

          {pendingSessions.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-400">
              No hay bitácoras pendientes de validación en tu región. ¡Buen trabajo!
            </div>
          )}
        </div>
      </div>

      {/* Modal Dialog */}
      {selectedSession && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div 
            className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[90vh] animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <span>📝</span> Bitácora del Caso: <span className="text-blue-700">{selectedSession.paCase.code}</span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Revisión metodológica del encuentro de acompañamiento
                </p>
              </div>
              <button 
                onClick={() => setSelectedSession(null)}
                className="p-1 px-2.5 rounded-lg bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable content) */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700">
              {/* Technical Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200/60">
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Número de Sesión</span>
                  <span className="font-bold text-slate-800 text-xs">Sesión #{selectedSession.sessionNumber}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Fecha de Sesión</span>
                  <span className="font-semibold text-slate-800 text-xs">
                    {new Date(selectedSession.date).toLocaleDateString("es-CL")}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Asistencia</span>
                  <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded border inline-block ${
                    selectedSession.attendance === "REALIZADA"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-rose-50 text-rose-800 border-rose-200"
                  }`}>
                    {selectedSession.attendance}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Modalidad</span>
                  <span className="font-semibold text-slate-800 text-xs">{selectedSession.modality}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Ámbito Trabajado (IAP)</span>
                  <span className="font-semibold text-slate-800 text-xs">{selectedSession.recoveryDomainId || "No especificado"}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Duración</span>
                  <span className="font-semibold text-slate-800 text-xs">{selectedSession.durationMinutes || 0} minutos</span>
                </div>
                <div className="col-span-full border-t border-slate-200 pt-2 mt-1">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Registro Emocional (PER)</span>
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold inline-block text-xs">
                    {mapEmotionToLabel(selectedSession.perEmotion || "BIEN")}
                  </span>
                </div>
              </div>

              {/* Detailed Summary Field */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-900 block border-b pb-0.5">Resumen de la Sesión</span>
                <p className="leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap text-slate-800">
                  {selectedSession.summary}
                </p>
              </div>

              {/* Agreements Field */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-900 block border-b pb-0.5">Acuerdos del Encuentro</span>
                <p className="leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap text-slate-800">
                  {selectedSession.agreements || "No se registraron acuerdos específicos."}
                </p>
              </div>

              {/* Difficulties Field */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-900 block border-b pb-0.5">Dificultades y Retos</span>
                <p className="leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap text-slate-800">
                  {selectedSession.difficulties || "No se reportaron dificultades específicas."}
                </p>
              </div>

              {/* Next Actions Field */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-900 block border-b pb-0.5">Próximas Acciones</span>
                <p className="leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap text-slate-800">
                  {selectedSession.nextAction || "Sin acciones próximas planificadas."}
                </p>
              </div>

              {/* PER Reflection Field */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-900 block border-b pb-0.5">Reflexión Personal del PER</span>
                <p className="leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap italic text-slate-800">
                  {selectedSession.perReflection || "Sin reflexión registrada."}
                </p>
              </div>
            </div>

            {/* Modal Footer / Review Controls */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl space-y-4">
              {/* Feedback Input Field */}
              <div className="space-y-1.5">
                <label className="block text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                  Observaciones de Devolución
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Escribe el motivo del rechazo u observaciones específicas si vas a Devolver..."
                  rows={2}
                  disabled={isPending}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl outline-none text-xs resize-none focus:border-red-400"
                ></textarea>
              </div>

              {/* Buttons Action Group */}
              <div className="flex flex-col sm:flex-row gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  disabled={isPending}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition text-xs cursor-pointer text-center"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => handleReturn(selectedSession.id)}
                  disabled={isPending || !feedback.trim()}
                  className={`w-full sm:w-auto px-4 py-2 text-red-700 font-bold rounded-xl border border-red-300 transition text-xs text-center ${
                    feedback.trim() 
                      ? "bg-red-50 hover:bg-red-100 cursor-pointer" 
                      : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60"
                  }`}
                  title={feedback.trim() ? "Devolver al PER" : "Escribe una observación primero"}
                >
                  {isPending ? "Procesando..." : "❌ Devolver"}
                </button>

                <button
                  type="button"
                  onClick={() => handleApprove(selectedSession.id)}
                  disabled={isPending}
                  className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center shadow-md shadow-blue-500/10"
                >
                  {isPending ? "Aprobando..." : "✅ Aprobar y Validar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
