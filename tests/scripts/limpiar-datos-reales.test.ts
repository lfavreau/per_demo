import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { prisma } from "@/lib/db";
import { createCaseFromCandidate } from "@/server/services/cases.service";
import { createCoordinator, createPer, createCandidate, testRegion } from "../helpers/fixtures";


const DB_FILE = "tests/.tmp/test.db";

function runCleanup(...extra: string[]) {
  return execFileSync("npx", ["tsx", "scripts/limpiar-datos-reales.ts", "--db", DB_FILE, ...extra], {
    encoding: "utf8",
    shell: true,
  });
}

/** Crea un PER + caso + datos colgantes. Los marca como "reales" (isDemo = false) si se pide. */
async function seedScenario(region: string, real: boolean) {
  const coord = await createCoordinator(region, true);
  const { user: perUser, profile } = await createPer(region, { isDemo: true });
  const candidate = await createCandidate(region);
  const paCase = await createCaseFromCandidate(candidate.id, profile.id, "motivo", "NUEVO", coord.id, true);
  const session = await prisma.sessionLog.create({
    data: {
      paCaseId: paCase.id,
      perId: perUser.id,
      regionId: region,
      sessionNumber: 1,
      stage: "VINCULACION",
      date: new Date(),
      modality: "PRESENCIAL",
      durationMinutes: 60,
      attendance: "REALIZADA",
      summary: "x",
      isDemo: true,
    },
  });

  if (real) {
    const flip = { isDemo: false };
    await prisma.user.update({ where: { id: perUser.id }, data: flip });
    await prisma.pACandidate.update({ where: { id: candidate.id }, data: flip });
    await prisma.pACase.update({ where: { id: paCase.id }, data: flip });
    await prisma.task.updateMany({ where: { paCaseId: paCase.id }, data: flip });
    await prisma.sessionLog.update({ where: { id: session.id }, data: flip });
    await prisma.notification.updateMany({ where: { userId: perUser.id }, data: flip });
    await prisma.auditLog.updateMany({ where: { entityId: paCase.id }, data: flip });
  }
  return { coord, perUser, profile, candidate, paCase, session };
}

describe("scripts/limpiar-datos-reales", () => {
  it("SCR-01: simula sin borrar; al aplicar borra lo real y conserva demo, coordinadores y catálogo", async () => {
    const region = testRegion();
    const real = await seedScenario(region, true);
    const demo = await seedScenario(region, false);
    const instrumentsBefore = await prisma.instrument.count();

    // Simulación: no cambia nada.
    const dry = runCleanup();
    expect(dry).toContain("SIMULACIÓN");
    expect(await prisma.user.count({ where: { id: real.perUser.id } })).toBe(1);
    expect(await prisma.pACase.count({ where: { id: real.paCase.id } })).toBe(1);

    // Aplicar.
    runCleanup("--aplicar");

    // Lo real desapareció, con todo lo que colgaba de ello.
    expect(await prisma.user.count({ where: { id: real.perUser.id } })).toBe(0);
    expect(await prisma.pERProfile.count({ where: { id: real.profile.id } })).toBe(0);
    expect(await prisma.pACase.count({ where: { id: real.paCase.id } })).toBe(0);
    expect(await prisma.pACandidate.count({ where: { id: real.candidate.id } })).toBe(0);
    expect(await prisma.sessionLog.count({ where: { id: real.session.id } })).toBe(0);
    expect(await prisma.task.count({ where: { paCaseId: real.paCase.id } })).toBe(0);
    expect(await prisma.iAPRecord.count({ where: { paCaseId: real.paCase.id } })).toBe(0);
    expect(await prisma.caseStatusHistory.count({ where: { paCaseId: real.paCase.id } })).toBe(0);

    // Lo demo quedó intacto.
    expect(await prisma.user.count({ where: { id: demo.perUser.id } })).toBe(1);
    expect(await prisma.pERProfile.count({ where: { id: demo.profile.id } })).toBe(1);
    expect(await prisma.pACase.count({ where: { id: demo.paCase.id } })).toBe(1);
    expect(await prisma.sessionLog.count({ where: { id: demo.session.id } })).toBe(1);
    expect(await prisma.task.count({ where: { paCaseId: demo.paCase.id } })).toBeGreaterThan(0);
    expect(await prisma.iAPRecord.count({ where: { paCaseId: demo.paCase.id } })).toBe(1);

    // Coordinadores (no PER) y catálogo se conservan.
    expect(await prisma.user.count({ where: { id: real.coord.id } })).toBe(1);
    expect(await prisma.instrument.count()).toBe(instrumentsBefore);
  }, 120_000);

  it("SCR-02: exige indicar el destino y confirmar producción", () => {
    expect(() => execFileSync("npx", ["tsx", "scripts/limpiar-datos-reales.ts"], { stdio: "pipe", shell: true })).toThrow();
    expect(() =>
      execFileSync("npx", ["tsx", "scripts/limpiar-datos-reales.ts", "--turso", "--aplicar"], {
        stdio: "pipe",
        shell: true,
        env: { ...process.env, TURSO_DATABASE_URL: "libsql://x.turso.io", TURSO_AUTH_TOKEN: "x" },
      })
    ).toThrow();
  }, 60_000);
});
