import { prisma } from "@/lib/db";
import { updateTaskStatus } from "@/server/services/tasks.service";
import {
  getSequentialStepsForStage,
  getStepByActivityKey,
  getStepsForStage,
  type CaseStage,
  type ItineraryStepDef,
} from "@/lib/instrument-itinerary";
import { MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION } from "@/lib/program-config";

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

interface ItineraryStepState {
  activityKey: string;
  title: string;
  kind: "COMPLETED" | "CURRENT" | "UPCOMING";
  taskId?: string;
  status?: string;
  contentJson?: string | null;
  googleUrl?: string | null;
  submissionMode: "EXTERNAL_LINK" | "NATIVE_FORM";
  optional: boolean;
}

async function findTaskForStep(tx: TxClient, paCaseId: string, activityKey: string) {
  return tx.task.findFirst({
    where: { paCaseId, instrument: { activityKey } },
    orderBy: { createdAt: "desc" },
  });
}

interface UnlockablePACase {
  id: string;
  regionId: string;
  per: { userId: string };
}

async function unlockStep(
  client: TxClient,
  paCase: UnlockablePACase,
  step: ItineraryStepDef,
  actorId: string,
  isDemo: boolean
) {
  const instrument = await client.instrument.findFirst({
    where: { activityKey: step.activityKey, status: "VIGENTE" },
  });
  if (!instrument) {
    throw new Error(`No se encontró el instrumento vigente para ${step.activityKey}`);
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (instrument.defaultDueDays || 15));

  const created = await client.task.create({
    data: {
      paCaseId: paCase.id,
      instrumentId: instrument.id,
      title: step.title,
      description: instrument.description,
      status: "PENDIENTE",
      priority: instrument.mandatory ? "CRITICA" : "MEDIA",
      dueDate,
      regionId: paCase.regionId,
      assignedToUserId: paCase.per.userId,
      assignedByUserId: actorId,
      isDemo,
    },
  });

  await client.taskEvent.create({
    data: {
      taskId: created.id,
      fromStatus: "NONE",
      toStatus: "PENDIENTE",
      byUserId: actorId,
      note: `Paso de itinerario desbloqueado: ${step.activityKey}`,
    },
  });

  return created;
}

/**
 * Idempotente: materializa solo la Task del primer paso SEQUENTIAL de la etapa actual
 * que aún no está VALIDADA/NO_APLICA. Los pasos siguientes de la etapa no existen en DB
 * hasta que este se valide (evita "sobrepoblación" de tasks pendientes).
 */
export async function ensureCurrentStageTasks(
  paCaseId: string,
  actorId: string,
  isDemo: boolean,
  tx?: TxClient
) {
  const run = async (client: TxClient) => {
    const paCase = await client.pACase.findUnique({
      where: { id: paCaseId },
      include: { per: true },
    });
    if (!paCase) throw new Error("Caso no encontrado");
    if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");

    const steps = getSequentialStepsForStage(paCase.stage as CaseStage);
    for (const step of steps) {
      const existing = await findTaskForStep(client, paCaseId, step.activityKey);
      if (existing && ["VALIDADA", "NO_APLICA"].includes(existing.status)) {
        continue; // este paso ya está resuelto, seguir al siguiente
      }
      if (existing) {
        return existing; // ya hay una task en curso para este paso, no crear otra
      }

      // La Evaluación Intermedia no se desbloquea sola al entrar a Conexión: recién tiene
      // sentido evaluar avances después de varias sesiones. El coordinador puede adelantarla
      // a mano si corresponde (ver triggerIntermediateEvaluation); sin eso ni sesiones
      // suficientes, la secuencia se detiene acá — Reformular Actividad 4 tampoco debería
      // aparecer antes que la evaluación que lo justifica.
      if (step.activityKey === "ACTIVIDAD_5_INTERMEDIA") {
        const validatedSessions = await client.sessionLog.count({
          where: { paCaseId, isDemo, status: "VALIDADA" },
        });
        if (validatedSessions < MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION) {
          return null;
        }
      }

      return unlockStep(client, paCase, step, actorId, isDemo); // solo materializamos un paso por llamada
    }
    return null; // toda la etapa ya está resuelta
  };

  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Override manual del coordinador: habilita la Evaluación Intermedia antes de llegar a las
 * MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION sesiones, cuando a su criterio ya corresponde.
 */
export async function triggerIntermediateEvaluation(paCaseId: string, actorId: string, isDemo: boolean) {
  return prisma.$transaction(async (tx) => {
    const paCase = await tx.pACase.findUnique({ where: { id: paCaseId }, include: { per: true } });
    if (!paCase) throw new Error("Caso no encontrado");
    if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");
    if (paCase.stage !== "CONEXION") {
      throw new Error("La Evaluación Intermedia solo se puede habilitar durante la etapa Conexión");
    }

    const existing = await findTaskForStep(tx, paCaseId, "ACTIVIDAD_5_INTERMEDIA");
    if (existing) {
      throw new Error("La Evaluación Intermedia ya está habilitada para este caso");
    }

    const step = getStepByActivityKey("ACTIVIDAD_5_INTERMEDIA");
    if (!step) throw new Error("Paso de itinerario no encontrado en el catálogo");

    return unlockStep(tx, paCase, step, actorId, isDemo);
  });
}

export async function getItineraryState(paCaseId: string, isDemo: boolean) {
  const paCase = await prisma.pACase.findUnique({ where: { id: paCaseId } });
  if (!paCase) throw new Error("Caso no encontrado");
  if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");

  const stage = paCase.stage as CaseStage;
  const steps = getStepsForStage(stage);
  const sequentialSteps = steps.filter((s) => s.triggerCondition === "SEQUENTIAL");

  const tasks = await prisma.task.findMany({
    where: { paCaseId, instrument: { activityKey: { not: null } } },
    include: { instrument: true },
  });
  const taskByActivityKey = new Map(tasks.map((t) => [t.instrument!.activityKey as string, t]));

  const stepStates: ItineraryStepState[] = sequentialSteps.map((step) => {
    const task = taskByActivityKey.get(step.activityKey);
    const kind: ItineraryStepState["kind"] =
      task && ["VALIDADA", "NO_APLICA"].includes(task.status)
        ? "COMPLETED"
        : task
          ? "CURRENT"
          : "UPCOMING";
    return {
      activityKey: step.activityKey,
      title: step.title,
      kind,
      taskId: task?.id,
      status: task?.status,
      contentJson: task?.contentJson,
      googleUrl: task?.googleUrl,
      submissionMode: step.submissionMode,
      optional: step.optional,
    };
  });

  const continuousStep = steps.find((s) => s.triggerCondition === "CONTINUOUS");
  let sessionLogCount: number | undefined;
  let validatedSessionLogCount: number | undefined;
  if (continuousStep) {
    sessionLogCount = await prisma.sessionLog.count({
      where: { paCaseId, isDemo, status: { in: ["ENVIADA", "VALIDADA"] } },
    });
    // Solo las validadas cuentan para el umbral de desbloqueo automático de la Evaluación
    // Intermedia (ver MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION) — distinto del contador de
    // "sesiones registradas" de arriba, que incluye las enviadas sin validar todavía.
    validatedSessionLogCount = await prisma.sessionLog.count({
      where: { paCaseId, isDemo, status: "VALIDADA" },
    });
  }

  // Los formularios de abandono se materializan bajo demanda (ensureWithdrawalStep) cuando
  // coordinación inicia un retiro/deserción, sin importar en qué etapa esté el caso — por eso
  // se buscan aparte, no vía getStepsForStage(stage actual).
  const withdrawalTask = tasks.find((t) => t.instrument?.triggerCondition === "ON_WITHDRAWAL");
  const pendingWithdrawalStep = withdrawalTask
    ? {
        activityKey: withdrawalTask.instrument!.activityKey as string,
        title: withdrawalTask.title,
        taskId: withdrawalTask.id,
        status: withdrawalTask.status,
        contentJson: withdrawalTask.contentJson,
      }
    : null;

  const gate = await assertStageAdvanceAllowed(paCaseId, isDemo);

  return {
    stage,
    steps: stepStates,
    continuousStep: continuousStep
      ? { activityKey: continuousStep.activityKey, title: continuousStep.title, sessionLogCount, validatedSessionLogCount }
      : null,
    pendingWithdrawalStep,
    gate,
  };
}

interface SubmitFieldValues {
  [key: string]: unknown;
}

export async function submitItineraryStep({
  taskId,
  actorId,
  isDemo,
  fieldValues,
}: {
  taskId: string;
  actorId: string;
  isDemo: boolean;
  fieldValues: SubmitFieldValues;
}) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { instrument: true, paCase: { include: { iapRecords: true } } },
  });
  if (!task) throw new Error("Tarea no encontrada");
  if (task.isDemo !== isDemo) throw new Error("La tarea no pertenece al modo de trabajo actual");
  const step = task.instrument?.activityKey ? getStepByActivityKey(task.instrument.activityKey) : undefined;
  if (!step) throw new Error("Instrumento sin catálogo de itinerario asociado");

  for (const field of step.fields || []) {
    if (field.required && !fieldValues[field.key]) {
      throw new Error(`El campo "${field.label}" es obligatorio`);
    }
  }

  const contentJson = JSON.stringify(fieldValues);

  if (step.contentTarget === "IAP_DOMAIN_MAP" || step.contentTarget === "IAP_GOAL") {
    const iapRecord = task.paCase?.iapRecords[0];
    if (!iapRecord) throw new Error("El caso no tiene un IAPRecord inicializado");

    await prisma.$transaction(async (tx) => {
      if (step.contentTarget === "IAP_DOMAIN_MAP") {
        const rows = (fieldValues.domains as Array<{ recoveryDomainId: string; needs?: string; strengths?: string; importance?: string }>) || [];
        await tx.iAPDomainMap.deleteMany({ where: { taskId } });
        for (const row of rows) {
          await tx.iAPDomainMap.create({
            data: {
              iapRecordId: iapRecord.id,
              taskId,
              recoveryDomainId: row.recoveryDomainId,
              needs: row.needs,
              strengths: row.strengths,
              importance: row.importance,
            },
          });
        }
      }

      if (step.contentTarget === "IAP_GOAL") {
        const rows = (fieldValues.goals as Array<{ recoveryDomainId: string; objective: string; resources?: string; activities?: string; deadline?: string }>) || [];
        const nextVersion = ((await tx.iAPGoal.aggregate({
          where: { iapRecordId: iapRecord.id },
          _max: { version: true },
        }))._max.version || 0) + (step.activityKey === "REFORMULAR_ACTIVIDAD_4" ? 1 : 0);
        const version = step.activityKey === "REFORMULAR_ACTIVIDAD_4" ? Math.max(nextVersion, 2) : 1;

        if (step.activityKey === "REFORMULAR_ACTIVIDAD_4") {
          await tx.iAPGoal.updateMany({
            where: { iapRecordId: iapRecord.id, isCurrent: true },
            data: { isCurrent: false },
          });
        }

        for (const row of rows) {
          await tx.iAPGoal.create({
            data: {
              iapRecordId: iapRecord.id,
              taskId,
              version,
              isCurrent: true,
              recoveryDomainId: row.recoveryDomainId,
              objective: row.objective,
              resources: row.resources,
              activities: row.activities,
              deadline: row.deadline ? new Date(row.deadline) : undefined,
            },
          });
        }
      }
    });
  }

  if (step.activityKey === "ACTIVIDAD_2_ANTECEDENTES" && typeof fieldValues.alias === "string" && fieldValues.alias.trim()) {
    await prisma.pACase.update({
      where: { id: task.paCaseId! },
      data: { alias: fieldValues.alias.trim() },
    });
  }

  return updateTaskStatus({ taskId, toStatus: "ENVIADA", actorId, isDemo, contentJson });
}

/**
 * Objetivos vigentes (isCurrent: true) del IAPRecord del caso, para poblar el selector
 * de "Objetivo" en el Registro de Acompañamiento (Actividad 4 o su reformulación).
 */
export async function getCurrentGoalsForCase(paCaseId: string) {
  const iapRecord = await prisma.iAPRecord.findFirst({ where: { paCaseId } });
  if (!iapRecord) return [];
  return prisma.iAPGoal.findMany({
    where: { iapRecordId: iapRecord.id, isCurrent: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function validateItineraryStep(taskId: string, actorId: string, isDemo: boolean, note?: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Tarea no encontrada");
  const updated = await updateTaskStatus({ taskId, toStatus: "VALIDADA", actorId, isDemo, note });
  if (task.paCaseId) {
    await ensureCurrentStageTasks(task.paCaseId, actorId, isDemo);
  }
  return updated;
}

export async function returnItineraryStep(taskId: string, actorId: string, isDemo: boolean, note: string) {
  return updateTaskStatus({ taskId, toStatus: "DEVUELTA", actorId, isDemo, note });
}

export async function markStepNotApplicable(taskId: string, actorId: string, isDemo: boolean, reason: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Tarea no encontrada");
  const updated = await updateTaskStatus({ taskId, toStatus: "NO_APLICA", actorId, isDemo, note: reason });
  if (task.paCaseId) {
    await ensureCurrentStageTasks(task.paCaseId, actorId, isDemo);
  }
  return updated;
}

export async function assertStageAdvanceAllowed(
  paCaseId: string,
  isDemo: boolean
): Promise<{ satisfied: boolean; missing: ItineraryStepDef[] }> {
  const paCase = await prisma.pACase.findUnique({ where: { id: paCaseId } });
  if (!paCase) throw new Error("Caso no encontrado");
  if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");

  const gatingSteps = getStepsForStage(paCase.stage as CaseStage).filter((s) => s.countsTowardStageGate);
  const missing: ItineraryStepDef[] = [];
  for (const step of gatingSteps) {
    const task = await findTaskForStep(prisma, paCaseId, step.activityKey);
    const satisfied = task && ["VALIDADA", "NO_APLICA"].includes(task.status);
    if (!satisfied) missing.push(step);
  }
  return { satisfied: missing.length === 0, missing };
}

export async function ensureWithdrawalStep(paCaseId: string, kind: "PA" | "PER", actorId: string, isDemo: boolean) {
  const activityKey = kind === "PA" ? "FORMULARIO_ABANDONO_PA" : "FORMULARIO_ABANDONO_PER";
  return prisma.$transaction(async (tx) => {
    const existing = await findTaskForStep(tx, paCaseId, activityKey);
    if (existing) return existing;

    const paCase = await tx.pACase.findUnique({ where: { id: paCaseId }, include: { per: true } });
    if (!paCase) throw new Error("Caso no encontrado");
    if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");

    const step = getStepByActivityKey(activityKey);
    const instrument = await tx.instrument.findFirst({ where: { activityKey, status: "VIGENTE" } });
    if (!step || !instrument) throw new Error(`No se encontró el instrumento vigente para ${activityKey}`);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (instrument.defaultDueDays || 7));

    return tx.task.create({
      data: {
        paCaseId,
        instrumentId: instrument.id,
        title: step.title,
        description: instrument.description,
        status: "PENDIENTE",
        priority: "CRITICA",
        dueDate,
        regionId: paCase.regionId,
        assignedToUserId: paCase.per.userId,
        assignedByUserId: actorId,
        isDemo,
      },
    });
  });
}
