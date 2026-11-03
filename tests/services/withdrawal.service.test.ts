import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createCaseFromCandidate } from "@/server/services/cases.service";
import { cancelWithdrawal, ensureWithdrawalStep } from "@/server/services/itinerary.service";
import { createCoordinator, createPer, createCandidate, testRegion } from "../helpers/fixtures";

async function caseWithPer() {
  const region = testRegion();
  const coord = await createCoordinator(region);
  const { user: perUser, profile: per } = await createPer(region);
  const candidate = await createCandidate(region);
  const paCase = await createCaseFromCandidate(candidate.id, per.id, "", "NUEVO", coord.id, true);
  return { region, coord, perUser, paCase };
}

describe("itinerary.service — iniciar y cancelar un retiro", () => {
  it("WD-01: cancelar borra el formulario, deja el caso intacto, avisa al PER y audita", async () => {
    const { coord, perUser, paCase } = await caseWithPer();
    const tasksBefore = await prisma.task.count({ where: { paCaseId: paCase.id } });

    const started = await ensureWithdrawalStep(paCase.id, "PA", coord.id, true);
    // El PER alcanza a escribir algo antes de que coordinación cancele.
    await prisma.task.update({
      where: { id: started.id },
      data: { status: "ENVIADA", contentJson: JSON.stringify({ reason: "borrador" }) },
    });
    await prisma.taskEvent.create({
      data: { taskId: started.id, fromStatus: "PENDIENTE", toStatus: "ENVIADA", byUserId: perUser.id },
    });
    expect(await prisma.task.count({ where: { paCaseId: paCase.id } })).toBe(tasksBefore + 1);

    const result = await cancelWithdrawal(paCase.id, coord.id, true);
    expect(result.removed).toBe(1);

    // El caso queda exactamente como estaba.
    expect(await prisma.task.count({ where: { paCaseId: paCase.id } })).toBe(tasksBefore);
    expect(await prisma.task.count({ where: { id: started.id } })).toBe(0);
    expect(await prisma.taskEvent.count({ where: { taskId: started.id } })).toBe(0);
    const after = await prisma.pACase.findUnique({ where: { id: paCase.id } });
    expect(after?.status).toBe(paCase.status);

    const notice = await prisma.notification.findFirst({
      where: { userId: perUser.id, title: { contains: "retiro cancelado" } },
    });
    expect(notice).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { entityId: paCase.id, action: "CANCEL_WITHDRAWAL" } });
    expect(audit).not.toBeNull();

    // Sin retiro iniciado no hay nada que cancelar.
    await expect(cancelWithdrawal(paCase.id, coord.id, true)).rejects.toThrow(/no tiene un retiro iniciado/);
  });

  it("WD-02: un coordinador de otra región no puede iniciar ni cancelar el retiro", async () => {
    const { coord, paCase } = await caseWithPer();
    const outsider = await createCoordinator(testRegion());

    await expect(ensureWithdrawalStep(paCase.id, "PA", outsider.id, true)).rejects.toThrow(/No autorizado/);
    await ensureWithdrawalStep(paCase.id, "PA", coord.id, true);
    await expect(cancelWithdrawal(paCase.id, outsider.id, true)).rejects.toThrow(/No autorizado/);
    expect(
      await prisma.task.count({ where: { paCaseId: paCase.id, instrument: { activityKey: "FORMULARIO_ABANDONO_PA" } } })
    ).toBe(1);
  });

  it("WD-03: un retiro ya registrado no se cancela desde aquí", async () => {
    const { coord, paCase } = await caseWithPer();
    await ensureWithdrawalStep(paCase.id, "PA", coord.id, true);
    await prisma.pACase.update({ where: { id: paCase.id }, data: { status: "RETIRO_VOLUNTARIO" } });

    await expect(cancelWithdrawal(paCase.id, coord.id, true)).rejects.toThrow(/ya fue registrado/);
  });
});
