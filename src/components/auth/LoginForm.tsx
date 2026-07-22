"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/actions/auth";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [email, setEmail] = useState("");

  const errorMsg =
    error === "missing_email"
      ? "Por favor, ingresa tu correo electrónico."
      : error === "email_not_found"
      ? "El correo no está registrado o se encuentra inactivo."
      : null;

  return (
    <div className="w-full max-w-md p-8 rounded-2xl bg-white border border-slate-200 shadow-xl relative z-10 text-slate-800">
      <div className="text-center mb-8">
        <div className="inline-flex p-3 rounded-full bg-slate-100 text-blue-600 mb-3">
          {/* Official looking shield icon */}
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
        <p className="text-xs text-slate-500 mt-2 font-medium">
          Programa de Integración Social - Sistema de Coordinación
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
          ⚠️ {errorMsg}
        </div>
      )}

      <form action={loginAction} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Nombre de Usuario
          </label>
          <input
            type="text"
            name="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="ej. coord.metro o admin"
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-900 placeholder-slate-400 transition outline-none text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition duration-150 shadow-md cursor-pointer text-sm"
        >
          Ingresar al Portal
        </button>
      </form>

      {/* Demo Accounts Select Assistant */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <p className="text-[10px] font-bold text-slate-400 mb-3 text-center uppercase tracking-wider">
          Cuentas de Evaluación Operativa
        </p>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setEmail("admin")}
            className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
          >
            <div>
              <span className="font-bold text-slate-950">Administrador Nacional</span>
              <span className="block text-[10px] text-slate-400">admin</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-bold">
              ADMIN
            </span>
          </button>

          <button
            type="button"
            onClick={() => setEmail("coord.metro")}
            className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
          >
            <div>
              <span className="font-bold text-slate-950">Coordinadora Regional (MET)</span>
              <span className="block text-[10px] text-slate-400">coord.metro</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-blue-600/10 text-blue-700 text-[9px] font-bold">
              COORDINACIÓN
            </span>
          </button>

          <button
            type="button"
            onClick={() => setEmail("coord.valpo")}
            className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
          >
            <div>
              <span className="font-bold text-slate-950">Coordinador Regional (VAL)</span>
              <span className="block text-[10px] text-slate-400">coord.valpo</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-blue-600/10 text-blue-700 text-[9px] font-bold">
              COORDINACIÓN
            </span>
          </button>

          <button
            type="button"
            onClick={() => setEmail("per.carla")}
            className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
          >
            <div>
              <span className="font-bold text-slate-950">Carla Muñoz (PER Habilitado - MET)</span>
              <span className="block text-[10px] text-slate-400">per.carla</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-600/10 text-emerald-700 text-[9px] font-bold">
              ACOMPAÑANTE
            </span>
          </button>

          <button
            type="button"
            onClick={() => setEmail("per.valpo")}
            className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition text-left text-slate-700 cursor-pointer"
          >
            <div>
              <span className="font-bold text-slate-950">Andrés Silva (PER No Habilitado - VAL)</span>
              <span className="block text-[10px] text-slate-400">per.valpo</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-amber-600/10 text-amber-700 text-[9px] font-bold">
              ACOMPAÑANTE
            </span>
          </button>
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
    </div>
  );
}
