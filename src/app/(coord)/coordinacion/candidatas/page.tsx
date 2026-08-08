import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { createCaseAction, createCandidateAction } from "@/app/actions/coordinator";
import CandidateStatusSelect from "@/components/coordinator/CandidateStatusSelect";

export const dynamic = "force-dynamic";

export default async function CoordinatorCandidatasPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const errorMsg = params.error;

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

  // 2. Fetch PER profiles for matching form (filtered by isDemo)
  const allPerProfiles = await prisma.pERProfile.findMany({
    where: {
      regionId: user.regionId,
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
  const perProfiles = allPerProfiles.filter((p: any) => Boolean(p.user?.isDemo) === isDemo);
  // Tope: un PER lleva como máximo un acompañamiento activo a la vez.
  const availablePers = perProfiles.filter((p) => p.certificationStatus !== "NO_HABILITADO" && p.cases.length === 0);

  // 3. Fetch Existing Cases/Matches created in region
  const allCases = await prisma.pACase.findMany({
    where: { regionId: user.regionId },
    include: {
      per: {
        include: { user: true },
      },
      candidate: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const matches = allCases.filter((c) => Boolean(c.isDemo) === isDemo);

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

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-2xl flex items-start gap-2 shadow-sm">
            <span className="text-sm shrink-0">⚠️</span>
            <div className="flex-1 space-y-1">
              <p className="font-bold text-red-900">No se pudo completar la operación</p>
              <p className="font-normal text-[11px] leading-relaxed text-red-700">{decodeURIComponent(errorMsg)}</p>
            </div>
          </div>
        )}

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
              Nómina de Preselección ({candidates.length})
            </h4>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="pb-2">Centro / Red Derivadora</th>
                    <th className="pb-2">Fórmula</th>
                    <th className="pb-2">Estado</th>
                    <th className="pb-2">Última Actualización</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((cand) => (
                    <tr key={cand.id} className="border-b border-border/50 hover:bg-secondary/10">
                      <td className="py-3 font-semibold text-slate-800">{cand.sourceCenter || "No especificado"}</td>
                      <td className="py-3 text-slate-400">
                        {cand.preRegistrationFormResponseRef ? "Formulario" : "Planilla"}
                      </td>
                      <td className="py-3">
                        {cand.convertedToCaseId ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold text-[10px]">
                            Convertida a caso
                          </span>
                        ) : (
                          <CandidateStatusSelect candidateId={cand.id} status={cand.status} />
                        )}
                      </td>
                      <td className="py-3 text-slate-500">
                        {new Date(cand.updatedAt).toLocaleDateString("es-CL")}
                      </td>
                    </tr>
                  ))}
                  {candidates.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        No hay personas en la nómina de preselección aún.
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
                <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Acompañante PER Disponible</label>
                <select
                  name="perId"
                  required
                  className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
                >
                  <option value="">-- Seleccionar --</option>
                  {availablePers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.user?.name || "PER"}
                    </option>
                  ))}
                </select>
                {availablePers.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    No hay PER disponibles: todos tienen un acompañamiento activo o no están habilitados.
                  </p>
                )}
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

              <div>
                <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-wider text-[10px]">Acta de Primer Encuentro</label>
                <input
                  type="url"
                  name="actaPrimerEncuentro"
                  required={!isDemo}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
                />
                <p className="text-[9px] text-slate-400 mt-1">
                  Se copiará con nombre normalizado dentro de 01_Vinculación. La dupla queda formalizada y con carpeta e IAP creados al enviar este formulario.
                </p>
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

        {/* Historial de Duplas y Matches Registrados */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span>🤝</span> Historial de Duplas y Matches Registrados ({matches.length})
          </h4>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-2">Código Caso</th>
                  <th className="pb-2">Origen / Postulante</th>
                  <th className="pb-2">Acompañante PER</th>
                  <th className="pb-2">Estado Match</th>
                  <th className="pb-2">Estado Caso</th>
                  <th className="pb-2">Fecha Match</th>
                  <th className="pb-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-secondary/10">
                    <td className="py-3 font-bold text-blue-700">{m.code}</td>
                    <td className="py-3 font-semibold text-slate-800">
                      {m.candidate?.sourceCenter || m.genderSelfId || "Ingreso Directo"}
                    </td>
                    <td className="py-3 text-slate-700 font-medium">
                      {m.per?.user?.name || "PER Asignado"}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                        m.matchStatus === "FORMALIZADO" 
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : m.matchStatus === "VALIDADO"
                            ? "bg-blue-50 text-blue-800 border border-blue-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}>
                        {m.matchStatus || "PROPUESTO"}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600 font-medium">
                      {m.status}
                    </td>
                    <td className="py-3 text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString("es-CL")}
                    </td>
                    <td className="py-3">
                      <a
                        href={`/coordinacion/casos?caseCode=${m.code}`}
                        className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 rounded-lg text-[10px] inline-block shadow-sm transition"
                      >
                        👁️ Ver e Iniciar
                      </a>
                    </td>
                  </tr>
                ))}
                {matches.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-slate-400">
                      No se han conformado duplas ni matches aún en esta región.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
