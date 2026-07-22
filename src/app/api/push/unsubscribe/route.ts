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
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { error: "Endpoint requerido" },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Push Unsubscribe] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
