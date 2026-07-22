import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { triggerAlertRulesAction } from "@/app/actions/coordinator";

export const dynamic = "force-dynamic";

export default async function CoordinatorPage() {
  const user = await getCurrentUser();

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }

  // 1. Fetch Candidates (Fase 2 preselection funnel)
  const candidates = await prisma.pACandidate.findMany({
    where: { regionId: user.regionId },
  });

  // Funnel stage definitions
  const stages = [
    "DERIVADA",
    "CONTACTADA",
    "PREINSCRITA",
    "ENTREVISTADA",
    "ADMISIBLE",
    "SELECCIONADA",
    "EN_ESPERA",
  ];

  const funnelSummary = stages.map((st) => ({
    stage: st,
    count: candidates.filter((c) => c.status === st).length,
  }));

  // 2. Fetch regional task statistics for indicators
  const totalRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId } });
  const completedRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, status: "VALIDADA" } });
  const overdueRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, status: "ATRASADA" } });
  const revisionRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, status: { in: ["ENVIADA", "EN_REVISION"] } } });
  const pendingRegTasksCount = await prisma.task.count({ where: { regionId: user.regionId, status: "PENDIENTE" } });

  // 3. Fetch active cases in the region
  const regionalCases = await prisma.pACase.findMany({
    where: { regionId: user.regionId },
  });

  return (
    <AppShell user={user}>
      <div className="space-y-8">
        
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Coordinación Regional: {user.regionId}</h3>
            <p className="text-xs text-slate-500 mt-1">
              Monitoreo operativo de hitos y consolidación regional.
            </p>
          </div>
          <form action={triggerAlertRulesAction}>
            <button
              type="submit"
              className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition active:scale-[0.98] cursor-pointer"
            >
              🔄 Verificar Atrasos e Inactividad
            </button>
          </form>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
            {funnelSummary.map((f) => (
              <div key={f.stage} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="block text-lg font-extrabold text-blue-700">{f.count}</span>
                <span className="text-[9px] text-slate-500 font-bold tracking-wider">{f.stage}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  );
}
