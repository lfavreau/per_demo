import { prisma } from "../src/lib/db";
import { ensureCurrentStageTasks } from "../src/server/services/itinerary.service";
import { updateTaskStatus } from "../src/server/services/tasks.service";
import { SETTINGS_CATALOG, buildInstrumentCatalog } from "./catalog/instruments";
import { REGIONAL_COORDINATORS } from "./catalog/coordinators";

/**
 * Simula progreso real del itinerario de la etapa ACTUAL del caso reusando las funciones de
 * servicio reales (no reimplementa reglas de estado): valida `validatedCount` pasos secuenciales
 * en orden y, si se pide, deja el siguiente paso materializado en `currentTaskState`.
 */
async function seedAdvanceItinerary(
  paCaseId: string,
  actorId: string,
  isDemo: boolean,
  validatedCount: number,
  currentTaskState?: "ENVIADA" | "DEVUELTA"
) {
  for (let i = 0; i < validatedCount; i++) {
    const task = await ensureCurrentStageTasks(paCaseId, actorId, isDemo);
    if (!task) return;
    await updateTaskStatus({ taskId: task.id, toStatus: "VALIDADA", actorId, isDemo });
  }
  if (currentTaskState) {
    const task = await ensureCurrentStageTasks(paCaseId, actorId, isDemo);
    if (task) {
      await updateTaskStatus({
        taskId: task.id,
        toStatus: currentTaskState,
        actorId,
        isDemo,
        note:
          currentTaskState === "DEVUELTA"
            ? "Favor detallar mejor la sección de dificultades reportadas."
            : undefined,
      });
    }
  }
}

function assertNotProduction() {
  const looksLikeProduction =
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_TURSO_DATABASE_URL;
  if (looksLikeProduction && process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    throw new Error(
      "Este seed borra y repuebla TODA la base de datos con datos demo/prueba. " +
        "Se detecto una variable de entorno de base de datos remota (Turso/produccion), asi que se aborta. " +
        "Si de verdad queres correrlo contra esa base, seteá ALLOW_DESTRUCTIVE_SEED=true explicitamente. " +
        "Para poblar produccion de forma segura usa en su lugar: npx tsx prisma/seed-bootstrap.ts"
    );
  }
}

async function main() {
  assertNotProduction();
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
  for (const s of SETTINGS_CATALOG) {
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
  const instruments = buildInstrumentCatalog(admin.id);

  for (const inst of instruments) {
    await prisma.instrument.create({ data: inst });
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
    // 1. Create Coordinator for region (datos compartidos con el bootstrap de produccion, son reales)
    const coordSeed = REGIONAL_COORDINATORS.find((c) => c.regionId === reg.name);
    if (!coordSeed) throw new Error("No hay coordinador definido para la region " + reg.name);
    const coord = await prisma.user.create({
      data: {
        name: coordSeed.name,
        email: coordSeed.email,
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
          isDemo: true, // dato de prueba, nunca debe aparecer en la seccion real
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
    // Un PER lleva como máximo un acompañamiento activo a la vez: las primeras
    // dbPerProfiles.length iteraciones reparten un caso activo distinto por PER;
    // el resto (si sobran casos que PERs en la región) queda en estado terminal
    // reusando PERs, ya que un caso cerrado no ocupa cupo.
    const casesCount = 4;
    const activeStatuses = ["VINCULACION", "CONEXION", "FINALIZACION"];
    const terminalStatuses = ["EGRESO", "RETIRO_VOLUNTARIO"];
    for (let k = 0; k < casesCount; k++) {
      const perProfile = k < dbPerProfiles.length ? dbPerProfiles[k] : dbPerProfiles[k % dbPerProfiles.length];
      const candidate = dbCandidates[k % dbCandidates.length];
      const status = k < dbPerProfiles.length
        ? activeStatuses[k % activeStatuses.length]
        : terminalStatuses[(k - dbPerProfiles.length) % terminalStatuses.length];
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

      // 7. Simular avance del itinerario de instrumentos en la etapa ACTUAL del caso, reusando
      // las funciones reales de servicio (ensureCurrentStageTasks + updateTaskStatus) en vez de
      // reimplementar reglas de estado — así el seed queda garantizado consistente con el
      // gating real en runtime. Solo se materializa (y muestra en /per) el paso actual de la
      // etapa, no los 5 hitos de golpe como antes.
      if (status === "VINCULACION") {
        // 5 pasos secuenciales (Primer Encuentro..Actividad 4). Variar por k para tener demo
        // con distintos niveles de avance: 0, 1 o 2 validados, y el actual en distintos estados.
        const validatedCount = k % 3;
        const currentTaskState = k === 0 ? "ENVIADA" : k % 4 === 3 ? "DEVUELTA" : undefined;
        await seedAdvanceItinerary(paCase.id, admin.id, true, validatedCount, currentTaskState);
      } else if (status === "CONEXION") {
        // 2 pasos secuenciales (Actividad 5 Intermedia, Reformular Actividad 4 [opcional]).
        // CONEXION solo ocurre en k=2 (ver `statuses` arriba), así que "k % 2" siempre daba 0:
        // ningún caso de la demo validaba su Evaluación Intermedia. Se fija en 1 para que el
        // KPI de evaluaciones intermedias (ver reports.service.ts) tenga datos que mostrar.
        const validatedCount = 1;
        const currentTaskState = reg.name === "Los Ríos" && k === 2 ? "ENVIADA" : undefined;
        await seedAdvanceItinerary(paCase.id, admin.id, true, validatedCount, currentTaskState);
      } else if (status === "FINALIZACION") {
        // 3 pasos secuenciales (Actividad 5 Final, Actividad 6, Encuesta de Satisfacción).
        const validatedCount = 1 + (k % 2);
        await seedAdvanceItinerary(paCase.id, admin.id, true, validatedCount, "ENVIADA");
      } else if (status === "EGRESO") {
        // Caso ya egresado: la etapa Finalización queda íntegramente validada, consistente con
        // la puerta de avance real (assertStageAdvanceAllowed) que ahora exige esto en runtime.
        await seedAdvanceItinerary(paCase.id, admin.id, true, 3);
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
