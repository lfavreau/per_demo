"use client";

import React, { useState, useTransition } from "react";
import { updateCaseAliasAction } from "@/app/actions/cases";
import { CASE_ALIAS_MAX_LENGTH } from "@/lib/nomenclatures";

interface CaseAliasFormProps {
  caseId: string;
  alias: string | null;
}

export default function CaseAliasForm({ caseId, alias }: CaseAliasFormProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(alias || "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(alias || "");
          setError(null);
          setEditing(true);
        }}
        className="text-[10px] font-semibold text-blue-700 hover:underline cursor-pointer"
      >
        ✏️ {alias ? "Editar alias" : "Asignar alias"}
      </button>
    );
  }

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateCaseAliasAction(caseId, value);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
          maxLength={CASE_ALIAS_MAX_LENGTH}
          placeholder="Alias (opcional)"
          disabled={isPending}
          autoFocus
          className="flex-1 min-w-0 p-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[10px] font-bold rounded-lg cursor-pointer"
        >
          {isPending ? "..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={isPending}
          className="px-2 py-1.5 text-slate-500 hover:text-slate-800 text-[10px] font-semibold cursor-pointer"
        >
          Cancelar
        </button>
      </div>
      <p className="text-[9px] text-slate-400">
        Apodo de referencia, no usar nombre completo ni RUT. Vacío para quitarlo.
      </p>
      {error && <p className="text-[10px] text-red-700 font-semibold">{error}</p>}
    </div>
  );
}
