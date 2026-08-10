"use client";

import { useState, useTransition } from "react";
import { ensureWithdrawalStepAction, transitionCaseStatusAction } from "@/app/actions/coordinator";
import { validateItineraryStepAction, returnItineraryStepAction } from "@/app/actions/itinerary";
import { getStepByActivityKey } from "@/lib/instrument-itinerary";

interface WithdrawalStepView {
  activityKey: string;
  taskId: string;
  title: string;
  status: string;
  contentJson?: string | null;
}

interface WithdrawalGateProps {
  caseId: string;
  withdrawalStep: WithdrawalStepView | null;
}

export default function WithdrawalGate({ caseId, withdrawalStep }: WithdrawalGateProps) {
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toStatus, setToStatus] = useState("RETIRO_VOLUNTARIO");

  if (!withdrawalStep) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] text-slate-500">
          Antes de registrar el retiro se debe completar el Formulario de Abandono — Persona Acompañada.
        </p>
        <button
          type="button"
          onClick={() => startTransition(() => ensureWithdrawalStepAction(caseId))}
          disabled={isPending}
          className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-[11px] cursor-pointer text-center"
        >
          {isPending ? "Iniciando..." : "📋 Iniciar Formulario de Abandono"}
        </button>
      </div>
    );
  }

  if (withdrawalStep.status !== "VALIDADA") {
    const step = getStepByActivityKey(withdrawalStep.activityKey);
    let parsed: Record<string, unknown> | null = null;
    if (withdrawalStep.contentJson) {
      try {
        parsed = JSON.parse(withdrawalStep.contentJson);
      } catch {
        parsed = null;
      }
    }

    return (
      <div className="space-y-2 text-[11px]">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="font-bold text-amber-700">{withdrawalStep.title}</p>
          <p className="text-amber-600 mt-0.5">Estado: {withdrawalStep.status}</p>
        </div>

        {withdrawalStep.status === "ENVIADA" && parsed && (
          <div className="space-y-1.5">
            {Object.entries(parsed).map(([key, value]) => {
              if (!value) return null;
              const label = step?.fields?.find((f) => f.key === key)?.label || key;
              return (
                <div key={key} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold block text-[9px] uppercase text-slate-400">{label}</span>
                  <span className="whitespace-pre-wrap">{String(value)}</span>
                </div>
              );
            })}
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Motivo si vas a devolver..."
              rows={2}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                disabled={isPending || !feedback.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const fd = new FormData();
                    fd.append("taskId", withdrawalStep.taskId);
                    fd.append("feedback", feedback);
                    await returnItineraryStepAction(fd);
                    setFeedback("");
                  })
                }
                className="px-3 py-1.5 text-red-700 font-bold rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
              >
                ❌ Devolver
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => validateItineraryStepAction(withdrawalStep.taskId))}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer"
              >
                ✅ Validar
              </button>
            </div>
          </div>
        )}

        {withdrawalStep.status !== "ENVIADA" && (
          <p className="text-slate-400">Esperando que el PER complete el formulario.</p>
        )}
      </div>
    );
  }

  return (
    <form action={transitionCaseStatusAction} className="space-y-3 text-xs">
      <input type="hidden" name="caseId" value={caseId} />

      <div className="space-y-1">
        <label className="font-semibold text-slate-700 block">Tipo de salida:</label>
        <select
          name="toStatus"
          required
          value={toStatus}
          onChange={(e) => setToStatus(e.target.value)}
          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
        >
          <option value="RETIRO_VOLUNTARIO">Retiro Voluntario</option>
          <option value="DESERCION">Deserción</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="font-semibold text-slate-700 block">Motivo / Observación:</label>
        <textarea
          name="reason"
          rows={2}
          required
          placeholder="Especifica el motivo de la salida..."
          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none resize-none"
        ></textarea>
      </div>

      <button
        type="submit"
        className="w-full py-2 px-3 bg-red-650 hover:bg-red-700 text-white font-bold rounded-xl transition duration-150 text-[10px] cursor-pointer text-center block"
      >
        ❌ Registrar Retiro Forzado
      </button>
    </form>
  );
}
