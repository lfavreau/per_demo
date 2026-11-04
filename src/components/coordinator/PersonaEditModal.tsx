"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { deletePersonaAction, updatePersonaAction } from "@/app/actions/coordinator";
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
  /** Código del caso, si la persona ya tiene PER: hay que escribirlo para confirmar el borrado. */
  caseCode?: string | null;
  /** Actividad real del caso (tareas ya trabajadas + bitácoras), para advertir antes de borrar. */
  activity?: number;
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
function DeleteButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-bold text-xs cursor-pointer"
    >
      {pending ? "Eliminando…" : "Eliminar definitivamente"}
    </button>
  );
}

export default function PersonaEditModal({
  candidateId,
  name,
  notes,
  status,
  hasCase,
  caseCode = null,
  activity = 0,
}: PersonaEditModalProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typedCode, setTypedCode] = useState("");
  const [deleteResult, deleteAction] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const next = await deletePersonaAction(prev, formData);
    if (next.status === "success") setOpen(false);
    return next;
  }, INITIAL);
  const codeOk = !hasCase || (caseCode !== null && typedCode.trim().toUpperCase() === caseCode.toUpperCase());
  const [result, formAction] = useActionState(async (prev: ActionResult, formData: FormData) => {
    const next = await updatePersonaAction(prev, formData);
    if (next.status === "success") setOpen(false);
    return next;
  }, INITIAL);

  // Un estado anterior (Derivada, Admisible…) no se ofrece: queda sin cambio hasta que se elija uno de los dos.
  const isLegacyStatus = status !== "EN_ESPERA" && status !== "SELECCIONADA";
  const editableStatus = isLegacyStatus ? "" : status;

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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col text-slate-800">
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
                    {isLegacyStatus && <option value="">(estado anterior — elige uno)</option>}
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

            {/* Zona de peligro: borrar la persona */}
            <div className="px-5 pb-5 text-xs">
              <div className="pt-4 border-t border-red-100 space-y-3">
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs cursor-pointer"
                  >
                    🗑️ Eliminar persona
                  </button>
                ) : (
                  <form action={deleteAction} className="space-y-3 p-3 rounded-xl bg-red-50 border border-red-200">
                    <input type="hidden" name="candidateId" value={candidateId} />
                    <p className="font-bold text-red-900">¿Eliminar a esta persona? No se puede deshacer.</p>
                    {hasCase ? (
                      <>
                        <p className="text-red-800 leading-relaxed">
                          Se borrarán también su caso <strong>{caseCode}</strong> y todo lo que tiene: tareas, IAP, historial,
                          bitácoras y avisos.
                          {activity > 0 && (
                            <> Ya tiene <strong>{activity}</strong> registro(s) de trabajo (tareas trabajadas o bitácoras) que se perderían.</>
                          )}
                        </p>
                        <div>
                          <label className="block text-red-900 mb-1 font-bold text-[10px] uppercase">
                            Escribe {caseCode} para confirmar
                          </label>
                          <input
                            type="text"
                            name="confirmCode"
                            value={typedCode}
                            onChange={(e) => setTypedCode(e.target.value)}
                            autoComplete="off"
                            className="w-full p-2.5 bg-white border border-red-200 rounded-xl outline-none focus:border-red-500"
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-red-800">Esta persona aún no tiene PER ni caso.</p>
                    )}
                    {deleteResult.status === "error" && (
                      <p role="alert" className="font-semibold text-red-700">⚠️ {deleteResult.message}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(false);
                          setTypedCode("");
                        }}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <DeleteButton disabled={!codeOk} />
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
