import { prisma } from "@/lib/db";

export async function checkAllAlertRules() {
  let createdCount = 0;
  const now = new Date();

  // 1. Fetch settings for alert thresholds
  const settings = await prisma.setting.findMany();
  const alertThresholds: Record<string, number> = {
    VINCULACION: 10,
    CONEXION: 14,
    FINALIZACION: 10,
  };

  settings.forEach((s) => {
    if (s.key === "alert_days_vinculacion") alertThresholds.VINCULACION = parseInt(s.value) || 10;
    if (s.key === "alert_days_conexion") alertThresholds.CONEXION = parseInt(s.value) || 14;
    if (s.key === "alert_days_finalizacion") alertThresholds.FINALIZACION = parseInt(s.value) || 10;
  });

  // RULE 1: Cases without sessions (Inactivity)
  const activeCases = await prisma.pACase.findMany({
    where: {
      status: { in: ["VINCULACION", "CONEXION", "FINALIZACION"] },
    },
  });

  for (const paCase of activeCases) {
    const threshold = alertThresholds[paCase.status] || 14;
    const baseDate = paCase.lastSessionDate || paCase.startDate || paCase.createdAt;
    const diffTime = Math.abs(now.getTime() - baseDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > threshold) {
      // Check if alert already exists for this case
      const existingAlert = await prisma.alert.findFirst({
        where: {
          paCaseId: paCase.id,
          type: "CASO_SIN_SESION",
          status: "ABIERTA",
        },
      });

      if (!existingAlert) {
        await prisma.alert.create({
          data: {
            type: "CASO_SIN_SESION",
            severity: paCase.status === "VINCULACION" ? "ALTA" : "MEDIA",
            regionId: paCase.regionId,
            perId: paCase.perId,
            paCaseId: paCase.id,
            status: "ABIERTA",
          },
        });
        createdCount++;
      }
    }
  }

  // RULE 2: Task Overdue (Atrasada)
  const overdueTasks = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      status: { notIn: ["VALIDADA", "ENVIADA", "CANCELADA", "NO_APLICA"] },
    },
  });

  for (const task of overdueTasks) {
    // 1. Transition task state to ATRASADA if it isn't already
    if (task.status !== "ATRASADA") {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "ATRASADA" },
      });

      await prisma.taskEvent.create({
        data: {
          taskId: task.id,
          fromStatus: task.status,
          toStatus: "ATRASADA",
          byUserId: "SYSTEM",
          note: "Vencimiento detectado por el sistema",
        },
      });
    }

    // 2. Generate alert
    const existingAlert = await prisma.alert.findFirst({
      where: {
        taskId: task.id,
        type: "TAREA_ATRASADA",
        status: "ABIERTA",
      },
    });

    if (!existingAlert) {
      await prisma.alert.create({
        data: {
          type: "TAREA_ATRASADA",
          severity: task.priority === "CRITICA" ? "CRITICA" : "ALTA",
          regionId: task.regionId,
          perId: task.perId,
          paCaseId: task.paCaseId,
          taskId: task.id,
          status: "ABIERTA",
        },
      });
      createdCount++;
    }
  }

  // RULE 3: PER non-certified performing critical tasks
  const criticalTasksByUncertifiedPer = await prisma.task.findMany({
    where: {
      status: { notIn: ["VALIDADA", "CANCELADA", "NO_APLICA"] },
      instrument: {
        criticalTask: true,
      },
      assignedTo: {
        profile: {
          certificationStatus: { not: "HABILITADO" },
        },
      },
    },
    include: {
      assignedTo: {
        include: {
          profile: true,
        },
      },
    },
  });

  for (const task of criticalTasksByUncertifiedPer) {
    const existingAlert = await prisma.alert.findFirst({
      where: {
        perId: task.assignedTo.profile?.id,
        type: "PER_NO_HABILITADO",
        status: "ABIERTA",
      },
    });

    if (!existingAlert) {
      await prisma.alert.create({
        data: {
          type: "PER_NO_HABILITADO",
          severity: "CRITICA",
          regionId: task.regionId,
          perId: task.assignedTo.profile?.id,
          paCaseId: task.paCaseId,
          taskId: task.id,
          status: "ABIERTA",
        },
      });
      createdCount++;
    }
  }

  return createdCount;
}

export async function resolveAlert(alertId: string, note: string, actorId: string) {
  return await prisma.$transaction(async (tx) => {
    const alert = await tx.alert.findUnique({
      where: { id: alertId },
    });
    if (!alert) throw new Error("Alerta no encontrada");

    const updated = await tx.alert.update({
      where: { id: alertId },
      data: {
        status: "RESUELTA",
        resolvedByUserId: actorId,
        resolutionNote: note,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "USER",
        action: "RESOLVE_ALERT",
        entityType: "Alert",
        entityId: alertId,
        previousValue: alert.status,
        newValue: "RESUELTA",
        reason: note,
      },
    });

    return updated;
  });
}
