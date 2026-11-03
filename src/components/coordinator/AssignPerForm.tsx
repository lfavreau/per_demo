"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { assignPerAction } from "@/app/actions/coordinator";
import type { ActionResult } from "@/app/actions/coordinator";

interface Option {
  id: string;
  label: string;
}

const INITIAL: ActionResult = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-wait text-white font-bold rounded-xl shadow transition cursor-pointer"
    >
      {pending ? "Asignando…" : "Asignar PER"}
    </button>
  );
}

/** Asigna un PER sin salir de la pantalla: el resultado se muestra aquí mismo. */
export default function AssignPerForm({ persons, pers }: { persons: Option[]; pers: Option[] }) {
  const [result, formAction] = useActionState(assignPerAction, INITIAL);

  return (
    <div className="space-y-3">
      <form action={formAction} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs items-end">
        <div>
          <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Persona acompañada</label>
          <select
            name="candidateId"
            required
            className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
          >
            <option value="">-- Seleccionar --</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {persons.length === 0 && (
            <p className="text-[10px] text-amber-600 mt-1">No hay personas seleccionadas esperando PER.</p>
          )}
        </div>

        <div>
          <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Acompañante PER</label>
          <select
            name="perId"
            required
            className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
          >
            <option value="">-- Seleccionar --</option>
            {pers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {pers.length === 0 && <p className="text-[10px] text-amber-600 mt-1">No hay PER activos en la región.</p>}
        </div>

        <SubmitButton />
      </form>

      {result.status !== "idle" && (
        <p
          role="status"
          className={`text-xs font-semibold px-3 py-2 rounded-xl border ${
            result.status === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          {result.status === "success" ? "✓ " : "⚠️ "}
          {result.message}
        </p>
      )}
    </div>
  );
}
