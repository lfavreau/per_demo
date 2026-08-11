import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { checkAllAlertRules, resolveAlert } from "@/server/services/alerts.service";
import { createCoordinator, createPer, createAdHocInstrument, uid, testRegion } from "../helpers/fixtures";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function createRawCase(
  regionId: string,
  perId: string,
  coordinatorId: string,
  overrides: Partial<{ status: string; stageEnteredAt: Date; lastSessionDate: Date | null; startDate: Date | null }> = {}
) {
  return prisma.pACase.create({
    data: {
      code: uid("PA-TST"),
      type: "NUEVO",
      regionId,
      perId,
      coordinatorId,
      status: overrides.status ?? "CONEXION",
      stage: overrides.status === "VINCULACION" ? "VINCULACION" : "CONEXION",
      stageEnteredAt: overrides.stageEnteredAt ?? new Date(),
      lastSessionDate: overrides.lastSessionDate,
      startDate: overrides.startDate,
      isDemo: true,
    },
  });
}

describe("alerts.service — checkAllAlertRules", () => {
  it("ALRT-01: caso sin sesiones supera el umbral de la etapa (14 días en Conexión)", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const { profile: per2 } = await createPer(region);
    const staleCase = await createRawCase(region, per.id, coord.id, {
      lastSessionDate: daysAgo(15),
      startDate: daysAgo(30),
    });
    const freshCase = await createRawCase(region, per2.id, coord.id, {
      lastSessionDate: daysAgo(13),
      startDate: daysAgo(20),
    });

    await checkAllAlertRules(true);

    const staleAlert = await prisma.alert.findFirst({ where: { paCaseId: staleCase.id, type: "CASO_SIN_SESION" } });
    expect(staleAlert).not.toBeNull();

    const freshAlert = await prisma.alert.findFirst({ where: { paCaseId: freshCase.id, type: "CASO_SIN_SESION" } });
    expect(freshAlert).toBeNull();
  });

  it("ALRT-03: no duplica alertas abiertas al ejecutar dos veces", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const staleCase = await createRawCase(region, per.id, coord.id, { lastSessionDate: daysAgo(20) });

    await checkAllAlertRules(true);
    await checkAllAlertRules(true);

    const alerts = await prisma.alert.findMany({ where: { paCaseId: staleCase.id, type: "CASO_SIN_SESION" } });
    expect(alerts.length).toBe(1);
  });

  it("ALRT-04: tarea vencida pasa a ATRASADA y genera alerta documental", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const admin = await createCoordinator(region); // solo para createdByUserId del instrumento ad-hoc
    const { user: perUser, profile: per } = await createPer(region);
    const paCase = await createRawCase(region, per.id, coord.id);
    const instrument = await createAdHocInstrument(admin.id);

    const overdueTask = await prisma.task.create({
      data: {
        title: "Entregable vencido",
        instrumentId: instrument.id,
        assignedToUserId: perUser.id,
        assignedByUserId: coord.id,
        regionId: region,
        perId: per.id,
        paCaseId: paCase.id,
        dueDate: daysAgo(2),
        status: "PENDIENTE",
        isDemo: true,
      },
    });

    await checkAllAlertRules(true);

    const refreshedTask = await prisma.task.findUnique({ where: { id: overdueTask.id } });
    expect(refreshedTask?.status).toBe("ATRASADA");

    const alert = await prisma.alert.findFirst({ where: { taskId: overdueTask.id, type: "TAREA_ATRASADA" } });
    expect(alert).not.toBeNull();
  });

  it("ALRT-05: PER no habilitado con tarea crítica genera alerta CRITICA", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const admin = await createCoordinator(region);
    const { user: perUser } = await createPer(region, { certificationStatus: "PENDIENTE" });
    const instrument = await createAdHocInstrument(admin.id, { criticalTask: true });

    const task = await prisma.task.create({
      data: {
        title: "Instrumento crítico",
        instrumentId: instrument.id,
        assignedToUserId: perUser.id,
        assignedByUserId: coord.id,
        regionId: region,
        status: "PENDIENTE",
        isDemo: true,
      },
    });

    await checkAllAlertRules(true);

    const alert = await prisma.alert.findFirst({ where: { taskId: task.id, type: "PER_NO_HABILITADO" } });
    expect(alert?.severity).toBe("CRITICA");
  });

  it("ALRT-09: las reglas respetan isDemo — no tocan casos del otro modo", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region, false);
    const { profile: per } = await createPer(region, { isDemo: false });
    const realCase = await prisma.pACase.create({
      data: {
        code: uid("PA-REAL"),
        type: "NUEVO",
        regionId: region,
        perId: per.id,
        coordinatorId: coord.id,
        status: "CONEXION",
        stage: "CONEXION",
        lastSessionDate: daysAgo(30),
        isDemo: false,
      },
    });

    await checkAllAlertRules(true); // corre en modo demo

    const alert = await prisma.alert.findFirst({ where: { paCaseId: realCase.id } });
    expect(alert).toBeNull();
  });
});

describe("alerts.service — resolveAlert", () => {
  it("ALRT-08: resolver una alerta la cierra y la audita", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const staleCase = await createRawCase(region, per.id, coord.id, { lastSessionDate: daysAgo(20) });
    await checkAllAlertRules(true);
    const alert = await prisma.alert.findFirstOrThrow({ where: { paCaseId: staleCase.id } });

    const resolved = await resolveAlert(alert.id, "Se contactó al PER, retomó la próxima semana", coord.id, true);
    expect(resolved.status).toBe("RESUELTA");
    expect(resolved.resolutionNote).toBe("Se contactó al PER, retomó la próxima semana");

    const audit = await prisma.auditLog.findFirst({ where: { entityId: alert.id, action: "RESOLVE_ALERT" } });
    expect(audit).not.toBeNull();
  });
});
