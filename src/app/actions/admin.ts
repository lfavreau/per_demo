"use server";

import { requireUser, verifyRealModePassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateInstrumentPlacement } from "@/server/services/instruments.service";

export async function createPERUserAction(formData: FormData) {
  const adminUser = await requireUser(["ADMIN"]);

  const name = (formData.get("name") as string)?.trim();
  const username = (formData.get("username") as string)?.trim().toLowerCase();
  const regionId = formData.get("regionId") as string;
  const certificationStatus = "HABILITADO";

  if (!name || !username || !regionId) {
    redirect("/admin/usuarios?error=missing_fields");
  }

  const email = username.includes("@") ? username : `${username}@per2026.cl`;

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    redirect("/admin/usuarios?error=user_exists");
  }

  // Create User and PERProfile in transaction
  const newUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        role: "PER",
        regionId,
        active: true,
        isDemo: Boolean(adminUser.isDemo),
      },
    });

    await tx.pERProfile.create({
      data: {
        userId: user.id,
        regionId,
        generation: "PRIMERA",
        certificationStatus,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        role: adminUser.role,
        action: "CREACION_USUARIO_PER",
        entityType: "USER",
        entityId: user.id,
        newValue: `Creado usuario PER '${name}' (${email}) asignado a región ${regionId}`,
        isDemo: Boolean(adminUser.isDemo),
      },
    });

    return user;
  });

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios?success=user_created");
}

export async function updatePERUserAction(formData: FormData) {
  const adminUser = await requireUser(["ADMIN"]);

  const userId = formData.get("userId") as string;
  const name = (formData.get("name") as string)?.trim();
  const username = (formData.get("username") as string)?.trim().toLowerCase();
  const regionId = formData.get("regionId") as string;
  const password = formData.get("adminPassword") as string;

  if (!userId || !name || !username || !regionId) {
    redirect("/admin/usuarios?error=missing_fields");
  }

  if (!verifyRealModePassword(password)) {
    redirect("/admin/usuarios?error=invalid_admin_password");
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser || targetUser.role !== "PER") {
    redirect("/admin/usuarios?error=user_not_found");
  }

  const email = username.includes("@") ? username : `${username}@per2026.cl`;

  if (email !== targetUser!.email) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      redirect("/admin/usuarios?error=user_exists");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { name, email, regionId },
    });

    await tx.pERProfile.update({
      where: { userId },
      data: { regionId },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUser.id,
        role: adminUser.role,
        action: "EDICION_USUARIO_PER",
        entityType: "USER",
        entityId: userId,
        previousValue: `${targetUser!.name} (${targetUser!.email}) - región ${targetUser!.regionId}`,
        newValue: `${name} (${email}) - región ${regionId}`,
        isDemo: Boolean(adminUser.isDemo),
      },
    });
  });

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios?success=user_updated");
}

export async function deletePERUserAction(formData: FormData) {
  const adminUser = await requireUser(["ADMIN"]);

  const userId = formData.get("userId") as string;
  const password = formData.get("adminPassword") as string;

  if (!userId) {
    redirect("/admin/usuarios?error=missing_user_id");
  }

  if (!verifyRealModePassword(password)) {
    redirect("/admin/usuarios?error=invalid_admin_password");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: { include: { _count: { select: { cases: true } } } } },
  });

  if (!targetUser || targetUser.role !== "PER") {
    redirect("/admin/usuarios?error=user_not_found");
  }

  const caseCount = targetUser!.profile?._count.cases ?? 0;
  if (caseCount > 0) {
    redirect("/admin/usuarios?error=per_has_cases");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: userId } });

      await tx.auditLog.create({
        data: {
          userId: adminUser.id,
          role: adminUser.role,
          action: "ELIMINACION_USUARIO_PER",
          entityType: "USER",
          entityId: userId,
          previousValue: `${targetUser!.name} (${targetUser!.email}) - región ${targetUser!.regionId}`,
          isDemo: Boolean(adminUser.isDemo),
        },
      });
    });
  } catch {
    redirect("/admin/usuarios?error=delete_failed");
  }

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios?success=user_deleted");
}

export async function toggleUserStatusAction(formData: FormData) {
  const adminUser = await requireUser(["ADMIN"]);
  const userId = formData.get("userId") as string;

  if (!userId) {
    redirect("/admin/usuarios?error=missing_user_id");
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) {
    redirect("/admin/usuarios?error=user_not_found");
  }

  // Do not allow deactivating the main admin
  if (targetUser.email === "admin@per2026.cl") {
    redirect("/admin/usuarios?error=cannot_deactivate_admin");
  }

  const updatedStatus = !targetUser.active;

  await prisma.user.update({
    where: { id: userId },
    data: { active: updatedStatus },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      role: adminUser.role,
      action: updatedStatus ? "ACTIVACION_USUARIO" : "DESACTIVACION_USUARIO",
      entityType: "USER",
      entityId: userId,
      newValue: `Usuario ${targetUser.email} ${updatedStatus ? "activado" : "desactivado"}`,
      isDemo: Boolean(adminUser.isDemo),
    },
  });

  revalidatePath("/admin/usuarios");
  redirect("/admin/usuarios?success=status_updated");
}

export async function updateInstrumentPlacementAction(formData: FormData): Promise<void> {
  const adminUser = await requireUser(["ADMIN"]);

  const instrumentId = formData.get("instrumentId") as string;
  const stageIdRaw = formData.get("stageId") as string;
  const orderRaw = formData.get("order") as string;

  if (!instrumentId) {
    throw new Error("Falta el instrumento");
  }

  const stageId = stageIdRaw && stageIdRaw !== "" ? stageIdRaw : null;
  const order = Number(orderRaw) || 0;

  await updateInstrumentPlacement({
    instrumentId,
    stageId,
    order,
    actorId: adminUser.id,
    isDemo: Boolean(adminUser.isDemo),
  });

  revalidatePath("/admin/instrumentos");
  revalidatePath("/per", "layout");
}
