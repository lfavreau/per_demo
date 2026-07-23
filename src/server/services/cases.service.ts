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

// Helper to abbreviate Chilean regions
function getRegionAbbreviation(region: string): string {
  const clean = region.toLowerCase().trim();
  if (clean.includes("metropolitana")) return "MET";
  if (clean.includes("valpara")) return "VAL";
  if (clean.includes("tarapac")) return "TAR";
  if (clean.includes("bio")) return "BIO";
  if (clean.includes("los rios") || clean.includes("ríos")) return "RIO";
  return "GEN";
}

// Helper to generate the next PA code
async function generatePaCode(regionId: string, isDemo: boolean): Promise<string> {
  const abbr = getRegionAbbreviation(regionId);
  
  // Get count of cases in this region to generate sequential suffix
  const count = await prisma.pACase.count({
    where: { regionId, isDemo },
  });
  
  const sequential = String(count + 1).padStart(3, "0");
  return `PA-${abbr}-${sequential}`;
}

export async function createCaseFromCandidate(
  candidateId: string,
  perId: string,
  matchRationale: string,
  type: "NUEVO" | "CONTINUIDAD",
  actorId: string,
  isDemo: boolean
) {
  return await prisma.$transaction(async (tx) => {
    // 1. Get candidate details
    const candidate = await tx.pACandidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) throw new Error("Candidata no encontrada");
    if (candidate.isDemo !== isDemo) {
      throw new Error("La candidata no pertenece al modo de trabajo actual");
    }
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || (actor.role !== "ADMIN" && actor.regionId !== candidate.regionId)) {
      throw new Error("No autorizado para operar casos de esta región");
    }

    // 2. Get PER Profile details
    const per = await tx.pERProfile.findUnique({
      where: { id: perId },
      include: { user: true },
    });
    if (!per) throw new Error("PER no encontrado");
    if (per.certificationStatus === "NO_HABILITADO") {
      throw new Error("No se puede asignar acompañamiento a un PER no habilitado");
    }

    // 3. Generate unique code
    const code = await generatePaCode(candidate.regionId, isDemo);

    // 4. Create case
    const newCase = await tx.pACase.create({
      data: {
        code,
        type,
        regionId: candidate.regionId,
        perId,
        coordinatorId: per.coordinatorId || actorId,
        candidateId,
        status: "REGISTRADA",
        matchStatus: "PROPUESTO",
        matchRationale,
        genderSelfId: candidate.gender,
        birthDate: candidate.birthDate,
        ageRange: candidate.ageRange,
        educationLevel: candidate.educationLevel,
        employmentStatus: candidate.employmentStatus,
        stageEnteredAt: new Date(),
        isDemo,
      },
    });

    // 5. Update candidate status
    await tx.pACandidate.update({
      where: { id: candidateId },
      data: {
        status: "SELECCIONADA",
        convertedToCaseId: newCase.id,
      },
    });

    // 6. Record status history
    await tx.caseStatusHistory.create({
      data: {
        paCaseId: newCase.id,
        fromStatus: "PRESELECCION",
        toStatus: "REGISTRADA",
        reason: "Conversión desde postulación y propuesta de dupla",
        byUserId: actorId,
      },
    });

    // 7. Write audit log
    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "CREATE_CASE",
        entityType: "PACase",
        entityId: newCase.id,
        newValue: JSON.stringify({ code, perId, type }),
        isDemo,
      },
    });

    await createNotificationWithPush({
      userId: per.userId,
      title: "Propuesta de Acompañamiento",
      message: `Se te ha propuesto la asignación del caso ${code}. Justificación: ${matchRationale}`,
      link: `/per?highlightCaseId=${newCase.id}`,
      isDemo,
    }, tx);

    return newCase;
  });
}

export async function validateMatch(caseId: string, actorId: string, isDemo: boolean) {
  return await prisma.$transaction(async (tx) => {
    const paCase = await tx.pACase.findUnique({ where: { id: caseId } });
    if (!paCase) throw new Error("Caso no encontrado");
    if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || (actor.role !== "ADMIN" && actor.regionId !== paCase.regionId)) {
      throw new Error("No autorizado para operar casos de esta región");
    }
    if (paCase.matchStatus === "FORMALIZADO") return paCase;

    const updated = await tx.pACase.update({
      where: { id: caseId },
      data: { matchStatus: "VALIDADO" },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "VALIDATE_MATCH",
        entityType: "PACase",
        entityId: caseId,
        previousValue: "PROPUESTO",
        newValue: "VALIDADO",
        isDemo,
      },
    });

    return updated;
  });
}

export async function formalizeMatch(
  caseId: string,
  actaPrimerEncuentroDriveId: string,
  actorId: string,
  isDemo: boolean
) {
  const paCase = await prisma.pACase.findUnique({
    where: { id: caseId },
    include: { per: true },
  });
  if (!paCase) throw new Error("Caso no encontrado");
  if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");
  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor || (actor.role !== "ADMIN" && actor.regionId !== paCase.regionId)) {
    throw new Error("No autorizado para operar casos de esta región");
  }
  if (paCase.matchStatus === "FORMALIZADO" && paCase.driveFolderCaseId) return paCase;
  if (paCase.matchStatus !== "VALIDADO") {
    throw new Error("La propuesta debe estar validada antes de formalizarla");
  }

  const folders = await createCaseFolder(paCase.code, paCase.regionId, paCase.perId, isDemo);

  let iap: GoogleDocResult | null = null;
  let actaCopy: ValidatedCopyResult | null = null;
  try {
    const createdIap = await createIapDocument(paCase.code, folders.vinculacionFolderId, isDemo);
    iap = createdIap;
    const createdActa = await copyActaPrimerEncuentro(
      actaPrimerEncuentroDriveId,
      folders.vinculacionFolderId,
      paCase.code,
      isDemo
    );
    actaCopy = createdActa;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.pACase.update({
        where: { id: caseId },
        data: {
          matchStatus: "FORMALIZADO",
          status: "VINCULACION",
          stage: "VINCULACION",
          actaPrimerEncuentroDriveId: createdActa.newFileId,
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
        },
      });

      await tx.iAPRecord.create({
        data: {
          paCaseId: caseId,
          status: "INICIADO",
          driveDocId: createdIap.docId,
        },
      });

      await tx.caseStageHistory.create({
        data: {
          paCaseId: caseId,
          stage: "VINCULACION",
          enteredAt: new Date(),
        },
      });

      await tx.caseStatusHistory.create({
        data: {
          paCaseId: caseId,
          fromStatus: paCase.status,
          toStatus: "VINCULACION",
          reason: "Dupla formalizada mediante Acta de Primer Encuentro y aprovisionamiento de Drive",
          byUserId: actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          role: "COORDINATOR",
          action: "FORMALIZE_MATCH",
          entityType: "PACase",
          entityId: caseId,
          previousValue: JSON.stringify({ matchStatus: paCase.matchStatus, status: paCase.status }),
          newValue: JSON.stringify({
            matchStatus: "FORMALIZADO",
            status: "VINCULACION",
            folders,
            iap: createdIap,
            acta: createdActa,
          }),
          isDemo,
        },
      });

      await createNotificationWithPush({
        userId: paCase.per.userId,
        title: "Acompañamiento Formalizado",
        message: `Se ha formalizado el caso ${paCase.code} y se habilitaron su carpeta e IAP en Google Drive.`,
        link: `/per?highlightCaseId=${paCase.id}`,
        isDemo,
      }, tx);

      return result;
    });

    await commitCaseFolder(folders, paCase.code, isDemo).catch((error) => {
      console.error("No se pudo marcar la carpeta como confirmada:", error);
    });
    await commitIapDocument(createdIap, isDemo).catch((error) => {
      console.error("No se pudo marcar el IAP como confirmado:", error);
    });
    await commitValidatedCopy(createdActa, isDemo).catch((error) => {
      console.error("No se pudo marcar el Acta como confirmada:", error);
    });
    return updated;
  } catch (error) {
    if (actaCopy) {
      await rollbackValidatedCopy(actaCopy, isDemo).catch((rollbackError) => {
        console.error("No se pudo revertir la copia del Acta:", rollbackError);
      });
    }
    if (iap) {
      await rollbackIapDocument(iap, isDemo).catch((rollbackError) => {
        console.error("No se pudo revertir el IAP creado:", rollbackError);
      });
    }
    await rollbackCaseFolder(folders, paCase.code, isDemo).catch((rollbackError) => {
      console.error("No se pudo revertir la carpeta creada:", rollbackError);
    });
    throw error;
  }
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
  isDemo: boolean
) {
  return await prisma.$transaction(async (tx) => {
    const paCase = await tx.pACase.findUnique({
      where: { id: caseId },
      include: { tasks: true, per: true },
    });
    if (!paCase) throw new Error("Caso no encontrado");
    if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || (actor.role !== "ADMIN" && actor.regionId !== paCase.regionId)) {
      throw new Error("No autorizado para operar casos de esta región");
    }

    // Egreso validations (satisfaction survey and ex-post evaluation tasks must be VALIDADA)
    if (toStatus === "EGRESO") {
      const activeTasks = paCase.tasks;
      const exPostTask = activeTasks.find((t) => t.id === paCase.exPostTaskId || t.title.toLowerCase().includes("ex-post"));
      const satTask = activeTasks.find((t) => t.id === paCase.satisfactionTaskId || t.title.toLowerCase().includes("satisfacción"));
      
      const isExPostValidated = exPostTask && exPostTask.status === "VALIDADA";
      const isSatValidated = satTask && satTask.status === "VALIDADA";

      if (!isExPostValidated || !isSatValidated) {
        throw new Error("Bloqueo de Egreso: Se requiere registro y validación del diagnóstico final (Ex-Post) y la Encuesta de Satisfacción.");
      }
    }

    // Deserción validations (requires contact attempts log verification or reason)
    if (toStatus === "DESERCION") {
      const attempts = await tx.contactAttempt.count({ where: { paCaseId: caseId } });
      if (attempts < 3 && !reason.toLowerCase().includes("forzada")) {
        throw new Error("No se puede marcar deserción sin registrar al menos 3 intentos de contacto fallidos.");
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
      link: `/per?highlightCaseId=${paCase.id}`,
      isDemo,
    }, tx);

    return updated;
  });
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

  const selectedPer = await prisma.pERProfile.findUnique({ where: { id: perId } });
  if (!selectedPer || selectedPer.regionId !== regionId || selectedPer.certificationStatus !== "HABILITADO") {
    throw new Error("El PER seleccionado no está habilitado en la región actual");
  }

  const count = await prisma.pACase.count({ where: { regionId, isDemo } });
  const abbr = getRegionAbbreviation(regionId);
  const sequential = String(count + 1).padStart(3, "0");
  const code = `PA-${abbr}-${sequential}`;

  const folders = await createCaseFolder(code, regionId, perId, isDemo);

  let iap: GoogleDocResult | null = null;
  let actaCopy: ValidatedCopyResult | null = null;
  try {
    const createdIap = await createIapDocument(code, folders.vinculacionFolderId, isDemo);
    iap = createdIap;
    const createdActa = await copyActaPrimerEncuentro(
      actaPrimerEncuentroDriveId,
      folders.vinculacionFolderId,
      code,
      isDemo
    );
    actaCopy = createdActa;

    const createdCase = await prisma.$transaction(async (tx) => {
      const candidate = await tx.pACandidate.create({
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

      const paCase = await tx.pACase.create({
        data: {
          code,
          type: "CONTINUIDAD",
          regionId,
          perId,
          coordinatorId: actorId,
          candidateId: candidate.id,
          status: "VINCULACION",
          matchStatus: "FORMALIZADO",
          matchRationale,
          actaPrimerEncuentroDriveId: createdActa.newFileId,
          genderSelfId: gender,
          ageRange,
          educationLevel,
          employmentStatus,
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
          isDemo,
        },
      });

      await tx.iAPRecord.create({
        data: {
          paCaseId: paCase.id,
          status: "INICIADO",
          driveDocId: createdIap.docId,
        },
      });

      await tx.caseStageHistory.create({
        data: {
          paCaseId: paCase.id,
          stage: "VINCULACION",
          enteredAt: new Date(),
        },
      });

      await tx.caseStatusHistory.create({
        data: {
          paCaseId: paCase.id,
          fromStatus: "REGISTRADA",
          toStatus: "VINCULACION",
          reason: "Ingreso directo de continuidad",
          byUserId: actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          role: "COORDINATOR",
          action: "CREATE_CONTINUITY_CASE",
          entityType: "PACase",
          entityId: paCase.id,
          newValue: JSON.stringify({
            code,
            perId,
            folders,
            iap: createdIap,
            acta: createdActa,
          }),
          isDemo,
        },
      });

      const defaultInstruments = await tx.instrument.findMany({
        where: { status: "VIGENTE" },
      });
      const perProfile = await tx.pERProfile.findUnique({ where: { id: perId } });
      if (!perProfile) throw new Error("PER no encontrado");

      for (const inst of defaultInstruments) {
        if (
          ["GOOGLE_DOC", "GOOGLE_FORM"].includes(inst.type) &&
          inst.name !== "Inducción y Caracterización PER" &&
          inst.name !== "Formulario de Preinscripción PA" &&
          inst.name !== "Formulario de Retiro Voluntario"
        ) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (inst.defaultDueDays || 15));
          const isIap = inst.name.toLowerCase().includes("itinerario");

          await tx.task.create({
            data: {
              paCaseId: paCase.id,
              instrumentId: inst.id,
              title: inst.name,
              description: inst.description,
              status: "PENDIENTE",
              priority: inst.mandatory ? "CRITICA" : "MEDIA",
              dueDate,
              regionId,
              assignedToUserId: perProfile.userId,
              assignedByUserId: actorId,
              googleUrl: isIap ? createdIap.docUrl : undefined,
              driveFileId: isIap ? createdIap.docId : undefined,
              isDemo,
            },
          });
        }
      }

      return paCase;
    });

    await commitCaseFolder(folders, code, isDemo).catch((error) => {
      console.error("No se pudo marcar la carpeta como confirmada:", error);
    });
    await commitIapDocument(createdIap, isDemo).catch((error) => {
      console.error("No se pudo marcar el IAP como confirmado:", error);
    });
    await commitValidatedCopy(createdActa, isDemo).catch((error) => {
      console.error("No se pudo marcar el Acta como confirmada:", error);
    });
    return createdCase;
  } catch (error) {
    if (actaCopy) {
      await rollbackValidatedCopy(actaCopy, isDemo).catch((rollbackError) => {
        console.error("No se pudo revertir la copia del Acta:", rollbackError);
      });
    }
    if (iap) {
      await rollbackIapDocument(iap, isDemo).catch((rollbackError) => {
        console.error("No se pudo revertir el IAP creado:", rollbackError);
      });
    }
    await rollbackCaseFolder(folders, code, isDemo).catch((rollbackError) => {
      console.error("No se pudo revertir la carpeta creada:", rollbackError);
    });
    throw error;
  }
}
