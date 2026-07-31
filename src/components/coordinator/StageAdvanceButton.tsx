"use client";

import { useState } from "react";
import { transitionCaseStatusAction } from "@/app/actions/coordinator";

interface StageAdvanceButtonProps {
  caseId: string;
  toStatus: string;
  label: string;
  reason: string;
  gateSatisfied: boolean;
  missingTitles: string[];
  colorClass?: string;
}

export default function StageAdvanceButton({
  caseId,
  toStatus,
  label,
  reason,
  gateSatisfied,
  missingTitles,
  colorClass = "bg-blue-600 hover:bg-blue-700",
}: StageAdvanceButtonProps) {
  const [forceOpen, setForceOpen] = useState(false);
  const [forceReason, setForceReason] = useState("");

  if (gateSatisfied) {
    return (
      <form action={transitionCaseStatusAction} className="space-y-3">
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="toStatus" value={toStatus} />
        <input type="hidden" name="reason" value={reason} />
        <button
          type="submit"
          className={`w-full py-2 px-4 ${colorClass} text-white font-bold rounded-xl transition duration-150 shadow text-xs cursor-pointer text-center block`}
        >
          {label}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[10px] text-amber-700">
        <p className="font-bold mb-1">Faltan instrumentos por validar en esta etapa:</p>
        <ul className="list-disc list-inside">
          {missingTitles.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      {!forceOpen ? (
        <button
          type="button"
          onClick={() => setForceOpen(true)}
          className="w-full py-2 px-4 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl text-xs cursor-pointer text-center"
        >
          Forzar avance de etapa
        </button>
      ) : (
        <form action={transitionCaseStatusAction} className="space-y-2">
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="toStatus" value={toStatus} />
          <input type="hidden" name="forceAdvance" value="on" />
          <textarea
            name="reason"
            required
            value={forceReason}
            onChange={(e) => setForceReason(e.target.value)}
            rows={2}
            placeholder="Motivo obligatorio para forzar el avance..."
            className="w-full p-2 bg-white border border-amber-300 rounded-lg outline-none text-[11px] resize-none"
          />
          <button
            type="submit"
            disabled={!forceReason.trim()}
            className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs cursor-pointer text-center"
          >
            ⚠️ Confirmar avance forzado
          </button>
        </form>
      )}
    </div>
  );
}
