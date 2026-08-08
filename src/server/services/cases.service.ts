import { prisma } from "@/lib/db";
import {
  commitCaseFolder,
  commitIapDocument,
  commitValidatedCopy,
  copyActaPrimerEncuentro,
  createCaseFolder,
  createIapDocument,
  rollbackCaseFolder,
  rollbackIapDocument,
  rollbackValidatedCopy,
  type GoogleDocResult,
  type ValidatedCopyResult,
} from "../google/workspace";
import { createNotificationWithPush } from "@/server/services/push.service";
import { assertStageAdvanceAllowed, ensureCurrentStageTasks } from "@/server/services/itinerary.service";
import { syncPendingCaseDocuments } from "@/server/services/document-sync.service";
import { MAX_ACTIVE_CASES_PER_PER } from "@/lib/program-config";
import type { CaseStage } from "@/lib/instrument-itinerary";

// Helper to abbreviate Chilean regions
function getRegionAbbreviation(region: string): string {
  const clean = region.toLowerCase().trim();
  if (clean.includes("metropolitana")) return "MET";
  if (clean.includes("valpara")) return "VAL";
  if (clean.includes("tarapac")) return "TAR";
  if (clean.includes("bio")) return "BIO";
  // "LOS" es la abreviatura canónica: es la que emite prisma/seed.ts y la que
  // aparece en toda la documentación del pilotaje.
  if (clean.includes("los rios") || clean.includes("ríos")) return "LOS";
  return "GEN";
}

// Helper to generate the next PA code.
// El correlativo es por región Y por modo: demo y real llevan series independientes,
// de modo que el primer caso real de una región siempre es 001 aunque existan casos
// demo. La unicidad en base de datos es @@unique([code, isDemo]).
async function generatePaCode(regionId: string, isDemo: boolean): Promise<string> {
  const abbr = getRegionAbbreviation(regionId);

  let sequential = (await prisma.pACase.count({ where: { regionId, isDemo } })) + 1;
  let code = `PA-${abbr}-${String(sequential).padStart(3, "0")}`;
  // Loop defensivo por si el conteo no refleja códigos ya tomados (casos eliminados,
  // creados fuera de orden, etc.)
  while (await prisma.pACase.findFirst({ where: { code, isDemo }, select: { id: true } })) {
    sequential++;
    code = `PA-${abbr}-${String(sequential).padStart(3, "0")}`;
  }
  return code;
}

// Un PER lleva como máximo un acompañamiento activo a la vez. "Activo" excluye
// los estados terminales (egreso, retiro, deserción): esos ya no ocupan cupo.
async function assertPerHasNoActiveCase(perId: string, isDemo: boolean) {
  const activeCount = await prisma.pACase.count({
    where: {
      perId,
      isDemo,
      status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
    },
  });
  if (activeCount >= MAX_ACTIVE_CASES_PER_PER) {
    throw new Error(
      `El PER ya tiene un acompañamiento activo en curso (máximo permitido: ${MAX_ACTIVE_CASES_PER_PER}).`
    );
  }
}

interface ProvisionCaseInput {
  code: string;
  type: "NUEVO" | "CONTINUIDAD";
  regionId: string;
  perId: string;
  coordinatorId: string;
  candidateId: string;
  perUserId: string;
  matchRationale: string;
  genderSelfId: string | null;
  birthDate: Date | null;
  ageRange: string | null;
  educationLevel: string | null;
  employmentStatus: string | null;
  actaPrimerEncuentroDriveId: string;
  actorId: string;
  isDemo: boolean;
  auditAction: string;
}

// Aprovisiona la carpeta de Drive, el IAP y la copia del Acta de Primer Encuentro, y
// persiste el caso ya FORMALIZADO en un solo paso — sin estados intermedios PROPUESTO/
// VALIDADO que nadie decide de forma independiente. Si el aprovisionamiento en Drive
// falla, no se escribe nada en la base de datos: el coordinador simplemente reintenta.
async function provisionAndPersistCase(input: ProvisionCaseInput) {
  const folders = await createCaseFolder(input.code, input.regionId, input.perId, input.isDemo);

  let iap: GoogleDocResult | null = null;
  let actaCopy: ValidatedCopyResult | null = null;
  try {
    const createdIap = await createIapDocument(input.code, folders.vinculacionFolderId, input.isDemo);
    iap = createdIap;
    const createdActa = await copyActaPrimerEncuentro(
      input.actaPrimerEncuentroDriveId,
      folders.vinculacionFolderId,
      input.code,
      input.isDemo
    );
    actaCopy = createdActa;

    const paCase = await prisma.$transaction(async (tx) => {
      const created = await tx.pACase.create({
        data: {
          code: input.code,
          type: input.type,
          regionId: input.regionId,
          perId: input.perId,
          coordinatorId: input.coordinatorId,
          candidateId: input.candidateId,
          status: "VINCULACION",
          matchStatus: "FORMALIZADO",
          matchRationale: input.matchRationale,
          actaPrimerEncuentroDriveId: createdActa.newFileId,
          genderSelfId: input.genderSelfId,
          birthDate: input.birthDate,
          ageRange: input.ageRange,
          educationLevel: input.educationLevel,
          employmentStatus: input.employmentStatus,
          stage: "VINCULACION",
          startDate: new Date(),
          stageEnteredAt: new Date(),
          driveFolderRegionId: folders.regionFolderId,
          driveFolderPerId: folders.perFolderId,
          driveFolderCaseId: folders.caseFolderId,
          driveFolderVinculacionId: folders.vinculacionFolderId,
          driveFolderConexionId: folders.conexionFolderId,
          driveFolderFinalizacionId: folders.finalizacionFolderId,
          driveFolderValidadosId: folders.validadosFolderId,
          driveFolderId: folders.folderUrl,
          isDemo: input.isDemo,
        },
      });

      await tx.iAPRecord.create({
        data: {
          paCaseId: created.id,
          status: "INICIADO",
          driveDocId: createdIap.docId,
        },
      });

      await tx.caseStageHistory.create({
        data: {
          paCaseId: created.id,
          stage: "VINCULACION",
          enteredAt: new Date(),
        },
      });

      await tx.caseStatusHistory.create({
        data: {
          paCaseId: created.id,
          fromStatus: "PRESELECCION",
          toStatus: "VINCULACION",
          reason: "Dupla conformada y formalizada mediante Acta de Primer Encuentro y aprovisionamiento de Drive",
          byUserId: input.actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.actorId,
          role: "COORDINATOR",
          action: input.auditAction,
          entityType: "PACase",
          entityId: created.id,
          newValue: JSON.stringify({
            code: input.code,
            perId: input.perId,
            folders,
            iap: createdIap,
            acta: createdActa,
          }),
          isDemo: input.isDemo,
        },
      });

      await ensureCurrentStageTasks(created.id, input.actorId, input.isDemo, tx);

      await createNotificationWithPush({
        userId: input.perUserId,
        title: "Acompañamiento Formalizado",
        message: `Se ha formalizado el caso ${input.code} y se habilitaron su carpeta e IAP en Google Drive.`,
        link: `/per?highlightCaseId=${created.id}`,
        isDemo: input.isDemo,
      }, tx);

      return created;
    });

    await commitCaseFolder(folders, input.code, input.isDemo).catch((error) => {
      console.error("No se pudo marcar la carpeta como confirmada:", error);
    });
    await commitIapDocument(createdIap, input.isDemo).catch((error) => {
      console.error("No se pudo marcar el IAP como confirmado:", error);
    });
    await commitValidatedCopy(createdActa, input.isDemo).catch((error) => {
      console.error("No se pudo marcar el Acta como confirmada:", error);
    });
    return paCase;
  } catch (error) {
    if (actaCopy) {
      await rollbackValidatedCopy(actaCopy, input.isDemo).catch((rollbackError) => {
        console.error("No se pudo revertir la copia del Acta:", rollbackError);
      });
    }
    if (iap) {
      await rollbackIapDocument(iap, input.isDemo).catch((rollbackError) => {
        console.error("No se pudo revertir el IAP creado:", rollbackError);
      });
    }
    await rollbackCaseFolder(folders, input.code, input.isDemo).catch((rollbackError) => {
      console.error("No se pudo revertir la carpeta creada:", rollbackError);
    });
    throw error;
  }
}

export async function createCaseFromCandidate(
  candidateId: string,
  perId: string,
  matchRationale: string,
  type: "NUEVO" | "CONTINUIDAD",
  actorId: string,
  isDemo: boolean,
  actaPrimerEncuentroDriveId: string
) {
  const candidate = await prisma.pACandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new Error("Candidata no encontrada");
  if (candidate.isDemo !== isDemo) {
    throw new Error("La candidata no pertenece al modo de trabajo actual");
  }
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor || (actor.role !== "ADMIN" && actor.regionId !== candidate.regionId)) {
    throw new Error("No autorizado para operar casos de esta región");
  }

  const per = await prisma.pERProfile.findUnique({ where: { id: perId }, include: { user: true } });
  if (!per) throw new Error("PER no encontrado");
  if (per.certificationStatus === "NO_HABILITADO") {
    throw new Error("No se puede asignar acompañamiento a un PER no habilitado");
  }
  await assertPerHasNoActiveCase(perId, isDemo);

  const code = await generatePaCode(candidate.regionId, isDemo);

  const paCase = await provisionAndPersistCase({
    code,
    type,
    regionId: candidate.regionId,
    perId,
    coordinatorId: per.coordinatorId || actorId,
    candidateId,
    perUserId: per.userId,
    matchRationale,
    genderSelfId: candidate.gender,
    birthDate: candidate.birthDate,
    ageRange: candidate.ageRange,
    educationLevel: candidate.educationLevel,
    employmentStatus: candidate.employmentStatus,
    actaPrimerEncuentroDriveId,
    actorId,
    isDemo,
    auditAction: "CREATE_CASE",
  });

  await prisma.pACandidate.update({
    where: { id: candidateId },
    data: { status: "SELECCIONADA", convertedToCaseId: paCase.id },
  });

  return paCase;
}

export async function reassignCase(
  caseId: string,
  newPerId: string,
  reason: string,
  actorId: string,
  isDemo: boolean
) {
  return await prisma.$transaction(async (tx) => {
    const paCase = await tx.pACase.findUnique({ where: { id: caseId }, include: { per: { include: { user: true } } } });
    if (!paCase) throw new Error("Caso no encontrado");
    if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || (actor.role !== "ADMIN" && actor.regionId !== paCase.regionId)) {
      throw new Error("No autorizado para operar casos de esta región");
    }
    if (["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"].includes(paCase.status)) {
      throw new Error("No se puede reasignar un caso ya cerrado");
    }
    if (newPerId === paCase.perId) {
      throw new Error("El caso ya está asignado a ese PER");
    }
    if (!reason || !reason.trim()) {
      throw new Error("La reasignación requiere un motivo");
    }

    const newPer = await tx.pERProfile.findUnique({ where: { id: newPerId }, include: { user: true } });
    if (!newPer) throw new Error("PER de destino no encontrado");
    if (newPer.regionId !== paCase.regionId) {
      throw new Error("El PER de destino no pertenece a la región del caso");
    }
    if (newPer.certificationStatus === "NO_HABILITADO") {
      throw new Error("No se puede reasignar a un PER no habilitado");
    }

    const otherActiveCount = await tx.pACase.count({
      where: {
        perId: newPerId,
        isDemo,
        status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
      },
    });
    if (otherActiveCount >= MAX_ACTIVE_CASES_PER_PER) {
      throw new Error(
        `El PER de destino ya tiene un acompañamiento activo en curso (máximo permitido: ${MAX_ACTIVE_CASES_PER_PER}).`
      );
    }

    const previousPer = paCase.per;

    const updated = await tx.pACase.update({
      where: { id: caseId },
      data: { perId: newPerId, coordinatorId: newPer.coordinatorId || actorId },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: actor.role,
        action: "REASSIGN_CASE",
        entityType: "PACase",
        entityId: caseId,
        previousValue: `${previousPer.user.name} (${previousPer.id})`,
        newValue: `${newPer.user.name} (${newPer.id})`,
        reason,
        isDemo,
      },
    });

    await createNotificationWithPush({
      userId: previousPer.userId,
      title: "Acompañamiento Reasignado",
      message: `El caso ${paCase.code} fue reasignado a otro acompañante. Motivo: ${reason}`,
      link: `/per`,
      isDemo,
    }, tx);

    await createNotificationWithPush({
      userId: newPer.userId,
      title: "Nuevo Acompañamiento Asignado",
      message: `Se te reasignó el caso ${paCase.code}. Motivo: ${reason}`,
      link: `/per?highlightCaseId=${caseId}`,
      isDemo,
    }, tx);

    return updated;
  });
}

export async function updateIntensityLevel(caseId: string, intensityLevel: "BASICO" | "INTERMEDIO" | "INTENSIVO", actorId: string) {
  return await prisma.$transaction(async (tx) => {
    const paCase = await tx.pACase.findUnique({ where: { id: caseId } });
    if (!paCase) throw new Error("Caso no encontrado");

    const updated = await tx.pACase.update({
      where: { id: caseId },
      data: { intensityLevel },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "UPDATE_INTENSITY",
        entityType: "PACase",
        entityId: caseId,
        previousValue: paCase.intensityLevel,
        newValue: intensityLevel,
      },
    });

    return updated;
  });
}

export async function transitionCaseStatus(
  caseId: string,
  toStatus: string,
  reason: string,
  actorId: string,
  isDemo: boolean,
  forceAdvance = false,
  forceDesertion = false
) {
  // Etapa que se deja al avanzar (o al pasar a EGRESO), si corresponde. Se lee dentro de la
  // transacción pero el flush de documentos corre después de que commitea: es una llamada de
  // red que puede tardar hasta 60s, y mantenerla dentro del $transaction retendría el lock de
  // escritura de SQLite todo ese tiempo. Si el flush falla, los documentos quedan pendientes
  // para el próximo cierre de etapa o el botón de forzado — no hay nada que revertir, el cambio
  // de estado ya es válido por sí mismo.
  let exitedStage: CaseStage | null = null;

  const updated = await prisma.$transaction(async (tx) => {
    const paCase = await tx.pACase.findUnique({
      where: { id: caseId },
      include: { per: true },
    });
    if (!paCase) throw new Error("Caso no encontrado");
    if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || (actor.role !== "ADMIN" && actor.regionId !== paCase.regionId)) {
      throw new Error("No autorizado para operar casos de esta región");
    }

    // Puertas de avance de etapa: exigen que todos los instrumentos del itinerario de la etapa
    // ACTUAL (la que se está por dejar) estén VALIDADA/NO_APLICA. Bloqueo blando: se puede
    // forzar con motivo obligatorio, queda auditado.
    if (["CONEXION", "FINALIZACION", "EGRESO"].includes(toStatus)) {
      const gate = await assertStageAdvanceAllowed(caseId, isDemo);
      if (!gate.satisfied) {
        if (!forceAdvance) {
          const missingTitles = gate.missing.map((s) => s.title).join("; ");
          throw new Error(
            `Bloqueo de avance de etapa: faltan instrumentos por validar (${missingTitles}). Puedes forzar el avance indicando un motivo.`
          );
        }
        if (!reason || !reason.trim()) {
          throw new Error("Forzar el avance de etapa requiere un motivo.");
        }
        await tx.auditLog.create({
          data: {
            userId: actorId,
            role: actor.role,
            action: "FORCE_STAGE_ADVANCE",
            entityType: "PACase",
            entityId: caseId,
            previousValue: paCase.stage,
            newValue: JSON.stringify({ toStatus, missing: gate.missing.map((s) => s.activityKey) }),
            reason,
            isDemo,
          },
        });
      }
      // Llegar hasta acá significa que el gate se cumplió o se forzó: la etapa actual queda
      // atrás (incluyendo FINALIZACION al pasar a EGRESO, que no abre una etapa nueva).
      exitedStage = paCase.stage as CaseStage;
    }

    // Retiro / Deserción: exigen el Formulario de Abandono (Persona Acompañada) validado —
    // reemplaza el hack anterior de pegar una URL de formulario dentro del campo "reason".
    if (["RETIRO_VOLUNTARIO", "DESERCION"].includes(toStatus)) {
      const withdrawalTask = await tx.task.findFirst({
        where: { paCaseId: caseId, instrument: { activityKey: "FORMULARIO_ABANDONO_PA" } },
        orderBy: { createdAt: "desc" },
      });
      if (!withdrawalTask || withdrawalTask.status !== "VALIDADA") {
        throw new Error(
          "Se requiere completar y validar el Formulario de Abandono — Persona Acompañada antes de confirmar el retiro."
        );
      }
      // El retiro no pasa por el gate de arriba (no es un avance de etapa), pero los
      // Formularios de Abandono están catalogados bajo FINALIZACION: sin esto, esos dos
      // documentos quedarían pendientes para siempre — nada más los vuelve a intentar.
      exitedStage = "FINALIZACION";
    }

    // Deserción validations (requires contact attempts log verification or reason)
    if (toStatus === "DESERCION") {
      const attempts = await tx.contactAttempt.count({ where: { paCaseId: caseId } });
      if (attempts < 3) {
        if (!forceDesertion) {
          throw new Error(
            `No se puede marcar deserción sin registrar al menos 3 intentos de contacto fallidos (hay ${attempts}). Puedes forzarlo indicando un motivo.`
          );
        }
        if (!reason || !reason.trim()) {
          throw new Error("Forzar una deserción con menos de 3 intentos de contacto requiere un motivo.");
        }
        await tx.auditLog.create({
          data: {
            userId: actorId,
            role: actor.role,
            action: "FORCE_DESERTION",
            entityType: "PACase",
            entityId: caseId,
            previousValue: paCase.status,
            newValue: JSON.stringify({ toStatus, contactAttempts: attempts }),
            reason,
            isDemo,
          },
        });
      }
    }

    // Manage stage transition logic
    let newStage = paCase.stage;
    if (toStatus === "VINCULACION") newStage = "VINCULACION";
    else if (toStatus === "CONEXION") newStage = "CONEXION";
    else if (toStatus === "FINALIZACION") newStage = "FINALIZACION";

    const startingOrChanging = ["VINCULACION", "CONEXION", "FINALIZACION"].includes(toStatus);

    if (paCase.status !== toStatus) {
      // Close current active stage history
      const activeHistory = await tx.caseStageHistory.findFirst({
        where: { paCaseId: caseId, exitedAt: null },
      });
      if (activeHistory) {
        await tx.caseStageHistory.update({
          where: { id: activeHistory.id },
          data: { exitedAt: new Date() },
        });
      }

      // Open new stage history if starting or changing
      if (startingOrChanging) {
        await tx.caseStageHistory.create({
          data: {
            paCaseId: caseId,
            stage: newStage,
            enteredAt: new Date(),
          },
        });
      }
    }

    const updated = await tx.pACase.update({
      where: { id: caseId },
      data: {
        status: toStatus,
        stage: newStage,
        stageEnteredAt: new Date(),
      },
    });

    if (startingOrChanging && newStage !== paCase.stage) {
      await ensureCurrentStageTasks(caseId, actorId, isDemo, tx);
    }

    await tx.caseStatusHistory.create({
      data: {
        paCaseId: caseId,
        fromStatus: paCase.status,
        toStatus,
        reason,
        byUserId: actorId,
      },
    });

    // Forced Withdrawal: release PER active cupo and notify coordinator with candidates list
    if (["RETIRO_VOLUNTARIO", "DESERCION"].includes(toStatus)) {
      const candidates = await tx.pACandidate.findMany({
        where: {
          regionId: paCase.regionId,
          status: { in: ["DERIVADA", "ADMISIBLE", "SELECCIONADA"] },
          isDemo,
        },
        select: { sourceCenter: true },
      });
      const listStr = candidates.map((c) => c.sourceCenter).join(", ");
      const newValueMsg = `Retiro registrado. Cupo liberado. Lista de preselección regional disponible: ${listStr || "Ninguno"}`;
      
      await tx.auditLog.create({
        data: {
          userId: actorId,
          role: "COORDINATOR",
          action: "CASE_WITHDRAWAL_NOTIFICATION",
          entityType: "PACase",
          entityId: caseId,
          newValue: newValueMsg,
          isDemo,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "TRANSITION_STATUS",
        entityType: "PACase",
        entityId: caseId,
        previousValue: paCase.status,
        newValue: toStatus,
        reason,
        isDemo,
      },
    });

    // Create Notification triggers
    await createNotificationWithPush({
      userId: paCase.coordinatorId,
      title: `Caso ${paCase.code}: ${toStatus}`,
      message: `El caso ${paCase.code} pasó a ${toStatus}. Motivo: ${reason}`,
      link: `/coordinacion/casos?caseCode=${paCase.code}&highlightCaseId=${paCase.id}`,
      isDemo,
    }, tx);

    await createNotificationWithPush({
      userId: paCase.per.userId,
      title: `Caso ${paCase.code}: ${toStatus}`,
      message: `Tu caso asignado ${paCase.code} pasó a estado ${toStatus}.`,
      link: `/per/casos/${paCase.id}/etapa`,
      isDemo,
    }, tx);

    return updated;
  });

  if (exitedStage) {
    try {
      await syncPendingCaseDocuments(caseId, isDemo, actorId, { stage: exitedStage });
    } catch (error) {
      console.error(`No se pudieron sincronizar documentos de ${exitedStage} para el caso ${caseId}:`, error);
    }
  }

  return updated;
}

export async function logContactAttempt(caseId: string, perId: string, channel: string, outcome: string, note?: string) {
  return await prisma.contactAttempt.create({
    data: {
      paCaseId: caseId,
      perId,
      channel,
      outcome,
      note,
    },
  });
}

export async function createDirectContinuityCase(
  perId: string,
  matchRationale: string,
  regionId: string,
  gender: string,
  ageRange: string,
  educationLevel: string,
  employmentStatus: string,
  actorId: string,
  isDemo: boolean,
  actaPrimerEncuentroDriveId: string
) {
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor || (actor.role !== "ADMIN" && actor.regionId !== regionId)) {
    throw new Error("No autorizado para operar casos de esta región");
  }

  const selectedPer = await prisma.pERProfile.findUnique({ where: { id: perId }, include: { user: true } });
  if (!selectedPer || selectedPer.regionId !== regionId || selectedPer.certificationStatus !== "HABILITADO") {
    throw new Error("El PER seleccionado no está habilitado en la región actual");
  }
  await assertPerHasNoActiveCase(perId, isDemo);

  const code = await generatePaCode(regionId, isDemo);

  const candidate = await prisma.pACandidate.create({
    data: {
      regionId,
      sourceCenter: "Caso Continuidad Directo",
      status: "SELECCIONADA",
      gender,
      ageRange,
      educationLevel,
      employmentStatus,
      notes: "Creado automáticamente para acompañamiento de continuidad",
      isDemo,
    },
  });

  return provisionAndPersistCase({
    code,
    type: "CONTINUIDAD",
    regionId,
    perId,
    coordinatorId: actorId,
    candidateId: candidate.id,
    perUserId: selectedPer.userId,
    matchRationale,
    genderSelfId: gender,
    birthDate: null,
    ageRange,
    educationLevel,
    employmentStatus,
    actaPrimerEncuentroDriveId,
    actorId,
    isDemo,
    auditAction: "CREATE_CONTINUITY_CASE",
  });
}
