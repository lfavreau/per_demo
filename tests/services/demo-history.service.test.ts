import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createCaseFromCandidate } from "@/server/services/cases.service";
import { fillDemoHistory, planDemoHistory } from "@/server/services/demo-history.service";
import { getCaseActivityHistory, getDomainPriorities } from "@/server/services/itinerary.service";
import { createCandidate, createCoordinator, createPer, testRegion } from "../helpers/fixtures";

/** Un caso demo con su primera tarea (la que crea el alta) y, aparte, un caso real que no debe tocarse. */
async function cases(demoStage: "VINCULACION" | "CONEXION" | "FINALIZACION", demoStatus: string) {
  const region = testRegion();
  const coord = await createCoordinator(region);
  const { profile: per } = await createPer(region);
  const demoCase = await createCaseFromCandidate((await createCandidate(region)).id, per.id, "", "NUEVO", coord.id, true);
  await prisma.pACase.update({ where: { id: demoCase.id }, data: { stage: demoStage, status: demoStatus } });

  const realCoord = await createCoordinator(region, false);
  const { profile: realPer } = await createPer(region, { isDemo: false });
  const realCase = await createCaseFromCandidate((await createCandidate(region, { isDemo: false })).id, realPer.id, "", "NUEVO", realCoord.id, false);
  return { demoCase, realCase };
}

describe("demo-history.service — historia de los casos demo", () => {
  it("DH-01: un caso en Conexión recibe toda la Vinculación validada y con contenido; lo real no se toca", async () => {
    const { demoCase, realCase } = await cases("CONEXION", "CONEXION");
    // El alta dejó la primera tarea sin contenido; el frontier es el comienzo de Conexión.
    const realTasksBefore = JSON.stringify(await prisma.task.findMany({ where: { paCaseId: realCase.id }, orderBy: { id: "asc" } }));

    const plan = (await planDemoHistory([demoCase.code]))[0];
    expect(plan.fill).toHaveLength(5);

    await fillDemoHistory([demoCase.code]);

    const history = await getCaseActivityHistory(demoCase.id, true);
    const vinculacion = history.filter((h) => h.stage === "VINCULACION");
    expect(vinculacion).toHaveLength(5);
    expect(vinculacion.every((h) => h.status === "VALIDADA" && !!h.contentJson)).toBe(true);
    expect(vinculacion.every((h) => h.events.some((e) => e.toStatus === "VALIDADA" && e.by === "COORDINATOR"))).toBe(true);

    // Actividad 3 y 4 dejan mapa de ámbitos con prioridad y objetivos con semana.
    expect(Object.keys(await getDomainPriorities(demoCase.id))).toHaveLength(9);
    const goals = await prisma.iAPGoal.findMany({ where: { iapRecord: { paCaseId: demoCase.id } } });
    expect(goals.length).toBeGreaterThanOrEqual(2);
    expect(goals.every((g) => g.targetWeek !== null)).toBe(true);

    // Idempotente y sin tocar lo real.
    expect((await planDemoHistory([demoCase.code]))[0].fill).toHaveLength(0);
    expect(JSON.stringify(await prisma.task.findMany({ where: { paCaseId: realCase.id }, orderBy: { id: "asc" } }))).toBe(realTasksBefore);
  });

  it("DH-02: un caso egresado queda con todo el itinerario validado, incluida la encuesta", async () => {
    const { demoCase } = await cases("FINALIZACION", "EGRESO");
    await fillDemoHistory([demoCase.code]);

    const history = await getCaseActivityHistory(demoCase.id, true);
    expect(history).toHaveLength(9);
    expect(history.every((h) => h.status === "VALIDADA")).toBe(true);
    expect(history.find((h) => h.activityKey === "ENCUESTA_SATISFACCION")?.googleUrl).toMatch(/^https:\/\//);
    expect((await prisma.iAPRecord.findFirstOrThrow({ where: { paCaseId: demoCase.id } })).status).toBe("FINALIZADO");
  });

  it("DH-03: un caso que recién empieza no recibe nada", async () => {
    const { demoCase } = await cases("VINCULACION", "VINCULACION");
    expect((await planDemoHistory([demoCase.code]))[0].fill).toHaveLength(0);
  });
});
