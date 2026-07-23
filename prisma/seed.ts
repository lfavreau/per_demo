import { prisma } from "../src/lib/db";

async function main() {
  console.log("Starting rich seed script...");

  // 1. Clear database in reverse dependency order
  console.log("Clearing existing data...");
  await prisma.setting.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.calendarEventRef.deleteMany();
  await prisma.driveFileRef.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.supervision.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.iAPGoal.deleteMany();
  await prisma.iAPDomainMap.deleteMany();
  await prisma.iAPRecord.deleteMany();
  await prisma.taskEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.caseStatusHistory.deleteMany();
  await prisma.caseStageHistory.deleteMany();
  await prisma.documentRecord.deleteMany();
  await prisma.networkActivation.deleteMany();
  await prisma.networkDevice.deleteMany();
  await prisma.phase5Record.deleteMany();
  await prisma.reportSnapshot.deleteMany();
  await prisma.contactAttempt.deleteMany();
  await prisma.pACase.deleteMany();
  await prisma.pACandidate.deleteMany();
  await prisma.trainingRecord.deleteMany();
  await prisma.pERProfile.deleteMany();
  await prisma.instrument.deleteMany();
  await prisma.user.deleteMany();

  // 2. Seed Settings
  console.log("Seeding settings...");
  const settingsData = [
    { key: "alert_days_vinculacion", value: "10" },
    { key: "alert_days_conexion", value: "14" },
    { key: "alert_days_finalizacion", value: "10" },
    { key: "duration_months_vinculacion", value: "1" },
    { key: "duration_months_conexion", value: "6" },
    { key: "duration_months_finalizacion", value: "2" },
  ];
  for (const s of settingsData) {
    await prisma.setting.create({ data: s });
  }

  // 3. Create Admin User
  console.log("Seeding core users...");
  const admin = await prisma.user.create({
    data: {
      name: "Admin Nacional",
      email: "admin@per2026.cl",
      phone: "+56912345678",
      role: "ADMIN",
      active: true,
    },
  });

  // Create System User for background/mock integrations
  await prisma.user.create({
    data: {
      id: "SYSTEM",
      name: "Sistema Automatizado",
      email: "system@per2026.cl",
      role: "ADMIN",
      active: true,
    },
  });

  // 4. Seed Instruments
  console.log("Seeding official instruments...");
  const instruments = [
    {
      name: "Inducción y Caracterización PER",
      description: "Recopilación de antecedentes iniciales de los PER",
      type: "GOOGLE_FORM",
      googleUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf123_induccion_per/viewform",
      phaseId: "FASE_1",
      stageId: "FASE_1_ETAPA_2",
      targetRole: "PER",
      scope: "NACIONAL",
      version: "1.0",
      status: "VIGENTE",
      mandatory: true,
      blocksProgress: true,
      criticalTask: false,
      validationRequired: true,
      createdByUserId: admin.id,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      templateFileId: "mock_template_induccion_per",
    },
    {
      name: "Formulario de Preinscripción PA",
      description: "Preinscripción de candidatas en Fase 2",
      type: "GOOGLE_FORM",
      googleUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf456_preinscripcion_pa/viewform",
      phaseId: "FASE_2",
      stageId: "FASE_2_ETAPA_2",
      targetRole: "COORDINATOR",
      scope: "NACIONAL",
      version: "1.0",
      status: "VIGENTE",
      mandatory: true,
      blocksProgress: true,
      criticalTask: false,
      validationRequired: true,
      createdByUserId: admin.id,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      templateFileId: "mock_template_preinscripcion_pa",
    },
    {
      name: "Acta de Primer Encuentro y Encuadre",
      description: "Registro de conformación y primer encuentro de la dupla",
      type: "GOOGLE_DOC",
      googleUrl: "https://docs.google.com/document/d/1_acta_primer_encuentro/edit",
      phaseId: "FASE_3",
      stageId: "FASE_3_ETAPA_4",
      targetRole: "PER",
      scope: "NACIONAL",
      version: "1.0",
      status: "VIGENTE",
      mandatory: true,
      blocksProgress: true,
      criticalTask: true,
      validationRequired: true,
      createdByUserId: admin.id,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      templateFileId: "mock_template_acta_primer_encuentro",
    },
    {
      name: "Itinerario de Acompañamiento Personalizado (IAP)",
      description: "Planificación de objetivos y ámbitos del caso",
      type: "GOOGLE_DOC",
      googleUrl: "https://docs.google.com/document/d/1_iap_plan/edit",
      phaseId: "FASE_4",
      stageId: "FASE_4_ETAPA_1",
      targetRole: "PER",
      scope: "NACIONAL",
      version: "1.0",
      status: "VIGENTE",
      mandatory: true,
      blocksProgress: true,
      criticalTask: true,
      validationRequired: true,
      createdByUserId: admin.id,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      templateFileId: "mock_template_iap_plan",
    },
    {
      name: "Evaluación Intermedia",
      description: "Evaluación intermedia del proceso de acompañamiento",
      type: "GOOGLE_DOC",
      googleUrl: "https://docs.google.com/document/d/1_evaluacion_intermedia/edit",
      phaseId: "FASE_4",
      stageId: "FASE_4_ETAPA_5",
      targetRole: "PER",
      scope: "NACIONAL",
      version: "1.0",
      status: "VIGENTE",
      mandatory: true,
      blocksProgress: false,
      criticalTask: false,
      validationRequired: true,
      createdByUserId: admin.id,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      templateFileId: "mock_template_evaluacion_intermedia",
    },
    {
      name: "Evaluación Ex-Post",
      description: "Evaluación final / diagnóstica ex-post",
      type: "GOOGLE_DOC",
      googleUrl: "https://docs.google.com/document/d/1_evaluacion_ex_post/edit",
      phaseId: "FASE_5",
      stageId: "FASE_5_ETAPA_1",
      targetRole: "PER",
      scope: "NACIONAL",
      version: "1.0",
      status: "VIGENTE",
      mandatory: true,
      blocksProgress: true,
      criticalTask: true,
      validationRequired: true,
      createdByUserId: admin.id,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      templateFileId: "mock_template_evaluacion_ex_post",
    },
    {
      name: "Encuesta de Satisfacción PA",
      description: "Evaluación de calidad y satisfacción del proceso",
      type: "GOOGLE_FORM",
      googleUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf789_satisfaccion/viewform",
      phaseId: "FASE_5",
      stageId: "FASE_5_ETAPA_1",
      targetRole: "PER",
      scope: "NACIONAL",
      version: "1.0",
      status: "VIGENTE",
      mandatory: true,
      blocksProgress: false,
      criticalTask: false,
      validationRequired: false,
      createdByUserId: admin.id,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      templateFileId: "mock_template_satisfaccion",
    },
    {
      name: "Formulario de Retiro Voluntario",
      description: "Registro oficial de desvinculación voluntaria de la PA",
      type: "GOOGLE_FORM",
      googleUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf321_retiro/viewform",
      phaseId: "TRANSVERSAL",
      stageId: "TRANSVERSAL_SEGUIMIENTO",
      targetRole: "COORDINATOR",
      scope: "NACIONAL",
      version: "1.1",
      status: "VIGENTE",
      mandatory: false,
      blocksProgress: false,
      criticalTask: false,
      validationRequired: true,
      createdByUserId: admin.id,
      effectiveFrom: new Date("2026-03-01T00:00:00Z"),
      templateFileId: "mock_template_retiro",
    },
  ];

  const dbInstruments: Record<string, any> = {};
  for (const inst of instruments) {
    const created = await prisma.instrument.create({ data: inst });
    dbInstruments[inst.name] = created;
  }

  // Define regional assets
  const regions = [
    { name: "Metropolitana", key: "MET", quota: 20 },
    { name: "Valparaíso", key: "VAL", quota: 8 },
    { name: "Tarapacá", key: "TAR", quota: 6 },
    { name: "Biobío", key: "BIO", quota: 4 },
    { name: "Los Ríos", key: "LOS", quota: 11 },
  ];

  const perNamesByRegion: Record<string, Array<{ name: string; email: string }>> = {
    Metropolitana: [
      { name: "Carla Muñoz", email: "per.carla@per2026.cl" },
      { name: "Diego Rojas", email: "per.diego@per2026.cl" },
      { name: "Juan Pérez", email: "per.juan@per2026.cl" },
    ],
    Valparaíso: [
      { name: "Andrés Silva", email: "per.valpo@per2026.cl" },
      { name: "Sonia Reyes", email: "per.sonia@per2026.cl" },
    ],
    Tarapacá: [
      { name: "Lucas Díaz", email: "per.lucas@per2026.cl" },
      { name: "Mario Soto", email: "per.mario@per2026.cl" },
    ],
    Biobío: [
      { name: "Camila Vera", email: "per.camila@per2026.cl" },
    ],
    "Los Ríos": [
      { name: "Pedro Castillo", email: "per.pedro@per2026.cl" },
      { name: "Elena Gómez", email: "per.elena@per2026.cl" },
    ],
  };

  const cosamsByRegion: Record<string, string[]> = {
    Metropolitana: ["COSAM Pudahuel", "COSAM Quinta Normal", "COSAM Lo Prado", "COSAM Estación Central"],
    Valparaíso: ["COSAM Viña del Mar", "COSAM Valparaíso", "COSAM Quilpué"],
    Tarapacá: ["COSAM Iquique", "COSAM Alto Hospicio"],
    Biobío: ["COSAM Concepción", "COSAM Talcahuano", "COSAM Chiguayante"],
    "Los Ríos": ["COSAM Valdivia", "COSAM La Unión"],
  };

  const candidateStatuses = [
    "DERIVADA",
    "CONTACTADA",
    "PREINSCRITA",
    "ENTREVISTADA",
    "ADMISIBLE",
    "SELECCIONADA",
    "EN_ESPERA",
  ];

  const caseStatuses = [
    "VINCULACION",
    "CONEXION",
    "FINALIZACION",
    "EGRESO",
    "RETIRO_VOLUNTARIO",
  ];

  const emotions = ["BIEN", "NEUTRO", "TRISTE", "MOLESTO"];
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

  console.log("Generating regional data...");
  let caseCodeIndex = 1;

  for (const reg of regions) {
    // 1. Create Coordinator for region
    let coordEmail = `coord.${reg.name.toLowerCase().replace(/ /g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")}@per2026.cl`;
    if (reg.name === "Metropolitana") coordEmail = "coord.metro@per2026.cl";
    if (reg.name === "Valparaíso") coordEmail = "coord.valpo@per2026.cl";
    const coord = await prisma.user.create({
      data: {
        name: `Coordinador ${reg.name}`,
        email: coordEmail,
        phone: `+569${Math.floor(10000000 + Math.random() * 90000000)}`,
        role: "COORDINATOR",
        regionId: reg.name,
        active: true,
      },
    });

    // 2. Create PERs for region
    const perList = perNamesByRegion[reg.name] || [];
    const dbPerProfiles = [];

    for (let i = 0; i < perList.length; i++) {
      const perData = perList[i];
      const perUser = await prisma.user.create({
        data: {
          name: perData.name,
          email: perData.email,
          phone: `+569${Math.floor(10000000 + Math.random() * 90000000)}`,
          role: "PER",
          regionId: reg.name,
          active: true,
        },
      });

      const perProfile = await prisma.pERProfile.create({
        data: {
          userId: perUser.id,
          regionId: reg.name,
          coordinatorId: coord.id,
          generation: i === 0 ? "PRIMERA" : "SEGUNDA",
          certificationStatus: i === 0 ? "HABILITADO" : "PENDIENTE",
          ethicsCodeStatus: i === 0 ? "VALIDADO" : "PENDIENTE",
          gender: i % 2 === 0 ? "Femenino" : "Masculino",
          inductionCompleted: i === 0,
          driveFolderId: `drive_folder_${reg.key.toLowerCase()}_per_${i}`,
        },
      });

      dbPerProfiles.push(perProfile);

      // Create training records
      await prisma.trainingRecord.create({
        data: {
          perId: perProfile.id,
          activityName: "Inducción Metodológica del Acompañamiento PER",
          type: "INDUCCION",
          date: new Date("2026-03-10T00:00:00Z"),
          status: i === 0 ? "REALIZADA" : "PENDIENTE",
        },
      });

      await prisma.trainingRecord.create({
        data: {
          perId: perProfile.id,
          activityName: "Código de Ética y Cuidado en Terreno",
          type: "EVALUACION",
          date: new Date("2026-04-15T00:00:00Z"),
          status: i === 0 ? "EVALUADA" : "PENDIENTE",
        },
      });
    }

    // 3. Create Candidates for region
    const candidatesCount = 6;
    const dbCandidates = [];
    const genders = ["Femenino", "Masculino", "Otro"];
    const eduLevels = ["Basica", "Media", "Tecnica", "Profesional"];
    const jobStatuses = ["Desocupado", "Informal", "Formal"];

    for (let c = 0; c < candidatesCount; c++) {
      const status = candidateStatuses[c % candidateStatuses.length];
      const regCosams = cosamsByRegion[reg.name] || ["COSAM General"];
      const cosam = regCosams[c % regCosams.length];
      const candGender = genders[c % genders.length];
      
      let candBirthDate = new Date();
      let ageRange = "";
      if (c % 3 === 0) {
        candBirthDate.setFullYear(candBirthDate.getFullYear() - 24);
        ageRange = "18-29";
      } else if (c % 3 === 1) {
        candBirthDate.setFullYear(candBirthDate.getFullYear() - 36);
        ageRange = "30-49";
      } else {
        candBirthDate.setFullYear(candBirthDate.getFullYear() - 55);
        ageRange = "50+";
      }

      const candidate = await prisma.pACandidate.create({
        data: {
          regionId: reg.name,
          sourceCenter: cosam,
          status: status,
          preRegistrationFormResponseRef: `ref_${reg.key}_cand_${c}`,
          gender: candGender,
          birthDate: candBirthDate,
          ageRange: ageRange,
          educationLevel: eduLevels[c % eduLevels.length],
          employmentStatus: jobStatuses[c % jobStatuses.length],
          notes: `Postulación derivada para el pilotaje de la región de ${reg.name}.`,
          isDemo: true,
        },
      });
      dbCandidates.push(candidate);
    }

    // 4. Create Cases for region
    const casesCount = 4;
    for (let k = 0; k < casesCount; k++) {
      const perProfile = dbPerProfiles[k % dbPerProfiles.length];
      const candidate = dbCandidates[k % dbCandidates.length];
      const statuses = ["VINCULACION", "EGRESO", "CONEXION", "FINALIZACION"];
      const status = statuses[k % statuses.length];
      const codeStr = `PA-${reg.key}-${String(caseCodeIndex).padStart(3, "0")}`;
      caseCodeIndex++;

      const isTerminal = ["EGRESO", "RETIRO_VOLUNTARIO"].includes(status);
      let daysAgo = 15;
      if (k === 0) daysAgo = 15;
      else if (k === 1) {
        daysAgo = (reg.name === "Biobío" || reg.name === "Los Ríos") ? 45 : 95;
      }
      else if (k === 2) daysAgo = 30;
      else if (k === 3) {
        daysAgo = (reg.name === "Los Ríos") ? 50 : 120;
      }
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      const lastSessionDate = new Date();
      lastSessionDate.setDate(lastSessionDate.getDate() - 3 - k);

      let stage = "VINCULACION";
      if (status === "CONEXION") stage = "CONEXION";
      else if (status === "FINALIZACION" || status === "EGRESO") stage = "FINALIZACION";

      const paCase = await prisma.pACase.create({
        data: {
          code: codeStr,
          type: k % 2 === 0 ? "NUEVO" : "CONTINUIDAD",
          regionId: reg.name,
          perId: perProfile.id,
          coordinatorId: coord.id,
          candidateId: candidate.id,
          status: status,
          matchStatus: "FORMALIZADO",
          matchRationale: "Experiencia previa de dupla del profesional con perfiles similares.",
          actaPrimerEncuentroDriveId: `drive_acta_${codeStr.toLowerCase()}`,
          intensityLevel: k % 3 === 0 ? "BASICO" : k % 3 === 1 ? "INTERMEDIO" : "INTENSIVO",
          genderSelfId: candidate.gender,
          birthDate: candidate.birthDate,
          ageRange: candidate.ageRange,
          educationLevel: candidate.educationLevel,
          employmentStatus: candidate.employmentStatus,
          stage: stage,
          startDate: startDate,
          lastSessionDate: lastSessionDate,
          stageEnteredAt: startDate,
          driveFolderRegionId: `gfolder_region_${reg.key.toLowerCase()}`,
          driveFolderPerId: perProfile.driveFolderId,
          driveFolderCaseId: `gfolder_case_${codeStr.toLowerCase()}`,
          driveFolderVinculacionId: `gfolder_case_${codeStr.toLowerCase()}_vinc`,
          driveFolderConexionId: `gfolder_case_${codeStr.toLowerCase()}_conex`,
          driveFolderFinalizacionId: `gfolder_case_${codeStr.toLowerCase()}_final`,
          driveFolderValidadosId: `gfolder_case_${codeStr.toLowerCase()}_validados`,
          driveFolderId: `drive_folder_case_${codeStr.toLowerCase()}`,
          notes: "Acompañamiento en desarrollo conforme a los ámbitos prioritarios.",
          isDemo: true,
        },
      });

      // Add Case status history
      await prisma.caseStatusHistory.create({
        data: {
          paCaseId: paCase.id,
          fromStatus: "REGISTRADA",
          toStatus: "VINCULACION",
          reason: "Asignación inicial",
          byUserId: coord.id,
          at: startDate,
        },
      });

      if (status !== "VINCULACION") {
        await prisma.caseStatusHistory.create({
          data: {
            paCaseId: paCase.id,
            fromStatus: "VINCULACION",
            toStatus: status,
            reason: "Tránsito de fase IAP",
            byUserId: coord.id,
            at: lastSessionDate,
          },
        });
      }

      // Add Case stage histories
      await prisma.caseStageHistory.create({
        data: {
          paCaseId: paCase.id,
          stage: "VINCULACION",
          enteredAt: startDate,
          exitedAt: status !== "VINCULACION" ? new Date(startDate.getTime() + 10 * 24 * 60 * 60 * 1000) : null,
        },
      });

      if (status === "CONEXION" || status === "FINALIZACION" || status === "EGRESO") {
        const enteredConexion = new Date(startDate.getTime() + 10 * 24 * 60 * 60 * 1000);
        await prisma.caseStageHistory.create({
          data: {
            paCaseId: paCase.id,
            stage: "CONEXION",
            enteredAt: enteredConexion,
            exitedAt: (status === "FINALIZACION" || status === "EGRESO") ? new Date(startDate.getTime() + 40 * 24 * 60 * 60 * 1000) : null,
          },
        });
      }

      if (status === "FINALIZACION" || status === "EGRESO") {
        const enteredFinalizacion = new Date(startDate.getTime() + 40 * 24 * 60 * 60 * 1000);
        await prisma.caseStageHistory.create({
          data: {
            paCaseId: paCase.id,
            stage: "FINALIZACION",
            enteredAt: enteredFinalizacion,
            exitedAt: status === "EGRESO" ? lastSessionDate : null,
          },
        });
      }

      // 5. Create IAP Record for Case
      const iap = await prisma.iAPRecord.create({
        data: {
          paCaseId: paCase.id,
          status: status === "EGRESO" ? "FINALIZADO" : "EN_DESARROLLO",
          perFirstReflection: "El participante muestra interés por fortalecer su red de apoyo.",
          motivations: "Lograr mayor independencia laboral.",
          expectations: "Obtener herramientas de capacitación.",
          backgroundNotesDriveId: `drive_bg_${paCase.id}`,
          driveDocId: `drive_iap_${paCase.id}`,
        },
      });

      // Map IAP domains
      for (const dom of domains) {
        await prisma.iAPDomainMap.create({
          data: {
            iapRecordId: iap.id,
            recoveryDomainId: dom,
            needs: "Identificación de brechas iniciales",
            strengths: "Fortaleza identificada en entrevista",
            importance: dom === "Apoyo social" || dom === "Educación y formación" ? "ALTO" : "MEDIO",
          },
        });
      }

      // Add IAP Goals
      await prisma.iAPGoal.create({
        data: {
          iapRecordId: iap.id,
          recoveryDomainId: "Apoyo social",
          objective: "Vincularse con un club deportivo o vecinal",
          resources: "Centros municipales",
          activities: "Buscar talleres e inscribirse",
          deadline: new Date(),
          result: k === 0 ? null : (k % 2 === 0 ? "MEDIANAMENTE_LOGRADO" : "COMPLETAMENTE_LOGRADO"),
        },
      });

      // 6. Create Session Logs
      const sessionsCount = 3 + (k * 2);
      for (let s = 1; s <= sessionsCount; s++) {
        const sessionDate = new Date(startDate);
        sessionDate.setDate(sessionDate.getDate() + s * 5);
        const emotion = emotions[(s + k) % emotions.length];
        const modality = s % 3 === 0 ? "ONLINE" : "PRESENCIAL";

        let sessionStage = "VINCULACION";
        if (s > 3 && s <= 15) sessionStage = "CONEXION";
        else if (s > 15) sessionStage = "FINALIZACION";

        await prisma.sessionLog.create({
          data: {
            paCaseId: paCase.id,
            perId: perProfile.userId,
            regionId: reg.name,
            sessionNumber: s,
            date: sessionDate,
            modality: modality,
            durationMinutes: 45 + (s * 5),
            recoveryDomainId: domains[s % domains.length],
            summary: `Desarrollo del encuentro #${s}. Trabajo en los objetivos del IAP.`,
            agreements: "Seguir con la agenda pactada.",
            difficulties: s % 5 === 0 ? "Inasistencia inicial justificable" : "Ninguna",
            nextAction: `Planificar encuentro #${s+1}`,
            perEmotion: emotion,
            perReflection: "Avance positivo.",
            attendance: "REALIZADA",
            stage: sessionStage,
            status: s === sessionsCount && k === 1 ? "ENVIADA" : "VALIDADA",
            isDemo: true,
          },
        });
      }

      // 7. Create Tasks (hitos)
      const tasksToCreate = [
        { title: "Acta de Primer Encuentro y Encuadre", inst: "Acta de Primer Encuentro y Encuadre" },
        { title: "Diseño del IAP", inst: "Itinerario de Acompañamiento Personalizado (IAP)" },
        { title: "Evaluación Intermedia", inst: "Evaluación Intermedia" },
        { title: "Evaluación Ex-Post", inst: "Evaluación Ex-Post" },
        { title: "Encuesta de Satisfacción Final", inst: "Encuesta de Satisfacción PA" },
      ];

      for (let t = 0; t < tasksToCreate.length; t++) {
        const taskData = tasksToCreate[t];
        const inst = dbInstruments[taskData.inst];

        let taskStatus = "PENDIENTE";
        if (t === 0) {
          taskStatus = "VALIDADA";
        } else if (t === 1) {
          if (k === 0) {
            taskStatus = "ENVIADA";
          } else if (reg.name === "Los Ríos" && k === 2) {
            taskStatus = "ENVIADA";
          } else {
            taskStatus = "VALIDADA";
          }
        } else if (t === 2) {
          if (status === "VINCULACION") taskStatus = "PENDIENTE";
          else if (status === "CONEXION" && k === 2) taskStatus = "ENVIADA";
          else taskStatus = "VALIDADA";
        } else if (t === 3) {
          if (status === "EGRESO") taskStatus = "VALIDADA";
          else if (status === "FINALIZACION") taskStatus = "ENVIADA";
          else taskStatus = "PENDIENTE";
        } else if (t === 4) {
          if (status === "EGRESO") taskStatus = "VALIDADA";
          else if (status === "FINALIZACION") taskStatus = "ENVIADA";
          else taskStatus = "PENDIENTE";
        }

        const dueDate = new Date(startDate);
        dueDate.setDate(dueDate.getDate() + 10 + t * 20);

        const task = await prisma.task.create({
          data: {
            paCaseId: paCase.id,
            instrumentId: inst.id,
            title: taskData.title,
            description: inst.description,
            status: taskStatus,
            priority: inst.mandatory ? "CRITICA" : "MEDIA",
            dueDate: dueDate,
            regionId: reg.name,
            assignedToUserId: perProfile.userId,
            assignedByUserId: admin.id,
            isDemo: true,
          },
        });

        // Link task validation to Case properties
        if (taskStatus === "VALIDADA") {
          if (inst.name.toLowerCase().includes("satisfacción")) {
            await prisma.pACase.update({
              where: { id: paCase.id },
              data: { satisfactionTaskId: task.id },
            });
          } else if (inst.name.toLowerCase().includes("ex-post")) {
            await prisma.pACase.update({
              where: { id: paCase.id },
              data: { exPostTaskId: task.id },
            });
          } else if (inst.name.toLowerCase().includes("itinerario")) {
            await prisma.pACase.update({
              where: { id: paCase.id },
              data: { exAnteTaskId: task.id },
            });
          }
        }

        // Add task events
        await prisma.taskEvent.create({
          data: {
            taskId: task.id,
            fromStatus: "PENDIENTE",
            toStatus: taskStatus === "VALIDADA" ? "VALIDADA" : "PENDIENTE",
            byUserId: perProfile.userId,
            at: new Date(),
            note: "Registro automático del seed",
          },
        });

        // Add Document Record for files submitted/validated
        if (taskStatus === "VALIDADA" || taskStatus === "ENVIADA") {
          await prisma.documentRecord.create({
            data: {
              caseId: paCase.id,
              instrumentId: inst.id,
              instrumentVersion: inst.version,
              fileId: `drive_file_${task.id}`,
              revisionId: "revision_1",
              fileName: `${inst.name.replace(/ /g, "_")}_${paCase.code}_v${inst.version}.pdf`,
              fileUrl: `https://drive.google.com/open?id=drive_file_${task.id}`,
              uploadedByUserId: perProfile.userId,
              stage: stage,
              status: taskStatus,
              isFinalVigente: taskStatus === "VALIDADA",
              driveFolderId: paCase.driveFolderValidadosId,
              isDemo: true,
            },
          });
        }
      }

      // 8. Create some active alerts for delayed/negative cases
      if (k === 1) {
        await prisma.alert.create({
          data: {
            paCaseId: paCase.id,
            regionId: reg.name,
            type: "CASO_SIN_SESION",
            severity: "CRITICA",
            status: "ABIERTA",
            isDemo: true,
          },
        });
      } else if (k === 2) {
        await prisma.alert.create({
          data: {
            paCaseId: paCase.id,
            regionId: reg.name,
            type: "TAREA_ATRASADA",
            severity: "CRITICA",
            status: "ABIERTA",
            isDemo: true,
          },
        });
      }
    }
  }

  // 9. Seed Network Devices, Activations, and Phase 5 Records
  console.log("Seeding Network Devices & Phase 5 Records...");
  for (const reg of regions) {
    const device1 = await prisma.networkDevice.create({
      data: {
        regionId: reg.name,
        name: `COSAM ${reg.name} Centro`,
        type: "Salud",
        contactPerson: "Dr. Roberto Silva",
        isDemo: true,
      },
    });

    const device2 = await prisma.networkDevice.create({
      data: {
        regionId: reg.name,
        name: `OMIL Municipalidad de ${reg.name}`,
        type: "Empleo",
        contactPerson: "María Paz Contreras",
        isDemo: true,
      },
    });

    const device3 = await prisma.networkDevice.create({
      data: {
        regionId: reg.name,
        name: `Centro de Educación de Adultos ${reg.name}`,
        type: "Educación",
        contactPerson: "Prof. Arturo Vidal",
        isDemo: true,
      },
    });

    const cases = await prisma.pACase.findMany({ where: { regionId: reg.name } });
    if (cases.length > 0) {
      await prisma.networkActivation.create({
        data: {
          networkDeviceId: device1.id,
          caseId: cases[0].id,
          description: "Derivación para evaluación psiquiátrica complementaria",
          driveDocId: "drive_ref_cosam_act",
          isDemo: true,
        },
      });

      if (cases.length > 1) {
        await prisma.networkActivation.create({
          data: {
            networkDeviceId: device2.id,
            caseId: cases[1].id,
            description: "Vinculación a programa de intermediación laboral",
            driveDocId: "drive_ref_omil_act",
            isDemo: true,
          },
        });
      }
    }

    await prisma.phase5Record.create({
      data: {
        regionId: reg.name,
        type: "FOCUS_GROUP",
        date: new Date("2026-06-10"),
        participantsCount: 8,
        driveUrl: "https://drive.google.com/open?id=focus_group_transcription_1",
        notes: "Evaluación final de pilotaje PER con la participación de 8 usuarios del programa.",
        isDemo: true,
      },
    });

    await prisma.phase5Record.create({
      data: {
        regionId: reg.name,
        type: "REUNION_EQUIPO",
        date: new Date("2026-06-12"),
        participantsCount: 4,
        driveUrl: "https://drive.google.com/open?id=reunion_equipo_acta_1",
        notes: "Reunión de balance del equipo y planificación de egresos del período.",
        isDemo: true,
      },
    });
  }

  // 10. Seed Supervisions
  console.log("Seeding supervisions with durations...");
  const perProfiles = await prisma.pERProfile.findMany({ include: { user: true } });
  const coordUsers = await prisma.user.findMany({ where: { role: "COORDINATOR" } });

  for (const per of perProfiles) {
    const coord = coordUsers.find((c: any) => c.regionId === per.regionId);
    if (coord) {
      // Seed a recent supervision for this week
      const today = new Date();
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Monday
      const supDate = new Date(thisMonday);
      supDate.setHours(10, 0, 0, 0);

      await prisma.supervision.create({
        data: {
          coordinatorId: coord.id,
          perId: per.id,
          regionId: per.regionId,
          date: supDate,
          modality: "MEET",
          status: "REALIZADA",
          durationMinutes: 60,
          casesReviewedSerialized: JSON.stringify(["PA-MET-001", "PA-MET-002"]),
          agreements: "Seguir fortaleciendo la vinculación comunitaria del caso 1.",
          observations: "PER demuestra buen manejo de los límites terapéuticos y apego al encuadre.",
          driveActaId: "drive_acta_supervision_mock",
          isDemo: true,
        },
      });
    }
  }

  console.log("Rich seed script completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
