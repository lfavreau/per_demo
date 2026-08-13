import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { logSession, validateSession, returnSession } from "@/server/services/sessions.service";
import { triggerIntermediateEvaluation } from "@/server/services/itinerary.service";
import { MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION } from "@/lib/program-config";
import { createCoordinator, createPer, uid, testRegion } from "../helpers/fixtures";

// `CreateSessionLogInput.perId` está tipado como requerido pero logSession() lo ignora en tiempo
// de ejecución: el PER real se resuelve desde el actorId (segundo argumento). Se pasa "unused"
// solo para satisfacer el tipo.

/** Caso mínimo, creado directo (sin pasar por Drive) — los tests de sesiones no necesitan Workspace. */
async function createRawCase(regionId: string, perId: string, coordinatorId: string, isDemo = true) {
  return prisma.pACase.create({
    data: {
      code: uid("PA-TST"),
      type: "NUEVO",
      regionId,
      perId,
      coordinatorId,
      status: "CONEXION",
      stage: "CONEXION",
      isDemo,
    },
  });
}

describe("sessions.service — logSession", () => {
  it("SESS-01: el número de sesión se autoasigna correlativo", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    for (let i = 1; i <= 7; i++) {
      await logSession(
        { paCaseId: paCase.id, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: `Encuentro ${i}`, attendance: "REALIZADA", status: "ENVIADA" },
        perUser.id,
        true
      );
    }
    const eighth = await logSession(
      { paCaseId: paCase.id, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: "Encuentro 8", attendance: "REALIZADA", status: "ENVIADA" },
      perUser.id,
      true
    );
    expect(eighth.sessionNumber).toBe(8);
  });

  it("SESS-02: el registro persiste el iapGoalId asociado", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    const session = await logSession(
      {
        paCaseId: paCase.id,
        perId: "unused",
        date: new Date(),
        modality: "PRESENCIAL",
        summary: "Trabajo del objetivo X",
        attendance: "REALIZADA",
        status: "ENVIADA",
        iapGoalId: "goal-fake-123",
      },
      perUser.id,
      true
    );
    expect(session.iapGoalId).toBe("goal-fake-123");
  });

  it("SESS-03: solo el PER dueño del caso puede registrar", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const { user: otherPerUser } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    await expect(
      logSession(
        { paCaseId: paCase.id, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: "x", attendance: "REALIZADA", status: "ENVIADA" },
        otherPerUser.id,
        true
      )
    ).rejects.toThrow(/no está asignado al PER autenticado/);
  });

  it("SESS-07: sincronización offline idempotente por offlineDraftId", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);
    const draftId = uid("draft");

    const first = await logSession(
      { paCaseId: paCase.id, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: "Registrado offline", attendance: "REALIZADA", status: "ENVIADA", offlineDraftId: draftId },
      perUser.id,
      true
    );
    const second = await logSession(
      { paCaseId: paCase.id, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: "Registrado offline", attendance: "REALIZADA", status: "ENVIADA", offlineDraftId: draftId },
      perUser.id,
      true
    );

    expect(second.id).toBe(first.id);
    const count = await prisma.sessionLog.count({ where: { offlineDraftId: draftId } });
    expect(count).toBe(1);
  });

  it("SESS-08: enviar notifica a la coordinación con enlace a la bandeja de validación", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    const session = await logSession(
      { paCaseId: paCase.id, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: "x", attendance: "REALIZADA", status: "ENVIADA" },
      perUser.id,
      true
    );

    const notification = await prisma.notification.findFirst({ where: { userId: coord.id } });
    expect(notification?.link).toBe(`/coordinacion/alertas?highlightSessionId=${session.id}`);
  });

  it("SESS-09: aislamiento demo/real — el caso no pertenece al modo de la sesión", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region, false);
    const { user: perUser, profile: per } = await createPer(region, { isDemo: false });
    const paCase = await createRawCase(region, per.id, coord.id, false); // caso real

    await expect(
      logSession(
        { paCaseId: paCase.id, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: "x", attendance: "REALIZADA", status: "ENVIADA" },
        perUser.id,
        true // actor operando en modo demo
      )
    ).rejects.toThrow(/no pertenece al modo de trabajo actual/);
  });
});

describe("sessions.service — validateSession / returnSession", () => {
  it("SESS-04/05: validar actualiza lastSessionDate solo si la sesión es más reciente", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    const olderDate = new Date("2026-01-01");
    const newerDate = new Date("2026-06-01");

    const newerSession = await logSession(
      { paCaseId: paCase.id, perId: "unused", date: newerDate, modality: "PRESENCIAL", summary: "reciente", attendance: "REALIZADA", status: "ENVIADA" },
      perUser.id,
      true
    );
    await validateSession(newerSession.id, coord.id, true);
    let updatedCase = await prisma.pACase.findUnique({ where: { id: paCase.id } });
    expect(updatedCase?.lastSessionDate?.toISOString()).toBe(newerDate.toISOString());

    const olderSession = await logSession(
      { paCaseId: paCase.id, perId: "unused", date: olderDate, modality: "PRESENCIAL", summary: "antigua", attendance: "REALIZADA", status: "ENVIADA" },
      perUser.id,
      true
    );
    await validateSession(olderSession.id, coord.id, true);
    updatedCase = await prisma.pACase.findUnique({ where: { id: paCase.id } });
    // No retrocede: sigue mostrando la fecha de la sesión más reciente ya validada.
    expect(updatedCase?.lastSessionDate?.toISOString()).toBe(newerDate.toISOString());
  });

  it("SESS-06: devolver crea Feedback, deja DEVUELTA y notifica al PER", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    const session = await logSession(
      { paCaseId: paCase.id, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: "x", attendance: "REALIZADA", status: "ENVIADA" },
      perUser.id,
      true
    );

    const updated = await returnSession(session.id, "Falta profundizar en dificultades", coord.id, true);
    expect(updated.status).toBe("DEVUELTA");
    expect(updated.coordinatorFeedbackId).toBeTruthy();

    const feedback = await prisma.feedback.findUnique({ where: { id: updated.coordinatorFeedbackId! } });
    expect(feedback?.text).toBe("Falta profundizar en dificultades");

    const notification = await prisma.notification.findFirst({
      where: { userId: perUser.id, link: { contains: session.id } },
    });
    expect(notification?.title).toBe("Registro de Acompañamiento devuelto");
  });
});

describe("sessions.service / itinerary.service — desbloqueo de Evaluación Intermedia", () => {
  async function validateNSessions(paCaseId: string, perUserId: string, coordId: string, n: number) {
    for (let i = 0; i < n; i++) {
      const session = await logSession(
        { paCaseId, perId: "unused", date: new Date(), modality: "PRESENCIAL", summary: `Encuentro ${i + 1}`, attendance: "REALIZADA", status: "ENVIADA" },
        perUserId,
        true
      );
      await validateSession(session.id, coordId, true);
    }
  }

  it("SESS-10: no se desbloquea antes del mínimo de sesiones validadas", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    await validateNSessions(paCase.id, perUser.id, coord.id, MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION - 1);

    const task = await prisma.task.findFirst({
      where: { paCaseId: paCase.id, instrument: { activityKey: "ACTIVIDAD_5_INTERMEDIA" } },
    });
    expect(task).toBeNull();
  });

  it("SESS-11: se desbloquea sola al validar la sesión número mínima", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    await validateNSessions(paCase.id, perUser.id, coord.id, MIN_SESSIONS_FOR_INTERMEDIATE_EVALUATION);

    const task = await prisma.task.findFirst({
      where: { paCaseId: paCase.id, instrument: { activityKey: "ACTIVIDAD_5_INTERMEDIA" } },
    });
    expect(task?.status).toBe("PENDIENTE");
  });

  it("SESS-12: el coordinador puede habilitarla antes a mano", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    await triggerIntermediateEvaluation(paCase.id, coord.id, true);

    const task = await prisma.task.findFirst({
      where: { paCaseId: paCase.id, instrument: { activityKey: "ACTIVIDAD_5_INTERMEDIA" } },
    });
    expect(task?.status).toBe("PENDIENTE");
  });

  it("SESS-13: el habilitado manual falla si ya está habilitada o fuera de Conexión", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);

    await triggerIntermediateEvaluation(paCase.id, coord.id, true);
    await expect(triggerIntermediateEvaluation(paCase.id, coord.id, true)).rejects.toThrow(/ya está habilitada/);

    const otherCase = await prisma.pACase.create({
      data: {
        code: uid("PA-TST"),
        type: "NUEVO",
        regionId: region,
        perId: per.id,
        coordinatorId: coord.id,
        status: "VINCULACION",
        stage: "VINCULACION",
        isDemo: true,
      },
    });
    await expect(triggerIntermediateEvaluation(otherCase.id, coord.id, true)).rejects.toThrow(/solo se puede habilitar durante la etapa Conexión/);
  });
});
