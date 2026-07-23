"use client";

import React, { useState } from "react";
import { createPERUserAction, toggleUserStatusAction } from "@/app/actions/admin";

interface UserWithProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  regionId: string | null;
  active: boolean;
  profile?: {
    id: string;
    certificationStatus: string;
  } | null;
}

interface UserManagementClientProps {
  users: UserWithProfile[];
  successMsg?: string | null;
  errorMsg?: string | null;
}

const REGIONS = [
  "Metropolitana",
  "Valparaíso",
  "Tarapacá",
  "Biobío",
  "Los Ríos",
];

export default function UserManagementClient({
  users,
  successMsg,
  errorMsg,
}: UserManagementClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("Metropolitana");

  const admins = users.filter((u) => u.role === "ADMIN");
  const coordinators = users.filter((u) => u.role === "COORDINATOR");
  const pers = users.filter((u) => u.role === "PER");

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4">
        <div>
          <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
            <span>👥</span> Gestión de Usuarios y Acompañantes PER
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Administra la nómina oficial, crea nuevos acompañantes PER y asígnalos a su respectiva Coordinación Regional.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-md cursor-pointer flex items-center gap-2 shrink-0"
        >
          <span>➕</span>
          <span>Crear Acompañante PER</span>
        </button>
      </div>

      {/* Success / Error Banners */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <span>✓</span>
          <span>
            {successMsg === "user_created"
              ? "Acompañante PER registrado y asignado exitosamente."
              : successMsg === "status_updated"
              ? "Estado de usuario actualizado correctamente."
              : "Operación realizada con éxito."}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>
            {errorMsg === "user_exists"
              ? "El nombre de usuario o correo ya se encuentra registrado."
              : errorMsg === "missing_fields"
              ? "Por favor, completa todos los campos requeridos."
              : errorMsg === "cannot_deactivate_admin"
              ? "No es posible desactivar la cuenta del Administrador Principal."
              : "Ocurrió un error al procesar la solicitud."}
          </span>
        </div>
      )}

      {/* SECTION 1: Acompañantes PER */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <span>🤝</span> Acompañantes PER Registrados ({pers.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Personal técnico asignado a acompañamientos individuales en cada territorio
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200">
            {pers.filter((p) => p.active).length} Activos
          </span>
        </div>

        {pers.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <span className="text-2xl block mb-2">👤</span>
            <p className="text-xs font-bold text-slate-700">No hay Acompañantes PER registrados aún</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
              Haz clic en el botón "Crear Acompañante PER" arriba para registrar y asignar personal a una coordinación regional.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">Acompañante</th>
                  <th className="py-3 px-4">Usuario / Email</th>
                  <th className="py-3 px-4">Región / Coordinador</th>
                  <th className="py-3 px-4">Certificación</th>
                  <th className="py-3 px-4">Cupo Max</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pers.map((per) => (
                  <tr key={per.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{per.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{per.email.replace("@per2026.cl", "")}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold text-[10px] border border-blue-100">
                        📍 {per.regionId}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {per.profile?.certificationStatus === "HABILITADO" ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-extrabold text-[10px]">
                          ✓ Habilitado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                          En Capacitación
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700">
                      5 casos (Cupo Max)
                    </td>
                    <td className="py-3 px-4 text-center">
                      {per.active ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                          Activo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-bold text-[10px]">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <form action={toggleUserStatusAction}>
                        <input type="hidden" name="userId" value={per.id} />
                        <button
                          type="submit"
                          className={`px-2.5 py-1 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                            per.active
                              ? "bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                          }`}
                        >
                          {per.active ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: Coordinadores Regionales */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <span>👔</span> Coordinadores Regionales ({coordinators.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cuentas territoriales institucionales encargadas de la supervisión regional
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {coordinators.map((coord) => (
            <div
              key={coord.id}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center gap-3"
            >
              <div>
                <span className="font-bold text-slate-900 block">{coord.name}</span>
                <span className="font-mono text-slate-500 text-[11px] block mt-0.5">
                  {coord.email}
                </span>
                <span className="inline-block mt-2 px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                  📍 {coord.regionId}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0">
                Activo
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL CREAR PER */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md flex flex-col text-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <span>➕</span> Registrar Nuevo Acompañante PER
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Asigna al nuevo usuario a una Coordinación Regional
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

            {/* Form */}
            <form action={createPERUserAction} className="p-6 space-y-4 text-xs">
              <div>
                <label htmlFor="name" className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  required
                  placeholder="ej. María Fernández"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none text-slate-900 text-sm"
                />
              </div>

              <div>
                <label htmlFor="username" className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nombre de Usuario / Identificador
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    name="username"
                    id="username"
                    required
                    placeholder="ej. per.maria"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none text-slate-900 font-mono text-sm"
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Se generará la cuenta institucional <code>per.maria@per2026.cl</code>
                </span>
              </div>

              <div>
                <label htmlFor="regionId" className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Coordinación Regional Asignada
                </label>
                <select
                  name="regionId"
                  id="regionId"
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:border-blue-600 outline-none text-slate-900 font-bold text-sm"
                >
                  {REGIONS.map((reg) => (
                    <option key={reg} value={reg}>
                      📍 {reg}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="certificationStatus" className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Estado Certificación
                  </label>
                  <select
                    name="certificationStatus"
                    id="certificationStatus"
                    defaultValue="HABILITADO"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 outline-none text-slate-900 font-medium"
                  >
                    <option value="HABILITADO">✓ Habilitado</option>
                    <option value="EN_CAPACITACION">En Capacitación</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="maxActiveCases" className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Cupo Máximo Casos
                  </label>
                  <input
                    type="number"
                    name="maxActiveCases"
                    id="maxActiveCases"
                    defaultValue={5}
                    min={1}
                    max={15}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 outline-none font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-md cursor-pointer"
                >
                  Guardar Acompañante
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
