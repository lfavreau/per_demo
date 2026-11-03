import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { prisma } from "@/lib/db";
import { createCaseFromCandidate } from "@/server/services/cases.service";
import { createCoordinator, createPer, createCandidate, testRegion } from "../helpers/fixtures";

const DB_FILE = "tests/.tmp/test.db";

function run(...extra: string[]) {
  return execFileSync("npx", ["tsx", "scripts/eliminar-casos-duplicados.ts", "--db", DB_FILE, ...extra], {
    encoding: "utf8",
    shell: true,
  });
}

describe("scripts/eliminar-casos-duplicados", () => {
  it("SCR-03: deja un caso por persona (el de más actividad) y borra el resto con sus datos", async () => {
    const region = testRegion();
    const coord = await createCoordinator(region);
    const { profile: per } = await createPer(region);

    // Tres casos de la MISMA persona, como dejaban los clics repetidos (se simulan por Prisma:
    // el servicio ya no permite crearlos).
    const candidate = await createCandidate(region);
    const donor1 = await createCandidate(region);
    const donor2 = await createCandidate(region);
    const first = await createCaseFromCandidate(candidate.id, per.id, "", "NUEVO", coord.id, true);
    const second = await createCaseFromCandidate(donor1.id, per.id, "", "NUEVO", coord.id, true);
    const third = await createCaseFromCandidate(donor2.id, per.id, "", "NUEVO", coord.id, true);
    await prisma.pACase.updateMany({ where: { id: { in: [second.id, third.id] } }, data: { candidateId: candidate.id } });
    await prisma.pACandidate.update({ where: { id: candidate.id }, data: { sourceCenter: "Persona Real" } });

    // El tercero es el que el PER efectivamente trabajó: tiene una bitácora.
    await prisma.sessionLog.create({
      data: {
        paCaseId: third.id,
        perId: per.userId,
        regionId: region,
        sessionNumber: 1,
        stage: "VINCULACION",
        date: new Date(),
        modality: "PRESENCIAL",
        attendance: "REALIZADA",
        summary: "x",
        isDemo: true,
      },
    });

    const dry = run();
    expect(dry).toContain("SIMULACIÓN");
    expect(await prisma.pACase.count({ where: { candidateId: candidate.id } })).toBe(3);

    run("--aplicar");

    const remaining = await prisma.pACase.findMany({ where: { candidateId: candidate.id } });
    expect(remaining.map((c) => c.id)).toEqual([third.id]); // conserva el de más actividad
    expect(await prisma.task.count({ where: { paCaseId: { in: [first.id, second.id] } } })).toBe(0);
    expect(await prisma.iAPRecord.count({ where: { paCaseId: { in: [first.id, second.id] } } })).toBe(0);
    expect(await prisma.sessionLog.count({ where: { paCaseId: third.id } })).toBe(1);
    expect(await prisma.task.count({ where: { paCaseId: third.id } })).toBeGreaterThan(0);

    const cand = await prisma.pACandidate.findUnique({ where: { id: candidate.id } });
    expect(cand?.convertedToCaseId).toBe(third.id);
    expect(remaining[0].alias).toBe("Persona Real");
  }, 120_000);
});
