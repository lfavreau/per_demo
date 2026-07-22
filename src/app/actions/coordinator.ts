"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function isNextRedirect(err: any): boolean {
  return err && (err.message === "NEXT_REDIRECT" || (typeof err.digest === "string" && err.digest.startsWith("NEXT_REDIRECT")));
}
import { createCaseFromCandidate, validateMatch, formalizeMatch, transitionCaseStatus } from "@/server/services/cases.service";
import { updateTaskStatus } from "@/server/services/tasks.service";
import { validateSession, returnSession } from "@/server/services/sessions.service";
import { resolveAlert, checkAllAlertRules } from "@/server/services/alerts.service";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotificationWithPush } from "@/server/services/push.service";

export async function createCaseAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const candidateId = formData.get("candidateId") as string;
  const perId = formData.get("perId") as string;
  const matchRationale = formData.get("matchRationale") as string;
  const type = formData.get("type") as "NUEVO" | "CONTINUIDAD";

  if (!candidateId || !perId || !matchRationale || !type) {
    return;
  }

  try {
    await createCaseFromCandidate(candidateId, perId, matchRationale, type, user.id);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err: any) {
    console.error("Error creating case:", err);
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
    await validateSession(sessionId, user.id);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err: any) {
    console.error("Error validating session:", err);
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

  if (!sessionId || !feedback) {
    return;
  }

  try {
    await returnSession(sessionId, feedback, user.id);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err: any) {
    console.error("Error returning session:", err);
  }
}

export async function validateTaskAction(taskId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await updateTaskStatus({
      taskId,
      toStatus: "VALIDADA",
      actorId: user.id,
    });
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err: any) {
    console.error("Error validating task:", err);
  }
}

export async function returnTaskAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const taskId = formData.get("taskId") as string;
  const feedback = formData.get("feedback") as string;

  if (!taskId || !feedback) {
    return;
  }

  try {
    await updateTaskStatus({
      taskId,
      toStatus: "DEVUELTA",
      note: feedback,
      actorId: user.id,
    });
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err: any) {
    console.error("Error returning task:", err);
  }
}

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

  if (!alertId || !note) {
    return;
  }

  try {
    await resolveAlert(alertId, note, user.id);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err: any) {
    console.error("Error resolving alert:", err);
  }
}

export async function triggerAlertRulesAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await checkAllAlertRules();
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err: any) {
    console.error("Error triggering alert rules:", err);
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
  const formUrl = formData.get("formUrl") as string;

  if (!caseId || !toStatus) {
    throw new Error("Faltan datos obligatorios");
  }

  let finalReason = reason;
  if (formUrl) {
    finalReason = `${reason || "Retiro registrado"}. Link formulario: ${formUrl}`;
  }

  // Fetch the case code so we can keep the case selected in the UI on redirect
  const paCase = await prisma.pACase.findUnique({
    where: { id: caseId },
    select: { code: true }
  });
  const caseCode = paCase?.code || "";

  try {
    await transitionCaseStatus(caseId, toStatus, finalReason, user.id);
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

  if (!perId || !matchRationale || !gender || !ageRange || !educationLevel || !employmentStatus) {
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
      user.id
    );
    revalidatePath("/coordinacion");
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
    },
  });

  await prisma.reportSnapshot.create({
    data: {
      periodKey,
      regionId: regFilter,
      cutOffDate: new Date(cutOffDateStr),
      kpisJson,
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

  if (!perId || !dateStr || !durationMinutesStr || !topic) {
    throw new Error("Todos los campos son obligatorios");
  }

  const { scheduleSupervisionEvent } = await import("@/server/google/workspace");
  const per = await prisma.pERProfile.findUnique({
    where: { id: perId },
    include: { user: true },
  });
  if (!per) throw new Error("PER no encontrado");

  const date = new Date(dateStr);
  const calendarResult = await scheduleSupervisionEvent(per.user.name, user.name || "Coordinador", date);

  const regionId = user.regionId || per.regionId;

  const supervision = await prisma.supervision.create({
    data: {
      coordinatorId: user.id,
      perId,
      regionId,
      date,
      durationMinutes: parseInt(durationMinutesStr, 10),
      observations: topic,
      modality: "MEET",
      status: "REALIZADA",
      casesReviewedSerialized: "[]",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      role: "COORDINATOR",
      action: "LOG_SUPERVISION",
      entityType: "Supervision",
      entityId: perId,
      newValue: JSON.stringify({ perId, dateStr, durationMinutesStr, topic, calendarResult }),
    },
  });

  await createNotificationWithPush({
    userId: per.userId,
    title: "Nueva Reunión de Supervisión",
    message: `Tu coordinador técnico regional agendó una reunión de supervisión: "${topic}" para el ${date.toLocaleDateString("es-CL")}.`,
    link: `/per?highlightSupervisionId=${supervision.id}`,
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

  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const contactPerson = formData.get("contactPerson") as string;

  if (!name || !type) {
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
    },
  });

  revalidatePath("/coordinacion/redes");
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

  if (!networkDeviceId || !dateStr || !description) {
    throw new Error("El dispositivo, fecha y descripción son obligatorios");
  }

  await prisma.networkActivation.create({
    data: {
      caseId: caseId || null,
      networkDeviceId,
      date: new Date(dateStr),
      description,
      driveDocId,
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

  if (!type || !dateStr || !participantsCountStr || !driveUrl) {
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
    },
  });

  revalidatePath("/coordinacion/redes");
}

export async function updatePerStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  const perId = formData.get("perId") as string;
  const toStatus = formData.get("status") as string;

  if (!perId || !toStatus) {
    throw new Error("Faltan datos obligatorios");
  }

  await prisma.pERProfile.update({
    where: { id: perId },
    data: {
      certificationStatus: toStatus,
      certifiedByUserId: user.id,
      certifiedAt: toStatus === "HABILITADO" ? new Date() : null,
    },
  });

  revalidatePath("/coordinacion/supervisiones");
  revalidatePath("/coordinacion/candidatas");
  revalidatePath("/admin");
}
