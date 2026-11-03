"use client";

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
  const isLegacy = !INTAKE_OPTIONS.some((o) => o.value === status);
  const tone =
    status === "SELECCIONADA"
      ? "bg-emerald-50 text-emerald-800"
      : status === "EN_ESPERA"
      ? "bg-amber-50 text-amber-800"
      : "bg-slate-100 text-slate-600";

  return (
    <form action={updateCandidateStatusAction}>
      <input type="hidden" name="candidateId" value={candidateId} />
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`px-2 py-0.5 rounded-lg font-semibold text-[10px] border border-slate-200 outline-none cursor-pointer ${tone}`}
      >
        {isLegacy && (
          <option value={status} disabled>
            {LEGACY_LABELS[status] ?? status} (anterior)
          </option>
        )}
        {INTAKE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
