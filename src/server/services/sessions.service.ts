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

export async function logSession(input: CreateSessionLogInput, actorId: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Get current count of sessions for this case to set the sequence number
    const sessionCount = await tx.sessionLog.count({
      where: { paCaseId: input.paCaseId },
    });

    const sessionNumber = sessionCount + 1;

    // 2. Fetch the case details to get coordinator ID and region ID
    const paCase = await tx.pACase.findUnique({
      where: { id: input.paCaseId },
    });
    if (!paCase) throw new Error("Caso no encontrado");

    // 3. Create the session log
    const session = await tx.sessionLog.create({
      data: {
        paCaseId: input.paCaseId,
        perId: input.perId,
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
      },
    });

    // 4. Update the case's lastSessionDate if the session was successfully attended
    if (input.attendance === "REALIZADA") {
      await tx.pACase.update({
        where: { id: input.paCaseId },
        data: {
          lastSessionDate: input.date,
        },
      });
    }

    // 5. Audit Log
    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "PER",
        action: "LOG_SESSION",
        entityType: "SessionLog",
        entityId: session.id,
        newValue: JSON.stringify({ sessionNumber, status: input.status }),
      },
    });

    if (input.status === "ENVIADA") {
      await createNotificationWithPush({
        userId: paCase.coordinatorId,
        title: "Nueva Bitácora por Validar",
        message: `El acompañante PER envió la sesión #${sessionNumber} del caso ${paCase.code} para su validación.`,
        link: `/coordinacion/sesiones?highlightSessionId=${session.id}`,
      }, tx);
    }

    return session;
  });
}

export async function validateSession(sessionId: string, actorId: string) {
  return await prisma.$transaction(async (tx) => {
    const session = await tx.sessionLog.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new Error("Registro de sesión no encontrado");

    const updated = await tx.sessionLog.update({
      where: { id: sessionId },
      data: { status: "VALIDADA" },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "COORDINATOR",
        action: "VALIDATE_SESSION",
        entityType: "SessionLog",
        entityId: sessionId,
        previousValue: session.status,
        newValue: "VALIDADA",
      },
    });

    const perProfile = await tx.pERProfile.findUnique({
      where: { id: session.perId },
    });
    if (perProfile) {
      const paCase = await tx.pACase.findUnique({
        where: { id: session.paCaseId },
      });
      await createNotificationWithPush({
        userId: perProfile.userId,
        title: "Bitácora Validada",
        message: `La sesión #${session.sessionNumber} del caso ${paCase?.code || ""} ha sido aprobada.`,
        link: `/per?highlightSessionId=${session.id}`,
      }, tx);
    }

    return updated;
  });
}

export async function returnSession(sessionId: string, feedbackText: string, actorId: string) {
  return await prisma.$transaction(async (tx) => {
    const session = await tx.sessionLog.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new Error("Registro de sesión no encontrado");

    // Create feedback record
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

    // Update status
    const updated = await tx.sessionLog.update({
      where: { id: sessionId },
      data: {
        status: "DEVUELTA",
        coordinatorFeedbackId: feedback.id,
      },
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
      },
    });

    const perProfile = await tx.pERProfile.findUnique({
      where: { id: session.perId },
    });
    if (perProfile) {
      const paCase = await tx.pACase.findUnique({
        where: { id: session.paCaseId },
      });
      await createNotificationWithPush({
        userId: perProfile.userId,
        title: "Bitácora Devuelta",
        message: `La sesión #${session.sessionNumber} del caso ${paCase?.code || ""} fue devuelta con observaciones.`,
        link: `/per?highlightSessionId=${session.id}`,
      }, tx);
    }

    return updated;
  });
}

export async function getSessionsByCase(caseId: string) {
  return await prisma.sessionLog.findMany({
    where: { paCaseId: caseId },
    orderBy: { sessionNumber: "asc" },
  });
}
