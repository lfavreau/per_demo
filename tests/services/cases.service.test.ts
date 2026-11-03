import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  createCaseFromCandidate,
  reassignCase,
  transitionCaseStatus,
} from "@/server/services/cases.service";
import { createAdmin, createCoordinator, createPer, createCandidate, testRegion } from "../helpers/fixtures";

// Interruptor de textos obligatorios (src/lib/program-config.ts): apagado por defecto; los tests de
// "motivo obligatorio" lo encienden y afterEach lo vuelve a apagar.
const textRules = vi.hoisted(() => ({ require: false }));
vi.mock("@/lib/program-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/program-config")>();
  return {
    ...actual,
    get REQUIRE_TEXT_FIELDS() {
      return textRules.require;
    },
  };
});
afterEach(() => {
  textRules.require = false;
});

describe("cases.service — createCaseFromCandidate", () => {
  it("CASE-01: un coordinador no crea casos de otra región", async () => {
    const regionA = testRegion();
    const regionB = testRegion();
    const coord = await createCoordinator(regionB);
    const candidate = await createCandidate(regionA);
    const { profile: per } = await createPer(regionA);

    await expect(
      createCaseFromCandidate(candidate.id, per.id, "motivo", "NUEVO", coord.id, true)
    ).rejects.toThrow(/No autorizado para operar casos de esta región/);
  });

  it("CASE-02: el ADMIN sí puede operar cualquier región", async () => {
    const region = testRegion();
    const admin = await createAdmin();
    const candidate = await createCandidate(region);
    const { profile: per } = await createPer(region);

    const paCase = await createCaseFromCandidate(
      candidate.id,
      per.id,
      "motivo",
      "NUEVO",
      admin.id,
      true
    );
    expect(paCase.regionId).toBe(region);
  });

  it("CASE-03: no se asigna caso a PER inactivo", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const candidate = await createCandidate(region);
    const { profile: per } = await createPer(region, { active: false });

    await expect(
      createCaseFromCandidate(candidate.id, per.id, "motivo", "NUEVO", coord.id, true)
    ).rejects.toThrow(/inactivo/);
  });

  it("CASE-03b: sin tope — un PER puede llevar más de un caso activo a la vez", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const candidate1 = await createCandidate(region);
    const candidate2 = await createCandidate(region);

    const firstCase = await createCaseFromCandidate(candidate1.id, per.id, "motivo", "NUEVO", coord.id, true);
    const secondCase = await createCaseFromCandidate(candidate2.id, per.id, "motivo", "NUEVO", coord.id, true);

    expect(firstCase.perId).toBe(per.id);
    expect(secondCase.perId).toBe(per.id);
  });

  it("CASE-04/05: el código correlativo es por región y por modo (isDemo)", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per1 } = await createPer(region);
    const { profile: per2 } = await createPer(region);
    const candidate1 = await createCandidate(region);
    const candidate2 = await createCandidate(region);

    const case1 = await createCaseFromCandidate(
      candidate1.id,
      per1.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );
    const case2 = await createCaseFromCandidate(
      candidate2.id,
      per2.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );

    // No se asume "-001" en duro: otros tests comparten la misma región de reserva ("GEN",
    // fallback de getRegionAbbreviation para nombres de región no reconocidos), así que el
    // correlativo global de esa abreviatura puede venir de más atrás. Lo que sí es invariante
    // del servicio es que, dentro de esta región real y modo, el segundo caso es consecutivo al primero.
    const num1 = Number(case1.code.split("-")[2]);
    const num2 = Number(case2.code.split("-")[2]);
    expect(num2).toBe(num1 + 1);
    expect(case1.code.split("-")[1]).toBe(case2.code.split("-")[1]); // misma región
  });

  it("CASE-06: crear el caso deja la candidata SELECCIONADA, enlazada, auditada y notifica al PER", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const candidate = await createCandidate(region, { status: "ADMISIBLE" });

    const paCase = await createCaseFromCandidate(
      candidate.id,
      per.id,
      "fundamentación de prueba",
      "NUEVO",
      coord.id,
      true
    );

    const updatedCandidate = await prisma.pACandidate.findUnique({ where: { id: candidate.id } });
    expect(updatedCandidate?.status).toBe("SELECCIONADA");
    expect(updatedCandidate?.convertedToCaseId).toBe(paCase.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: paCase.id, action: "CREATE_CASE" },
    });
    expect(audit).not.toBeNull();

    const notification = await prisma.notification.findFirst({
      where: { userId: perUser.id, link: { contains: paCase.id } },
    });
    expect(notification).not.toBeNull();
  });

  it("CASE-07/08: match en un solo paso — nace FORMALIZADO/VINCULACION con IAP y primer Task", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(
      candidate.id,
      per.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );

    // No existe un estado PROPUESTO/VALIDADO intermedio: nace formalizado de una.
    expect(paCase.matchStatus).toBe("FORMALIZADO");
    expect(paCase.status).toBe("VINCULACION");
    expect(paCase.stage).toBe("VINCULACION");

    const iap = await prisma.iAPRecord.findFirst({ where: { paCaseId: paCase.id } });
    expect(iap).not.toBeNull();

    const firstTask = await prisma.task.findFirst({ where: { paCaseId: paCase.id } });
    expect(firstTask).not.toBeNull();
    expect(firstTask?.status).toBe("PENDIENTE");
  });

});

describe("cases.service — reassignCase", () => {
  it("CASE-16: reasigna el caso, libera el cupo anterior y audita", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: perA } = await createPer(region);
    const { profile: perB } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(
      candidate.id,
      perA.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );

    const updated = await reassignCase(paCase.id, perB.id, "PER anterior dejó el programa", coord.id, true);
    expect(updated.perId).toBe(perB.id);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: paCase.id, action: "REASSIGN_CASE" },
    });
    expect(audit).not.toBeNull();

    // El cupo del PER anterior quedó libre: se le puede asignar un caso nuevo.
    const candidate2 = await createCandidate(region);
    const newCase = await createCaseFromCandidate(
      candidate2.id,
      perA.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );
    expect(newCase.perId).toBe(perA.id);
  });

  it("CASE-17: reasigna a un PER que ya tiene otro caso activo (sin tope)", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: perA } = await createPer(region);
    const { profile: perB } = await createPer(region);
    const candidate1 = await createCandidate(region);
    const candidate2 = await createCandidate(region);

    const caseA = await createCaseFromCandidate(candidate1.id, perA.id, "motivo", "NUEVO", coord.id, true);
    await createCaseFromCandidate(candidate2.id, perB.id, "motivo", "NUEVO", coord.id, true);

    const moved = await reassignCase(caseA.id, perB.id, "motivo", coord.id, true);
    expect(moved.perId).toBe(perB.id);
  });

  it("reasignar sin motivo está prohibido (con REQUIRE_TEXT_FIELDS activo)", async () => {
    textRules.require = true;
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: perA } = await createPer(region);
    const { profile: perB } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(
      candidate.id,
      perA.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );

    await expect(reassignCase(paCase.id, perB.id, "", coord.id, true)).rejects.toThrow(/motivo/);
  });
});

describe("cases.service — transitionCaseStatus (puerta de avance de etapa)", () => {
  it("CASE-10: avanzar de etapa con instrumentos pendientes está bloqueado", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(
      candidate.id,
      per.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );

    await expect(
      transitionCaseStatus(paCase.id, "CONEXION", "avance normal", coord.id, true)
    ).rejects.toThrow(/Bloqueo de avance de etapa/);
  });

  it("CASE-11: con REQUIRE_TEXT_FIELDS activo, forzar sin motivo está prohibido; con motivo queda auditado", async () => {
    textRules.require = true;
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(
      candidate.id,
      per.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );

    await expect(
      transitionCaseStatus(paCase.id, "CONEXION", "", coord.id, true, true)
    ).rejects.toThrow(/motivo/);

    const updated = await transitionCaseStatus(
      paCase.id,
      "CONEXION",
      "Forzado por decisión de coordinación",
      coord.id,
      true,
      true
    );
    expect(updated.status).toBe("CONEXION");

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: paCase.id, action: "FORCE_STAGE_ADVANCE" },
    });
    expect(audit).not.toBeNull();
  });

  it("CASE-13: un retiro voluntario exige el Formulario de Abandono validado", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(candidate.id, per.id, "motivo", "NUEVO", coord.id, true);

    await expect(
      transitionCaseStatus(paCase.id, "RETIRO_VOLUNTARIO", "Retiro solicitado", coord.id, true)
    ).rejects.toThrow(/Formulario de Abandono/);

    const instrument = await prisma.instrument.findFirstOrThrow({
      where: { activityKey: "FORMULARIO_ABANDONO_PA" },
    });
    await prisma.task.create({
      data: {
        title: instrument.name,
        instrumentId: instrument.id,
        paCaseId: paCase.id,
        regionId: region,
        assignedToUserId: perUser.id,
        assignedByUserId: coord.id,
        status: "VALIDADA",
        contentJson: JSON.stringify({ date: "2026-08-05", reason: "Decisión personal" }),
        isDemo: true,
      },
    });

    const updated = await transitionCaseStatus(paCase.id, "RETIRO_VOLUNTARIO", "Retiro solicitado", coord.id, true);
    expect(updated.status).toBe("RETIRO_VOLUNTARIO");
  });
});

describe("cases.service — una persona, un solo caso", () => {
  it("CASE-21: asignar dos veces a la misma persona (también en paralelo) crea un solo caso", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const candidate = await createCandidate(region);

    const results = await Promise.allSettled([
      createCaseFromCandidate(candidate.id, per.id, "", "NUEVO", coord.id, true),
      createCaseFromCandidate(candidate.id, per.id, "", "NUEVO", coord.id, true),
      createCaseFromCandidate(candidate.id, per.id, "", "NUEVO", coord.id, true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.pACase.count({ where: { candidateId: candidate.id } })).toBe(1);

    // Un intento posterior también se rechaza, y no deja la persona bloqueada a medias.
    await expect(
      createCaseFromCandidate(candidate.id, per.id, "", "NUEVO", coord.id, true)
    ).rejects.toThrow(/ya tiene un PER asignado/);
    const after = await prisma.pACandidate.findUnique({ where: { id: candidate.id } });
    expect(after?.convertedToCaseId).not.toMatch(/^reserva:/);
  });

  it("CASE-22: si falla la creación, la reserva se libera y se puede reintentar", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: goodPer } = await createPer(region);
    const candidate = await createCandidate(region);

    // Falla forzada DESPUÉS de reservar a la persona: sin instrumentos vigentes no se puede
    // desbloquear el primer paso del itinerario y la creación del caso revierte.
    const vigentes = await prisma.instrument.findMany({ where: { status: "VIGENTE" }, select: { id: true } });
    await prisma.instrument.updateMany({ where: { id: { in: vigentes.map((i) => i.id) } }, data: { status: "BORRADOR" } });
    try {
      await expect(
        createCaseFromCandidate(candidate.id, goodPer.id, "", "NUEVO", coord.id, true)
      ).rejects.toThrow(/instrumento vigente/);
    } finally {
      await prisma.instrument.updateMany({ where: { id: { in: vigentes.map((i) => i.id) } }, data: { status: "VIGENTE" } });
    }
    const released = await prisma.pACandidate.findUnique({ where: { id: candidate.id } });
    expect(released?.convertedToCaseId).toBeNull();

    const ok = await createCaseFromCandidate(candidate.id, goodPer.id, "", "NUEVO", coord.id, true);
    expect(ok.candidateId).toBe(candidate.id);
  });
});

describe("cases.service — nombre o alias de la persona", () => {
  it("CASE-19: el caso toma como alias el nombre o alias con que se registró a la persona", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const candidate = await createCandidate(region);
    await prisma.pACandidate.update({ where: { id: candidate.id }, data: { sourceCenter: "  Don   Pato  " } });

    const paCase = await createCaseFromCandidate(candidate.id, per.id, "", "NUEVO", coord.id, true);
    expect(paCase.alias).toBe("Don Pato");
    expect(paCase.type).toBe("NUEVO");
  });
});

describe("cases.service — textos opcionales (REQUIRE_TEXT_FIELDS apagado)", () => {
  it("CASE-18: reasignar y forzar avance funcionan sin motivo escrito", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: perA } = await createPer(region);
    const { profile: perB } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(candidate.id, perA.id, "", "NUEVO", coord.id, true);

    const moved = await reassignCase(paCase.id, perB.id, "", coord.id, true);
    expect(moved.perId).toBe(perB.id);

    const advanced = await transitionCaseStatus(paCase.id, "CONEXION", "", coord.id, true, true);
    expect(advanced.status).toBe("CONEXION");
  });
});
