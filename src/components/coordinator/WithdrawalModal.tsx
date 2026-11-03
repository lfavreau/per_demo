"use client";

import { useState, useTransition } from "react";
import ModalButton from "@/components/shared/ModalButton";
import WithdrawalGate from "@/components/coordinator/WithdrawalGate";
import { cancelWithdrawalAction } from "@/app/actions/coordinator";

interface WithdrawalModalProps {
  caseId: string;
  caseCode: string;
  withdrawalStep: {
    activityKey: string;
    taskId: string;
    title: string;
    status: string;
    contentJson?: string | null;
  } | null;
}

/** Deshace el inicio del retiro. Pide una segunda confirmación antes de borrar el formulario. */
function CancelWithdrawal({ caseId, hasAnswers }: { caseId: string; hasAnswers: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="pt-4 mt-4 border-t border-slate-200 space-y-2 text-xs">
      {message && (
        <p
          role="status"
          className={`px-3 py-2 rounded-xl border font-semibold ${
            message.ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {message.text}
        </p>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold cursor-pointer"
        >
          ↩️ Cancelar retiro
        </button>
      ) : (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
          <p className="font-bold text-amber-900">¿Cancelar el retiro de esta persona?</p>
          <p className="text-amber-800 leading-relaxed">
            Se borra el Formulario de Abandono{hasAnswers ? " con lo que el PER ya escribió" : ""} y el caso queda
            exactamente como estaba. Se avisa al PER.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold cursor-pointer"
            >
              No, volver
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await cancelWithdrawalAction(caseId);
                  setMessage({ ok: result.ok, text: result.message });
                  setConfirming(false);
                })
              }
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-bold cursor-pointer"
            >
              {isPending ? "Cancelando…" : "Sí, cancelar retiro"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Retiro / deserción en un modal. Sin retiro iniciado solo ofrece iniciarlo; con retiro iniciado
 * muestra el estado del formulario y, en el mismo modal, permite cancelar el retiro.
 */
export default function WithdrawalModal({ caseId, caseCode, withdrawalStep }: WithdrawalModalProps) {
  const started = Boolean(withdrawalStep);
  return (
    <ModalButton
      label={started ? "🚪 Retiro en proceso — ver o cancelar" : "🚪 Registrar Retiro o Deserción"}
      title={`Retiro o deserción — ${caseCode}`}
      buttonClassName={
        started
          ? "w-full py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold rounded-xl text-[11px] cursor-pointer text-center"
          : undefined
      }
    >
      <WithdrawalGate caseId={caseId} withdrawalStep={withdrawalStep} />
      {withdrawalStep && <CancelWithdrawal caseId={caseId} hasAnswers={Boolean(withdrawalStep.contentJson)} />}
    </ModalButton>
  );
}
