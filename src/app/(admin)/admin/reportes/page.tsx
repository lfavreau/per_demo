import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { freezeSnapshotAction } from "@/app/actions/coordinator";
import { computeKpis } from "@/server/services/reports.service";

export const dynamic = "force-dynamic";

export default async function AdminReportesPage({ searchParams }: { searchParams: any }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }
  const isDemo = Boolean(user.isDemo);

  // Handle async searchParams safely
  const resolvedParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const selectedRegion = resolvedParams?.regionId || null;
  const selectedPeriod = resolvedParams?.periodKey || "ACTUAL";

  const regions = [
    { name: "Metropolitana", key: "MET" },
    { name: "Valparaíso", key: "VAL" },
    { name: "Tarapacá", key: "TAR" },
    { name: "Biobío", key: "BIO" },
    { name: "Los Ríos", key: "LOS" },
  ];

  const periods = [
    { key: "ACTUAL", name: "Tiempo Real (Actual)", dateStr: "" },
    { key: "INFORME_2", name: "Informe 2 (Corte 14/06/2026)", dateStr: "2026-06-14T23:59:59Z" },
    { key: "INFORME_3", name: "Informe 3 (Corte 02/09/2026)", dateStr: "2026-09-02T23:59:59Z" },
    { key: "INFORME_4", name: "Informe 4 (Corte 20/01/2027)", dateStr: "2027-01-20T23:59:59Z" },
    { key: "INFORME_5", name: "Informe 5 (Corte 01/08/2027)", dateStr: "2027-08-01T23:59:59Z" },
    { key: "INFORME_6", name: "Informe 6 (Corte 12/12/2027)", dateStr: "2027-12-12T23:59:59Z" },
  ];

  const activePeriod = periods.find(p => p.key === selectedPeriod) || periods[0];
  const cutOffDate = activePeriod.dateStr ? new Date(activePeriod.dateStr) : null;
  const dateFilter = cutOffDate ? { lte: cutOffDate } : undefined;

  // Check if a frozen snapshot exists for this combination
  let frozenSnapshot = null;
  try {
    frozenSnapshot = await prisma.reportSnapshot.findFirst({
      where: {
        periodKey: selectedPeriod,
        regionId: selectedRegion || null,
        isDemo,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (e) {
    console.error("Error fetching reportSnapshot:", e);
  }

  let data: any = null;

  if (frozenSnapshot && frozenSnapshot.kpisJson) {
    try {
      data = JSON.parse(frozenSnapshot.kpisJson);
    } catch (e) {
      data = null;
    }
  }

  if (!data) {
    let allCases: any[] = [];
    let supervisions: any[] = [];
    let activations: any[] = [];

    try {
      const rawCases = await prisma.pACase.findMany({
        where: {
          regionId: selectedRegion ? selectedRegion : undefined,
          createdAt: dateFilter,
        },
        include: {
          per: {
            include: {
              user: true,
            },
          },
          candidate: true,
          iapRecords: {
            where: { createdAt: dateFilter },
            include: {
              domainMaps: true,
              goals: { where: { createdAt: dateFilter } },
            },
          },
          sessionLogs: {
            where: {
              date: dateFilter,
            },
          },
          tasks: {
            where: { createdAt: dateFilter },
            include: {
              instrument: true,
            },
          },
        },
      });
      allCases = rawCases.filter((c) => Boolean(c.isDemo) === isDemo);
    } catch (e) {
      console.error("Error fetching allCases in reportes:", e);
    }

    try {
      const rawSupervisions = await prisma.supervision.findMany({
        where: {
          regionId: selectedRegion ? selectedRegion : undefined,
          date: dateFilter,
        },
      });
      supervisions = rawSupervisions.filter((s) => Boolean(s.isDemo) === isDemo);
    } catch (e) {
      console.error("Error fetching supervisions in reportes:", e);
    }

    try {
      const rawActivations = await prisma.networkActivation.findMany({
        where: {
          date: dateFilter,
        },
        include: {
          networkDevice: true,
        },
      });
      activations = rawActivations.filter(
        (a) => Boolean(a.isDemo) === isDemo && (!selectedRegion || a.networkDevice?.regionId === selectedRegion)
      );
    } catch (e) {
      console.error("Error fetching activations in reportes:", e);
    }

    data = computeKpis({ cases: allCases, supervisions, activations });
  }

  // Destructure computed variables for display
  const {
    femaleCount: femaleCountVal,
    maleCount: maleCountVal,
    otherGenderCount: otherGenderCountVal,
    age18_29: age18_29Val,
    age30_49: age30_49Val,
    age50Plus: age50PlusVal,
    eduBasic: eduBasicVal,
    eduMedia: eduMediaVal,
    eduTecnica: eduTecnicaVal,
    eduProf: eduProfVal,
    jobDesocupado: jobDesocupadoVal,
    jobInformal: jobInformalVal,
    jobFormal: jobFormalVal,
    totalCasesCount: totalCasesCountVal,
    domainStats: domainStatsVal,
    newCases: newCasesVal,
    continuityCases: continuityCasesVal,
    newCasesPercent: newCasesPercentVal,
    levelBasic: levelBasicVal,
    levelIntermediate: levelIntermediateVal,
    levelIntense: levelIntenseVal,
    vinSesCount: vinSesCountVal,
    conSesCount: conSesCountVal,
    finSesCount: finSesCountVal,
    adherencePercent: adherencePercentVal,
    adherentContinuityCount: adherentContinuityCountVal,
    continuityCount: continuityCountVal,
    generalAdherencePercent: generalAdherencePercentVal,
    adherentAllCount: adherentAllCountVal,
    duplaFemFem: duplaFemFemVal,
    duplaMascMasc: duplaMascMascVal,
    duplaMixtaPerFem: duplaMixtaPerFemVal,
    duplaMixtaPerMasc: duplaMixtaPerMascVal,
    supervisionCount: supervisionCountVal,
    intermediateEvaluationsCount: intermediateEvaluationsCountVal,
    closedCount: closedCountVal,
    closedWithSatisfaction: closedWithSatisfactionVal,
    satisfactionPercent: satisfactionPercentVal,
    networkDevices: networkDevicesVal,
    generalCsvContent: generalCsvContentVal,
  } = data;

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Consola de Reportes y Extracción Cuantitativa</h3>
            <p className="text-xs text-slate-500 mt-1">
              Filtra la información territorial del pilotaje y extrae los datos desagregados de acuerdo a las metas del convenio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(generalCsvContentVal)}`}
              download={`matriz_general_consolidado_${selectedRegion || "nacional"}.csv`}
              className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 font-semibold transition shadow-2xs cursor-pointer text-xs text-center flex items-center justify-center gap-1.5"
            >
              📥 Exportar Matriz General
            </a>
          </div>
        </div>

        {/* Period Selector Controls */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Período de Corte del Informe</h4>
              <p className="text-[11px] text-slate-400">Selecciona el período de informe para calcular los KPIs acumulados a esa fecha de corte (as-of).</p>
            </div>
            <form method="GET" className="flex items-center gap-2 w-full md:w-auto">
              {selectedRegion && <input type="hidden" name="regionId" value={selectedRegion} />}
              <select
                name="periodKey"
                defaultValue={selectedPeriod}
                className="w-full md:w-auto px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-slate-400"
              >
                {periods.map(p => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </select>
              <button type="submit" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-xs font-semibold rounded-xl cursor-pointer transition shadow-2xs">
                Filtrar
              </button>
            </form>
          </div>

          {/* Frozen Snapshot Notice or Freeze Button */}
          {frozenSnapshot ? (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-[11px] font-semibold flex items-center justify-between">
              <span>⚠️ Los datos mostrados corresponden al snapshot oficial del informe congelado el {new Date(frozenSnapshot.createdAt).toLocaleDateString("es-CL")} por Administración.</span>
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold uppercase text-[9px]">CONGELADO</span>
            </div>
          ) : (
            selectedPeriod !== "ACTUAL" && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-slate-600 font-medium">⚠️ No existe un snapshot congelado para este informe. Los datos se calculan dinámicamente.</span>
                <form action={freezeSnapshotAction}>
                  <input type="hidden" name="periodKey" value={selectedPeriod} />
                  <input type="hidden" name="regionId" value={selectedRegion || "NACIONAL"} />
                  <input type="hidden" name="cutOffDate" value={cutOffDate ? cutOffDate.toISOString() : ""} />
                  <input type="hidden" name="kpisJson" value={JSON.stringify(data)} />
                  <button type="submit" className="w-full sm:w-auto px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[10px] cursor-pointer">
                    ❄️ Congelar Snapshot Oficial
                  </button>
                </form>
              </div>
            )
          )}
        </div>

        {/* HORIZONTAL NAVIGATION SUB-TABS */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          <a
            href={selectedPeriod !== "ACTUAL" ? `/admin/reportes?periodKey=${selectedPeriod}` : "/admin/reportes"}
            className={`px-4 py-2.5 text-xs font-semibold transition ${
              !selectedRegion
                ? "border-b-2 border-slate-900 text-slate-900 font-extrabold"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            🌐 Todo el País (Nacional)
          </a>
          {regions.map((reg) => {
            const isActive = selectedRegion === reg.name;
            const linkHref = selectedPeriod !== "ACTUAL" 
              ? `/admin/reportes?regionId=${encodeURIComponent(reg.name)}&periodKey=${selectedPeriod}` 
              : `/admin/reportes?regionId=${encodeURIComponent(reg.name)}`;
            return (
              <a
                key={reg.name}
                href={linkHref}
                className={`px-4 py-2.5 text-xs font-semibold transition ${
                  isActive
                    ? "border-b-2 border-slate-900 text-slate-900 font-extrabold"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                📍 {reg.name}
              </a>
            );
          })}
        </div>

        {/* SÍNTESIS EJECUTIVA DE DESEMPEÑO (MINI RESUMEN INICIAL SOBRIO) */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-3 gap-2">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 tracking-tight">Síntesis Ejecutiva de Desempeño</h3>
              <p className="text-[11px] text-slate-500">Resumen consolidado del seguimiento operativo y cumplimiento de metas del convenio.</p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[10px]">
              {selectedRegion ? `Región: ${selectedRegion}` : "Alcance Nacional"}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Casos Registrados</span>
              <span className="text-2xl font-bold text-slate-900 block">{totalCasesCountVal}</span>
              <span className="text-[10px] text-slate-400 block">Personas en el pilotaje</span>
            </div>

            <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Adherencia General</span>
              <span className="text-2xl font-bold text-slate-900 block">{generalAdherencePercentVal}%</span>
              <span className="text-[10px] text-slate-500 block">{adherentAllCountVal} de {totalCasesCountVal} casos con retención</span>
            </div>

            <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Nuevos Acompañamientos</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-900">{newCasesPercentVal}%</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${newCasesPercentVal >= 60 ? "bg-slate-200 text-slate-800" : "bg-slate-200 text-slate-800"}`}>
                  {newCasesPercentVal >= 60 ? "Meta 60% OK" : "< 60%"}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block">{newCasesVal} casos de primer ingreso</span>
            </div>

            <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">Satisfacción al Cierre</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-900">{satisfactionPercentVal}%</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${satisfactionPercentVal >= 80 ? "bg-slate-200 text-slate-800" : "bg-slate-200 text-slate-800"}`}>
                  {satisfactionPercentVal >= 80 ? "Meta 80% OK" : "Pendiente"}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 block">{closedWithSatisfactionVal} de {closedCountVal} egresos</span>
            </div>
          </div>
        </div>

        {/* BLOQUE: SEGUIMIENTO OPERATIVO Y CALIDAD TÉCNICA */}
        <div className="space-y-6">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Seguimiento Operativo y Calidad Técnica
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Métricas dinámicas para el monitoreo de la intervención técnica, carga de trabajo, adherencia y gestión territorial.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            
            {/* Capitales de recuperación */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h4 className="font-bold text-slate-900 text-sm">Desarrollo de Capitales de Recuperación (IAP)</h4>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 font-semibold text-slate-500">
                    <th className="py-2">Ámbito del Capital</th>
                    <th className="py-2 text-center">Priorizado Ex-Ante</th>
                    <th className="py-2 text-center">Avances Ex-Post</th>
                  </tr>
                </thead>
                <tbody>
                  {domainStatsVal.map((d: any) => (
                    <tr key={d.domain} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="py-2 font-medium text-slate-700">{d.domain}</td>
                      <td className="py-2 text-center font-bold text-slate-900">{d.exAnteCount}</td>
                      <td className="py-2 text-center font-bold text-slate-900">{d.exPostCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 italic">
                Evalúa la evolución cualitativa/cuantitativa en las 9 dimensiones del acompañamiento.
              </p>
            </div>

            {/* Niveles de intensidad IAP */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h4 className="font-bold text-slate-900 text-sm">Clasificación por Niveles de Intensidad (IAP)</h4>
              </div>
              <div className="space-y-4">
                <p className="text-slate-500">
                  Distribución de acompañamientos según el nivel de necesidades detectadas y perfil de complejidad:
                </p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Acompañamiento Básico (Rango Menor)</span>
                      <span className="font-bold text-slate-900">{levelBasicVal} casos</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-slate-400 h-full rounded-full" style={{ width: `${totalCasesCountVal > 0 ? (levelBasicVal/totalCasesCountVal)*100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Acompañamiento Intermedio (Rango Medio)</span>
                      <span className="font-bold text-slate-900">{levelIntermediateVal} casos</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-slate-600 h-full rounded-full" style={{ width: `${totalCasesCountVal > 0 ? (levelIntermediateVal/totalCasesCountVal)*100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Acompañamiento Intensivo (Rango Crítico)</span>
                      <span className="font-bold text-slate-900">{levelIntenseVal} casos</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-slate-900 h-full rounded-full" style={{ width: `${totalCasesCountVal > 0 ? (levelIntenseVal/totalCasesCountVal)*100 : 0}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic mt-2">
                Guía la asignación balanceada de casos a cada Par Especialista (PER).
              </p>
            </div>

            {/* Sesiones por Fase y Adherencia */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-sm">Sesiones por Fase y Retención (Adherencia)</h4>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-slate-700">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-xl font-bold text-slate-900">{vinSesCountVal}</span>
                    <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider block">Vinculación</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-xl font-bold text-slate-900">{conSesCountVal}</span>
                    <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider block">Conexión</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-xl font-bold text-slate-900">{finSesCountVal}</span>
                    <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider block">Finalización</span>
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                    <span>Adherencia de Continuidad:</span>
                    <span className="text-slate-900 text-sm">{adherencePercentVal}% ({adherentContinuityCountVal} de {continuityCountVal})</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-900 border-t border-slate-200 pt-1">
                    <span>Adherencia General (Total Casos):</span>
                    <span className="text-slate-900 text-sm">{generalAdherencePercentVal}% ({adherentAllCountVal} de {totalCasesCountVal})</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Permite vigilar el riesgo de deserción y medir el ritmo real de encuentros por fase.
              </p>
            </div>

            {/* Monitoreo y Supervisión Técnica */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-sm">Monitoreo y Supervisión Técnica (ET)</h4>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 block">Supervisiones Técnicas Realizadas</span>
                      <span className="text-[10px] text-slate-500">Sesiones de seguimiento de la dupla lideradas por el Equipo Técnico.</span>
                    </div>
                    <span className="text-2xl font-bold text-slate-900 px-3">{supervisionCountVal}</span>
                  </div>
                  <div className="flex justify-between items-center p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 block">Evaluaciones Intermedias Aplicadas</span>
                      <span className="text-[10px] text-slate-500">Verificación de avances a mitad de acompañamiento.</span>
                    </div>
                    <span className="text-2xl font-bold text-slate-900 px-3">{intermediateEvaluationsCountVal}</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-semibold">
                  📈 Cobertura de Monitoreo: {totalCasesCountVal > 0 ? Math.round((intermediateEvaluationsCountVal / totalCasesCountVal) * 100) : 0}% de casos evaluados a mitad del proceso.
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Respalda el acompañamiento profesional y cuidado de los equipos PER en terreno.
              </p>
            </div>

            {/* Gestión de redes */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 lg:col-span-2">
              <div className="border-b border-slate-100 pb-2">
                <h4 className="font-bold text-slate-900 text-sm">Gestión de Redes y Dispositivos Activados</h4>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 font-semibold text-slate-500">
                    <th className="py-2">Tipo de Dispositivo</th>
                    <th className="py-2">Nombre Red Municipal / Salud / Comunitaria</th>
                    <th className="py-2 text-center">Activados</th>
                  </tr>
                </thead>
                <tbody>
                  {networkDevicesVal.map((nd: any) => (
                    <tr key={nd.type} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="py-2 font-medium text-slate-700">{nd.type}</td>
                      <td className="py-2 text-slate-500">{nd.name}</td>
                      <td className="py-2 text-center font-bold text-slate-900">{nd.activatedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 italic">
                Refleja la integración social efectiva conectando participantes con salud, empleo y vivienda.
              </p>
            </div>

          </div>
        </div>

        {/* BLOQUE: INDICADORES DE CONVENIO SENDA (AUDITORÍA Y RENDICIÓN) */}
        <div className="space-y-6 pt-6 border-t border-slate-200">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Indicadores de Convenio SENDA (Auditoría y Rendición)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Indicadores contractuales de cumplimiento obligatorio para la rendición oficial de cuentas e informes formales.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            
            {/* Tasa de nuevos acompañamientos */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-sm">Tasa de Nuevos Acompañamientos</h4>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center mt-2">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-3xl font-extrabold text-slate-900">{newCasesPercentVal}%</span>
                    <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider block mt-1">Acompañamientos Nuevos</span>
                    <span className="block text-[10px] text-slate-400 mt-1 font-medium">({newCasesVal} de {totalCasesCountVal} casos)</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-3xl font-extrabold text-slate-900">{100 - newCasesPercentVal}%</span>
                    <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider block mt-1">De Continuidad</span>
                    <span className="block text-[10px] text-slate-400 mt-1 font-medium">({continuityCasesVal} de {totalCasesCountVal} casos)</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-semibold">
                  📢 {newCasesPercentVal >= 60 ? "Cumple Meta del Convenio" : "Bajo la meta fijada por SENDA"} (Meta de convenio: mínimo del 60% de acompañamientos nuevos en las regiones participantes).
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Exigencia presupuestaria de rotación y atención a nuevos ingresos.
              </p>
            </div>

            {/* Encuestas de Cierre y Satisfacción */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="font-bold text-slate-900 text-sm">Encuestas de Cierre y Satisfacción Usuaria</h4>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center mt-2">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-3xl font-extrabold text-slate-900">{closedCountVal}</span>
                    <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider block mt-1">Casos Cerrados/Egresados</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-3xl font-extrabold text-slate-900">{satisfactionPercentVal}%</span>
                    <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider block mt-1">Encuestas Completadas</span>
                    <span className="block text-[10px] text-slate-400 mt-1 font-medium">({closedWithSatisfactionVal} de {closedCountVal})</span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-semibold">
                  📢 Meta del Convenio: Evaluar satisfacción usuaria en al menos el 80% de las personas participantes egresadas.
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Evaluación cualitativa al egreso requerida por la contraparte institucional.
              </p>
            </div>

            {/* Desagregación Demográfica */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 lg:col-span-2">
              <h4 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2">
                Desagregación Demográfica y Caracterización de la Población ({totalCasesCountVal} Personas)
              </h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-xs text-slate-700">
                {/* Gender breakdown */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px] block">Distinción de Género</span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span>Femenino:</span>
                      <span className="font-bold text-slate-900">{femaleCountVal} ({totalCasesCountVal > 0 ? Math.round((femaleCountVal / totalCasesCountVal) * 100) : 0}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Masculino:</span>
                      <span className="font-bold text-slate-900">{maleCountVal} ({totalCasesCountVal > 0 ? Math.round((maleCountVal / totalCasesCountVal) * 100) : 0}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Otro / Sin registrar:</span>
                      <span className="font-bold text-slate-900">{otherGenderCountVal} ({totalCasesCountVal > 0 ? Math.round((otherGenderCountVal / totalCasesCountVal) * 100) : 0}%)</span>
                    </div>
                  </div>
                </div>

                {/* Age range breakdown */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px] block">Rango Etario</span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span>18 - 29 años:</span>
                      <span className="font-bold text-slate-900">{age18_29Val} ({totalCasesCountVal > 0 ? Math.round((age18_29Val / totalCasesCountVal) * 100) : 0}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>30 - 49 años:</span>
                      <span className="font-bold text-slate-900">{age30_49Val} ({totalCasesCountVal > 0 ? Math.round((age30_49Val / totalCasesCountVal) * 100) : 0}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>50+ años:</span>
                      <span className="font-bold text-slate-900">{age50PlusVal} ({totalCasesCountVal > 0 ? Math.round((age50PlusVal / totalCasesCountVal) * 100) : 0}%)</span>
                    </div>
                  </div>
                </div>

                {/* Education level */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px] block">Nivel de Estudios</span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span>Básica Completa/Incomp:</span>
                      <span className="font-bold text-slate-900">{eduBasicVal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Media Completa:</span>
                      <span className="font-bold text-slate-900">{eduMediaVal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Técnica Superior:</span>
                      <span className="font-bold text-slate-900">{eduTecnicaVal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Universitaria/Prof:</span>
                      <span className="font-bold text-slate-900">{eduProfVal}</span>
                    </div>
                  </div>
                </div>

                {/* Employment status */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px] block">Situación Laboral</span>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span>Desocupado / Buscando:</span>
                      <span className="font-bold text-slate-900">{jobDesocupadoVal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Informal / Indep:</span>
                      <span className="font-bold text-slate-900">{jobInformalVal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Trabajo Formal:</span>
                      <span className="font-bold text-slate-900">{jobFormalVal}</span>
                    </div>
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
