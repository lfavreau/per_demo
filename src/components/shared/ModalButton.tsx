"use client";

import { useState } from "react";
import type { ReactNode } from "react";

interface ModalButtonProps {
  /** Texto del botón que abre el modal. */
  label: string;
  /** Título que se muestra en la cabecera del modal. */
  title: string;
  children: ReactNode;
  /** Clases del botón (por defecto, estilo neutro). */
  buttonClassName?: string;
}

/** Botón que abre un modal con el contenido recibido. Se cierra con ✕, Escape o clic fuera. */
export default function ModalButton({ label, title, children, buttonClassName }: ModalButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "w-full py-2 px-3 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-[11px] cursor-pointer text-center"
        }
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col text-slate-800"
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 sticky top-0">
              <h3 className="font-extrabold text-base text-slate-900">{title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
