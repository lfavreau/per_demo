import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "Datos de suscripción incompletos" },
        { status: 400 }
      );
    }

    // Upsert: if this endpoint already exists for this user, update it
    const existing = await prisma.pushSubscription.findFirst({
      where: { userId: user.id, endpoint },
    });

    if (existing) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          keys: JSON.stringify(keys),
          userAgent: request.headers.get("user-agent") || null,
          lastUsedAt: new Date(),
        },
      });
    } else {
      await prisma.pushSubscription.create({
        data: {
          userId: user.id,
          endpoint,
          keys: JSON.stringify(keys),
          userAgent: request.headers.get("user-agent") || null,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Push Subscribe] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
