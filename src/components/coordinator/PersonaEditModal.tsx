"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { updatePersonaAction } from "@/app/actions/coordinator";
import type { ActionResult } from "@/app/actions/coordinator";
import { CASE_ALIAS_MAX_LENGTH } from "@/lib/nomenclatures";
import { REQUIRE_TEXT_FIELDS } from "@/lib/program-config";

interface PersonaEditModalProps {
  candidateId: string;
  name: string;
  notes: string;
  status: string;
  /** Con PER asignado el estado de ingreso queda fijo. */
  hasCase: boolean;
}

const INITIAL: ActionResult = { status: "idle", message: "" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-wait text-white font-bold text-xs cursor-pointer"
    >
      {pending ? "Guardando…" : "Guardar cambios"}
    </button>
  );
}

/** Botón + modal para editar una persona acompañada. No pide contraseña. */
export default function PersonaEditModal({ candidateId, name, notes, status, hasCase }: PersonaEditModalProps) {
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const next = await updatePersonaAction(prev, formData);
    if (next.status === "success") setOpen(false);
    return next;
  }, INITIAL);

  const editableStatus = status === "EN_ESPERA" ? "EN_ESPERA" : "SELECCIONADA";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2.5 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
      >
        ✏️ Editar
      </button>

      {open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md flex flex-col text-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-extrabold text-base text-slate-900">Editar persona acompañada</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form action={formAction} className="p-5 space-y-4 text-xs">
              <input type="hidden" name="candidateId" value={candidateId} />

              <div>
                <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Nombre / alias</label>
                <input
                  type="text"
                  name="sourceCenter"
                  defaultValue={name}
                  required={REQUIRE_TEXT_FIELDS}
                  maxLength={CASE_ALIAS_MAX_LENGTH}
                  placeholder="Nombre o alias (sin RUT)"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Estado de ingreso</label>
                {hasCase ? (
                  <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
                    Con PER asignado (el estado queda fijo)
                  </p>
                ) : (
                  <select
                    name="status"
                    defaultValue={editableStatus}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                  >
                    <option value="SELECCIONADA">Seleccionada (se le puede asignar PER)</option>
                    <option value="EN_ESPERA">Lista de espera</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Notas / Antecedentes</label>
                <textarea
                  name="notes"
                  defaultValue={notes}
                  rows={3}
                  placeholder="Observaciones de ingreso..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {result.status === "error" && (
                <p role="alert" className="px-3 py-2 rounded-xl bg-red-50 text-red-800 border border-red-200 font-semibold">
                  ⚠️ {result.message}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <SaveButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
