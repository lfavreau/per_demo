import { prisma } from "@/lib/db";
import { updateTaskStatus } from "@/server/services/tasks.service";
import { createNotificationWithPush } from "@/server/services/push.service";
import {
  getSequentialStepsForStage,
  getStepByActivityKey,
  getStepsForStage,
  type CaseStage,
  type ItineraryStepDef,
} from "@/lib/instrument-itinerary";
import { MAX_PLAN_WEEK, MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION, REQUIRE_TEXT_FIELDS } from "@/lib/program-config";

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
  /** La actividad ya estuvo validada y se volvió a abrir (edición solicitada o editada por el PER). */
  reopened?: boolean;
  /** Último motivo con que coordinación la devolvió, para mostrarlo al PER. */
  returnNote?: string | null;
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

  // Una actividad "reabierta" es la que ya estuvo validada y volvió a revisión o a edición.
  const events = tasks.length
    ? await prisma.taskEvent.findMany({ where: { taskId: { in: tasks.map((t) => t.id) } }, orderBy: { at: "asc" } })
    : [];
  const reopenedTaskIds = new Set(events.filter((e) => e.fromStatus === "VALIDADA").map((e) => e.taskId));
  const returnNoteByTask = new Map<string, string | null>();
  for (const e of events) if (e.toStatus === "DEVUELTA") returnNoteByTask.set(e.taskId, e.note);

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
      reopened: kind === "CURRENT" && !!task && reopenedTaskIds.has(task.id),
      returnNote: task && task.status === "DEVUELTA" ? (returnNoteByTask.get(task.id) ?? null) : null,
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

interface GoalInputRow {
  id?: string;
  recoveryDomainId: string;
  objective: string;
  resources?: string;
  activities?: string;
  targetWeek?: number | string | null;
}

function parseTargetWeek(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const week = Number(value);
  if (!Number.isInteger(week) || week < 1 || week > MAX_PLAN_WEEK) {
    throw new Error(`La semana debe ser un número entre 1 y ${MAX_PLAN_WEEK}`);
  }
  return week;
}

/** Claves de primer nivel cuyo contenido cambió: la auditoría guarda cuáles, nunca el texto. */
function changedKeys(previousJson: string | null, nextJson: string): string[] {
  let previous: Record<string, unknown> = {};
  try {
    previous = previousJson ? JSON.parse(previousJson) : {};
  } catch {
    previous = {};
  }
  const next = JSON.parse(nextJson) as Record<string, unknown>;
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys].filter((k) => JSON.stringify(previous[k] ?? null) !== JSON.stringify(next[k] ?? null)).sort();
}

/**
 * Guarda los objetivos de la Actividad 4 (o su reformulación) sin duplicar: las filas que ya existen
 * para esta tarea se actualizan por id, las nuevas se crean y las quitadas se borran. Un objetivo
 * quitado que ya tiene registros de acompañamiento asociados no se borra: se retira (isCurrent: false)
 * para no dejar esos registros apuntando a nada. Devuelve las filas con su id para guardarlas en
 * el contenido de la tarea.
 */
async function saveGoals(
  tx: TxClient,
  { taskId, iapRecordId, isReformulation, rows }: { taskId: string; iapRecordId: string; isReformulation: boolean; rows: GoalInputRow[] }
) {
  const own = await tx.iAPGoal.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });

  let version = own[0]?.version ?? 1;
  if (own.length === 0 && isReformulation) {
    const max = (await tx.iAPGoal.aggregate({ where: { iapRecordId }, _max: { version: true } }))._max.version || 0;
    version = Math.max(max + 1, 2);
    await tx.iAPGoal.updateMany({ where: { iapRecordId, isCurrent: true }, data: { isCurrent: false } });
  }
  const isCurrent = own.length ? own.some((g) => g.isCurrent) : true;

  // Contenido guardado antes de que las filas llevaran id: se asocia por posición.
  const legacyByPosition = own.length > 0 && rows.every((r) => !r.id);
  const ownIds = new Set(own.map((g) => g.id));
  const kept = new Set<string>();
  const saved: GoalInputRow[] = [];

  for (const [index, row] of rows.entries()) {
    const targetWeek = parseTargetWeek(row.targetWeek);
    const data = {
      recoveryDomainId: row.recoveryDomainId,
      objective: row.objective,
      resources: row.resources,
      activities: row.activities,
      targetWeek,
    };
    const matchId = row.id && ownIds.has(row.id) ? row.id : legacyByPosition ? own[index]?.id : undefined;
    if (matchId && !kept.has(matchId)) {
      await tx.iAPGoal.update({ where: { id: matchId }, data });
      kept.add(matchId);
      saved.push({ ...row, id: matchId, targetWeek });
    } else {
      const created = await tx.iAPGoal.create({ data: { ...data, iapRecordId, taskId, version, isCurrent } });
      kept.add(created.id);
      saved.push({ ...row, id: created.id, targetWeek });
    }
  }

  const removed = own.filter((g) => !kept.has(g.id));
  if (removed.length) {
    const referenced = new Set(
      (
        await tx.sessionLog.findMany({
          where: { iapGoalId: { in: removed.map((g) => g.id) } },
          select: { iapGoalId: true },
        })
      ).map((s) => s.iapGoalId)
    );
    const toRetire = removed.filter((g) => referenced.has(g.id)).map((g) => g.id);
    const toDelete = removed.filter((g) => !referenced.has(g.id)).map((g) => g.id);
    if (toRetire.length) await tx.iAPGoal.updateMany({ where: { id: { in: toRetire } }, data: { isCurrent: false } });
    if (toDelete.length) await tx.iAPGoal.deleteMany({ where: { id: { in: toDelete } } });
  }

  return saved;
}

/**
 * Avisa a la coordinación activa de la región que una actividad cambió. No se filtra por User.isDemo:
 * las cuentas de coordinación son las mismas en modo demo y real; el aviso lleva el modo del caso.
 */
async function notifyRegionCoordinators(
  tx: TxClient,
  { regionId, isDemo, title, message, link }: { regionId: string; isDemo: boolean; title: string; message: string; link: string }
) {
  const coordinators = await tx.user.findMany({
    where: { role: "COORDINATOR", regionId, active: true },
    select: { id: true },
  });
  for (const coordinator of coordinators) {
    await createNotificationWithPush({ userId: coordinator.id, title, message, link, isDemo }, tx);
  }
}

/**
 * Envía una actividad del itinerario. También sirve para editarla después: el PER puede modificar una
 * actividad ya enviada (sigue en revisión y coordinación recibe un aviso) o ya validada (vuelve a
 * revisión de coordinación y queda marcada como editada). Toda edición deja auditoría con las claves
 * que cambiaron, sin el texto.
 */
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

  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor) throw new Error("Usuario no encontrado");
  // Antes de escribir mapas o planes del caso: solo el PER asignado puede enviar o editar.
  if (actor.role === "PER" && task.assignedToUserId !== actorId) {
    throw new Error("La tarea no está asignada al PER autenticado");
  }
  if (["CANCELADA", "NO_APLICA"].includes(task.status)) {
    throw new Error("Esta actividad ya no admite cambios.");
  }

  for (const field of step.fields || []) {
    // Las fechas siguen siendo obligatorias; los textos solo si REQUIRE_TEXT_FIELDS está activo.
    const mustFill = field.required && (field.type === "date" || REQUIRE_TEXT_FIELDS);
    if (mustFill && !fieldValues[field.key]) {
      throw new Error(`El campo "${field.label}" es obligatorio`);
    }
  }

  const previousStatus = task.status;
  const previousContent = task.contentJson;
  let storedValues: SubmitFieldValues = fieldValues;

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
        const goals = await saveGoals(tx, {
          taskId,
          iapRecordId: iapRecord.id,
          isReformulation: step.activityKey === "REFORMULAR_ACTIVIDAD_4",
          rows: (fieldValues.goals as GoalInputRow[]) || [],
        });
        storedValues = { ...fieldValues, goals };
      }
    });
  }

  if (step.activityKey === "ACTIVIDAD_2_ANTECEDENTES" && typeof fieldValues.alias === "string" && fieldValues.alias.trim()) {
    await prisma.pACase.update({
      where: { id: task.paCaseId! },
      data: { alias: fieldValues.alias.trim() },
    });
  }

  const contentJson = JSON.stringify(storedValues);
  const isEdit = previousStatus === "ENVIADA" || previousStatus === "VALIDADA";
  const eventNote =
    previousStatus === "VALIDADA"
      ? "Editada por el PER después de validarse"
      : previousStatus === "ENVIADA"
        ? "Modificada por el PER antes de la revisión"
        : undefined;

  const updated = await updateTaskStatus({ taskId, toStatus: "ENVIADA", actorId, isDemo, contentJson, eventNote });

  if (isEdit && task.paCaseId) {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId: actorId,
          role: actor.role,
          action: "EDIT_ITINERARY_STEP",
          entityType: "Task",
          entityId: taskId,
          previousValue: previousStatus,
          newValue: JSON.stringify({ status: "ENVIADA", activityKey: step.activityKey, changedFields: changedKeys(previousContent, contentJson) }),
          reason: eventNote,
          isDemo,
        },
      });
      await notifyRegionCoordinators(tx, {
        regionId: task.regionId,
        isDemo,
        title: previousStatus === "VALIDADA" ? "Actividad editada tras validarse" : "Actividad modificada antes de revisar",
        message: `Caso ${task.paCase?.code ?? ""}: ${step.title}. Requiere nueva revisión.`,
        link: `/coordinacion/casos?caseCode=${task.paCase?.code ?? ""}`,
      });
    });
  }

  return updated;
}

/**
 * Corrige una validación hecha por error. `REVIEW` deja la actividad de nuevo en revisión (ENVIADA) para
 * que coordinación decida otra vez sin molestar al PER. `REQUEST_EDIT` se la devuelve al PER como una
 * edición solicitada (aparece destacada en su pantalla). Siempre pide un motivo. No deshace lo que la
 * validación ya provocó (por ejemplo un avance de etapa).
 */
export async function reopenValidation({
  taskId,
  mode,
  reason,
  actorId,
  isDemo,
}: {
  taskId: string;
  mode: "REVIEW" | "REQUEST_EDIT";
  reason: string;
  actorId: string;
  isDemo: boolean;
}) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("Escribe el motivo de la corrección.");

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { paCase: true } });
  if (!task) throw new Error("Tarea no encontrada");
  if (task.isDemo !== isDemo) throw new Error("La tarea no pertenece al modo de trabajo actual");
  if (task.status !== "VALIDADA") throw new Error("Solo se puede corregir una actividad validada.");

  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor || (actor.role !== "ADMIN" && !(actor.role === "COORDINATOR" && actor.regionId === task.regionId))) {
    throw new Error("No autorizado para operar tareas de esta región");
  }

  const toStatus = mode === "REVIEW" ? "ENVIADA" : "DEVUELTA";
  const eventNote = `${mode === "REVIEW" ? "Validación revertida" : "Edición solicitada tras validar"}: ${trimmed}`;
  const updated = await updateTaskStatus({ taskId, toStatus, actorId, isDemo, eventNote, ...(toStatus === "DEVUELTA" ? { note: eventNote } : {}) });

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: actor.role,
        action: "REOPEN_VALIDATION",
        entityType: "Task",
        entityId: taskId,
        previousValue: "VALIDADA",
        newValue: JSON.stringify({ status: toStatus, mode }),
        reason: trimmed,
        isDemo,
      },
    });
    if (mode === "REQUEST_EDIT" && task.assignedToUserId && task.paCase) {
      await createNotificationWithPush(
        {
          userId: task.assignedToUserId,
          title: "Edición solicitada",
          message: `Caso ${task.paCase.code}: coordinación pide editar «${task.title}». ${trimmed}`,
          link: `/per/casos/${task.paCase.id}/etapa`,
          isDemo,
        },
        tx
      );
    }
  });

  return updated;
}

/**
 * Coordinación (o el administrador) devuelve una actividad al PER con un texto que dice qué falta
 * corregir. Sirve cuando la revisó por fuera de la app: la actividad puede estar enviada (se devuelve
 * como una devolución normal) o ya validada (se pide como edición, destacada en rosa para el PER).
 * El texto es obligatorio y le llega al PER en un aviso y dentro de la propia actividad.
 */
export async function requestCorrection({
  taskId,
  reason,
  actorId,
  isDemo,
}: {
  taskId: string;
  reason: string;
  actorId: string;
  isDemo: boolean;
}) {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("Escribe qué hay que corregir.");

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { paCase: true } });
  if (!task) throw new Error("Tarea no encontrada");
  if (task.isDemo !== isDemo) throw new Error("La tarea no pertenece al modo de trabajo actual");

  if (task.status === "VALIDADA") {
    return reopenValidation({ taskId, mode: "REQUEST_EDIT", reason: trimmed, actorId, isDemo });
  }
  if (task.status !== "ENVIADA") {
    throw new Error("Solo se puede pedir una corrección de una actividad enviada o validada.");
  }

  const actor = await prisma.user.findUnique({ where: { id: actorId } });
  if (!actor || (actor.role !== "ADMIN" && !(actor.role === "COORDINATOR" && actor.regionId === task.regionId))) {
    throw new Error("No autorizado para operar tareas de esta región");
  }

  const updated = await updateTaskStatus({ taskId, toStatus: "DEVUELTA", note: trimmed, actorId, isDemo });
  if (task.assignedToUserId && task.paCase) {
    await createNotificationWithPush({
      userId: task.assignedToUserId,
      title: "Actividad devuelta para corregir",
      message: `Caso ${task.paCase.code}: «${task.title}». ${trimmed}`,
      link: `/per/casos/${task.paCase.id}/etapa`,
      isDemo,
    });
  }
  return updated;
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

export interface ActivityHistoryItem {
  taskId: string;
  activityKey: string;
  title: string;
  stage: CaseStage;
  order: number;
  status: string;
  submissionMode: "EXTERNAL_LINK" | "NATIVE_FORM";
  contentTarget: "TASK_JSON" | "IAP_DOMAIN_MAP" | "IAP_GOAL" | null;
  contentJson: string | null;
  googleUrl: string | null;
  /** Estuvo validada y se reabrió. */
  reopened: boolean;
  events: Array<{ at: string; by: "PER" | "COORDINATOR" | "ADMIN" | "SISTEMA"; fromStatus: string; toStatus: string; note: string | null }>;
}

/**
 * Todas las actividades del itinerario que ya existen en el caso (de todas las etapas) con su historial
 * de estados. Es la base del visor de historial del PER y de coordinación. Los eventos muestran el rol
 * de quien actuó, nunca su nombre.
 */
export async function getCaseActivityHistory(paCaseId: string, isDemo: boolean): Promise<ActivityHistoryItem[]> {
  const paCase = await prisma.pACase.findUnique({ where: { id: paCaseId } });
  if (!paCase) throw new Error("Caso no encontrado");
  if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");

  const tasks = await prisma.task.findMany({
    where: { paCaseId, instrument: { activityKey: { not: null }, triggerCondition: { not: "ON_WITHDRAWAL" } } },
    include: { instrument: true, events: { orderBy: { at: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  const actors = await prisma.user.findMany({
    where: { id: { in: [...new Set(tasks.flatMap((t) => t.events.map((e) => e.byUserId)))] } },
    select: { id: true, role: true },
  });
  const roleById = new Map(actors.map((a) => [a.id, a.role]));

  const items: ActivityHistoryItem[] = [];
  for (const task of tasks) {
    const step = getStepByActivityKey(task.instrument!.activityKey as string);
    if (!step) continue;
    items.push({
      taskId: task.id,
      activityKey: step.activityKey,
      title: step.title,
      stage: step.stage,
      order: step.order,
      status: task.status,
      submissionMode: step.submissionMode,
      contentTarget: step.contentTarget as ActivityHistoryItem["contentTarget"],
      contentJson: task.contentJson,
      googleUrl: task.googleUrl,
      reopened: task.events.some((e) => e.fromStatus === "VALIDADA"),
      events: task.events.map((e) => ({
        at: e.at.toISOString(),
        by: (roleById.get(e.byUserId) as ActivityHistoryItem["events"][number]["by"]) ?? "SISTEMA",
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        note: e.note,
      })),
    });
  }
  const stageOrder = ["VINCULACION", "CONEXION", "FINALIZACION"];
  return items.sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || a.order - b.order);
}

/** Prioridad de cada ámbito según el Mapa de recursos y necesidades (Actividad 3); vacío si aún no se envía. */
export async function getDomainPriorities(paCaseId: string): Promise<Record<string, string>> {
  const rows = await prisma.iAPDomainMap.findMany({
    where: { iapRecord: { paCaseId }, importance: { not: null } },
    select: { recoveryDomainId: true, importance: true },
  });
  return Object.fromEntries(rows.map((r) => [r.recoveryDomainId, r.importance as string]));
}

const WITHDRAWAL_ACTIVITY_KEYS = ["FORMULARIO_ABANDONO_PA", "FORMULARIO_ABANDONO_PER"];

async function assertCanOperateWithdrawal(
  tx: TxClient,
  paCase: { regionId: string; isDemo: boolean },
  actorId: string,
  isDemo: boolean
) {
  if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (!actor || (actor.role !== "ADMIN" && !(actor.role === "COORDINATOR" && actor.regionId === paCase.regionId))) {
    throw new Error("No autorizado para operar casos de esta región");
  }
  return actor;
}

export async function ensureWithdrawalStep(paCaseId: string, kind: "PA" | "PER", actorId: string, isDemo: boolean) {
  const activityKey = kind === "PA" ? "FORMULARIO_ABANDONO_PA" : "FORMULARIO_ABANDONO_PER";
  return prisma.$transaction(async (tx) => {
    const existing = await findTaskForStep(tx, paCaseId, activityKey);
    if (existing) return existing;

    const paCase = await tx.pACase.findUnique({ where: { id: paCaseId }, include: { per: true } });
    if (!paCase) throw new Error("Caso no encontrado");
    await assertCanOperateWithdrawal(tx, paCase, actorId, isDemo);

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

/**
 * Deshace el inicio de un retiro: borra el Formulario de Abandono del caso (con lo que el PER
 * haya alcanzado a escribir) y deja el caso exactamente como estaba. Solo mientras el caso siga
 * activo: un retiro ya registrado no se revierte desde aquí. Avisa al PER y deja auditoría.
 */
export async function cancelWithdrawal(paCaseId: string, actorId: string, isDemo: boolean) {
  const result = await prisma.$transaction(async (tx) => {
    const paCase = await tx.pACase.findUnique({ where: { id: paCaseId }, include: { per: true } });
    if (!paCase) throw new Error("Caso no encontrado");
    const actor = await assertCanOperateWithdrawal(tx, paCase, actorId, isDemo);
    if (["RETIRO_VOLUNTARIO", "DESERCION", "EGRESO"].includes(paCase.status)) {
      throw new Error("El retiro ya fue registrado; no se puede cancelar desde aquí.");
    }

    const tasks = await tx.task.findMany({
      where: { paCaseId, instrument: { activityKey: { in: WITHDRAWAL_ACTIVITY_KEYS } } },
      select: { id: true, status: true },
    });
    if (tasks.length === 0) throw new Error("Este caso no tiene un retiro iniciado.");
    const taskIds = tasks.map((t) => t.id);

    await tx.taskEvent.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.feedback.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { entityId: { in: taskIds } }] } });
    await tx.alert.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.task.deleteMany({ where: { id: { in: taskIds } } });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: actor.role,
        action: "CANCEL_WITHDRAWAL",
        entityType: "PACase",
        entityId: paCaseId,
        previousValue: JSON.stringify(tasks.map((t) => t.status)),
        isDemo,
      },
    });

    await createNotificationWithPush(
      {
        userId: paCase.per.userId,
        title: `Caso ${paCase.code}: retiro cancelado`,
        message: `Coordinación canceló el inicio del retiro del caso ${paCase.code}. Ya no tienes que completar el formulario de abandono.`,
        link: `/per/casos/${paCase.id}/etapa`,
        isDemo,
      },
      tx
    );

    return { removed: tasks.length };
  });
  return result;
}
