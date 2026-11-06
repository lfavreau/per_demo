"use client";

import { useEffect, useRef, useState } from "react";

export interface RowAction {
  label: string;
  icon?: string;
  onClick?: () => void;
  /** Si se indica, la opción es un enlace en vez de un botón. */
  href?: string;
  tone?: "default" | "danger";
  disabled?: boolean;
}

interface RowActionsMenuProps {
  actions: Array<RowAction | false | null | undefined>;
  /** Nombre accesible del botón (p. ej. «Acciones de PA-VAL-001»). */
  label?: string;
}

const ITEM_HEIGHT = 36;

/**
 * Menú de tres puntos verticales (⋮) para las acciones de una fila: evita botones sueltos que se tocan sin querer.
 * El menú se posiciona sobre la página (no dentro de la tabla) para que un contenedor con scroll no lo recorte.
 */
export default function RowActionsMenu({ actions, label = "Acciones" }: RowActionsMenuProps) {
  const items = actions.filter((a): a is RowAction => Boolean(a));
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  if (items.length === 0) return null;

  function toggle() {
    if (pos) {
      setPos(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const height = items.length * ITEM_HEIGHT + 8;
    const opensUp = rect.bottom + height + 8 > window.innerHeight && rect.top - height - 8 > 0;
    setPos({
      top: opensUp ? rect.top - height - 4 : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(pos)}
        onClick={toggle}
        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      {pos && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-[60] min-w-40 py-1 bg-white border border-slate-200 rounded-xl shadow-xl text-xs"
        >
          {items.map((item) => {
            const tone = item.tone === "danger" ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-50";
            const className = `flex items-center gap-2 w-full px-3 text-left font-semibold ${tone} ${
              item.disabled ? "opacity-40 pointer-events-none" : "cursor-pointer"
            }`;
            const content = (
              <>
                {item.icon && <span aria-hidden="true">{item.icon}</span>}
                <span>{item.label}</span>
              </>
            );
            return item.href ? (
              <a key={item.label} role="menuitem" href={item.href} style={{ height: ITEM_HEIGHT }} className={className} onClick={() => setPos(null)}>
                {content}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                style={{ height: ITEM_HEIGHT }}
                className={className}
                onClick={() => {
                  setPos(null);
                  item.onClick?.();
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
