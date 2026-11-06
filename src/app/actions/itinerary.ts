"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isNextRedirect } from "@/lib/next-errors";
import {
  submitItineraryStep,
  validateItineraryStep,
  returnItineraryStep,
  reopenValidation,
  requestCorrection,
  markStepNotApplicable,
  triggerIntermediateEvaluation,
} from "@/server/services/itinerary.service";
import { REQUIRE_TEXT_FIELDS } from "@/lib/program-config";

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
  // Marcar un instrumento como NO_APLICA satisface la puerta de avance de etapa
  // (ver assertStageAdvanceAllowed), así que es una decisión metodológica de
  // coordinación — nunca del propio PER que debe completarlo.
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await markStepNotApplicable(taskId, user.id, user.isDemo, reason);
    revalidateItineraryPaths();
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo marcar el instrumento como no aplicable";
    redirect(`/coordinacion/casos?error=${encodeURIComponent(message)}`);
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
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo validar el instrumento";
    redirect(`/coordinacion/casos?error=${encodeURIComponent(message)}`);
  }
}

/**
 * Corrige una validación hecha por error: la deja de nuevo en revisión ("REVIEW") o se la pide editar
 * al PER ("REQUEST_EDIT"). Devuelve el resultado para mostrarlo en el mismo modal.
 */
export async function reopenValidationAction(
  taskId: string,
  mode: "REVIEW" | "REQUEST_EDIT",
  reason: string
): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    return { ok: false, message: "No autorizado" };
  }
  try {
    await reopenValidation({ taskId, mode, reason, actorId: user.id, isDemo: Boolean(user.isDemo) });
    revalidateItineraryPaths();
    return {
      ok: true,
      message: mode === "REVIEW" ? "La actividad volvió a revisión." : "Se le pidió al PER que edite la actividad.",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "No se pudo corregir la validación." };
  }
}

/**
 * Devuelve al PER una actividad enviada o validada con un texto que indica qué falta corregir.
 * Lo pueden usar coordinación de la región y el administrador.
 */
export async function requestCorrectionAction(taskId: string, reason: string): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    return { ok: false, message: "No autorizado" };
  }
  try {
    await requestCorrection({ taskId, reason, actorId: user.id, isDemo: Boolean(user.isDemo) });
    revalidateItineraryPaths();
    return { ok: true, message: "Se la enviaste al PER con tu texto." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "No se pudo enviar la corrección." };
  }
}

export async function triggerIntermediateEvaluationAction(caseId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Adelantar la Evaluación Intermedia antes de las sesiones mínimas es una decisión de
  // coordinación, no algo que el PER deba poder autoactivarse.
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await triggerIntermediateEvaluation(caseId, user.id, user.isDemo);
    revalidateItineraryPaths();
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo habilitar la Evaluación Intermedia";
    redirect(`/coordinacion/casos?error=${encodeURIComponent(message)}`);
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
  if (!taskId || (REQUIRE_TEXT_FIELDS && !feedback)) return;

  try {
    await returnItineraryStep(taskId, user.id, user.isDemo, feedback);
    revalidateItineraryPaths();
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo devolver el instrumento";
    redirect(`/coordinacion/casos?error=${encodeURIComponent(message)}`);
  }
}
