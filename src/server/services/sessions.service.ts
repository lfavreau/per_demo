import { prisma } from "@/lib/db";
import { createNotificationWithPush } from "@/server/services/push.service";

export interface CreateSessionLogInput {
  paCaseId: string;
  perId: string;
  date: Date;
  modality: string;
  durationMinutes?: number;
  recoveryDomainId?: string;
  iapGoalId?: string;
  summary: string;
  agreements?: string;
  difficulties?: string;
  nextAction?: string;
  perEmotion?: string;
  perReflection?: string;
  attendance: string;
  status: "BORRADOR" | "ENVIADA";
  offlineDraftId?: string;
}

export async function logSession(input: CreateSessionLogInput, actorId: string, isDemo: boolean) {
  return prisma.$transaction(async (tx) => {
    const paCase = await tx.pACase.findUnique({ where: { id: input.paCaseId } });
    if (!paCase) throw new Error("Caso no encontrado");
    if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");

    const perProfile = await tx.pERProfile.findUnique({ where: { userId: actorId } });
    if (!perProfile || paCase.perId !== perProfile.id) {
      throw new Error("El caso no está asignado al PER autenticado");
    }

    if (input.offlineDraftId) {
      const existing = await tx.sessionLog.findFirst({
        where: {
          offlineDraftId: input.offlineDraftId,
          paCaseId: input.paCaseId,
          perId: perProfile.id,
          isDemo,
        },
      });
      if (existing) return existing;
    }

    const sessionNumber =
      (await tx.sessionLog.count({ where: { paCaseId: input.paCaseId } })) + 1;

    const session = await tx.sessionLog.create({
      data: {
        paCaseId: input.paCaseId,
        perId: perProfile.id,
        regionId: paCase.regionId,
        sessionNumber,
        date: input.date,
        modality: input.modality,
        durationMinutes: input.durationMinutes,
        recoveryDomainId: input.recoveryDomainId,
        iapGoalId: input.iapGoalId,
        summary: input.summary,
        agreements: input.agreements,
        difficulties: input.difficulties,
        nextAction: input.nextAction,
        perEmotion: input.perEmotion,
        perReflection: input.perReflection,
        attendance: input.attendance,
        stage: paCase.stage,
        status: input.status,
        offlineDraftId: input.offlineDraftId,
        isDemo,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "PER",
        action: "LOG_SESSION",
        entityType: "SessionLog",
        entityId: session.id,
        newValue: JSON.stringify({ sessionNumber, status: input.status }),
        isDemo,
      },
    });

    if (input.status === "ENVIADA") {
      await createNotificationWithPush(
        {
          userId: paCase.coordinatorId,
          title: "Nueva Bitácora por Validar",
          message: `El acompañante PER envió la sesión #${sessionNumber} del caso ${paCase.code} para su validación.`,
          link: `/coordinacion/sesiones?highlightSessionId=${session.id}`,
          isDemo,
        },
        tx
      );
    }

    return session;
  });
}

export async function validateSession(sessionId: string, actorId: string, isDemo: boolean) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.sessionLog.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error("Registro de sesión no encontrado");
    if (session.isDemo !== isDemo) throw new Error("La sesión no pertenece al modo de trabajo actual");

    const updated = await tx.sessionLog.update({
      where: { id: sessionId },
      data: { status: "VALIDADA" },
    });

    if (session.attendance === "REALIZADA") {
      const paCase = await tx.pACase.findUnique({ where: { id: session.paCaseId } });
      if (!paCase?.lastSessionDate || session.date > paCase.lastSessionDate) {
        await tx.pACase.update({
          where: { id: session.paCaseId },
          data: { lastSessionDate: session.date },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "VALIDATE_SESSION",
        entityType: "SessionLog",
        entityId: sessionId,
        previousValue: session.status,
        newValue: "VALIDADA",
        isDemo,
      },
    });

    const perProfile = await tx.pERProfile.findUnique({ where: { id: session.perId } });
    if (perProfile) {
      const paCase = await tx.pACase.findUnique({ where: { id: session.paCaseId } });
      await createNotificationWithPush(
        {
          userId: perProfile.userId,
          title: "Bitácora Validada",
          message: `La sesión #${session.sessionNumber} del caso ${paCase?.code || ""} ha sido aprobada.`,
          link: `/per?highlightSessionId=${session.id}`,
          isDemo,
        },
        tx
      );
    }

    return updated;
  });
}

export async function returnSession(
  sessionId: string,
  feedbackText: string,
  actorId: string,
  isDemo: boolean
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.sessionLog.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error("Registro de sesión no encontrado");
    if (session.isDemo !== isDemo) throw new Error("La sesión no pertenece al modo de trabajo actual");

    const feedback = await tx.feedback.create({
      data: {
        coordinatorId: actorId,
        perId: session.perId,
        entityType: "SessionLog",
        entityId: sessionId,
        text: feedbackText,
        requiresCorrection: true,
        status: "ENVIADA",
      },
    });

    const updated = await tx.sessionLog.update({
      where: { id: sessionId },
      data: { status: "DEVUELTA", coordinatorFeedbackId: feedback.id },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "RETURN_SESSION",
        entityType: "SessionLog",
        entityId: sessionId,
        previousValue: session.status,
        newValue: "DEVUELTA",
        reason: feedbackText,
        isDemo,
      },
    });

    const perProfile = await tx.pERProfile.findUnique({ where: { id: session.perId } });
    if (perProfile) {
      const paCase = await tx.pACase.findUnique({ where: { id: session.paCaseId } });
      await createNotificationWithPush(
        {
          userId: perProfile.userId,
          title: "Bitácora Devuelta",
          message: `La sesión #${session.sessionNumber} del caso ${paCase?.code || ""} fue devuelta con observaciones.`,
          link: `/per?highlightSessionId=${session.id}`,
          isDemo,
        },
        tx
      );
    }

    return updated;
  });
}

export async function getSessionsByCase(caseId: string) {
  return prisma.sessionLog.findMany({
    where: { paCaseId: caseId },
    orderBy: { sessionNumber: "asc" },
  });
}
