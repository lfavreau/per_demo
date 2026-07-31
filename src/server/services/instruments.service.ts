import { prisma } from "@/lib/db";

export async function updateInstrumentPlacement({
  instrumentId,
  stageId,
  order,
  actorId,
  isDemo,
}: {
  instrumentId: string;
  stageId: string | null;
  order: number;
  actorId: string;
  isDemo: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const instrument = await tx.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new Error("Instrumento no encontrado");

    const updated = await tx.instrument.update({
      where: { id: instrumentId },
      data: { stageId, order },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: "ADMIN",
        action: "UPDATE_INSTRUMENT_PLACEMENT",
        entityType: "Instrument",
        entityId: instrumentId,
        previousValue: JSON.stringify({ stageId: instrument.stageId, order: instrument.order }),
        newValue: JSON.stringify({ stageId, order }),
        isDemo,
      },
    });

    return updated;
  });
}
