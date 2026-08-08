import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { resolveAlertAction } from "@/app/actions/coordinator";
import { checkAllAlertRules } from "@/server/services/alerts.service";
import { mapAlertTypeToLabel } from "@/lib/nomenclatures";

export const dynamic = "force-dynamic";

export default async function CoordinatorPage({
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

  // Recalcula atrasos e inactividad en cada carga del resumen regional — nadie
  // tiene que acordarse de apretar un botón para que las alertas existan.
  await checkAllAlertRules(isDemo).catch((err) => {
    console.error("No se pudieron recalcular las reglas de alerta:", err);
  });

  // 1. Fetch Candidates (Fase 2 preselection funnel)
  const candidates = await prisma.pACandidate.findMany({
    where: { regionId: user.regionId, isDemo },
  });

  // Funnel stage definitions
  const stages = [
    "DERIVADA",
    "CONTACTADA",
    "PREINSCRITA",
    "ENTREVISTADA",
    "ADMISIBLE",
    "NO_ADMISIBLE",
    "SELECCIONADA",
    "EN_ESPERA",
    "DESCARTADA",
  ];

  const funnelSummary = stages.map((st) => ({
    stage: st,
    count: candidates.filter((c) => c.status === st).length,
  }));

  // 2. Fetch regional task statistics for indicators
  const totalRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, isDemo } });
  const completedRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, isDemo, status: "VALIDADA" } });
  const overdueRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, isDemo, status: "ATRASADA" } });
  const revisionRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, isDemo, status: { in: ["ENVIADA", "EN_REVISION"] } } });
  const pendingRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, isDemo, status: "PENDIENTE" } });

  // 3. Fetch active cases in the region
  const regionalCases = await prisma.pACase.findMany({
    where: { regionId: user.regionId, isDemo },
  });

  // 4. Fetch open methodological support alerts for the region
  const activeAlerts = await prisma.alert.findMany({
    where: { regionId: user.regionId, status: "ABIERTA", isDemo },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell user={user}>
      <div className="space-y-8">

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-2xl flex items-start gap-2 shadow-sm">
            <span className="text-sm shrink-0">⚠️</span>
            <p className="font-normal text-[11px] leading-relaxed text-red-755">{decodeURIComponent(errorMsg)}</p>
          </div>
        )}

        {/* Top Action Bar */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-extrabold text-base text-slate-900">Coordinación Regional: {user.regionId}</h3>
          <p className="text-xs text-slate-500 mt-1">
            Monitoreo operativo de hitos y consolidación regional.
          </p>
        </div>

        {/* Indicators Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Milestone stats card */}
          <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-800">
              Hitos Regionales
            </h3>
            <p className="text-xs text-slate-500">
              De un total de <span className="font-bold text-slate-800">{totalRegTasksCount}</span> hitos programados en la región:
            </p>
            <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
              <div className="p-2 bg-red-50 border border-red-100 rounded-xl">
                <span className="block font-bold text-red-700 text-sm">{overdueRegTasksCount}</span>
                <span className="text-red-850 font-semibold">Atrasados</span>
              </div>
              <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                <span className="block font-bold text-emerald-700 text-sm">{completedRegTasksCount}</span>
                <span className="text-emerald-850 font-semibold">Validados</span>
              </div>
              <div className="p-2 bg-blue-50 border border-blue-100 rounded-xl">
                <span className="block font-bold text-blue-700 text-sm">{revisionRegTasksCount}</span>
                <span className="text-blue-850 font-semibold">En Revisión</span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="block font-bold text-slate-600 text-sm">{pendingRegTasksCount}</span>
                <span className="text-slate-650 font-semibold">Pendientes</span>
              </div>
            </div>
          </div>

          {/* Cases stats card */}
          <div className="p-6 bg-card border border-border rounded-2xl shadow-sm flex flex-col justify-between">
            <div className="space-y-2">
              <h3 className="font-bold text-sm text-slate-800">
                Acompañamientos Activos
              </h3>
              <p className="text-xs text-slate-500">
                Resumen de casos activos en territorio:
              </p>
            </div>
            <div className="text-center py-4 bg-slate-50 border border-slate-200 rounded-xl mt-4">
              <span className="block text-3xl font-extrabold text-blue-700">{regionalCases.length}</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Casos en Proceso</span>
            </div>
          </div>

          {/* Candidates summary card */}
          <div className="p-6 bg-card border border-border rounded-2xl shadow-sm flex flex-col justify-between">
            <div className="space-y-2">
              <h3 className="font-bold text-sm text-slate-800">
                Nómina Preselección
              </h3>
              <p className="text-xs text-slate-500">
                Total de personas en preselección (Fase 2):
              </p>
            </div>
            <div className="text-center py-4 bg-slate-50 border border-slate-200 rounded-xl mt-4">
              <span className="block text-3xl font-extrabold text-blue-700">{candidates.length}</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Postulantes Derivados</span>
            </div>
          </div>

        </div>

        {/* pre-selection funnel stage summary card */}
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-800 mb-4">
            Distribución del Embudo de Preselección (Fase 2)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3 text-center">
            {funnelSummary.map((f) => (
              <div key={f.stage} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="block text-lg font-extrabold text-blue-700">{f.count}</span>
                <span className="text-[9px] text-slate-500 font-bold tracking-wider">{f.stage}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Methodological support panel */}
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Casos que Requieren Apoyo Metodológico</h3>
            <p className="text-xs text-slate-500 mt-1">
              Alertas abiertas por atraso o inactividad. Registra la nota de seguimiento para cerrarlas.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-slate-900">
                    {mapAlertTypeToLabel(alert.type)}
                  </span>
                </div>
                <form action={resolveAlertAction} className="space-y-2">
                  <input type="hidden" name="alertId" value={alert.id} />
                  <textarea
                    name="note"
                    placeholder="Registrar notas de apoyo o resolución..."
                    required
                    rows={3}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[10px] outline-none focus:border-primary resize-none"
                  ></textarea>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="py-1 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-semibold cursor-pointer"
                    >
                      Guardar Registro
                    </button>
                  </div>
                </form>
              </div>
            ))}
            {activeAlerts.length === 0 && (
              <p className="col-span-full text-xs text-slate-450 py-4 text-center">✔️ Todos los acompañamientos al día.</p>
            )}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
