import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AppShell from "@/components/shell/AppShell";
import { prisma } from "@/lib/db";
import { freezeSnapshotAction } from "@/app/actions/coordinator";

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
      },
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

    const totalCasesCount = allCases.length;

    // 2. Compute Desaggregated Demographic Statistics
    let femaleCount = 0;
    let maleCount = 0;
    let otherGenderCount = 0;

    let age18_29 = 0;
    let age30_49 = 0;
    let age50Plus = 0;

    let eduBasic = 0;
    let eduMedia = 0;
    let eduTecnica = 0;
    let eduProf = 0;

    let jobDesocupado = 0;
    let jobInformal = 0;
    let jobFormal = 0;

    allCases.forEach((c) => {
      // Gender
      const gen = c.genderSelfId || "Sin registrar";
      if (gen === "Femenino") femaleCount++;
      else if (gen === "Masculino") maleCount++;
      else otherGenderCount++;

      // Age Range
      const ageRange = c.ageRange || "Sin registrar";
      if (ageRange === "18-29") age18_29++;
      else if (ageRange === "30-49") age30_49++;
      else if (ageRange === "50+") age50Plus++;
      else {
        if (c.birthDate) {
          const age = new Date().getFullYear() - new Date(c.birthDate).getFullYear();
          if (age >= 18 && age <= 29) age18_29++;
          else if (age >= 30 && age <= 49) age30_49++;
          else if (age >= 50) age50Plus++;
          else otherGenderCount++;
        } else {
          otherGenderCount++;
        }
      }

      // Education Level
      const edu = c.educationLevel || "Sin registrar";
      if (edu === "Basica") eduBasic++;
      else if (edu === "Media") eduMedia++;
      else if (edu === "Tecnica") eduTecnica++;
      else if (edu === "Profesional") eduProf++;
      else eduBasic++; // default fallback

      // Employment Status
      const job = c.employmentStatus || "Sin registrar";
      if (job === "Desocupado") jobDesocupado++;
      else if (job === "Informal") jobInformal++;
      else if (job === "Formal") jobFormal++;
      else jobDesocupado++; // fallback
    });

    // 3. Compute contract metrics
    const domains = [
      "Apoyo social",
      "Ejercicio de ciudadanía",
      "Tiempo libre",
      "Empleo",
      "Situación judicial",
      "Educación y formación",
      "Habitabilidad",
      "Situación financiera",
      "Física y mental",
    ];

    const domainStats = domains.map((dom) => {
      let exAnteCount = 0;
      let exPostCount = 0;

      allCases.forEach((c) => {
        c.iapRecords.forEach((iap: any) => {
          const dMap = iap.domainMaps.find((m: any) => m.recoveryDomainId === dom);
          if (dMap && (dMap.importance === "ALTO" || dMap.importance === "MEDIO")) {
            exAnteCount++;
          }
          const goalsInDom = iap.goals.filter((g: any) => g.recoveryDomainId === dom && g.result && g.result !== "NO_LOGRADO");
          exPostCount += goalsInDom.length;
        });
      });

      return { domain: dom, exAnteCount, exPostCount };
    });

    // Metric 2: Continuity vs New accompanied ratio
    const newCases = allCases.filter((c) => c.type === "NUEVO").length;
    const continuityCases = allCases.filter((c) => c.type === "CONTINUIDAD").length;
    const newCasesPercent = totalCasesCount > 0 ? Math.round((newCases / totalCasesCount) * 100) : 0;

    // Metric 3: IAP Intensity Levels
    let levelBasic = 0;
    let levelIntermediate = 0;
    let levelIntense = 0;
    allCases.forEach((c) => {
      const lvl = c.intensityLevel || "BASICO";
      if (lvl === "BASICO") levelBasic++;
      else if (lvl === "INTERMEDIO") levelIntermediate++;
      else if (lvl === "INTENSIVO") levelIntense++;
    });

    // Metric 4: Sessions by operational stage and 3-month adherence
    let vinSesCount = 0;
    let conSesCount = 0;
    let finSesCount = 0;
    allCases.forEach((c) => {
      c.sessionLogs.forEach((s: any) => {
        if (s.attendance === "REALIZADA" && s.status === "VALIDADA") {
          if (s.stage === "VINCULACION") vinSesCount++;
          else if (s.stage === "CONEXION") conSesCount++;
          else if (s.stage === "FINALIZACION") finSesCount++;
        }
      });
    });

    // Adherence: KPI 1.1 calculates for continuity cases
    const continuityCasesFilter = allCases.filter((c) => c.type === "CONTINUIDAD");
    const continuityCount = continuityCasesFilter.length;
    const adherentContinuityCount = continuityCasesFilter.filter((c) => {
      if (!c.startDate || !c.lastSessionDate) return false;
      const diff = c.lastSessionDate.getTime() - c.startDate.getTime();
      const diffDays = diff / (1000 * 60 * 60 * 24);
      return diffDays >= 90;
    }).length;
    const adherencePercent = continuityCount > 0 ? Math.round((adherentContinuityCount / continuityCount) * 100) : 0;

    // General adherence (all active cases)
    const adherentAllCount = allCases.filter((c) => {
      if (!c.startDate || !c.lastSessionDate) return false;
      const diff = c.lastSessionDate.getTime() - c.startDate.getTime();
      const diffDays = diff / (1000 * 60 * 60 * 24);
      return diffDays >= 90;
    }).length;
    const generalAdherencePercent = totalCasesCount > 0 ? Math.round((adherentAllCount / totalCasesCount) * 100) : 0;

    // Metric 5: Duplas by Gender
    let duplaFemFem = 0;
    let duplaMascMasc = 0;
    let duplaMixtaPerFem = 0;
    let duplaMixtaPerMasc = 0;

    allCases.forEach((c) => {
      const perGen = c.per.gender || "Femenino";
      const accGen = c.genderSelfId || "Femenino";

      if (perGen === "Femenino" && accGen === "Femenino") duplaFemFem++;
      else if (perGen === "Masculino" && accGen === "Masculino") duplaMascMasc++;
      else if (perGen === "Femenino" && accGen === "Masculino") duplaMixtaPerFem++;
      else duplaMixtaPerMasc++;
    });

    // Metric 6: Supervision sessions and intermediate evaluations
    const supervisionCount = supervisions.length;
    
    // Intermediate evaluations: count tasks validated that belong to the instrument "Evaluación Intermedia"
    let intermediateEvaluationsCount = 0;
    allCases.forEach((c) => {
      c.tasks.forEach((t: any) => {
        if (t.instrument?.name === "Evaluación Intermedia" && t.status === "VALIDADA") {
          intermediateEvaluationsCount++;
        }
      });
    });

    // Metric 7: Closure forms and final satisfaction rate
    const closedCases = allCases.filter((c) => ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"].includes(c.status));
    const closedCount = closedCases.length;
    const closedWithSatisfaction = closedCases.filter((c) => c.satisfactionTaskId).length;
    const satisfactionPercent = closedCount > 0 ? Math.round((closedWithSatisfaction / closedCount) * 100) : 0;

    // Metric 8: Network Management (real activations grouped by type)
    const deviceTypes = ["Salud", "Empleo", "Vivienda", "Educación", "Otro"];
    const networkDevices = deviceTypes.map((type) => {
      const typeActivations = activations.filter((act) => act.networkDevice.type === type);
      const name = type === "Salud" ? "COSAM / Red APS de Salud" :
                   type === "Empleo" ? "OMIL / Red SENCE regional" :
                   type === "Vivienda" ? "Oficina Municipal de Vivienda / DIDECO" :
                   type === "Educación" ? "Centros de Educación de Adultos (CEIA)" : "Otros Dispositivos";
      return {
        type,
        name,
        activatedCount: typeActivations.length,
      };
    });

    // Generate General Spreadsheet Matrix
    const generalCsvRows = allCases.map((c) => {
      const code = c.code;
      const region = c.regionId;
      const status = c.status;
      const type = c.type;
      const gender = c.genderSelfId || "Sin registrar";
      const ageRange = c.ageRange || "Sin registrar";
      const educationLevel = c.educationLevel || "Sin registrar";
      const employmentStatus = c.employmentStatus || "Sin registrar";
      const lvl = c.intensityLevel || "BASICO";
      const exAnte = c.exAnteTaskId ? "SI" : "NO";
      const satisfaction = c.satisfactionTaskId ? "SI" : "NO";
      const sessionCount = c.sessionLogs.filter((s: any) => s.status === "VALIDADA" && s.attendance === "REALIZADA").length;
      const startDateStr = c.startDate ? new Date(c.startDate).toLocaleDateString("es-CL") : "-";
      const lastSessionStr = c.lastSessionDate ? new Date(c.lastSessionDate).toLocaleDateString("es-CL") : "-";
      
      let adherenceDays = 0;
      if (c.startDate && c.lastSessionDate) {
        adherenceDays = Math.round((c.lastSessionDate.getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      return `${code},${region},${status},${type},${gender},${ageRange},${educationLevel},${employmentStatus},${lvl},${exAnte},${satisfaction},${sessionCount},${startDateStr},${lastSessionStr},${adherenceDays}`;
    });

    const generalCsvContent = "Codigo,Region,Estado,Tipo_Caso,Genero,Rango_Etario,Nivel_Estudios,Situacion_Laboral,Intensidad_IAP,Ex_Ante_Completado,Encuesta_Cierre,Sesiones_Validadas,Fecha_Inicio,Ultima_Sesion,Dias_Adherencia\n" + generalCsvRows.join("\n");

    data = {
      femaleCount,
      maleCount,
      otherGenderCount,
      age18_29,
      age30_49,
      age50Plus,
      eduBasic,
      eduMedia,
      eduTecnica,
      eduProf,
      jobDesocupado,
      jobInformal,
      jobFormal,
      totalCasesCount,
      domainStats,
      newCases,
      continuityCases,
      newCasesPercent,
      levelBasic,
      levelIntermediate,
      levelIntense,
      vinSesCount,
      conSesCount,
      finSesCount,
      adherencePercent,
      adherentContinuityCount,
      continuityCount,
      generalAdherencePercent,
      adherentAllCount,
      duplaFemFem,
      duplaMascMasc,
      duplaMixtaPerFem,
      duplaMixtaPerMasc,
      supervisionCount,
      intermediateEvaluationsCount,
      closedCount,
      closedWithSatisfaction,
      satisfactionPercent,
      networkDevices,
      generalCsvContent,
    };
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
              className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition duration-150 shadow-md cursor-pointer text-xs text-center flex items-center justify-center gap-1.5"
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
                className="w-full md:w-auto px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-primary"
              >
                {periods.map(p => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </select>
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer">
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

        {/* Horizontal Navigation Sub-Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          <a
            href={selectedPeriod !== "ACTUAL" ? `/admin/reportes?periodKey=${selectedPeriod}` : "/admin/reportes"}
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
            const linkHref = selectedPeriod !== "ACTUAL" 
              ? `/admin/reportes?regionId=${encodeURIComponent(reg.name)}&periodKey=${selectedPeriod}` 
              : `/admin/reportes?regionId=${encodeURIComponent(reg.name)}`;
            return (
              <a
                key={reg.name}
                href={linkHref}
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

        {/* SECTION A: DESAGREGACIÓN DEMOGRÁFICA */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <h4 className="font-extrabold text-sm text-slate-900 border-b pb-2 flex items-center gap-1.5">
            <span>📊</span> Desagregación Demográfica ({totalCasesCountVal} Personas Acompañadas)
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-xs text-slate-700">
            {/* Gender breakdown */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px] block">Distinción de Género</span>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>Femenino:</span>
                  <span className="font-bold">{femaleCountVal} ({totalCasesCountVal > 0 ? Math.round((femaleCountVal / totalCasesCountVal) * 100) : 0}%)</span>
                </div>
                <div className="flex justify-between">
                  <span>Masculino:</span>
                  <span className="font-bold">{maleCountVal} ({totalCasesCountVal > 0 ? Math.round((maleCountVal / totalCasesCountVal) * 100) : 0}%)</span>
                </div>
                <div className="flex justify-between">
                  <span>Otro / Sin registrar:</span>
                  <span className="font-bold">{otherGenderCountVal} ({totalCasesCountVal > 0 ? Math.round((otherGenderCountVal / totalCasesCountVal) * 100) : 0}%)</span>
                </div>
              </div>
            </div>

            {/* Age range breakdown */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px] block">Rango Etario</span>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>18 - 29 años:</span>
                  <span className="font-bold">{age18_29Val} ({totalCasesCountVal > 0 ? Math.round((age18_29Val / totalCasesCountVal) * 100) : 0}%)</span>
                </div>
                <div className="flex justify-between">
                  <span>30 - 49 años:</span>
                  <span className="font-bold">{age30_49Val} ({totalCasesCountVal > 0 ? Math.round((age30_49Val / totalCasesCountVal) * 100) : 0}%)</span>
                </div>
                <div className="flex justify-between">
                  <span>50+ años:</span>
                  <span className="font-bold">{age50PlusVal} ({totalCasesCountVal > 0 ? Math.round((age50PlusVal / totalCasesCountVal) * 100) : 0}%)</span>
                </div>
              </div>
            </div>

            {/* Education level */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px] block">Nivel de Estudios</span>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>Básica Completa/Incomp:</span>
                  <span className="font-bold">{eduBasicVal}</span>
                </div>
                <div className="flex justify-between">
                  <span>Media Completa:</span>
                  <span className="font-bold">{eduMediaVal}</span>
                </div>
                <div className="flex justify-between">
                  <span>Técnica Superior:</span>
                  <span className="font-bold">{eduTecnicaVal}</span>
                </div>
                <div className="flex justify-between">
                  <span>Universitaria/Prof:</span>
                  <span className="font-bold">{eduProfVal}</span>
                </div>
              </div>
            </div>

            {/* Employment status */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[10px] block">Situación Laboral</span>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span>Desocupado / Buscando:</span>
                  <span className="font-bold text-rose-700">{jobDesocupadoVal}</span>
                </div>
                <div className="flex justify-between">
                  <span>Informal / Indep:</span>
                  <span className="font-bold text-amber-700">{jobInformalVal}</span>
                </div>
                <div className="flex justify-between">
                  <span>Trabajo Formal:</span>
                  <span className="font-bold text-emerald-700">{jobFormalVal}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION B: 8 INDICADORES CONTRACTUALES */}
        <div className="space-y-6">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-400">
            Reporte de Indicadores de Convenio (Bases Técnicas)
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
            
            {/* 1. Capitales de recuperación */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-bold text-slate-900 text-sm">1. Desarrollo de Capitales de Recuperación (IAP)</h4>
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                    "ambito,priorizados_ex_ante,avances_ex_post\n" +
                      domainStatsVal.map((d: any) => `${d.domain},${d.exAnteCount},${d.exPostCount}`).join("\n")
                  )}`}
                  download={`1_capitales_recuperacion_${selectedRegion || "nacional"}.csv`}
                  className="py-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold cursor-pointer text-[10px] text-slate-700"
                >
                  📥 Exportar CSV
                </a>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 font-bold text-slate-500">
                    <th className="py-2">Ámbito del Capital</th>
                    <th className="py-2 text-center">Priorizado Ex-Ante</th>
                    <th className="py-2 text-center">Avances Ex-Post</th>
                  </tr>
                </thead>
                <tbody>
                  {domainStatsVal.map((d: any) => (
                    <tr key={d.domain} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 font-medium text-slate-700">{d.domain}</td>
                      <td className="py-2 text-center font-bold text-blue-700">{d.exAnteCount}</td>
                      <td className="py-2 text-center font-bold text-emerald-700">{d.exPostCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 italic">
                Meta: Evaluar capitales de manera ex-ante y ex-post para al menos el 80% de las personas acompañadas.
              </p>
            </div>

            {/* 2. Cobertura continuidad y nuevos */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h4 className="font-bold text-slate-900 text-sm">2. Tasa de Nuevos Acompañamientos</h4>
                  <a
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                      `tipo,cantidad,porcentaje\nNuevos,${newCasesVal},${newCasesPercentVal}%\nContinuidad,${continuityCasesVal},${100 - newCasesPercentVal}%`
                    )}`}
                    download={`2_nuevos_vs_continuidad_${selectedRegion || "nacional"}.csv`}
                    className="py-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold cursor-pointer text-[10px] text-slate-700"
                  >
                    📥 Exportar CSV
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center mt-2">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-3xl font-extrabold text-emerald-600">{newCasesPercentVal}%</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Acompañamientos Nuevos</span>
                    <span className="block text-[10px] text-slate-500 mt-1 font-semibold">({newCasesVal} de {totalCasesCountVal} casos)</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-3xl font-extrabold text-blue-600">{100 - newCasesPercentVal}%</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">De Continuidad</span>
                    <span className="block text-[10px] text-slate-500 mt-1 font-semibold">({continuityCasesVal} de {totalCasesCountVal} casos)</span>
                  </div>
                </div>
                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-[11px] font-semibold leading-relaxed">
                  📢 {newCasesPercentVal >= 60 ? "¡Cumple Meta del Convenio!" : "Bajo la meta recomendada"} (Meta del convenio: mínimo del 60% de acompañamientos nuevos en las regiones participantes).
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Focaliza la priorización en base a las necesidades de integración social detectadas territorialmente.
              </p>
            </div>

            {/* 3. Niveles de intensidad IAP */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-bold text-slate-900 text-sm">3. Clasificación por Niveles de Intensidad (IAP)</h4>
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                    `intensidad,cantidad\nBasico,${levelBasicVal}\nIntermedio,${levelIntermediateVal}\nIntensivo,${levelIntenseVal}`
                  )}`}
                  download={`3_intensidad_iap_${selectedRegion || "nacional"}.csv`}
                  className="py-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold cursor-pointer text-[10px] text-slate-700"
                >
                  📥 Exportar CSV
                </a>
              </div>
              <div className="space-y-4">
                <p className="text-slate-500">
                  Distribución de acompañamientos según el nivel de necesidades detectadas y trayectorias del participante:
                </p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Acompañamiento Básico (Rango Menor)</span>
                      <span className="font-bold">{levelBasicVal} casos</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-sky-500 h-full rounded-full" style={{ width: `${totalCasesCountVal > 0 ? (levelBasicVal/totalCasesCountVal)*100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Acompañamiento Intermedio (Rango Medio)</span>
                      <span className="font-bold">{levelIntermediateVal} casos</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full rounded-full" style={{ width: `${totalCasesCountVal > 0 ? (levelIntermediateVal/totalCasesCountVal)*100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-700">Acompañamiento Intensivo (Rango Crítico)</span>
                      <span className="font-bold">{levelIntenseVal} casos</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-indigo-650 h-full rounded-full" style={{ width: `${totalCasesCountVal > 0 ? (levelIntenseVal/totalCasesCountVal)*100 : 0}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic mt-2">
                Define la intensidad de la intervención y tiempos según el perfilamiento inicial realizado por los coordinadores y PER.
              </p>
            </div>

            {/* 4. Número y frecuencia de sesiones */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h4 className="font-bold text-slate-900 text-sm">4. Sesiones por Fase y Adherencia</h4>
                  <a
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                      `fase,sesiones_validadas\nVinculacion,${vinSesCountVal}\nConexion,${conSesCountVal}\nFinalizacion,${finSesCountVal}\nContinuidad Adherente,${adherentContinuityCountVal}`
                    )}`}
                    download={`4_sesiones_adherencia_${selectedRegion || "nacional"}.csv`}
                    className="py-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold cursor-pointer text-[10px] text-slate-700"
                  >
                    📥 Exportar CSV
                  </a>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-slate-700">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-xl font-bold text-blue-700">{vinSesCountVal}</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Fase Vinculación</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-xl font-bold text-blue-700">{conSesCountVal}</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Fase Conexión</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-xl font-bold text-blue-700">{finSesCountVal}</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Fase Finalización</span>
                  </div>
                </div>
                <div className="p-3 bg-blue-55 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                    <span>Adherencia de Continuidad:</span>
                    <span className="text-blue-700 text-sm">{adherencePercentVal}% ({adherentContinuityCountVal} de {continuityCountVal})</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-slate-900 border-t border-blue-200 pt-1">
                    <span>Adherencia General (Total Casos):</span>
                    <span className="text-blue-700 text-sm">{generalAdherencePercentVal}% ({adherentAllCountVal} de {totalCasesCountVal})</span>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-1 leading-normal">
                    Meta del convenio: mantener un mínimo de 3 meses de adherencia activa para al menos el 80% de las personas acompañadas en las 5 regiones del pilotaje.
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Avanza en la definición de los tiempos óptimos de intervención teniendo en cuenta las sesiones mínimas de cada fase.
              </p>
            </div>

            {/* 5. Distinción de duplas por género */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-bold text-slate-900 text-sm">5. Configuración de Duplas con Enfoque de Género</h4>
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                    `tipo_dupla,cantidad\nFemenina_Femenino,${duplaFemFemVal}\nMasculina_Masculino,${duplaMascMascVal}\nMixta_PerFem,${duplaMixtaPerFemVal}\nMixta_PerMasc,${duplaMixtaPerMascVal}`
                  )}`}
                  download={`5_duplas_genero_${selectedRegion || "nacional"}.csv`}
                  className="py-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold cursor-pointer text-[10px] text-slate-700"
                >
                  📥 Exportar CSV
                </a>
              </div>
              <div className="space-y-4">
                <p className="text-slate-500">
                  Mapeo del emparejamiento entre el género del Par Especialista (PER) y la persona acompañada:
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-1">
                    <span className="font-semibold text-slate-800">Dupla Femenina:</span>
                    <span className="block text-lg font-bold text-emerald-800">{duplaFemFemVal} duplas</span>
                    <span className="text-[9px] text-slate-500 block">PER Femenino + Participante Femenina</span>
                  </div>
                  <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-1">
                    <span className="font-semibold text-slate-800">Dupla Masculina:</span>
                    <span className="block text-lg font-bold text-blue-800">{duplaMascMascVal} duplas</span>
                    <span className="text-[9px] text-slate-500 block">PER Masculino + Participante Masculino</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="font-semibold text-slate-800">Mixta (PER Fem):</span>
                    <span className="block text-lg font-bold text-slate-800">{duplaMixtaPerFemVal} duplas</span>
                    <span className="text-[9px] text-slate-500 block">PER Femenino + Participante Masculino</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="font-semibold text-slate-800">Mixta (PER Masc):</span>
                    <span className="block text-lg font-bold text-slate-800">{duplaMixtaPerMascVal} duplas</span>
                    <span className="text-[9px] text-slate-500 block">PER Masculino + Participante Femenina</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Evalúa y complementa consideraciones de género en los acompañamientos a través de metodologías cualitativas.
              </p>
            </div>

            {/* 6. Supervisiones y Evaluaciones Intermedias */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h4 className="font-bold text-slate-900 text-sm">6. Monitoreo y Supervisión Técnica</h4>
                  <a
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                      `tipo_registro,cantidad\nSupervisiones_ET,${supervisionCountVal}\nEvaluaciones_Intermedias,${intermediateEvaluationsCountVal}`
                    )}`}
                    download={`6_supervisiones_${selectedRegion || "nacional"}.csv`}
                    className="py-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold cursor-pointer text-[10px] text-slate-700"
                  >
                    📥 Exportar CSV
                  </a>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-800 block">Supervisiones Técnicas Realizadas</span>
                      <span className="text-[10px] text-slate-500">Sesiones de seguimiento de casos lideradas por ET.</span>
                    </div>
                    <span className="text-2xl font-extrabold text-blue-700 px-3">{supervisionCountVal}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-800 block">Evaluaciones Intermedias Aplicadas</span>
                      <span className="text-[10px] text-slate-500">Verificación de avances según actividad 5 del IAP.</span>
                    </div>
                    <span className="text-2xl font-extrabold text-blue-700 px-3">{intermediateEvaluationsCountVal}</span>
                  </div>
                </div>
                <div className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200 text-blue-800 text-[11px] font-semibold">
                  📈 Cobertura de Monitoreo del IAP: {totalCasesCountVal > 0 ? Math.round((intermediateEvaluationsCountVal / totalCasesCountVal) * 100) : 0}% de los acompañamientos registrados.
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Estrategias de monitoreo del plan de acompañamiento enfocadas en la Meta de Cobertura del 80%.
              </p>
            </div>

            {/* 7. Encuestas de Cierre */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h4 className="font-bold text-slate-900 text-sm">7. Encuestas de Cierre y Satisfacción</h4>
                  <a
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                      `egresos,encuestas_aplicadas,porcentaje_satisfaccion\n${closedCountVal},${closedWithSatisfactionVal},${satisfactionPercentVal}%`
                    )}`}
                    download={`7_cierre_satisfaccion_${selectedRegion || "nacional"}.csv`}
                    className="py-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold cursor-pointer text-[10px] text-slate-700"
                  >
                    📥 Exportar CSV
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center mt-2">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-3xl font-extrabold text-blue-700">{closedCountVal}</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Casos Cerrados/Egresados</span>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="block text-3xl font-extrabold text-emerald-600">{satisfactionPercentVal}%</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Encuestas Completadas</span>
                    <span className="block text-[10px] text-slate-500 mt-1 font-semibold">({closedWithSatisfactionVal} de {closedCountVal})</span>
                  </div>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] font-semibold leading-relaxed">
                  📢 Meta del Convenio: Evaluar satisfacción usuaria en al menos el 80% de las personas participantes egresadas mediante el instrumento específico.
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Asegura el levantamiento del formulario de cierre de acompañamiento en los cierres técnicos de la dupla.
              </p>
            </div>

            {/* 8. Gestión de redes (planes de trabajo) */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h4 className="font-bold text-slate-900 text-sm">8. Gestión de Redes y Dispositivos Activados</h4>
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                    `tipo_dispositivo,nombre,cantidad_activados\n` +
                      networkDevicesVal.map((d: any) => `${d.type},${d.name},${d.activatedCount}`).join("\n")
                  )}`}
                  download={`8_gestion_redes_${selectedRegion || "nacional"}.csv`}
                  className="py-1 px-2.5 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-semibold cursor-pointer text-[10px] text-slate-700"
                >
                  📥 Exportar CSV
                </a>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 font-bold text-slate-500">
                    <th className="py-2">Tipo de Dispositivo</th>
                    <th className="py-2">Nombre Red Municipal/Salud</th>
                    <th className="py-2 text-center">Activados</th>
                  </tr>
                </thead>
                <tbody>
                  {networkDevicesVal.map((nd: any) => (
                    <tr key={nd.type} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 font-medium text-slate-700">{nd.type}</td>
                      <td className="py-2 text-slate-500">{nd.name}</td>
                      <td className="py-2 text-center font-bold text-blue-700">{nd.activatedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 italic">
                Fortalece la territorialización del programa identificando actores relevantes en distintos niveles de gestión del piloto PER.
              </p>
            </div>

          </div>
        </div>

      </div>
    </AppShell>
  );
}
