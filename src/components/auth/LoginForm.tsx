"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/actions/auth";

interface UserDirectoryItem {
  name: string;
  username: string;
  email: string;
  role: "ADMIN" | "COORDINATOR" | "PER";
  roleLabel: string;
  region: string;
}

const REGISTERED_USERS: UserDirectoryItem[] = [
  // Admin
  { name: "Administrador Nacional", username: "admin", email: "admin@per2026.cl", role: "ADMIN", roleLabel: "Administrador Nacional", region: "Nacional" },
  // Coordinadores
  { name: "Coordinadora Metropolitana", username: "coord.metro", email: "coord.metro@per2026.cl", role: "COORDINATOR", roleLabel: "Coordinador Regional", region: "Metropolitana" },
  { name: "Coordinador Valparaíso", username: "coord.valpo", email: "coord.valpo@per2026.cl", role: "COORDINATOR", roleLabel: "Coordinador Regional", region: "Valparaíso" },
  { name: "Coordinador Tarapacá", username: "coord.tarapaca", email: "coord.tarapaca@per2026.cl", role: "COORDINATOR", roleLabel: "Coordinador Regional", region: "Tarapacá" },
  { name: "Coordinador Biobío", username: "coord.biobio", email: "coord.biobio@per2026.cl", role: "COORDINATOR", roleLabel: "Coordinador Regional", region: "Biobío" },
  { name: "Coordinador Los Ríos", username: "coord.losrios", email: "coord.losrios@per2026.cl", role: "COORDINATOR", roleLabel: "Coordinador Regional", region: "Los Ríos" },
  // PERs
  { name: "Carla Muñoz", username: "per.carla", email: "per.carla@per2026.cl", role: "PER", roleLabel: "Acompañante PER (Habilitado)", region: "Metropolitana" },
  { name: "Diego Rojas", username: "per.diego", email: "per.diego@per2026.cl", role: "PER", roleLabel: "Acompañante PER", region: "Metropolitana" },
  { name: "Juan Pérez", username: "per.juan", email: "per.juan@per2026.cl", role: "PER", roleLabel: "Acompañante PER", region: "Metropolitana" },
  { name: "Andrés Silva", username: "per.valpo", email: "per.valpo@per2026.cl", role: "PER", roleLabel: "Acompañante PER (No Habilitado)", region: "Valparaíso" },
  { name: "Sonia Reyes", username: "per.sonia", email: "per.sonia@per2026.cl", role: "PER", roleLabel: "Acompañante PER", region: "Valparaíso" },
  { name: "Lucas Díaz", username: "per.lucas", email: "per.lucas@per2026.cl", role: "PER", roleLabel: "Acompañante PER", region: "Tarapacá" },
  { name: "Mario Soto", username: "per.mario", email: "per.mario@per2026.cl", role: "PER", roleLabel: "Acompañante PER", region: "Tarapacá" },
  { name: "Camila Vera", username: "per.camila", email: "per.camila@per2026.cl", role: "PER", roleLabel: "Acompañante PER", region: "Biobío" },
  { name: "Pedro Castillo", username: "per.pedro", email: "per.pedro@per2026.cl", role: "PER", roleLabel: "Acompañante PER", region: "Los Ríos" },
  { name: "Elena Gómez", username: "per.elena", email: "per.elena@per2026.cl", role: "PER", roleLabel: "Acompañante PER", region: "Los Ríos" },
];

export default function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedUser, setCopiedUser] = useState<string | null>(null);

  const errorMsg =
    error === "missing_email"
      ? "Por favor, ingresa tu usuario o correo electrónico."
      : error === "missing_password"
      ? "Por favor, ingresa tu contraseña."
      : error === "invalid_password"
      ? "Contraseña incorrecta."
      : error === "email_not_found"
      ? "El usuario no está registrado o se encuentra inactivo."
      : null;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUser(text);
    setTimeout(() => setCopiedUser(null), 2000);
  };

  const handleSelectUser = (u: UserDirectoryItem) => {
    setEmail(u.username);
    setIsModalOpen(false);
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

      {/* Botón para Abrir Modal de Directorio de Usuarios */}
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition text-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
        >
          <span>📋</span>
          <span>Ver Lista de Usuarios Registrados y Copiar</span>
        </button>
      </div>

      {/* Cuentas de Evaluación Operativa (Modo Demo) */}
      <div className="mt-6 pt-6 border-t border-slate-200">
        <div className="text-center mb-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            🧪 Cuentas de Evaluación Operativa (Modo Demo)
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Acceso directo con datos de prueba precargados para evaluación
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs">
          <form action={loginAction}>
            <input type="hidden" name="email" value="admin" />
            <input type="hidden" name="isDemo" value="true" />
            <button
              type="submit"
              className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
            >
              <div>
                <span className="font-bold text-slate-950 block">Administrador Nacional</span>
                <span className="text-[10px] text-slate-400">admin (Acceso Directo Demo)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-bold">
                ADMIN DEMO
              </span>
            </button>
          </form>

          <form action={loginAction}>
            <input type="hidden" name="email" value="coord.metro" />
            <input type="hidden" name="isDemo" value="true" />
            <button
              type="submit"
              className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
            >
              <div>
                <span className="font-bold text-slate-950 block">Coordinadora Regional (MET)</span>
                <span className="text-[10px] text-slate-400">coord.metro (Acceso Directo Demo)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-600/10 text-blue-700 text-[9px] font-bold">
                COORD DEMO
              </span>
            </button>
          </form>

          <form action={loginAction}>
            <input type="hidden" name="email" value="coord.valpo" />
            <input type="hidden" name="isDemo" value="true" />
            <button
              type="submit"
              className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
            >
              <div>
                <span className="font-bold text-slate-950 block">Coordinador Regional (VAL)</span>
                <span className="text-[10px] text-slate-400">coord.valpo (Acceso Directo Demo)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-600/10 text-blue-700 text-[9px] font-bold">
                COORD DEMO
              </span>
            </button>
          </form>

          <form action={loginAction}>
            <input type="hidden" name="email" value="per.carla" />
            <input type="hidden" name="isDemo" value="true" />
            <button
              type="submit"
              className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
            >
              <div>
                <span className="font-bold text-slate-950 block">Carla Muñoz (PER Habilitado - MET)</span>
                <span className="text-[10px] text-slate-400">per.carla (Acceso Directo Demo)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-600/10 text-emerald-700 text-[9px] font-bold">
                PER DEMO
              </span>
            </button>
          </form>

          <form action={loginAction}>
            <input type="hidden" name="email" value="per.valpo" />
            <input type="hidden" name="isDemo" value="true" />
            <button
              type="submit"
              className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
            >
              <div>
                <span className="font-bold text-slate-950 block">Andrés Silva (PER No Habilitado - VAL)</span>
                <span className="text-[10px] text-slate-400">per.valpo (Acceso Directo Demo)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-600/10 text-amber-700 text-[9px] font-bold">
                PER DEMO
              </span>
            </button>
          </form>
        </div>
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
                  Copia o selecciona cualquier usuario para ingresar al portal
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
                <span>✓ Usuario "{copiedUser}" copiado al portapapeles</span>
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

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(u.username)}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1"
                        >
                          📋 Copiar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectUser(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Usar
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

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(u.username)}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1"
                        >
                          📋 Copiar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectUser(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Usar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sección PERs */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Acompañantes PER
                </h4>
                <div className="space-y-2">
                  {REGISTERED_USERS.filter((u) => u.role === "PER").map((u) => (
                    <div
                      key={u.username}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-slate-300 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 truncate">{u.name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-600/10 text-emerald-700 text-[9px] font-extrabold shrink-0">
                            {u.region}
                          </span>
                        </div>
                        <span className="block text-[11px] font-mono text-slate-500 truncate mt-0.5">
                          {u.username} <span className="text-slate-400">({u.email})</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(u.username)}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1"
                        >
                          📋 Copiar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectUser(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
                        >
                          Usar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <span className="text-[11px] text-slate-500 font-medium">
                Total: <strong>{REGISTERED_USERS.length} cuentas registradas</strong>
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
