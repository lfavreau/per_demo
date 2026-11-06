import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createCaseFromCandidate } from "@/server/services/cases.service";
import {
  getCaseActivityHistory,
  getDomainPriorities,
  getItineraryState,
  reopenValidation,
  submitItineraryStep,
} from "@/server/services/itinerary.service";
import { createCoordinator, createPer, createCandidate, testRegion } from "../helpers/fixtures";

async function caseWithPer() {
  const region = testRegion();
  const coord = await createCoordinator(region);
  const { user: perUser, profile: per } = await createPer(region);
  const candidate = await createCandidate(region);
  const paCase = await createCaseFromCandidate(candidate.id, per.id, "", "NUEVO", coord.id, true);
  return { region, coord, perUser, paCase };
}

/** Crea la tarea de una actividad del catálogo, ya asignada al PER, en el estado pedido. */
async function taskFor(
  paCase: { id: string; regionId: string },
  perUserId: string,
  coordId: string,
  activityKey: string,
  status = "PENDIENTE"
) {
  const instrument = await prisma.instrument.findFirstOrThrow({ where: { activityKey, status: "VIGENTE" } });
  return prisma.task.create({
    data: {
      paCaseId: paCase.id,
      instrumentId: instrument.id,
      title: instrument.name,
      status,
      priority: "CRITICA",
      dueDate: new Date(Date.now() + 86400000),
      regionId: paCase.regionId,
      assignedToUserId: perUserId,
      assignedByUserId: coordId,
      isDemo: true,
    },
  });
}

const goalRows = (...objectives: string[]) =>
  objectives.map((objective, i) => ({ recoveryDomainId: "Empleo", objective, resources: "", activities: "", targetWeek: i + 1 }));

describe("itinerary.service — Actividad 4 sin duplicar objetivos", () => {
  it("ED-01: reenviar actualiza por id, agrega los nuevos y no duplica", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_4_PLANIFICACION");

    await submitItineraryStep({ taskId: task.id, actorId: perUser.id, isDemo: true, fieldValues: { goals: goalRows("Uno", "Dos") } });
    const first = await prisma.iAPGoal.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });
    expect(first).toHaveLength(2);
    expect(first.map((g) => g.targetWeek)).toEqual([1, 2]);

    // Lo guardado en la tarea lleva los ids; el formulario los reenvía al editar.
    const stored = JSON.parse((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).contentJson!);
    expect(stored.goals.map((g: { id: string }) => g.id)).toEqual(first.map((g) => g.id));

    const edited = [{ ...stored.goals[0], objective: "Uno editado", targetWeek: 5 }, stored.goals[1], { recoveryDomainId: "Salud", objective: "Tres" }];
    await submitItineraryStep({ taskId: task.id, actorId: perUser.id, isDemo: true, fieldValues: { goals: edited } });

    const after = await prisma.iAPGoal.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });
    expect(after).toHaveLength(3);
    expect(after[0].id).toBe(first[0].id);
    expect(after[0].objective).toBe("Uno editado");
    expect(after[0].targetWeek).toBe(5);
    expect(after[1].id).toBe(first[1].id);
  });

  it("ED-02: un objetivo quitado se borra, salvo que ya tenga registros: entonces se retira", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_4_PLANIFICACION");
    await submitItineraryStep({ taskId: task.id, actorId: perUser.id, isDemo: true, fieldValues: { goals: goalRows("A", "B", "C") } });
    const goals = await prisma.iAPGoal.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });

    // B ya tiene un registro de acompañamiento asociado.
    await prisma.sessionLog.create({
      data: {
        paCaseId: paCase.id,
        perId: paCase.perId,
        regionId: paCase.regionId,
        sessionNumber: 1,
        date: new Date(),
        modality: "PRESENCIAL",
        iapGoalId: goals[1].id,
        summary: "x",
        attendance: "REALIZADA",
        isDemo: true,
      },
    });

    const stored = JSON.parse((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).contentJson!);
    await submitItineraryStep({ taskId: task.id, actorId: perUser.id, isDemo: true, fieldValues: { goals: [stored.goals[0]] } });

    expect(await prisma.iAPGoal.findUnique({ where: { id: goals[2].id } })).toBeNull(); // C: sin registros, se borra
    const retired = await prisma.iAPGoal.findUnique({ where: { id: goals[1].id } });
    expect(retired?.isCurrent).toBe(false); // B: tiene registros, se conserva retirado
    expect((await prisma.iAPGoal.findUnique({ where: { id: goals[0].id } }))?.isCurrent).toBe(true);
  });

  it("ED-03: la semana debe ser un número entero entre 1 y 52", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_4_PLANIFICACION");
    const send = (targetWeek: unknown) =>
      submitItineraryStep({
        taskId: task.id,
        actorId: perUser.id,
        isDemo: true,
        fieldValues: { goals: [{ recoveryDomainId: "Empleo", objective: "x", targetWeek }] },
      });
    await expect(send(0)).rejects.toThrow(/semana/);
    await expect(send(53)).rejects.toThrow(/semana/);
    await expect(send(2.5)).rejects.toThrow(/semana/);
    await expect(send(null)).resolves.toBeTruthy(); // la semana es opcional
  });
});

describe("itinerary.service — Actividad 3", () => {
  it("ED-04: exige fecha, guarda prioridad y la expone por ámbito", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_3_MAPA_RECURSOS");
    const domains = [
      { recoveryDomainId: "Empleo", needs: "", strengths: "", importance: "ALTO" },
      { recoveryDomainId: "Salud", needs: "", strengths: "", importance: "BAJO" },
    ];

    await expect(
      submitItineraryStep({ taskId: task.id, actorId: perUser.id, isDemo: true, fieldValues: { date: "", domains } })
    ).rejects.toThrow(/Fecha/);

    await submitItineraryStep({ taskId: task.id, actorId: perUser.id, isDemo: true, fieldValues: { date: "2026-03-02", domains } });
    expect(await getDomainPriorities(paCase.id)).toEqual({ Empleo: "ALTO", Salud: "BAJO" });
    const stored = JSON.parse((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).contentJson!);
    expect(stored.date).toBe("2026-03-02");
  });
});

describe("itinerary.service — editar una actividad ya enviada o validada", () => {
  it("ED-05: el PER edita una validada: vuelve a revisión, queda auditado sin texto y coordinación recibe aviso", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    // Las cuentas de coordinación reales atienden también el modo demo: el aviso no depende de User.isDemo.
    const realCoord = await createCoordinator(paCase.regionId, false);
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA");
    await prisma.task.update({
      where: { id: task.id },
      data: { contentJson: JSON.stringify({ date: "2026-03-01", motivations: "texto privado viejo", expectations: "e" }) },
    });

    await submitItineraryStep({
      taskId: task.id,
      actorId: perUser.id,
      isDemo: true,
      fieldValues: { date: "2026-03-01", motivations: "texto privado nuevo", expectations: "e" },
    });

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.status).toBe("ENVIADA");
    expect(after.googleUrl).toBeNull(); // la nota del historial no se cuela como enlace entregado

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: task.id, action: "EDIT_ITINERARY_STEP" } });
    expect(JSON.parse(audit.newValue!).changedFields).toEqual(["motivations"]);
    expect(audit.newValue).not.toContain("texto privado");
    expect(audit.previousValue).toBe("VALIDADA");

    const event = await prisma.taskEvent.findFirstOrThrow({ where: { taskId: task.id, fromStatus: "VALIDADA" } });
    expect(event.note).toMatch(/Editada por el PER/);
    const notice = await prisma.notification.findFirst({ where: { userId: realCoord.id, title: { contains: "editada" } } });
    expect(notice?.isDemo).toBe(true);
  });

  it("ED-06: editar una enviada la deja en revisión y avisa; una pendiente no avisa", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const sent = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_1_MOTIVACIONES", "ENVIADA");
    const fresh = { date: "2026-03-01", motivations: "m", expectations: "e" };

    await submitItineraryStep({ taskId: sent.id, actorId: perUser.id, isDemo: true, fieldValues: fresh });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: sent.id } })).status).toBe("ENVIADA");
    expect(await prisma.auditLog.count({ where: { entityId: sent.id, action: "EDIT_ITINERARY_STEP" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: coord.id, title: { contains: "modificada" } } })).toBe(1);

    const pending = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_2_ANTECEDENTES", "PENDIENTE");
    await submitItineraryStep({
      taskId: pending.id,
      actorId: perUser.id,
      isDemo: true,
      fieldValues: { date: "2026-03-02", talksAboutSelf: "t", freeTimeActivities: "f", howDidYouFeel: "h" },
    });
    expect(await prisma.auditLog.count({ where: { entityId: pending.id, action: "EDIT_ITINERARY_STEP" } })).toBe(0);
  });

  it("ED-07: otro PER no puede enviar ni editar, ni pisa el mapa del caso", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const { user: intruder } = await createPer(paCase.regionId);
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_3_MAPA_RECURSOS");

    await expect(
      submitItineraryStep({
        taskId: task.id,
        actorId: intruder.id,
        isDemo: true,
        fieldValues: { date: "2026-03-02", domains: [{ recoveryDomainId: "Empleo", importance: "ALTO" }] },
      })
    ).rejects.toThrow(/no está asignada/);
    expect(await prisma.iAPDomainMap.count({ where: { taskId: task.id } })).toBe(0);
  });
});

describe("itinerary.service — corregir una validación", () => {
  it("ED-08: «dejar en revisión» vuelve a ENVIADA, pide motivo y audita", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA");

    await expect(reopenValidation({ taskId: task.id, mode: "REVIEW", reason: "  ", actorId: coord.id, isDemo: true })).rejects.toThrow(/motivo/);
    await reopenValidation({ taskId: task.id, mode: "REVIEW", reason: "La validé sin revisar", actorId: coord.id, isDemo: true });

    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("ENVIADA");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: task.id, action: "REOPEN_VALIDATION" } });
    expect(audit.reason).toBe("La validé sin revisar");
    // El PER no recibe aviso en este modo.
    expect(await prisma.notification.count({ where: { userId: perUser.id, title: "Edición solicitada" } })).toBe(0);
    // Solo se corrige lo que está validado.
    await expect(reopenValidation({ taskId: task.id, mode: "REVIEW", reason: "otra vez", actorId: coord.id, isDemo: true })).rejects.toThrow(/validada/);
  });

  it("ED-09: «pedir edición» devuelve al PER, lo avisa y la actividad sale marcada como reabierta con su motivo", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    // Al crear el caso ya existe la tarea del primer paso; se da por validada.
    const created = await prisma.task.findFirstOrThrow({
      where: { paCaseId: paCase.id, instrument: { activityKey: "PRIMER_ENCUENTRO_REFLEXION" } },
    });
    const task = await prisma.task.update({ where: { id: created.id }, data: { status: "VALIDADA" } });

    await reopenValidation({ taskId: task.id, mode: "REQUEST_EDIT", reason: "Falta la fecha real", actorId: coord.id, isDemo: true });

    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("DEVUELTA");
    expect(await prisma.notification.count({ where: { userId: perUser.id, title: "Edición solicitada" } })).toBe(1);

    const state = await getItineraryState(paCase.id, true);
    const step = state.steps.find((s) => s.activityKey === "PRIMER_ENCUENTRO_REFLEXION");
    expect(step?.kind).toBe("CURRENT");
    expect(step?.reopened).toBe(true);
    expect(step?.returnNote).toMatch(/Falta la fecha real/);
  });

  it("ED-10: un coordinador de otra región no puede corregir la validación", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const outsider = await createCoordinator(testRegion());
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA");

    await expect(reopenValidation({ taskId: task.id, mode: "REVIEW", reason: "x", actorId: outsider.id, isDemo: true })).rejects.toThrow(/No autorizado/);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("VALIDADA");
  });
});

describe("itinerary.service — historial del caso", () => {
  it("ED-11: lista las actividades por etapa con eventos por rol y sin nombres", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const task = await taskFor(paCase, perUser.id, coord.id, "ACTIVIDAD_1_MOTIVACIONES", "ENVIADA");
    await prisma.taskEvent.create({ data: { taskId: task.id, fromStatus: "PENDIENTE", toStatus: "ENVIADA", byUserId: perUser.id } });
    await prisma.taskEvent.create({ data: { taskId: task.id, fromStatus: "ENVIADA", toStatus: "VALIDADA", byUserId: coord.id, note: "ok" } });

    const history = await getCaseActivityHistory(paCase.id, true);
    const item = history.find((h) => h.taskId === task.id)!;
    expect(item.stage).toBe("VINCULACION");
    expect(item.events.map((e) => e.by)).toEqual(["PER", "COORDINATOR"]);
    expect(JSON.stringify(history)).not.toContain(perUser.name);
    expect(JSON.stringify(history)).not.toContain(perUser.email);
  });
});
