"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export interface UserNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  createdAt: Date;
}

export async function getUserNotificationsAction(): Promise<UserNotification[]> {
  const user = await getCurrentUser();
  if (!user) {
    return [];
  }

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20, // Keep it light, last 20 notifications is plenty
    });
    return notifications;
  } catch (err) {
    console.error("Error fetching notifications:", err);
    return [];
  }
}

export async function markNotificationAsReadAction(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("No autorizado");
  }

  try {
    await prisma.notification.update({
      where: { id, userId: user.id },
      data: { read: true },
    });
    revalidatePath("/", "layout");
  } catch (err: any) {
    console.error("Error marking notification as read:", err);
    throw err;
  }
}

export async function markAllNotificationsAsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("No autorizado");
  }

  try {
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    revalidatePath("/", "layout");
  } catch (err: any) {
    console.error("Error marking all notifications as read:", err);
    throw err;
  }
}
