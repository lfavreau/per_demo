import { prisma } from "@/lib/db";

export async function updateTaskStatus({
  taskId,
  toStatus,
  note,
  actorId,
  isDemo,
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

  return prisma.$transaction(async (tx) => {
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

    const result = await tx.task.update({
      where: { id: taskId },
      data: {
        status: toStatus,
        // Enlace que el PER entrega (formulario o documento externo); no se verifica contra ningún servicio.
        googleUrl: toStatus === "ENVIADA" && note ? note : current.googleUrl,
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
        newValue: JSON.stringify({ status: toStatus }),
        reason: note,
        isDemo,
      },
    });

    return result;
  });
}
