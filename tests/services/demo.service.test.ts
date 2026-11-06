import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createCaseFromCandidate } from "@/server/services/cases.service";
import { submitItineraryStep } from "@/server/services/itinerary.service";
import {
  DEMO_BASELINE_KEY,
  DEMO_WINDOW_KEY,
  DEMO_WINDOW_MINUTES,
  captureDemoBaseline,
  ensureDemoWindow,
  resetDemoData,
} from "@/server/services/demo.service";
import { createCandidate, createCoordinator, createPer, testRegion } from "../helpers/fixtures";

const clearDemoSettings = () => prisma.setting.deleteMany({ where: { key: { in: [DEMO_BASELINE_KEY, DEMO_WINDOW_KEY] } } });

afterAll(clearDemoSettings);

/** Un caso demo con su primera tarea ya enviada, y un caso real aparte que el reinicio nunca debe tocar. */
async function scenario() {
  const region = testRegion();
  const demoCoord = await createCoordinator(region);
  const { profile: demoPer } = await createPer(region);
  const demoCase = await createCaseFromCandidate((await createCandidate(region)).id, demoPer.id, "", "NUEVO", demoCoord.id, true);

  const realCoord = await createCoordinator(region, false);
  const { profile: realPer } = await createPer(region, { isDemo: false });
  const realCandidate = await createCandidate(region, { isDemo: false });
  const realCase = await createCaseFromCandidate(realCandidate.id, realPer.id, "", "NUEVO", realCoord.id, false);

  const task = await prisma.task.findFirstOrThrow({ where: { paCaseId: demoCase.id } });
  await submitItineraryStep({
    taskId: task.id,
    actorId: (await prisma.pERProfile.findUniqueOrThrow({ where: { id: demoPer.id } })).userId,
    isDemo: true,
    fieldValues: { date: "2026-03-01", reflection: "texto de ejemplo" },
  });
  return { region, demoCase, realCase, task };
}

describe("demo.service — reinicio de los datos demo", () => {
  it("DM-01: vuelve a la línea base lo demo (incluidas fechas) y no toca nada de lo real", async () => {
    const { region, demoCase, realCase, task } = await scenario();
    await captureDemoBaseline();

    const demoBefore = JSON.stringify(await prisma.pACase.findUniqueOrThrow({ where: { id: demoCase.id } }));
    const taskBefore = JSON.stringify(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }));
    const eventsBefore = await prisma.taskEvent.count({ where: { taskId: task.id } });

    // Uso del demo: se cambia una tarea, se agrega una persona y se borra un evento.
    await prisma.task.update({ where: { id: task.id }, data: { status: "VALIDADA", contentJson: "{}" } });
    const extra = await createCandidate(region);
    await prisma.taskEvent.deleteMany({ where: { taskId: task.id } });
    // Y lo real cambia por su lado (por ejemplo, alguien trabajando en el modo real).
    await prisma.pACase.update({ where: { id: realCase.id }, data: { alias: "cambio real" } });
    const realCandidatesBefore = await prisma.pACandidate.count({ where: { isDemo: false } });

    expect(await resetDemoData()).toBe(true);

    expect(JSON.stringify(await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))).toBe(taskBefore);
    expect(JSON.stringify(await prisma.pACase.findUniqueOrThrow({ where: { id: demoCase.id } }))).toBe(demoBefore);
    expect(await prisma.taskEvent.count({ where: { taskId: task.id } })).toBe(eventsBefore);
    expect(await prisma.pACandidate.findUnique({ where: { id: extra.id } })).toBeNull();

    // Lo real quedó exactamente como estaba antes del reinicio.
    expect((await prisma.pACase.findUniqueOrThrow({ where: { id: realCase.id } })).alias).toBe("cambio real");
    expect(await prisma.pACandidate.count({ where: { isDemo: false } })).toBe(realCandidatesBefore);
  });

  it("DM-02: sin línea base guardada no hace nada", async () => {
    await clearDemoSettings();
    const { task } = await scenario();
    await prisma.task.update({ where: { id: task.id }, data: { contentJson: "cambiado" } });

    expect(await resetDemoData()).toBe(false);
    expect(await ensureDemoWindow()).toEqual({ reset: false });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).contentJson).toBe("cambiado");
  });

  it("DM-03: reinicia en el primer clic tras 5 minutos, no antes, y el clic reinicia la ventana", async () => {
    await clearDemoSettings();
    const { task } = await scenario();
    await captureDemoBaseline();
    const baselineContent = (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).contentJson;

    const t0 = new Date("2026-11-06T12:00:00Z");
    const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
    const edit = () => prisma.task.update({ where: { id: task.id }, data: { contentJson: "uso del demo" } });
    const content = async () => (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).contentJson;

    // Primer clic: abre la ventana (los datos demo parten del estado inicial).
    expect((await ensureDemoWindow(t0)).reset).toBe(true);
    await edit();

    // Dentro de los 5 minutos no se reinicia.
    expect((await ensureDemoWindow(at(DEMO_WINDOW_MINUTES - 0.01))).reset).toBe(false);
    expect(await content()).toBe("uso del demo");

    // El primer clic pasados los 5 minutos reinicia, y ese clic abre la ventana siguiente.
    expect((await ensureDemoWindow(at(DEMO_WINDOW_MINUTES + 1))).reset).toBe(true);
    expect(await content()).toBe(baselineContent);
    await edit();
    expect((await ensureDemoWindow(at(DEMO_WINDOW_MINUTES + 3))).reset).toBe(false);
    expect(await content()).toBe("uso del demo");
    expect((await ensureDemoWindow(at(2 * DEMO_WINDOW_MINUTES + 2))).reset).toBe(true);
    expect(await content()).toBe(baselineContent);
  });

  it("DM-04: dos clics a la vez tras vencer la ventana reinician una sola vez", async () => {
    await clearDemoSettings();
    await scenario();
    await captureDemoBaseline();
    const t0 = new Date("2026-11-06T13:00:00Z");
    await ensureDemoWindow(t0);

    const later = new Date(t0.getTime() + 6 * 60_000);
    const results = await Promise.all([ensureDemoWindow(later), ensureDemoWindow(later), ensureDemoWindow(later)]);
    expect(results.filter((r) => r.reset)).toHaveLength(1);
  });

  it("DM-05: si el reinicio falla no cambia nada y el próximo clic lo reintenta", async () => {
    await clearDemoSettings();
    const { task } = await scenario();
    await captureDemoBaseline();
    const t0 = new Date("2026-11-06T14:00:00Z");
    await ensureDemoWindow(t0);

    // Línea base ilegible: el reinicio falla a mitad de camino.
    const good = (await prisma.setting.findUniqueOrThrow({ where: { key: DEMO_BASELINE_KEY } })).value;
    const broken = JSON.parse(good);
    broken.tables.Task.rows[0][0] = null; // Task.id no puede ser NULL
    await prisma.setting.update({ where: { key: DEMO_BASELINE_KEY }, data: { value: JSON.stringify(broken) } });
    await prisma.task.update({ where: { id: task.id }, data: { contentJson: "uso del demo" } });

    const later = new Date(t0.getTime() + 6 * 60_000);
    expect(await ensureDemoWindow(later)).toEqual({ reset: false });
    // La transacción se deshizo: lo demo sigue como estaba.
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).contentJson).toBe("uso del demo");

    // Con la línea base buena, el siguiente clic sí reinicia (la ventana vencida se devolvió).
    await prisma.setting.update({ where: { key: DEMO_BASELINE_KEY }, data: { value: good } });
    expect((await ensureDemoWindow(new Date(later.getTime() + 1000))).reset).toBe(true);
  });
});
