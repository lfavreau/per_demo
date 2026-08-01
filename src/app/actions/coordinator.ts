"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isNextRedirect } from "@/lib/next-errors";
import { createCaseFromCandidate, validateMatch, formalizeMatch, transitionCaseStatus } from "@/server/services/cases.service";
import { updateTaskStatus } from "@/server/services/tasks.service";
import { validateSession, returnSession } from "@/server/services/sessions.service";
import { resolveAlert, checkAllAlertRules } from "@/server/services/alerts.service";
import { ensureWithdrawalStep } from "@/server/services/itinerary.service";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotificationWithPush } from "@/server/services/push.service";
import { extractGoogleDriveFileId } from "@/lib/google-resource";

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
    const newCase = await createCaseFromCandidate(candidateId, perId, matchRationale, type, user.id, user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/coordinacion/casos");
    revalidatePath("/coordinacion/candidatas");
    revalidatePath("/per");
    revalidatePath("/admin");
    redirect(`/coordinacion/casos?caseCode=${encodeURIComponent(newCase.code)}&highlightCaseId=${newCase.id}`);
  } catch (err: any) {
    if (isNextRedirect(err)) throw err;
    console.error("Error creating case:", err);
    redirect(`/coordinacion/candidatas?error=${encodeURIComponent(err.message || "Error al crear caso")}`);
  }
}

export async function validateMatchAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    throw new Error("No autorizado");
  }

  const caseId = String(formData.get("caseId") || "");
  const caseCode = String(formData.get("caseCode") || "");
  try {
    await validateMatch(caseId, user.id, user.isDemo);
    revalidatePath("/coordinacion/casos");
    redirect(`/coordinacion/casos?caseCode=${encodeURIComponent(caseCode)}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo validar la dupla";
    redirect(`/coordinacion/casos?caseCode=${encodeURIComponent(caseCode)}&error=${encodeURIComponent(message)}`);
  }
}

export async function formalizeMatchAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    throw new Error("No autorizado");
  }

  const caseId = String(formData.get("caseId") || "");
  const caseCode = String(formData.get("caseCode") || "");
  const actaInput = String(formData.get("actaPrimerEncuentro") || "");

  try {
    const extracted = extractGoogleDriveFileId(actaInput);
    const actaFileId = user.isDemo
      ? actaInput || `demo_acta_${caseCode}`
      : extracted || `auto_acta_${caseCode}`;
    await formalizeMatch(caseId, actaFileId, user.id, user.isDemo);
    revalidatePath("/coordinacion/casos");
    revalidatePath("/per");
    redirect(`/coordinacion/casos?caseCode=${encodeURIComponent(caseCode)}&workspace=created`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = error instanceof Error ? error.message : "No se pudo formalizar la dupla";
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
    redirect(`/coordinacion/sesiones?error=${encodeURIComponent(message)}`);
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
    await returnSession(sessionId, feedback, user.id, user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo devolver el Registro de Acompañamiento";
    redirect(`/coordinacion/sesiones?error=${encodeURIComponent(message)}`);
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
      isDemo: user.isDemo,
    });
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo validar la tarea";
    redirect(`/coordinacion/alertas?error=${encodeURIComponent(message)}`);
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
      isDemo: user.isDemo,
    });
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo devolver la tarea";
    redirect(`/coordinacion/alertas?error=${encodeURIComponent(message)}`);
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
    await resolveAlert(alertId, note, user.id, user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo resolver la alerta";
    redirect(`/coordinacion/alertas?error=${encodeURIComponent(message)}`);
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
    await checkAllAlertRules(user.isDemo);
    revalidatePath("/coordinacion");
    revalidatePath("/admin");
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudieron ejecutar las reglas de alerta";
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
  const forceDesertion = formData.get("forceDesertion") === "on";

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
    await transitionCaseStatus(caseId, toStatus, reason, user.id, user.isDemo, forceAdvance, forceDesertion);
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
  const actaInput = String(formData.get("actaPrimerEncuentro") || "");

  if (!perId || !matchRationale || !gender || !ageRange || !educationLevel || !employmentStatus) {
    throw new Error("Faltan campos obligatorios para el ingreso directo");
  }

  const regionId = user.regionId || (formData.get("regionId") as string);
  if (!regionId) {
    throw new Error("Región no especificada");
  }

  try {
    const extracted = extractGoogleDriveFileId(actaInput);
    const actaFileId = user.isDemo
      ? actaInput || "demo_acta_continuidad"
      : extracted || "auto_acta_continuidad";
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
      user.isDemo,
      actaFileId
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

  if (!perId || !dateStr || !durationMinutesStr || !topic) {
    throw new Error("Todos los campos son obligatorios");
  }

  const { rollbackSupervisionEvent, scheduleSupervisionEvent } = await import("@/server/google/workspace");
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
  const calendarResult = await scheduleSupervisionEvent(
    per.user.name,
    user.name || "Coordinador",
    date,
    durationMinutes,
    user.isDemo
  );

  const regionId = user.regionId || per.regionId;

  let supervision;
  try {
    supervision = await prisma.$transaction(async (tx) => {
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
          calendarEventId: calendarResult.eventId,
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
          newValue: JSON.stringify({ perId, dateStr, durationMinutes, topic, calendarResult }),
          isDemo: user.isDemo,
        },
      });
      return created;
    });
  } catch (error) {
    await rollbackSupervisionEvent(calendarResult, user.isDemo).catch((rollbackError) => {
      console.error("No se pudo revertir el evento de Calendar:", rollbackError);
    });
    throw error;
  }

  await createNotificationWithPush({
    userId: per.userId,
    title: "Nueva Reunión de Supervisión",
    message: `Tu coordinador técnico regional agendó una reunión de supervisión: "${topic}" para el ${date.toLocaleDateString("es-CL")}.`,
    link: `/per?highlightSupervisionId=${supervision.id}`,
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
      isDemo: user.isDemo,
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
      isDemo: user.isDemo,
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
  if (!["HABILITADO", "PENDIENTE", "NO_HABILITADO"].includes(toStatus)) {
    throw new Error("Estado de certificación inválido");
  }

  const profile = await prisma.pERProfile.findUnique({
    where: { id: perId },
    include: { user: true },
  });
  if (!profile) throw new Error("PER no encontrado");

  // Mismo control regional que el resto de operaciones de coordinación
  if (user.role !== "ADMIN" && user.regionId !== profile.regionId) {
    throw new Error("No autorizado para operar acompañantes de esta región");
  }
  // La habilitación no puede cruzar modos: un coordinador en sesión demo no
  // debe alterar el estado de un PER real, ni al revés.
  if (Boolean(profile.user.isDemo) !== Boolean(user.isDemo)) {
    throw new Error("El acompañante no pertenece al modo de trabajo actual");
  }

  await prisma.$transaction(async (tx) => {
    await tx.pERProfile.update({
      where: { id: perId },
      data: {
        certificationStatus: toStatus,
        certifiedByUserId: user.id,
        certifiedAt: toStatus === "HABILITADO" ? new Date() : null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: toStatus === "HABILITADO" ? "HABILITACION_PER" : "SUSPENSION_PER",
        entityType: "PERProfile",
        entityId: perId,
        previousValue: profile.certificationStatus,
        newValue: toStatus,
        isDemo: Boolean(user.isDemo),
      },
    });
  });

  revalidatePath("/coordinacion/supervisiones");
  revalidatePath("/coordinacion/candidatas");
  revalidatePath("/admin");
}

export async function createCandidateAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COORDINATOR" && user.role !== "ADMIN")) {
    throw new Error("No autorizado");
  }

  const sourceCenter = (formData.get("sourceCenter") as string) || "Derivación Directa";
  const status = (formData.get("status") as string) || "SELECCIONADA";
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

