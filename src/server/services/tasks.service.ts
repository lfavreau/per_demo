import { prisma } from "@/lib/db";

export async function assignTask({
  title,
  description,
  instrumentId,
  assignedToUserId,
  paCaseId,
  dueDate,
  priority = "MEDIA",
  actorId,
}: {
  title: string;
  description?: string;
  instrumentId?: string;
  assignedToUserId: string;
  paCaseId?: string;
  dueDate?: Date;
  priority?: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  actorId: string;
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. If instrument is specified, verify eligibility
    if (instrumentId) {
      const instrument = await tx.instrument.findUnique({
        where: { id: instrumentId },
      });

      if (instrument && instrument.criticalTask) {
        // Find assigned user's PERProfile
        const profile = await tx.pERProfile.findUnique({
          where: { userId: assignedToUserId },
        });

        if (profile && profile.certificationStatus !== "HABILITADO") {
          throw new Error(
            "Regla Crítica: No se puede asignar una tarea crítica (ej. Acta de Primer Encuentro, IAP) a un PER que no esté habilitado."
          );
        }
      }
    }

    // 2. Fetch assigned user to determine region scope
    const assignedUser = await tx.user.findUnique({
      where: { id: assignedToUserId },
    });
    if (!assignedUser) throw new Error("Usuario asignado no encontrado");

    // 3. Create task
    const task = await tx.task.create({
      data: {
        title,
        description,
        instrumentId,
        assignedToUserId,
        assignedByUserId: actorId,
        regionId: assignedUser.regionId || "MET", // fallback
        paCaseId,
        dueDate,
        status: "PENDIENTE",
        priority,
      },
    });

    // 4. Record event
    await tx.taskEvent.create({
      data: {
        taskId: task.id,
        fromStatus: "NONE",
        toStatus: "PENDIENTE",
        byUserId: actorId,
        note: "Asignación inicial de tarea",
      },
    });

    // 5. Write audit log
    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "ASSIGN_TASK",
        entityType: "Task",
        entityId: task.id,
        newValue: JSON.stringify({ title, assignedToUserId, paCaseId }),
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
}: {
  taskId: string;
  toStatus: "PENDIENTE" | "EN_CURSO" | "ENVIADA" | "EN_REVISION" | "VALIDADA" | "DEVUELTA" | "CANCELADA";
  note?: string;
  actorId: string;
}) {
  return await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      include: { instrument: true },
    });
    if (!task) throw new Error("Tarea no encontrada");

    const previousStatus = task.status;

    // Handle special feedback when task is returned (DEVUELTA)
    if (toStatus === "DEVUELTA") {
      await tx.feedback.create({
        data: {
          coordinatorId: actorId,
          perId: task.assignedToUserId,
          entityType: "Task",
          entityId: taskId,
          text: note || "Devuelto para correcciones",
          requiresCorrection: true,
          status: "ENVIADA",
          taskId: taskId,
        },
      });
    }

    // Auto-validate case requirements if task is validated
    if (toStatus === "VALIDADA" && task.paCaseId && task.instrumentId) {
      const inst = task.instrument;
      if (inst) {
        const updateData: Record<string, string> = {};
        if (inst.name.toLowerCase().includes("satisfacción")) {
          updateData.satisfactionTaskId = task.id;
        } else if (inst.name.toLowerCase().includes("ex-post")) {
          updateData.exPostTaskId = task.id;
        } else if (inst.name.toLowerCase().includes("ex-ante") || inst.name.toLowerCase().includes("itinerario")) {
          updateData.exAnteTaskId = task.id;
        }

        if (Object.keys(updateData).length > 0) {
          await tx.pACase.update({
            where: { id: task.paCaseId },
            data: updateData,
          });
        }
      }
    }

    // Update status
    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        status: toStatus,
        googleUrl: toStatus === "ENVIADA" && note ? note : task.googleUrl, // If PER submits with a link
      },
    });

    // Record task event
    await tx.taskEvent.create({
      data: {
        taskId,
        fromStatus: previousStatus,
        toStatus,
        byUserId: actorId,
        note,
      },
    });

    // Write audit log
    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "USER",
        action: "UPDATE_TASK_STATUS",
        entityType: "Task",
        entityId: taskId,
        previousValue: previousStatus,
        newValue: toStatus,
        reason: note,
      },
    });

    return updated;
  });
}
