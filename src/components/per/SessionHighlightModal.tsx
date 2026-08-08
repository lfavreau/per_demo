"use client";

import { useState } from "react";

interface SessionHighlightModalProps {
  sessionNumber: number;
  date: string;
  status: string;
  summary: string;
  feedbackText: string | null;
}

export default function SessionHighlightModal({
  sessionNumber,
  date,
  status,
  summary,
  feedbackText,
}: SessionHighlightModalProps) {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-3 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start gap-2 border-b pb-2">
          <div>
            <h4 className="font-extrabold text-slate-800 text-sm">Sesión #{sessionNumber}</h4>
            <span className="text-[10px] text-slate-400">{date}</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded font-bold text-[9px] ${
              status === "VALIDADA"
                ? "bg-emerald-100 text-emerald-800"
                : status === "DEVUELTA"
                  ? "bg-rose-100 text-rose-800"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {status}
          </span>
        </div>

        <p className="text-slate-600 leading-relaxed">{summary}</p>

        {feedbackText && (
          <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl">
            <p className="font-bold text-rose-700 text-[10px] mb-1">Observaciones del coordinador</p>
            <p className="text-slate-700 italic">&quot;{feedbackText}&quot;</p>
          </div>
        )}

        <p className="text-[9px] text-slate-400">
          Este registro no se encuentra en la etapa actual del acompañamiento, por lo que se muestra aquí en detalle.
        </p>

        <button
          onClick={() => setOpen(false)}
          className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
