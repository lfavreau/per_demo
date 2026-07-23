import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { createCaseAction, createCandidateAction } from "@/app/actions/coordinator";

export const dynamic = "force-dynamic";

export default async function CoordinatorCandidatasPage() {
  const user = await getCurrentUser();

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }

  const isDemo = Boolean(user.isDemo);

  // 1. Fetch Candidates (Fase 2 preselection funnel)
  const candidates = await prisma.pACandidate.findMany({
    where: { regionId: user.regionId, isDemo },
    orderBy: { createdAt: "desc" },
  });

  // 2. Fetch PER profiles for matching form (only habilitado PERs)
  const perProfiles = await prisma.pERProfile.findMany({
    where: {
      regionId: user.regionId,
      certificationStatus: "HABILITADO",
    },
    include: {
      user: true,
      cases: {
        where: {
          status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
        },
      },
    },
  });

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Gestión de Nóminas e Ingresos (Fase 2)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Revisa las postulaciones derivadas de los centros de tratamiento o red derivadora y formaliza el emparejamiento con duplas de acompañamiento.
            </p>
          </div>
        </div>

        {/* Formulario para Registrar Nueva Postulante / Candidata */}
        <div className="p-6 bg-white border border-blue-100 rounded-2xl shadow-sm space-y-4">
          <h4 className="font-bold text-xs text-blue-900 uppercase tracking-wider flex items-center gap-2">
            <span>➕</span> Registrar Nueva Persona Acompañada / Derivación a Nómina
          </h4>
          <form action={createCandidateAction} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Centro de Origen / Red Derivadora</label>
              <input
                type="text"
                name="sourceCenter"
                required
                placeholder="Ej: CESFAM San Rafael, COSAM, Derivación Directa..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Estado de Ingreso</label>
              <select
                name="status"
                defaultValue="SELECCIONADA"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
              >
                <option value="SELECCIONADA">SELECCIONADA (Apta para asignar PER)</option>
                <option value="ADMISIBLE">ADMISIBLE</option>
                <option value="PREINSCRITA">PREINSCRITA</option>
                <option value="DERIVADA">DERIVADA</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Notas / Antecedentes Iniciales</label>
              <input
                type="text"
                name="notes"
                placeholder="Observaciones de ingreso..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition text-xs cursor-pointer"
              >
                ➕ Registrar e Ingresar a Nómina
              </button>
            </div>
          </form>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Candidates Table (Left side) */}
          <div className="lg:col-span-2 p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
            <h4 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
              Personas Preseleccionadas
            </h4>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="pb-2">Centro / Red Derivadora</th>
                    <th className="pb-2">Fórmula</th>
                    <th className="pb-2">Estado</th>
                    <th className="pb-2">Fecha Derivación</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates
                    .filter((c) => c.status === "SELECCIONADA" || c.status === "ADMISIBLE")
                    .map((cand) => (
                      <tr key={cand.id} className="border-b border-border/50 hover:bg-secondary/10">
                        <td className="py-3 font-semibold text-slate-800">{cand.sourceCenter || "No especificado"}</td>
                        <td className="py-3 text-slate-400">
                          {cand.preRegistrationFormResponseRef ? "Formulario" : "Planilla"}
                        </td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[10px]">
                            {cand.status}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500">
                          {new Date(cand.createdAt).toLocaleDateString("es-CL")}
                        </td>
                      </tr>
                    ))}
                  {candidates.filter((c) => c.status === "SELECCIONADA" || c.status === "ADMISIBLE").length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        No hay personas preseleccionadas esperando dupla.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dupla Matching Form (Right side) */}
          <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-800">
              Registrar Dupla & Proponer Match
            </h3>
            
            <form action={createCaseAction} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Persona Acompañada Apta (Fase 2)</label>
                <select
                  name="candidateId"
                  required
                  className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
                >
                  <option value="">-- Seleccionar --</option>
                  {candidates
                    .filter((c) => c.status === "SELECCIONADA" || c.status === "ADMISIBLE")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.sourceCenter} (Fase 2)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Acompañante PER (Habilitado)</label>
                <select
                  name="perId"
                  required
                  className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
                >
                  <option value="">-- Seleccionar --</option>
                  {perProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.user.name} ({p.cases.length} casos activos)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Tipo de Acompañamiento</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 font-semibold">
                    <input type="radio" name="type" value="NUEVO" defaultChecked required />
                    Nuevo
                  </label>
                  <label className="flex items-center gap-2 font-semibold">
                    <input type="radio" name="type" value="CONTINUIDAD" required />
                    Continuidad
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Fundamentación del Match</label>
                <textarea
                  name="matchRationale"
                  placeholder="Justificar según afinidad territorial, especialidad, etc..."
                  required
                  rows={4}
                  className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary resize-none"
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition cursor-pointer"
              >
                Conformar Dupla
              </button>
            </form>
          </div>

        </div>

      </div>
    </AppShell>
  );
}
