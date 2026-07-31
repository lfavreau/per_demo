import { prisma } from "@/lib/db";
import type { ValidatedCopyResult } from "@/server/google/workspace";

// Import dinámico: `@/server/google/workspace` hace `import "server-only"`, que revienta fuera
// del compilador de Next.js (por ejemplo, en el script de seed corrido con tsx). Los pasos de
// instrumentos nativos (submissionMode NATIVE_FORM) nunca tocan Drive, así que este módulo solo
// se carga cuando realmente se necesita.
function loadWorkspace() {
  return import("@/server/google/workspace");
}

export async function assignTask({
  title,
  description,
  instrumentId,
  assignedToUserId,
  paCaseId,
  dueDate,
  priority = "MEDIA",
  actorId,
  isDemo,
}: {
  title: string;
  description?: string;
  instrumentId?: string;
  assignedToUserId: string;
  paCaseId?: string;
  dueDate?: Date;
  priority?: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  actorId: string;
  isDemo: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    if (instrumentId) {
      const instrument = await tx.instrument.findUnique({ where: { id: instrumentId } });
      if (instrument?.criticalTask) {
        const profile = await tx.pERProfile.findUnique({ where: { userId: assignedToUserId } });
        if (profile && profile.certificationStatus !== "HABILITADO") {
          throw new Error("No se puede asignar una tarea crítica a un PER no habilitado.");
        }
      }
    }

    const assignedUser = await tx.user.findUnique({ where: { id: assignedToUserId } });
    if (!assignedUser) throw new Error("Usuario asignado no encontrado");

    if (paCaseId) {
      const paCase = await tx.pACase.findUnique({ where: { id: paCaseId } });
      if (!paCase || paCase.isDemo !== isDemo) {
        throw new Error("El caso no pertenece al modo de trabajo actual");
      }
    }

    const task = await tx.task.create({
      data: {
        title,
        description,
        instrumentId,
        assignedToUserId,
        assignedByUserId: actorId,
        regionId: assignedUser.regionId || "MET",
        paCaseId,
        dueDate,
        status: "PENDIENTE",
        priority,
        isDemo,
      },
    });

    await tx.taskEvent.create({
      data: {
        taskId: task.id,
        fromStatus: "NONE",
        toStatus: "PENDIENTE",
        byUserId: actorId,
        note: "Asignación inicial de tarea",
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "ASSIGN_TASK",
        entityType: "Task",
        entityId: task.id,
        newValue: JSON.stringify({ title, assignedToUserId, paCaseId }),
        isDemo,
      },
    });

    return task;
  });
}

export async function updateTaskStatus({
  taskId,
  toStatus,
  note,
  actorId,
  isDemo,
  googleFileId,
  contentJson,
}: {
  taskId: string;
  toStatus:
    | "PENDIENTE"
    | "EN_CURSO"
    | "ENVIADA"
    | "EN_REVISION"
    | "VALIDADA"
    | "DEVUELTA"
    | "CANCELADA"
    | "NO_APLICA";
  note?: string;
  actorId: string;
  isDemo: boolean;
  googleFileId?: string;
  /** Payload JSON de instrumentos nativos (submissionMode NATIVE_FORM) — se persiste en Task.contentJson. */
  contentJson?: string;
}) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { instrument: true, paCase: true },
  });
  if (!task) throw new Error("Tarea no encontrada");
  if (task.isDemo !== isDemo) throw new Error("La tarea no pertenece al modo de trabajo actual");

  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor) throw new Error("Usuario no encontrado");
  if (actor.role === "PER" && task.assignedToUserId !== actorId) {
    throw new Error("La tarea no está asignada al PER autenticado");
  }
  if (
    actor.role === "COORDINATOR" &&
    (!actor.regionId || actor.regionId !== task.regionId)
  ) {
    throw new Error("No autorizado para operar tareas de otra región");
  }

  const isNativeForm = task.instrument?.submissionMode === "NATIVE_FORM";

  let submittedFile = null;
  if (toStatus === "ENVIADA" && !isNativeForm) {
    if (!googleFileId || !task.paCase?.driveFolderCaseId) {
      if (!isDemo) throw new Error("La tarea debe incluir un archivo dentro de la carpeta del caso");
    } else {
      const { verifyDriveFile } = await loadWorkspace();
      submittedFile = await verifyDriveFile(
        googleFileId,
        task.paCase.driveFolderCaseId,
        isDemo
      );
    }
  }

  let validatedCopy: ValidatedCopyResult | null = null;
  if (toStatus === "VALIDADA" && !isNativeForm && task.paCaseId && task.instrument) {
    if (!task.driveFileId || !task.paCase?.driveFolderValidadosId) {
      if (!isDemo) throw new Error("No se puede validar una tarea sin archivo verificado");
    } else {
      const { copyToValidadosFolder } = await loadWorkspace();
      validatedCopy = await copyToValidadosFolder(
        task.driveFileId,
        task.paCase.driveFolderValidadosId,
        task.paCase.code,
        task.instrument.name,
        task.instrument.version,
        isDemo
      );
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.task.findUnique({
        where: { id: taskId },
        include: { instrument: true },
      });
      if (!current || current.isDemo !== isDemo) {
        throw new Error("La tarea cambió o dejó de estar disponible");
      }

      if (toStatus === "DEVUELTA") {
        await tx.feedback.create({
          data: {
            coordinatorId: actorId,
            perId: current.assignedToUserId,
            entityType: "Task",
            entityId: taskId,
            text: note || "Devuelto para correcciones",
            requiresCorrection: true,
            status: "ENVIADA",
            taskId,
          },
        });
      }

      if (toStatus === "VALIDADA" && current.paCaseId && current.instrumentId) {
        const activityKey = current.instrument?.activityKey;
        const instrumentName = current.instrument?.name.toLowerCase() || "";
        const updateData: Record<string, string> = {};
        if (activityKey === "ENCUESTA_SATISFACCION" || instrumentName.includes("satisfacción")) {
          updateData.satisfactionTaskId = current.id;
        } else if (activityKey === "ACTIVIDAD_5_FINAL" || instrumentName.includes("ex-post")) {
          updateData.exPostTaskId = current.id;
        } else if (
          activityKey === "ACTIVIDAD_4_PLANIFICACION" ||
          instrumentName.includes("ex-ante") ||
          instrumentName.includes("itinerario")
        ) {
          updateData.exAnteTaskId = current.id;
        }
        if (Object.keys(updateData).length) {
          await tx.pACase.update({ where: { id: current.paCaseId }, data: updateData });
        }
      }

      if (validatedCopy && current.paCaseId && current.instrumentId && current.instrument) {
        await tx.documentRecord.updateMany({
          where: {
            caseId: current.paCaseId,
            instrumentId: current.instrumentId,
            isFinalVigente: true,
            isDemo,
          },
          data: { isFinalVigente: false },
        });
        const existingRecord = await tx.documentRecord.findFirst({
          where: {
            caseId: current.paCaseId,
            instrumentId: current.instrumentId,
            fileId: validatedCopy.newFileId,
            isDemo,
          },
        });
        if (!existingRecord) {
          await tx.documentRecord.create({
            data: {
              caseId: current.paCaseId,
              instrumentId: current.instrumentId,
              instrumentVersion: current.instrument.version,
              fileId: validatedCopy.newFileId,
              revisionId: validatedCopy.newRevisionId,
              fileName: validatedCopy.fileName,
              fileUrl: validatedCopy.fileUrl,
              uploadedByUserId: current.assignedToUserId,
              stage: task.paCase?.stage || "VINCULACION",
              status: "VALIDADA",
              isFinalVigente: true,
              driveFolderId: task.paCase?.driveFolderValidadosId,
              isDemo,
            },
          });
        }
      }

      const result = await tx.task.update({
        where: { id: taskId },
        data: {
          status: toStatus,
          googleUrl:
            toStatus === "ENVIADA" && note
              ? submittedFile?.fileUrl || note
              : current.googleUrl,
          driveFileId:
            toStatus === "ENVIADA" && googleFileId
              ? submittedFile?.fileId || googleFileId
              : current.driveFileId,
          contentJson: contentJson !== undefined ? contentJson : current.contentJson,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId,
          fromStatus: current.status,
          toStatus,
          byUserId: actorId,
          note,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorId,
          role: actor.role,
          action: "UPDATE_TASK_STATUS",
          entityType: "Task",
          entityId: taskId,
          previousValue: current.status,
          newValue: JSON.stringify({
            status: toStatus,
            submittedFile,
            validatedCopy,
          }),
          reason: note,
          isDemo,
        },
      });

      return result;
    });

    if (validatedCopy) {
      const { commitValidatedCopy } = await loadWorkspace();
      await commitValidatedCopy(validatedCopy, isDemo).catch((error) => {
        console.error("No se pudo marcar la copia validada como confirmada:", error);
      });
    }
    return updated;
  } catch (error) {
    if (validatedCopy) {
      const { rollbackValidatedCopy } = await loadWorkspace();
      await rollbackValidatedCopy(validatedCopy, isDemo).catch((rollbackError) => {
        console.error("No se pudo revertir la copia validada:", rollbackError);
      });
    }
    throw error;
  }
}
