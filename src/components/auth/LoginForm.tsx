"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { DEMO_ACCOUNTS, DEMO_REGIONS, type DemoAccount } from "@/lib/demo-accounts";

const REGISTERED_USERS: DemoAccount[] = DEMO_ACCOUNTS.filter((a) => a.role !== "PER");

const ROLE_BADGE: Record<DemoAccount["role"], { label: string; className: string }> = {
  ADMIN: { label: "ADMIN DEMO", className: "bg-blue-100 text-blue-800" },
  COORDINATOR: { label: "COORD DEMO", className: "bg-blue-600/10 text-blue-700" },
  PER: { label: "PER DEMO", className: "bg-emerald-600/10 text-emerald-700" },
};

function DemoAccountRow({ account }: { account: DemoAccount }) {
  const badge = ROLE_BADGE[account.role];
  return (
    <form action={loginAction}>
      <input type="hidden" name="email" value={account.username} />
      <input type="hidden" name="isDemo" value="true" />
      <button
        type="submit"
        className="w-full flex justify-between items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
      >
        <div className="min-w-0">
          <span className="font-bold text-xs text-slate-950 block truncate">{account.name}</span>
          <span className="text-[10px] text-slate-400 font-mono">{account.username}</span>
        </div>
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold shrink-0 ${badge.className}`}>
          {badge.label}
        </span>
      </button>
    </form>
  );
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [copiedUser, setCopiedUser] = useState<string | null>(null);

  const errorMsg =
    error === "missing_email"
      ? "Por favor, ingresa tu usuario o correo electrónico."
      : error === "missing_password"
      ? "Por favor, ingresa tu contraseña."
      : error === "invalid_password"
      ? "Contraseña incorrecta."
      : error === "email_not_found"
      ? "El usuario no está registrado o se encuentra deshabilitado."
      : error === "demo_not_allowed"
      ? "Esta cuenta no está habilitada para el entorno demostrativo."
      : error === "account_is_demo_only"
      ? "Esta es una cuenta de demostración. Ingresa con el Acceso Directo Demo, no con este formulario."
      : error === "real_mode_not_configured"
      ? "El modo real aún no tiene una contraseña configurada en Vercel."
      : null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUser(text);
    setTimeout(() => setCopiedUser(null), 2000);
  };

  return (
    <div className="w-full max-w-md p-8 rounded-2xl bg-white border border-slate-200 shadow-xl relative z-10 text-slate-800">
      <div className="text-center mb-6">
        <div className="inline-flex p-3 rounded-full bg-blue-50 text-blue-600 mb-3 border border-blue-100">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          PER 2026-2027
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Programa de Integración Social — Sistema de Coordinación
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
          <span>⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Formulario de Login */}
      <form action={loginAction} className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="email" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Nombre de Usuario
            </label>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>👥 Ver Usuarios</span>
            </button>
          </div>
          <input
            type="text"
            name="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="ej. admin, coord.metro o per.carla"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-900 placeholder-slate-400 transition outline-none text-sm"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Contraseña
          </label>
          <input
            type="password"
            name="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-900 placeholder-slate-400 transition outline-none text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition duration-150 shadow-md cursor-pointer text-sm flex justify-center items-center gap-2 mt-2"
        >
          Ingresar al Portal
        </button>
      </form>

      {/* Cuentas de Evaluación Operativa (Modo Demo) */}
      <div className="mt-8 pt-6 border-t border-slate-200 text-center">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          🧪 Cuentas de Evaluación Operativa (Modo Demo)
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5 mb-3">
          Acceso directo con datos de prueba precargados para evaluación
        </p>
        <button
          type="button"
          onClick={() => setIsDemoModalOpen(true)}
          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-slate-700 text-xs font-bold cursor-pointer"
        >
          🧪 Ver cuentas demo ({DEMO_ACCOUNTS.length})
        </button>
      </div>

      {/* Resumen Link */}
      <div className="mt-6 pt-4 border-t border-slate-100 text-center">
        <a
          href="/Resumen.md"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline transition cursor-pointer"
        >
          📖 Ver Resumen de Operación y Funcionalidad (Resumen.md)
        </a>
      </div>

      {/* MODAL DE CUENTAS DEMO */}
      {isDemoModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setIsDemoModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col text-slate-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <span>🧪</span> Cuentas Demo
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Acceso directo con datos de prueba precargados
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDemoModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-sm flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Administración Nacional
                </h4>
                <div className="space-y-2">
                  {DEMO_ACCOUNTS.filter((a) => a.role === "ADMIN").map((a) => (
                    <DemoAccountRow key={a.username} account={a} />
                  ))}
                </div>
              </div>

              {DEMO_REGIONS.map((region) => (
                <div key={region}>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {region}
                  </h4>
                  <div className="space-y-2">
                    {DEMO_ACCOUNTS.filter((a) => a.region === region).map((a) => (
                      <DemoAccountRow key={a.username} account={a} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <span className="text-[11px] text-slate-500 font-medium">
                Total: <strong>{DEMO_ACCOUNTS.length} cuentas demo</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsDemoModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE USUARIOS REGISTRADOS */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col text-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header del Modal */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <span>👥</span> Usuarios Registrados en el Sistema
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Copia el nombre de usuario de las cuentas institucionales
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-sm flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Banner Informativo */}
            {copiedUser && (
              <div className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 text-center flex items-center justify-center gap-2 animate-bounce">
                <span>✓ Usuario &quot;{copiedUser}&quot; copiado al portapapeles</span>
              </div>
            )}

            {/* Lista de Usuarios */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Sección Admin */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Administración Nacional
                </h4>
                <div className="space-y-2">
                  {REGISTERED_USERS.filter((u) => u.role === "ADMIN").map((u) => (
                    <div
                      key={u.username}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-slate-300 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">{u.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-extrabold shrink-0">
                            ADMIN
                          </span>
                        </div>
                        <span className="block text-[11px] font-mono text-slate-500 truncate mt-0.5">
                          {u.username} <span className="text-slate-400">({u.email})</span>
                        </span>
                      </div>

                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(u.username)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-xs"
                        >
                          📋 Copiar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sección Coordinadores */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Coordinadores Regionales
                </h4>
                <div className="space-y-2">
                  {REGISTERED_USERS.filter((u) => u.role === "COORDINATOR").map((u) => (
                    <div
                      key={u.username}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-slate-300 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">{u.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-700 text-[9px] font-extrabold shrink-0">
                            {u.region}
                          </span>
                        </div>
                        <span className="block text-[11px] font-mono text-slate-500 truncate mt-0.5">
                          {u.username} <span className="text-slate-400">({u.email})</span>
                        </span>
                      </div>

                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(u.username)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-xs"
                        >
                          📋 Copiar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sección PER Note */}
              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Acompañantes PER
                </h4>
                <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 italic">
                  ℹ️ Los Acompañantes PER son creados dinámicamente desde la plataforma por el Administrador Nacional y asignados a su respectiva Coordinación Regional.
                </p>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <span className="text-[11px] text-slate-500 font-medium">
                Total: <strong>{REGISTERED_USERS.length} cuentas institucionales</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
