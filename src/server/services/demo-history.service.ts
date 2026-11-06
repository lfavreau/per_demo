import { prisma } from "@/lib/db";
import { ITINERARY_CATALOG, type CaseStage, type ItineraryStepDef } from "@/lib/instrument-itinerary";
import { DEMO_SURVEY_URL, demoDomainRows, demoGoalRows, demoTaskContent } from "@/lib/demo-content";
import { submitItineraryStep } from "@/server/services/itinerary.service";
import { updateTaskStatus } from "@/server/services/tasks.service";

/**
 * Da historia a los casos del modo demo: las actividades ANTERIORES a la que cada caso ya tiene quedan
 * enviadas y validadas, con contenido inventado, para poder verlas desde el historial del PER y de coordinación.
 *
 * Solo toca casos con isDemo = 1 (y las tareas, mapas y objetivos de esos casos). Los datos reales nunca se leen
 * para escribir ni se modifican. Va por los mismos servicios que la app (envío del PER y validación de
 * coordinación), así que deja eventos y auditoría iguales a los de un uso normal.
 */

const STAGE_ORDER: CaseStage[] = ["VINCULACION", "CONEXION", "FINALIZACION"];

/** Pasos secuenciales obligatorios de todas las etapas, en orden. La reformulación (opcional) no se inventa. */
const FLOW: ItineraryStepDef[] = ITINERARY_CATALOG.filter((s) => s.triggerCondition === "SEQUENTIAL" && !s.optional).sort(
  (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.order - b.order
);

export interface DemoHistoryPlanItem {
  code: string;
  stage: string;
  status: string;
  /** Actividades a completar, en orden. */
  fill: string[];
  /** Por qué no se hace nada, si corresponde. */
  note?: string;
}

const DONE = ["VALIDADA", "NO_APLICA", "CANCELADA"];

function daysAgo(days: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function loadDemoCases(codes?: string[]) {
  return prisma.pACase.findMany({
    where: { isDemo: true, ...(codes?.length ? { code: { in: codes } } : {}) },
    include: { per: true, tasks: { include: { instrument: true } } },
    orderBy: { code: "asc" },
  });
}

type DemoCase = Awaited<ReturnType<typeof loadDemoCases>>[number];

/** Hasta qué paso del flujo el caso ya tiene historia: todo lo anterior se completa. */
function frontierIndex(paCase: DemoCase): number {
  if (paCase.status === "EGRESO") return FLOW.length;
  const taskIndexes = paCase.tasks
    .map((t) => FLOW.findIndex((s) => s.activityKey === t.instrument?.activityKey))
    .filter((index) => index >= 0);
  const stageStart = FLOW.findIndex((s) => s.stage === paCase.stage);
  return Math.max(stageStart, ...taskIndexes);
}

function needsFill(step: ItineraryStepDef, task: DemoCase["tasks"][number] | undefined): boolean {
  if (!task) return true;
  if (task.status === "NO_APLICA" || task.status === "CANCELADA") return false;
  if (task.status !== "VALIDADA") return true;
  return step.submissionMode === "NATIVE_FORM" && !task.contentJson;
}

export function planFor(paCase: DemoCase): DemoHistoryPlanItem {
  const base = { code: paCase.code, stage: paCase.stage, status: paCase.status };
  if (!paCase.per) return { ...base, fill: [], note: "sin PER asignado" };
  const frontier = frontierIndex(paCase);
  const fill = FLOW.slice(0, frontier).filter((step) => {
    const task = paCase.tasks.find((t) => t.instrument?.activityKey === step.activityKey);
    return needsFill(step, task);
  });
  return { ...base, fill: fill.map((s) => s.title) };
}

/** Qué se completaría en cada caso demo, sin escribir nada. */
export async function planDemoHistory(codes?: string[]): Promise<DemoHistoryPlanItem[]> {
  return (await loadDemoCases(codes)).map(planFor);
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function fillCase(paCase: DemoCase): Promise<number> {
  const plan = planFor(paCase);
  if (plan.fill.length === 0) return 0;

  const perUserId = paCase.per.userId;
  const coordinator =
    (await prisma.user.findFirst({ where: { role: "COORDINATOR", regionId: paCase.regionId, active: true } })) ??
    (await prisma.user.findFirst({ where: { role: "ADMIN", active: true } }));
  if (!coordinator) throw new Error(`Sin coordinación ni administración activa para ${paCase.code}`);

  const record = await prisma.iAPRecord.findFirst({ where: { paCaseId: paCase.id } });
  const recordStatus = paCase.status === "EGRESO" ? "FINALIZADO" : paCase.stage === "VINCULACION" ? "INICIADO" : "EN_DESARROLLO";
  if (!record) await prisma.iAPRecord.create({ data: { paCaseId: paCase.id, status: recordStatus } });
  else if (record.status === "INICIADO" && recordStatus !== "INICIADO") await prisma.iAPRecord.update({ where: { id: record.id }, data: { status: recordStatus } });

  const variant = Number(paCase.code.match(/(\d+)$/)?.[1] ?? 0);
  const steps = plan.fill.map((title) => FLOW.find((s) => s.title === title)!);

  for (const [index, step] of steps.entries()) {
    const when = daysAgo((steps.length - index) * 7);
    let task = paCase.tasks.find((t) => t.instrument?.activityKey === step.activityKey);

    if (task && !task.isDemo) throw new Error(`La tarea ${task.id} de ${paCase.code} no es demo: se aborta`);
    if (!task) {
      const instrument = await prisma.instrument.findFirst({ where: { activityKey: step.activityKey, status: "VIGENTE" } });
      if (!instrument) throw new Error(`No hay instrumento vigente para ${step.activityKey}`);
      const created = await prisma.task.create({
        data: {
          paCaseId: paCase.id,
          instrumentId: instrument.id,
          title: step.title,
          description: instrument.description,
          status: "PENDIENTE",
          priority: instrument.mandatory ? "CRITICA" : "MEDIA",
          dueDate: new Date(when.getTime() + 15 * 86_400_000),
          regionId: paCase.regionId,
          assignedToUserId: perUserId,
          assignedByUserId: coordinator.id,
          isDemo: true,
        },
        include: { instrument: true },
      });
      await prisma.taskEvent.create({
        data: { taskId: created.id, fromStatus: "NONE", toStatus: "PENDIENTE", byUserId: coordinator.id, note: `Paso de itinerario desbloqueado: ${step.activityKey}` },
      });
      task = created;
    }

    if (step.submissionMode === "NATIVE_FORM") {
      const date = isoDay(when);
      const fieldValues =
        step.contentTarget === "IAP_DOMAIN_MAP"
          ? { date, domains: demoDomainRows(variant) }
          : step.contentTarget === "IAP_GOAL"
            ? { goals: demoGoalRows(variant) }
            : demoTaskContent(step.activityKey, variant, date);
      if (!fieldValues) throw new Error(`Sin contenido demo para ${step.activityKey}`);
      await submitItineraryStep({ taskId: task.id, actorId: perUserId, isDemo: true, fieldValues });
    } else {
      await updateTaskStatus({ taskId: task.id, toStatus: "ENVIADA", note: DEMO_SURVEY_URL, actorId: perUserId, isDemo: true });
    }
    await updateTaskStatus({ taskId: task.id, toStatus: "VALIDADA", actorId: coordinator.id, isDemo: true });

    // La historia se ve repartida en el tiempo y no toda "de hoy".
    const events = await prisma.taskEvent.findMany({ where: { taskId: task.id }, orderBy: { at: "asc" } });
    for (const [eventIndex, event] of events.entries()) {
      await prisma.taskEvent.update({ where: { id: event.id }, data: { at: new Date(when.getTime() + eventIndex * 30 * 60_000) } });
    }
    await prisma.task.update({ where: { id: task.id }, data: { createdAt: when, updatedAt: new Date(when.getTime() + events.length * 30 * 60_000) } });
  }
  return steps.length;
}

/** Completa la historia de los casos demo. Devuelve cuántas actividades se completaron por caso. */
export async function fillDemoHistory(codes?: string[]): Promise<Array<{ code: string; filled: number }>> {
  const result: Array<{ code: string; filled: number }> = [];
  for (const paCase of await loadDemoCases(codes)) {
    if (!paCase.isDemo) throw new Error(`El caso ${paCase.code} no es demo: se aborta`);
    result.push({ code: paCase.code, filled: await fillCase(paCase) });
  }
  return result;
}

