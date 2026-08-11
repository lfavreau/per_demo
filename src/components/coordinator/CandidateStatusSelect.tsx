"use client";

import { updateCandidateStatusAction } from "@/app/actions/coordinator";

const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  DERIVADA: "Derivada",
  CONTACTADA: "Contactada",
  PREINSCRITA: "Preinscrita",
  ENTREVISTADA: "Entrevistada",
  ADMISIBLE: "Admisible",
  NO_ADMISIBLE: "No Admisible",
  SELECCIONADA: "Seleccionada",
  EN_ESPERA: "En Espera",
  DESCARTADA: "Descartada",
};

export default function CandidateStatusSelect({
  candidateId,
  status,
}: {
  candidateId: string;
  status: string;
}) {
  return (
    <form action={updateCandidateStatusAction}>
      <input type="hidden" name="candidateId" value={candidateId} />
      <select
        name="status"
        defaultValue={status}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="px-2 py-0.5 rounded-lg font-semibold text-[10px] border border-slate-200 bg-emerald-50 text-emerald-800 outline-none cursor-pointer"
      >
        {Object.entries(CANDIDATE_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </form>
  );
}
