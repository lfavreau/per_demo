export interface KpiInput {
  cases: any[]; // PACase + per.user, candidate, iapRecords{domainMaps,goals}, sessionLogs, tasks{instrument}
  supervisions: any[];
  activations: any[]; // NetworkActivation + networkDevice
}

export interface KpiResult {
  femaleCount: number;
  maleCount: number;
  otherGenderCount: number;
  age18_29: number;
  age30_49: number;
  age50Plus: number;
  eduBasic: number;
  eduMedia: number;
  eduTecnica: number;
  eduProf: number;
  jobDesocupado: number;
  jobInformal: number;
  jobFormal: number;
  totalCasesCount: number;
  domainStats: { domain: string; exAnteCount: number; exPostCount: number }[];
  newCases: number;
  continuityCases: number;
  newCasesPercent: number;
  levelBasic: number;
  levelIntermediate: number;
  levelIntense: number;
  vinSesCount: number;
  conSesCount: number;
  finSesCount: number;
  adherencePercent: number;
  adherentContinuityCount: number;
  continuityCount: number;
  generalAdherencePercent: number;
  adherentAllCount: number;
  duplaFemFem: number;
  duplaMascMasc: number;
  duplaMixtaPerFem: number;
  duplaMixtaPerMasc: number;
  supervisionCount: number;
  intermediateEvaluationsCount: number;
  closedCount: number;
  closedWithSatisfaction: number;
  satisfactionPercent: number;
  networkDevices: { type: string; name: string; activatedCount: number }[];
  generalCsvContent: string;
}

// Cálculo puro de los 8 KPIs de /admin/reportes. Sin acceso a Prisma: recibe los datos ya
// consultados (con sus filtros isDemo y fecha de corte aplicados) y devuelve el mismo objeto
// que antes se armaba inline en la página, para que el snapshot congelado (F01) y el cálculo
// en vivo produzcan siempre la misma forma de datos.
export function computeKpis({ cases: allCases, supervisions, activations }: KpiInput): KpiResult {
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
  // Comparar por activityKey (clave estable del catálogo), no por nombre visible:
  // el nombre es editable desde /admin/instrumentos y rompería el indicador.
  let intermediateEvaluationsCount = 0;
  allCases.forEach((c) => {
    c.tasks.forEach((t: any) => {
      if (t.instrument?.activityKey === "ACTIVIDAD_5_INTERMEDIA" && t.status === "VALIDADA") {
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

  return {
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
