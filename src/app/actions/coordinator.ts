"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isNextRedirect } from "@/lib/next-errors";
import { createCaseFromCandidate, deletePersona, reassignCase, transitionCaseStatus } from "@/server/services/cases.service";
import { validateSession, returnSession } from "@/server/services/sessions.service";
import { resolveAlert } from "@/server/services/alerts.service";
import { ensureWithdrawalStep } from "@/server/services/itinerary.service";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotificationWithPush } from "@/server/services/push.service";
import { REQUIRE_TEXT_FIELDS } from "@/lib/program-config";
import { CASE_ALIAS_MAX_LENGTH, normalizeCaseAlias } from "@/lib/nomenclatures";

export interface ActionResult {
  status: "idle" | "success" | "error";
  message: string;
}

/**
 * Asigna un PER a una persona acompañada. No redirige: devuelve el resultado para mostrarlo en la
 * misma pantalla. El caso y el itinerario del PER quedan listos de inmediato.
 */
export async function assignPerAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    return { status: "error", message: "No autorizado" };
  }

  const candidateId = String(formData.get("candidateId") || "");
  const perId = String(formData.get("perId") || "");
  if (!candidateId || !perId) {
    return { status: "error", message: "Selecciona la persona y el PER." };
  }

  const candidate = await prisma.pACandidate.findUnique({
    where: { id: candidateId },
    select: { status: true, convertedToCaseId: true },
  });
  if (candidate?.convertedToCaseId) {
    return { status: "error", message: "Esta persona ya tiene un PER asignado." };
  }
  if (candidate && candidate.status !== "SELECCIONADA") {
    return { status: "error", message: "Solo se puede asignar PER a personas en estado Seleccionada." };
  }

  try {
    // El tipo (nuevo / continuidad) y la fundamentación no se piden: el caso queda como NUEVO.
    const newCase = await createCaseFromCandidate(candidateId, perId, "", "NUEVO", user.id, user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/coordinacion/casos");
    revalidatePath("/coordinacion/candidatas");
    revalidatePath("/per");
    revalidatePath("/admin");
    return { status: "success", message: `PER asignado. Caso ${newCase.code} creado.` };
  } catch (err: any) {
    console.error("Error creating case:", err);
    return { status: "error", message: err.message || "No se pudo asignar el PER." };
  }
}

export async function reassignCaseAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    throw new Error("No autorizado");
  }

  const caseId = String(formData.get("caseId") || "");
  const caseCode = String(formData.get("caseCode") || "");
  const newPerId = String(formData.get("newPerId") || "");
  const reason = String(formData.get("reason") || "");

  try {
    await reassignCase(caseId, newPerId, reason, user.id, user.isDemo);
    revalidatePath("/coordinacion/casos");
    revalidatePath("/coordinacion/candidatas");
    revalidatePath("/coordinacion/supervisiones");
    revalidatePath("/per", "layout");
    redirect(`/coordinacion/casos?caseCode=${encodeURIComponent(caseCode)}&highlightCaseId=${encodeURIComponent(caseId)}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo reasignar el caso";
    redirect(`/coordinacion/casos?caseCode=${encodeURIComponent(caseCode)}&error=${encodeURIComponent(message)}`);
  }
}

export async function validateSessionAction(sessionId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await validateSession(sessionId, user.id, user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo validar el Registro de Acompañamiento";
    redirect(`/coordinacion/alertas?error=${encodeURIComponent(message)}`);
  }
}

export async function returnSessionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const sessionId = formData.get("sessionId") as string;
  const feedback = formData.get("feedback") as string;

  if (!sessionId || (REQUIRE_TEXT_FIELDS && !feedback)) {
    return;
  }

  try {
    await returnSession(sessionId, feedback, user.id, user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo devolver el Registro de Acompañamiento";
    redirect(`/coordinacion/alertas?error=${encodeURIComponent(message)}`);
  }
}

// La validación/devolución de hitos del itinerario se hace vía validateItineraryStepAction /
// returnItineraryStepAction (src/app/actions/itinerary.ts) — esas además desbloquean el
// siguiente paso del itinerario (ensureCurrentStageTasks), cosa que estas dos no hacían.

export async function resolveAlertAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const alertId = formData.get("alertId") as string;
  const note = formData.get("note") as string;

  if (!alertId || (REQUIRE_TEXT_FIELDS && !note)) {
    return;
  }

  try {
    await resolveAlert(alertId, note, user.id, user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo resolver la alerta";
    redirect(`/coordinacion?error=${encodeURIComponent(message)}`);
  }
}

export async function transitionCaseStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const caseId = formData.get("caseId") as string;
  const toStatus = formData.get("toStatus") as string;
  const reason = formData.get("reason") as string;
  const forceAdvance = formData.get("forceAdvance") === "on";

  if (!caseId || !toStatus) {
    throw new Error("Faltan datos obligatorios");
  }

  // Fetch the case code so we can keep the case selected in the UI on redirect
  const paCase = await prisma.pACase.findUnique({
    where: { id: caseId },
    select: { code: true }
  });
  const caseCode = paCase?.code || "";

  try {
    await transitionCaseStatus(caseId, toStatus, reason, user.id, user.isDemo, forceAdvance);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
    redirect(`/coordinacion/casos?caseCode=${caseCode}`);
  } catch (err: any) {
    if (isNextRedirect(err)) {
      throw err;
    }
    console.error("Error transitioning case status:", err.message);
    redirect(`/coordinacion/casos?caseCode=${caseCode}&error=${encodeURIComponent(err.message)}`);
  }
}

export async function ensureWithdrawalStepAction(caseId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await ensureWithdrawalStep(caseId, "PA", user.id, user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/per", "layout");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo iniciar el formulario de abandono";
    redirect(`/coordinacion/casos?error=${encodeURIComponent(message)}`);
  }
}

export async function createDirectContinuityCaseAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const perId = formData.get("perId") as string;
  const matchRationale = formData.get("matchRationale") as string;
  const gender = formData.get("gender") as string;
  const ageRange = formData.get("ageRange") as string;
  const educationLevel = formData.get("educationLevel") as string;
  const employmentStatus = formData.get("employmentStatus") as string;

  if (!perId || !gender || !ageRange || !educationLevel || !employmentStatus || (REQUIRE_TEXT_FIELDS && !matchRationale)) {
    throw new Error("Faltan campos obligatorios para el ingreso directo");
  }

  const regionId = user.regionId || (formData.get("regionId") as string);
  if (!regionId) {
    throw new Error("Región no especificada");
  }

  try {
    const { createDirectContinuityCase } = await import("@/server/services/cases.service");
    const paCase = await createDirectContinuityCase(
      perId,
      matchRationale,
      regionId,
      gender,
      ageRange,
      educationLevel,
      employmentStatus,
      user.id,
      user.isDemo
    );
    revalidatePath("/coordinacion");
    revalidatePath("/coordinacion/casos");
    revalidatePath("/coordinacion/candidatas");
    revalidatePath("/per");
    revalidatePath("/admin");
    redirect(`/coordinacion/casos?caseCode=${paCase.code}`);
  } catch (err: any) {
    if (isNextRedirect(err)) {
      throw err;
    }
    console.error("Error creating direct continuity case:", err.message);
    redirect(`/coordinacion/casos?error=${encodeURIComponent(err.message)}`);
  }
}

export async function freezeSnapshotAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Solo administradores pueden congelar snapshots oficiales de informes.");
  }

  const periodKey = formData.get("periodKey") as string;
  const regionId = formData.get("regionId") as string;
  const kpisJson = formData.get("kpisJson") as string;
  const cutOffDateStr = formData.get("cutOffDate") as string;

  if (!periodKey || !kpisJson || !cutOffDateStr) {
    throw new Error("Faltan datos obligatorios");
  }

  const regFilter = regionId === "NACIONAL" ? null : regionId;
  await prisma.reportSnapshot.deleteMany({
    where: {
      periodKey,
      regionId: regFilter,
      isDemo: user.isDemo,
    },
  });

  await prisma.reportSnapshot.create({
    data: {
      periodKey,
      regionId: regFilter,
      cutOffDate: new Date(cutOffDateStr),
      kpisJson,
      isDemo: user.isDemo,
    },
  });

  // Notify regional coordinators and admins
  const usersToNotify = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "COORDINATOR"] },
      OR: [
        { regionId: regFilter },
        { role: "ADMIN" }
      ]
    }
  });

  await Promise.all(
    usersToNotify.map(u =>
      createNotificationWithPush({
        userId: u.id,
        title: "Reporte Oficial Congelado",
        message: `Se ha congelado el reporte oficial para el período ${periodKey} (${regionId}).`,
        link: `/admin/reportes`,
        isDemo: user.isDemo,
      })
    )
  );

  revalidatePath("/admin/reportes");
}

export async function logSupervisionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const perId = formData.get("perId") as string;
  const dateStr = formData.get("date") as string;
  const durationMinutesStr = formData.get("durationMinutes") as string;
  const topic = formData.get("topic") as string;

  if (!perId || !dateStr || !durationMinutesStr || (REQUIRE_TEXT_FIELDS && !topic)) {
    throw new Error("Todos los campos son obligatorios");
  }

  const per = await prisma.pERProfile.findUnique({
    where: { id: perId },
    include: { user: true },
  });
  if (!per) throw new Error("PER no encontrado");

  const date = new Date(dateStr);
  const durationMinutes = parseInt(durationMinutesStr, 10);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(durationMinutes)) {
    throw new Error("Fecha o duración inválida");
  }
  const regionId = user.regionId || per.regionId;

  const supervision = await prisma.$transaction(async (tx) => {
    const created = await tx.supervision.create({
      data: {
        coordinatorId: user.id,
        perId,
        regionId,
        date,
        durationMinutes,
        observations: topic,
        modality: "MEET",
        status: "AGENDADA",
        casesReviewedSerialized: "[]",
        isDemo: user.isDemo,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: "COORDINATOR",
        action: "SCHEDULE_SUPERVISION",
        entityType: "Supervision",
        entityId: created.id,
        newValue: JSON.stringify({ perId, dateStr, durationMinutes }),
        isDemo: user.isDemo,
      },
    });
    return created;
  });

  await createNotificationWithPush({
    userId: per.userId,
    title: "Nueva Reunión de Supervisión",
    message: `Tu coordinador técnico regional agendó una reunión de supervisión: "${topic}" para el ${date.toLocaleDateString("es-CL")}.`,
    link: `/per/avisos?highlightSupervisionId=${supervision.id}`,
    isDemo: user.isDemo,
  });

  revalidatePath("/coordinacion/supervisiones");
}

export async function registerNetworkDeviceAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string;
  const contactPerson = formData.get("contactPerson") as string;

  if (!type || (REQUIRE_TEXT_FIELDS && !name)) {
    throw new Error("El nombre y el tipo de dispositivo son obligatorios");
  }

  const regionId = user.regionId || (formData.get("regionId") as string);
  if (!regionId) {
    throw new Error("Región no especificada");
  }

  await prisma.networkDevice.create({
    data: {
      name,
      type,
      contactPerson,
      regionId,
      isDemo: user.isDemo,
    },
  });

  revalidatePath("/coordinacion/redes");
  revalidatePath("/admin/redes");
}

export async function logNetworkActivationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const caseId = formData.get("caseId") as string;
  const networkDeviceId = formData.get("networkDeviceId") as string;
  const dateStr = formData.get("date") as string;
  const description = formData.get("description") as string;
  const driveDocId = formData.get("driveDocId") as string;

  if (!networkDeviceId || !dateStr || (REQUIRE_TEXT_FIELDS && !description)) {
    throw new Error("El dispositivo, fecha y descripción son obligatorios");
  }

  const device = await prisma.networkDevice.findUnique({ where: { id: networkDeviceId } });
  if (!device || device.isDemo !== user.isDemo) {
    throw new Error("El dispositivo no pertenece al modo de trabajo actual");
  }
  if (caseId) {
    const paCase = await prisma.pACase.findUnique({ where: { id: caseId } });
    if (!paCase || paCase.isDemo !== user.isDemo || paCase.regionId !== device.regionId) {
      throw new Error("El caso no pertenece al modo o región del dispositivo");
    }
  }

  await prisma.networkActivation.create({
    data: {
      caseId: caseId || null,
      networkDeviceId,
      date: new Date(dateStr),
      description,
      driveDocId,
      isDemo: user.isDemo,
    },
  });

  revalidatePath("/coordinacion/redes");
  revalidatePath("/admin/reportes");
}

export async function registerPhase5RecordAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const type = formData.get("type") as string;
  const dateStr = formData.get("date") as string;
  const participantsCountStr = formData.get("participantsCount") as string;
  const driveUrl = formData.get("driveUrl") as string;
  const notes = formData.get("notes") as string;

  if (!type || !dateStr || !participantsCountStr || (REQUIRE_TEXT_FIELDS && !driveUrl)) {
    throw new Error("Tipo, fecha, cantidad de participantes y URL son obligatorios");
  }

  const regionId = user.regionId || (formData.get("regionId") as string);
  if (!regionId) {
    throw new Error("Región no especificada");
  }

  await prisma.phase5Record.create({
    data: {
      type,
      regionId,
      date: new Date(dateStr),
      participantsCount: parseInt(participantsCountStr, 10),
      driveUrl,
      notes,
      isDemo: user.isDemo,
    },
  });

  revalidatePath("/coordinacion/redes");
}

export async function createCandidateAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    throw new Error("No autorizado");
  }

  // sourceCenter guarda el nombre o alias de la persona acompañada (es lo que se muestra en la app).
  const sourceCenter = String(formData.get("sourceCenter") || "").trim().slice(0, CASE_ALIAS_MAX_LENGTH) || "Sin nombre";
  const status = String(formData.get("status") || "SELECCIONADA");
  if (!INTAKE_STATUSES.includes(status)) {
    throw new Error("Estado de ingreso inválido");
  }
  const notes = (formData.get("notes") as string) || "";
  const gender = (formData.get("gender") as string) || null;
  const ageRange = (formData.get("ageRange") as string) || null;

  const regionId = user.regionId || (formData.get("regionId") as string);
  if (!regionId) {
    throw new Error("Región no especificada");
  }

  await prisma.pACandidate.create({
    data: {
      regionId,
      sourceCenter,
      status,
      notes,
      gender,
      ageRange,
      isDemo: Boolean(user.isDemo),
    },
  });

  revalidatePath("/coordinacion/candidatas");
  revalidatePath("/coordinacion");
}

// Estado de ingreso: solo "Seleccionada" (se le puede asignar PER) o "Lista de espera".
// Los estados anteriores (Derivada, Admisible, etc.) pueden seguir en datos antiguos, pero ya no se ofrecen.
const INTAKE_STATUSES = ["SELECCIONADA", "EN_ESPERA"];
const CANDIDATE_STATUSES = INTAKE_STATUSES;

/** Borra una persona acompañada (y su caso, si lo tiene). No pide contraseña; con caso exige escribir su código. */
export async function deletePersonaAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    return { status: "error", message: "No autorizado" };
  }
  const candidateId = String(formData.get("candidateId") || "");
  if (!candidateId) return { status: "error", message: "Persona no encontrada." };

  try {
    const result = await deletePersona(candidateId, user.id, Boolean(user.isDemo), String(formData.get("confirmCode") || ""));
    revalidatePath("/coordinacion/candidatas");
    revalidatePath("/coordinacion/casos");
    revalidatePath("/coordinacion");
    revalidatePath("/per", "layout");
    revalidatePath("/admin");
    return {
      status: "success",
      message: result.deletedCases ? `Persona y caso eliminados (${result.deletedTasks} tareas).` : "Persona eliminada.",
    };
  } catch (err: any) {
    return { status: "error", message: err.message || "No se pudo eliminar." };
  }
}

/**
 * Edita una persona acompañada: nombre o alias, notas y (si aún no tiene PER) estado de ingreso.
 * No pide contraseña. Si ya tiene caso, el alias del caso sigue al nombre o alias de la persona.
 * La auditoría no guarda el texto del nombre o alias (privacidad).
 */
export async function updatePersonaAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    return { status: "error", message: "No autorizado" };
  }

  const candidateId = String(formData.get("candidateId") || "");
  const candidate = candidateId ? await prisma.pACandidate.findUnique({ where: { id: candidateId } }) : null;
  if (!candidate) return { status: "error", message: "Persona no encontrada." };
  if (user.role !== "ADMIN" && candidate.regionId !== user.regionId) {
    return { status: "error", message: "No autorizado para operar la nómina de esta región." };
  }
  if (Boolean(candidate.isDemo) !== Boolean(user.isDemo)) {
    return { status: "error", message: "La persona no pertenece al modo de trabajo actual." };
  }

  const name = String(formData.get("sourceCenter") || "").trim().slice(0, CASE_ALIAS_MAX_LENGTH);
  if (REQUIRE_TEXT_FIELDS && !name) return { status: "error", message: "Ingresa el nombre o alias." };
  const sourceCenter = name || "Sin nombre";
  const notes = String(formData.get("notes") || "");

  const data: { sourceCenter: string; notes: string; status?: string } = { sourceCenter, notes };
  const requestedStatus = formData.get("status");
  if (!candidate.convertedToCaseId && requestedStatus != null) {
    const status = String(requestedStatus);
    if (!INTAKE_STATUSES.includes(status)) return { status: "error", message: "Estado de ingreso inválido." };
    data.status = status;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pACandidate.update({ where: { id: candidateId }, data });
      if (candidate.convertedToCaseId) {
        await tx.pACase.update({
          where: { id: candidate.convertedToCaseId },
          data: { alias: normalizeCaseAlias(sourceCenter) },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: "UPDATE_CANDIDATE",
          entityType: "PACandidate",
          entityId: candidateId,
          previousValue: candidate.status,
          newValue: data.status ?? candidate.status,
          isDemo: Boolean(user.isDemo),
        },
      });
    });
  } catch (err: any) {
    console.error("Error updating persona:", err);
    return { status: "error", message: err.message || "No se pudo guardar." };
  }

  revalidatePath("/coordinacion/candidatas");
  revalidatePath("/coordinacion/casos");
  revalidatePath("/coordinacion");
  revalidatePath("/per", "layout");
  return { status: "success", message: "Cambios guardados." };
}

export async function updateCandidateStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    throw new Error("No autorizado");
  }

  const candidateId = String(formData.get("candidateId") || "");
  const status = String(formData.get("status") || "");

  if (!candidateId || !CANDIDATE_STATUSES.includes(status)) {
    throw new Error("Estado de nómina inválido");
  }

  const candidate = await prisma.pACandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new Error("Persona no encontrada en la nómina");
  if (user.role !== "ADMIN" && candidate.regionId !== user.regionId) {
    throw new Error("No autorizado para operar la nómina de esta región");
  }
  if (Boolean(candidate.isDemo) !== Boolean(user.isDemo)) {
    throw new Error("La persona no pertenece al modo de trabajo actual");
  }
  if (candidate.convertedToCaseId) {
    throw new Error("Ya fue convertida a un acompañamiento; el estado se administra desde el caso");
  }

  await prisma.$transaction(async (tx) => {
    await tx.pACandidate.update({ where: { id: candidateId }, data: { status } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: "UPDATE_CANDIDATE_STATUS",
        entityType: "PACandidate",
        entityId: candidateId,
        previousValue: candidate.status,
        newValue: status,
        isDemo: Boolean(user.isDemo),
      },
    });
  });

  revalidatePath("/coordinacion/candidatas");
  revalidatePath("/coordinacion");
}

