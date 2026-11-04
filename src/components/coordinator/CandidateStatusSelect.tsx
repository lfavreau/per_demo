"use client";

import { useOptimistic, useState, useTransition } from "react";
import { updateCandidateStatusAction } from "@/app/actions/coordinator";

// Estado de ingreso: solo estas dos opciones. Los estados anteriores (Derivada, Admisible, etc.)
// pueden seguir en datos antiguos; se muestran tal cual hasta que se cambie a una de las dos.
const INTAKE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "SELECCIONADA", label: "Seleccionada" },
  { value: "EN_ESPERA", label: "Lista de espera" },
];

const LEGACY_LABELS: Record<string, string> = {
  DERIVADA: "Derivada",
  CONTACTADA: "Contactada",
  PREINSCRITA: "Preinscrita",
  ENTREVISTADA: "Entrevistada",
  ADMISIBLE: "Admisible",
  NO_ADMISIBLE: "No admisible",
  DESCARTADA: "Descartada",
};

export default function CandidateStatusSelect({
  candidateId,
  status,
}: {
  candidateId: string;
  status: string;
}) {
  // El valor mostrado sigue siempre al dato del servidor (también cuando cambia desde el modal de
  // edición); mientras guarda se muestra el valor elegido y, si falla, vuelve al anterior.
  const [shown, setShown] = useOptimistic(status);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isLegacy = !INTAKE_OPTIONS.some((o) => o.value === shown);
  const tone =
    shown === "SELECCIONADA"
      ? "bg-emerald-50 text-emerald-800"
      : shown === "EN_ESPERA"
      ? "bg-amber-50 text-amber-800"
      : "bg-slate-100 text-slate-600";

  function change(next: string) {
    if (next === status) return;
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await updateCandidateStatusAction(candidateId, next);
      if (!result.ok) setError(result.message);
    });
  }

  return (
    <div className="space-y-1">
      <select
        value={shown}
        disabled={isPending}
        onChange={(e) => change(e.target.value)}
        aria-label="Estado de ingreso"
        className={`px-2 py-0.5 rounded-lg font-semibold text-[10px] border border-slate-200 outline-none cursor-pointer disabled:opacity-60 disabled:cursor-wait ${tone}`}
      >
        {isLegacy && (
          <option value={shown} disabled>
            {LEGACY_LABELS[shown] ?? shown} (anterior)
          </option>
        )}
        {INTAKE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {isPending && <p className="text-[10px] text-slate-400">Guardando…</p>}
      {error && (
        <p role="alert" className="text-[10px] font-semibold text-red-700 max-w-[200px]">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
