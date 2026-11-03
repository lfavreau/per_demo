"use server";

import { revalidatePath } from "next/cache";
import { logSession, CreateSessionLogInput } from "@/server/services/sessions.service";
import { updateTaskStatus } from "@/server/services/tasks.service";
import { getCurrentUser } from "@/lib/auth";
import { extractGoogleDriveFileId } from "@/lib/google-resource";
import { REQUIRE_TEXT_FIELDS } from "@/lib/program-config";

export async function logSessionAction(data: Omit<CreateSessionLogInput, "perId" | "sessionNumber" | "regionId" | "date"> & { date: string }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") throw new Error("No autorizado");

  try {
    const formattedData: CreateSessionLogInput = {
      ...data,
      perId: user.id,
      date: new Date(data.date),
      durationMinutes: data.durationMinutes ? Number(data.durationMinutes) : undefined,
    };

    await logSession(formattedData, user.id, user.isDemo);
    revalidatePath("/per", "layout");
    revalidatePath("/coordinacion", "layout");
    revalidatePath("/admin", "layout");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function submitTaskAction(taskId: string, googleUrl: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") throw new Error("No autorizado");

  if (REQUIRE_TEXT_FIELDS && !googleUrl) {
    return { error: "Por favor, ingresa el enlace del documento de Google Drive" };
  }

  try {
    const googleFileId = user.isDemo || !googleUrl ? undefined : extractGoogleDriveFileId(googleUrl);
    await updateTaskStatus({
      taskId,
      toStatus: "ENVIADA",
      note: googleUrl,
      actorId: user.id,
      isDemo: user.isDemo,
      googleFileId,
    });
    revalidatePath("/per", "layout");
    revalidatePath("/coordinacion", "layout");
    revalidatePath("/admin", "layout");
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function syncOfflineSessionsAction(sessions: Array<any>) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "PER") {
      return { error: "No autorizado. Su sesión puede haber expirado." };
    }

    let syncedCount = 0;
    const errors = [];

    for (const s of sessions) {
      try {
        const formattedData: CreateSessionLogInput = {
          paCaseId: s.paCaseId,
          perId: user.id,
          date: new Date(s.date),
          modality: s.modality,
          durationMinutes: s.durationMinutes ? Number(s.durationMinutes) : undefined,
          recoveryDomainId: s.recoveryDomainId,
          iapGoalId: s.iapGoalId,
          summary: s.summary,
          agreements: s.agreements,
          difficulties: s.difficulties,
          nextAction: s.nextAction,
          perEmotion: s.perEmotion,
          perReflection: s.perReflection,
          attendance: s.attendance,
          status: "ENVIADA",
          offlineDraftId: s.id,
        };

        await logSession(formattedData, user.id, user.isDemo);
        syncedCount++;
      } catch (err: any) {
        errors.push({ id: s.id, error: err.message });
      }
    }

    revalidatePath("/per", "layout");
    revalidatePath("/coordinacion", "layout");
    revalidatePath("/admin", "layout");
    return { success: true, syncedCount, errors };
  } catch (err: any) {
    return { error: err.message };
  }
}
