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

// Los mocks de Drive en modo demo (isDemo: true) son deterministas y no hacen red — se dejan
// pasar tal cual (importOriginal). Solo se sobreescribe createIapDocument puntualmente en el
// test de rollback (CASE-09), para simular una falla real de Google Workspace.
vi.mock("@/server/google/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/google/workspace")>();
  return {
    ...actual,
    createCaseFolder: vi.fn(actual.createCaseFolder),
    createIapDocument: vi.fn(actual.createIapDocument),
    rollbackCaseFolder: vi.fn(actual.rollbackCaseFolder),
    rollbackIapDocument: vi.fn(actual.rollbackIapDocument),
  };
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

  it("CASE-07/08: match en un solo paso — nace FORMALIZADO/VINCULACION con Drive, IAP y primer Task", async () => {
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
    expect(paCase.driveFolderCaseId).toBeTruthy();

    const iap = await prisma.iAPRecord.findFirst({ where: { paCaseId: paCase.id } });
    expect(iap).not.toBeNull();

    const firstTask = await prisma.task.findFirst({ where: { paCaseId: paCase.id } });
    expect(firstTask).not.toBeNull();
    expect(firstTask?.status).toBe("PENDIENTE");
  });

  it("CASE-09: si falla la creación del IAP, no se persiste nada (nada a medias)", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);
    const candidate = await createCandidate(region);

    const workspace = await import("@/server/google/workspace");
    (workspace.createIapDocument as any).mockRejectedValueOnce(new Error("mock: falla de Drive"));

    await expect(
      createCaseFromCandidate(candidate.id, per.id, "motivo", "NUEVO", coord.id, true)
    ).rejects.toThrow(/mock: falla de Drive/);

    expect(workspace.rollbackCaseFolder).toHaveBeenCalled();
    // El IAP nunca llegó a crearse (falló antes): no hay nada que revertir de ese lado.
    expect(workspace.rollbackIapDocument).not.toHaveBeenCalled();

    const orphanCase = await prisma.pACase.findFirst({ where: { candidateId: candidate.id } });
    expect(orphanCase).toBeNull();

    const candidateAfter = await prisma.pACandidate.findUnique({ where: { id: candidate.id } });
    expect(candidateAfter?.convertedToCaseId).toBeNull(); // no se tocó: la falla fue antes de ese paso
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

  it("CASE-12: al cerrar VINCULACION se sincronizan en Drive los documentos generados pendientes", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(
      candidate.id,
      per.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );
    expect(paCase.driveFolderVinculacionId).toBeTruthy();

    // Se valida directo por Prisma en vez de recorrer todo el itinerario secuencial, que es
    // irrelevante para lo que este test verifica.
    const instrument = await prisma.instrument.findFirstOrThrow({
      where: { activityKey: "ACTIVIDAD_1_MOTIVACIONES" },
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
        contentJson: JSON.stringify({
          date: "2026-08-01",
          motivations: "Retomar estudios",
          expectations: "Sentirme acompañada",
        }),
        isDemo: true,
      },
    });

    await transitionCaseStatus(
      paCase.id,
      "CONEXION",
      "Forzado para probar sincronización de documentos",
      coord.id,
      true,
      true
    );

    const record = await prisma.documentRecord.findFirst({
      where: { caseId: paCase.id, instrumentId: instrument.id, origin: "GENERATED", isFinalVigente: true },
    });
    expect(record).not.toBeNull();
    expect(record?.stage).toBe("VINCULACION");
    expect(record?.contentHash).toBeTruthy();
    expect(record?.revisionId).toBeTruthy();
  });

  it("CASE-13: un retiro voluntario también sincroniza el Formulario de Abandono validado", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { user: perUser, profile: per } = await createPer(region);
    const candidate = await createCandidate(region);

    const paCase = await createCaseFromCandidate(
      candidate.id,
      per.id,
      "motivo",
      "NUEVO",
      coord.id,
      true
    );
    expect(paCase.driveFolderFinalizacionId).toBeTruthy();

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

    // El retiro no pasa por el gate de avance de etapa (no es un cambio de VINCULACION/CONEXION/
    // FINALIZACION): la sincronización tiene que dispararse igual, por la rama de retiro.
    await transitionCaseStatus(paCase.id, "RETIRO_VOLUNTARIO", "Retiro solicitado por la persona acompañada", coord.id, true);

    const record = await prisma.documentRecord.findFirst({
      where: { caseId: paCase.id, instrumentId: instrument.id, origin: "GENERATED", isFinalVigente: true },
    });
    expect(record).not.toBeNull();
    expect(record?.stage).toBe("FINALIZACION");
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
