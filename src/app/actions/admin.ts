"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createPERUserAction(formData: FormData) {
  const adminUser = await requireUser(["ADMIN"]);

  const name = (formData.get("name") as string)?.trim();
  const username = (formData.get("username") as string)?.trim().toLowerCase();
  const regionId = formData.get("regionId") as string;
  const certificationStatus = (formData.get("certificationStatus") as string) || "HABILITADO";

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
