import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";
import { syncMirrorSheet } from "@/server/google/workspace";
import { mapAlertTypeToLabel } from "@/lib/nomenclatures";

// Server action for manual Sheets Mirror sync from the dashboard
async function triggerSheetsSync(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") throw new Error("No autorizado");

  const regionId = String(formData.get("regionId") || "").trim();
  const query = new URLSearchParams();
  if (regionId) query.set("regionId", regionId);

  try {
    await syncMirrorSheet(user.isDemo);
    query.set("sync", "success");
  } catch (error) {
    console.error("Error al sincronizar Google Workspace:", error);
    query.set(
      "sync",
      error instanceof Error &&
        error.message.includes("Integración Google Workspace no configurada")
        ? "not-configured"
        : "error",
    );
  }

  redirect(`/admin?${query.toString()}`);
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ regionId?: string; sync?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const selectedRegion = params.regionId || null;

  // Enforce auth and admin access
  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  const isDemo = Boolean(user.isDemo);

  // 1. Fetch case statistics for KPIs (filtered by region if selected and isDemo)
  const caseWhere: any = { isDemo };
  if (selectedRegion) caseWhere.regionId = selectedRegion;

  const allCases = await prisma.pACase.findMany({
    where: caseWhere,
    include: {
      tasks: true,
      per: {
        include: {
          user: true,
        },
      },
    },
  });

  const totalCasesCount = allCases.length;

  // 1.2. Query task statistics for indicators (filtered by region if selected and isDemo)
  const taskWhere: any = { isDemo };
  if (selectedRegion) taskWhere.regionId = selectedRegion;

  const totalTasksCount = await prisma.task.count({ where: taskWhere });
  const completedTasksCount = await prisma.task.count({ where: { ...taskWhere, status: "VALIDADA" } });
  const overdueTasksCount = await prisma.task.count({ where: { ...taskWhere, status: "ATRASADA" } });
  const revisionTasksCount = await prisma.task.count({ where: { ...taskWhere, status: { in: ["ENVIADA", "EN_REVISION"] } } });
  const pendingTasksCount = await prisma.task.count({ where: { ...taskWhere, status: "PENDIENTE" } });

  // KPI 1.1: Continuity cases with >= 3 months of adherence
  const continuityCases = allCases.filter((c) => c.type === "CONTINUIDAD");
  const continuityCount = continuityCases.length;
  
  const adherentContinuityCount = continuityCases.filter((c) => {
    if (!c.startDate || !c.lastSessionDate) return false;
    const diff = c.lastSessionDate.getTime() - c.startDate.getTime();
    const diffDays = diff / (1000 * 60 * 60 * 24);
    return diffDays >= 90; // 3 months
  }).length;

  const kpiAdherencePercent = continuityCount > 0 
    ? Math.round((adherentContinuityCount / continuityCount) * 100) 
    : 0;

  // KPI 1.2: Minimum 60% new cases
  const newCasesCount = allCases.filter((c) => c.type === "NUEVO").length;
  const kpiNewCasesPercent = totalCasesCount > 0 
    ? Math.round((newCasesCount / totalCasesCount) * 100) 
    : 0;

  // KPI 2.1: Diagnóstico ex-ante / ex-post (target >= 80%)
  const casesWithExAnte = allCases.filter((c) => c.exAnteTaskId).length;
  const kpiExAntePercent = totalCasesCount > 0 
    ? Math.round((casesWithExAnte / totalCasesCount) * 100) 
    : 0;

  // KPI 2.3: Satisfaction survey completed on closed cases
  const closedCases = allCases.filter((c) => ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"].includes(c.status));
  const closedCount = closedCases.length;
  const closedWithSatisfaction = closedCases.filter((c) => c.satisfactionTaskId).length;
  const kpiSatisfactionPercent = closedCount > 0 
    ? Math.round((closedWithSatisfaction / closedCount) * 100) 
    : 0;

  // KPI 2.2: Monitoreo del IAP (verificar evaluaciones del plan para al menos el 80% de participantes)
  const iapWhere: any = { paCase: { isDemo } };
  if (selectedRegion) iapWhere.paCase.regionId = selectedRegion;

  const iapsWithEvaluations = await prisma.iAPRecord.count({
    where: {
      ...iapWhere,
      goals: {
        some: {
          result: { not: null }
        }
      }
    }
  });
  const kpiIapMonitoredPercent = totalCasesCount > 0
    ? Math.round((iapsWithEvaluations / totalCasesCount) * 100)
    : 0;

  // KPI 4: Training & Mentoría 360 (filtered by regional PERs if selected)
  const trainingRecords = await prisma.trainingRecord.findMany({
    where: selectedRegion ? { perProfile: { regionId: selectedRegion } } : undefined,
    include: {
      perProfile: {
        include: {
          user: true,
        },
      },
    },
  });

  const totalTrainingCount = trainingRecords.length;
  const completedTrainingCount = trainingRecords.filter((t) => t.status === "REALIZADA" || t.status === "EVALUADA").length;
  const trainingProgressPercent = totalTrainingCount > 0 
    ? Math.round((completedTrainingCount / totalTrainingCount) * 100) 
    : 0;

  // KPI 5: Methodological phase distribution of active cases
  const phaseStats = {
    VINCULACION: allCases.filter(c => c.status === "VINCULACION").length,
    CONEXION: allCases.filter(c => c.status === "CONEXION").length,
    FINALIZACION: allCases.filter(c => c.status === "FINALIZACION").length,
    EGRESO_TERMINADOS: allCases.filter(c => ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION", "SUSPENDIDA"].includes(c.status)).length,
  };

  // 1.3. Additional operational stats (filtered by region if selected)
  const sessionWhere: any = { isDemo };
  if (selectedRegion) sessionWhere.regionId = selectedRegion;

  const totalSessionsCount = await prisma.sessionLog.count({ where: sessionWhere });
  const presencialSessionsCount = await prisma.sessionLog.count({ where: { ...sessionWhere, modality: "PRESENCIAL" } });
  const onlineSessionsCount = await prisma.sessionLog.count({ where: { ...sessionWhere, modality: "ONLINE" } });
  const totalInstrumentsCount = await prisma.instrument.count();

  // 2. Fetch Regional summary
  const regions = [
    { name: "Metropolitana", quota: 20 },
    { name: "Valparaíso", quota: 8 },
    { name: "Tarapacá", quota: 6 },
    { name: "Biobío", quota: 4 },
    { name: "Los Ríos", quota: 11 },
  ];

  const regionalData = await Promise.all(
    regions.map(async (reg) => {
      const activeCount = await prisma.pACase.count({
        where: { regionId: reg.name, isDemo, status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] } },
      });
      const alertCount = await prisma.alert.count({
        where: { regionId: reg.name, isDemo, status: "ABIERTA" },
      });
      const candidatesCount = await prisma.pACandidate.count({
        where: { regionId: reg.name, isDemo },
      });
      return {
        ...reg,
        active: activeCount,
        candidates: candidatesCount,
        alerts: alertCount,
      };
    })
  );

  // 3. Fetch active critical alerts
  const activeAlerts = await prisma.alert.findMany({
    where: { status: "ABIERTA", isDemo },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <AppShell user={user}>
      <div className="space-y-8">
        {params.sync === "success" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Google Sheets se sincronizó correctamente.
          </div>
        )}
        {params.sync === "not-configured" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Google Workspace todavía no está configurado. Define{" "}
            <code>GOOGLE_APPS_SCRIPT_URL</code> y{" "}
            <code>GOOGLE_APPS_SCRIPT_SECRET</code> en el entorno y vuelve a
            desplegar.
          </div>
        )}
        {params.sync === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            No fue posible sincronizar Google Workspace. Revisa el despliegue
            de Apps Script y vuelve a intentarlo.
          </div>
        )}

        {/* Banner with sync controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">
              Resumen Operativo PER 2026-2027
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Monitoreo operativo y consolidación de KPIs para reportes a SENDA.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <form action={triggerSheetsSync}>
              <input type="hidden" name="regionId" value={selectedRegion || ""} />
              <button
                type="submit"
                className="py-1.5 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-350 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition active:scale-[0.98] cursor-pointer"
              >
                🔄 Sincronizar Google Workspace
              </button>
            </form>
          </div>
        </div>

        {/* Regional Navigation Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          <a
            href="/admin"
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition ${
              !selectedRegion
                ? "border-blue-600 text-blue-700 font-extrabold"
                : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
            }`}
          >
            🌐 Todo el País (Nacional)
          </a>
          {regions.map((reg) => {
            const isActive = selectedRegion === reg.name;
            return (
              <a
                key={reg.name}
                href={`/admin?regionId=${encodeURIComponent(reg.name)}`}
                className={`px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                  isActive
                    ? "border-blue-600 text-blue-700 font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
                }`}
              >
                📍 {reg.name}
              </a>
            );
          })}
        </div>

        {/* KPI Grid Section */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">
            Objetivos Contractuales del Pilotaje
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
            
            {/* Adherence KPI */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Adherencia ≥3 Meses
                </span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">
                  Meta 80%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold">{kpiAdherencePercent}%</span>
                <span className="text-xs text-slate-500">
                  ({adherentContinuityCount} de {continuityCount} casos)
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(kpiAdherencePercent, 100)}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                Porcentaje de acompañamientos de continuidad con adherencia sostenida.
              </p>
            </div>

            {/* New vs Continuity Ratio KPI */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Casos Nuevos
                </span>
                <span className="text-xs bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-semibold">
                  Meta ≥60%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold">{kpiNewCasesPercent}%</span>
                <span className="text-xs text-slate-500">
                  ({newCasesCount} de {totalCasesCount} total)
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(kpiNewCasesPercent, 100)}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                Porcentaje de nuevos ingresos versus acompañamientos reasignados.
              </p>
            </div>

            {/* Diagnostic Assessment Cover KPI */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Evaluación Ex-Ante
                </span>
                <span className="text-xs bg-blue-50 text-blue-800 px-2 py-0.5 rounded font-semibold">
                  Meta 80%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold">{kpiExAntePercent}%</span>
                <span className="text-xs text-slate-500">
                  ({casesWithExAnte} de {totalCasesCount} casos)
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(kpiExAntePercent, 100)}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                Personas acompañadas con el diagnóstico global de capital de recuperación completado.
              </p>
            </div>

            {/* Satisfaction KPI */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Encuestas de Cierre
                </span>
                <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded font-semibold">
                  Meta 80%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold">{kpiSatisfactionPercent}%</span>
                <span className="text-xs text-slate-500">
                  ({closedWithSatisfaction} de {closedCount} cerrados)
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
                <div 
                  className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(kpiSatisfactionPercent, 100)}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                Satisfacción registrada al momento de egreso o desvinculación formal.
              </p>
            </div>

            {/* Monitoreo del IAP KPI (Meta 2.2) */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Monitoreo del IAP
                </span>
                <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-semibold">
                  Meta 80%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-extrabold">{kpiIapMonitoredPercent}%</span>
                <span className="text-xs text-slate-500">
                  ({iapsWithEvaluations} de {totalCasesCount} planes)
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-4 overflow-hidden">
                <div 
                  className="bg-indigo-650 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(kpiIapMonitoredPercent, 100)}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
                Evaluaciones de objetivos del plan verificadas para el acompañamiento (Meta 2.2).
              </p>
            </div>

          </div>
        </div>

        {/* Regional Monitoring Table */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 p-6 bg-card border border-border rounded-2xl shadow-sm">
            <h3 className="font-bold text-sm text-slate-800 mb-4">
              Cobertura y Gestión Territorial
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="pb-3">Región</th>
                    <th className="pb-3 text-center">Cupos Max</th>
                    <th className="pb-3 text-center">Activos</th>
                    <th className="pb-3 text-center">Candidatos</th>
                    <th className="pb-3 text-center">Uso de Cupo</th>
                    <th className="pb-3 text-center">Tareas Atrasadas</th>
                  </tr>
                </thead>
                <tbody>
                  {regionalData.map((reg) => {
                    const usagePercent = Math.round((reg.active / reg.quota) * 100);
                    return (
                      <tr key={reg.name} className="border-b border-border/50 hover:bg-secondary/20 transition">
                        <td className="py-4 font-semibold">{reg.name}</td>
                        <td className="py-4 text-center text-slate-500">{reg.quota}</td>
                        <td className="py-4 text-center font-bold">{reg.active}</td>
                        <td className="py-4 text-center text-slate-500">{reg.candidates}</td>
                        <td className="py-4">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-semibold">{usagePercent}%</span>
                            <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-primary h-full rounded-full" 
                                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          {reg.alerts > 0 ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px]">
                              {reg.alerts} atrasadas
                            </span>
                          ) : (
                            <span className="text-slate-500 font-semibold">✔️ Al día</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alert Center & Gender Breakdown Side Panel */}
          <div className="space-y-6">
            
            {/* Methodological Phase Distribution Panel */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
              <h3 className="font-bold text-sm text-slate-800 mb-4">
                Distribución por Fase Metodológica
              </h3>
              <div className="space-y-3 text-xs">
                {[
                  { name: "Vinculación", count: phaseStats.VINCULACION, color: "bg-blue-600" },
                  { name: "Conexión", count: phaseStats.CONEXION, color: "bg-indigo-600" },
                  { name: "Cierre / Finalización", count: phaseStats.FINALIZACION, color: "bg-emerald-600" },
                  { name: "Egresados / Historial", count: phaseStats.EGRESO_TERMINADOS, color: "bg-slate-400" },
                ].map((phase) => {
                  const percent = totalCasesCount > 0 ? Math.round((phase.count / totalCasesCount) * 100) : 0;
                  return (
                    <div key={phase.name} className="space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>{phase.name}</span>
                        <span>{phase.count} ({percent}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`${phase.color} h-full`}
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Operational Sessions & Instruments Index */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
              <h3 className="font-bold text-sm text-slate-800 mb-4">
                Índice de Bitácoras e Instrumentos
              </h3>
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-500">Total Encuentros (Bitácoras):</span>
                    <span className="font-extrabold text-slate-800">{totalSessionsCount}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 pl-2 border-l-2 border-slate-200">
                    <span>Presenciales: {presencialSessionsCount}</span>
                    <span>Remotos: {onlineSessionsCount}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">Instrumentos en Catálogo:</span>
                  <span className="font-extrabold text-slate-800">{totalInstrumentsCount} vigentes</span>
                </div>
              </div>
            </div>

            {/* Task and Milestone Progress Indicators */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
              <h3 className="font-bold text-sm text-slate-800 mb-4">
                Indicadores de Hitos y Tareas
              </h3>
              <div className="space-y-4 text-xs">
                <p className="text-slate-500 leading-relaxed">
                  De un total de <span className="font-bold text-slate-800">{totalTasksCount}</span> hitos programados en el país:
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2.5 bg-red-55/40 border border-red-200 rounded-xl">
                    <span className="font-semibold text-red-900">Atrasadas o Vencidas</span>
                    <span className="font-extrabold text-red-700">{overdueTasksCount} tareas</span>
                  </div>
                  <div className="flex justify-between items-center p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <span className="font-semibold text-emerald-800">Validadas y Completadas</span>
                    <span className="font-extrabold text-emerald-700">{completedTasksCount} tareas</span>
                  </div>
                  <div className="flex justify-between items-center p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                    <span className="font-semibold text-blue-800">En Revisión de Dupla</span>
                    <span className="font-extrabold text-blue-700">{revisionTasksCount} tareas</span>
                  </div>
                  <div className="flex justify-between items-center p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="font-semibold text-slate-700">Pendientes de Registro</span>
                    <span className="font-extrabold text-slate-600">{pendingTasksCount} tareas</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    </AppShell>
  );
}
