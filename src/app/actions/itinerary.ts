"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  submitItineraryStep,
  validateItineraryStep,
  returnItineraryStep,
  markStepNotApplicable,
} from "@/server/services/itinerary.service";

function revalidateItineraryPaths() {
  revalidatePath("/per", "layout");
  revalidatePath("/coordinacion", "layout");
  revalidatePath("/admin", "layout");
}

export async function submitItineraryStepAction(taskId: string, fieldValues: Record<string, unknown>) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") return { error: "No autorizado" };

  try {
    await submitItineraryStep({ taskId, actorId: user.id, isDemo: user.isDemo, fieldValues });
    revalidateItineraryPaths();
    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function syncOfflineItineraryStepsAction(
  steps: Array<{ id: string; taskId: string; fieldValues: Record<string, unknown> }>
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") return { error: "No autorizado. Su sesión puede haber expirado." };

  let syncedCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const step of steps) {
    try {
      await submitItineraryStep({
        taskId: step.taskId,
        actorId: user.id,
        isDemo: user.isDemo,
        fieldValues: step.fieldValues,
      });
      syncedCount++;
    } catch (err: any) {
      errors.push({ id: step.id, error: err.message });
    }
  }

  revalidateItineraryPaths();
  return { success: true, syncedCount, errors };
}

export async function markStepNotApplicableAction(taskId: string, reason: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "PER" && user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await markStepNotApplicable(taskId, user.id, user.isDemo, reason);
    revalidateItineraryPaths();
  } catch (err: any) {
    console.error("Error marking itinerary step as not applicable:", err);
  }
}

export async function validateItineraryStepAction(taskId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await validateItineraryStep(taskId, user.id, user.isDemo);
    revalidateItineraryPaths();
  } catch (err: any) {
    console.error("Error validating itinerary step:", err);
  }
}

export async function returnItineraryStepAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const taskId = formData.get("taskId") as string;
  const feedback = formData.get("feedback") as string;
  if (!taskId || !feedback) return;

  try {
    await returnItineraryStep(taskId, user.id, user.isDemo, feedback);
    revalidateItineraryPaths();
  } catch (err: any) {
    console.error("Error returning itinerary step:", err);
  }
}
