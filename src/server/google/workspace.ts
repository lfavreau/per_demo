import "server-only";

import { prisma } from "@/lib/db";

const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
const GOOGLE_APPS_SCRIPT_SECRET = process.env.GOOGLE_APPS_SCRIPT_SECRET?.trim();
const REQUEST_TIMEOUT_MS = 20_000;

type WorkspaceMode = "demo" | "real";

function modeFromDemo(isDemo: boolean): WorkspaceMode {
  return isDemo ? "demo" : "real";
}

function createRequestId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function assertRealConfiguration() {
  if (!GOOGLE_APPS_SCRIPT_URL || !GOOGLE_APPS_SCRIPT_SECRET) {
    throw new Error(
      "Integración Google Workspace no configurada. Define GOOGLE_APPS_SCRIPT_URL y GOOGLE_APPS_SCRIPT_SECRET en Vercel."
    );
  }

  let url: URL;
  try {
    url = new URL(GOOGLE_APPS_SCRIPT_URL);
  } catch {
    throw new Error("GOOGLE_APPS_SCRIPT_URL no contiene una URL válida.");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "script.google.com" ||
    !url.pathname.endsWith("/exec")
  ) {
    throw new Error("GOOGLE_APPS_SCRIPT_URL debe ser una URL HTTPS de producción terminada en /exec.");
  }

  if (GOOGLE_APPS_SCRIPT_SECRET.length < 32) {
    throw new Error("GOOGLE_APPS_SCRIPT_SECRET debe tener al menos 32 caracteres.");
  }
}

async function callGoogleAppsScript<T>(
  action: string,
  payload: Record<string, unknown>,
  requestId = createRequestId(action)
): Promise<T> {
  assertRealConfiguration();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        apiSecret: GOOGLE_APPS_SCRIPT_SECRET,
        timestamp: new Date().toISOString(),
        requestId,
        ...payload,
      }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Apps Script respondió HTTP ${response.status}.`);
    }

    const body = (await response.json()) as {
      success?: boolean;
      data?: T;
      error?: string;
    };

    if (!body.success || body.data === undefined) {
      throw new Error(body.error || `Apps Script rechazó la acción ${action}.`);
    }

    return body.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Google Workspace no respondió dentro de ${REQUEST_TIMEOUT_MS / 1000} segundos.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertGoogleId(value: string, label: string) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(value) || value.toLowerCase().includes("mock")) {
    throw new Error(`Google devolvió un ${label} inválido.`);
  }
}

function assertGoogleUrl(value: string, allowedHosts: string[], label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Google devolvió una URL inválida para ${label}.`);
  }

  if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname)) {
    throw new Error(`Google devolvió una URL no permitida para ${label}.`);
  }
}

async function ensureSystemUser() {
  await prisma.user.upsert({
    where: { id: "SYSTEM" },
    update: {},
    create: {
      id: "SYSTEM",
      name: "Sistema Automatizado",
      email: "system@per2026.cl",
      role: "ADMIN",
      active: true,
    },
  });
}

export interface CaseFoldersResult {
  regionFolderId: string;
  perFolderId: string;
  caseFolderId: string;
  vinculacionFolderId: string;
  conexionFolderId: string;
  finalizacionFolderId: string;
  validadosFolderId: string;
  folderUrl: string;
  createdCaseFolder: boolean;
  requestId: string;
}

export interface GoogleDocResult {
  docId: string;
  docUrl: string;
  createdDocument: boolean;
  requestId: string;
}

export interface GoogleCalendarResult {
  eventId: string;
  eventUrl: string;
  createdEvent: boolean;
  requestId: string;
}

export interface VerifiedDriveFile {
  fileId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
}

export interface ValidatedCopyResult {
  newFileId: string;
  newRevisionId: string;
  fileName: string;
  fileUrl: string;
  createdCopy: boolean;
  requestId: string;
}

export async function createCaseFolder(
  caseCode: string,
  regionId: string,
  perId: string,
  isDemo: boolean
): Promise<CaseFoldersResult> {
  const mode = modeFromDemo(isDemo);
  const requestId = createRequestId("case");

  if (mode === "demo") {
    const base = `demo_${caseCode.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    return {
      regionFolderId: `${base}_region`,
      perFolderId: `${base}_per`,
      caseFolderId: `${base}_case`,
      vinculacionFolderId: `${base}_vinculacion`,
      conexionFolderId: `${base}_conexion`,
      finalizacionFolderId: `${base}_finalizacion`,
      validadosFolderId: `${base}_validados`,
      folderUrl: `https://drive.google.com/drive/folders/mock_${base}`,
      createdCaseFolder: false,
      requestId,
    };
  }

  const result = await callGoogleAppsScript<CaseFoldersResult>(
    "createCaseFolderHierarchy",
    { caseCode, regionId, perId },
    requestId
  );

  for (const [label, id] of Object.entries({
    regionFolderId: result.regionFolderId,
    perFolderId: result.perFolderId,
    caseFolderId: result.caseFolderId,
    vinculacionFolderId: result.vinculacionFolderId,
    conexionFolderId: result.conexionFolderId,
    finalizacionFolderId: result.finalizacionFolderId,
    validadosFolderId: result.validadosFolderId,
  })) {
    assertGoogleId(id, label);
  }
  assertGoogleUrl(result.folderUrl, ["drive.google.com"], "carpeta del caso");

  await ensureSystemUser();
  await prisma.auditLog.create({
    data: {
      userId: "SYSTEM",
      role: "ADMIN",
      action: "GOOGLE_DRIVE_PROVISION_CASE",
      entityType: "PACase",
      entityId: caseCode,
      newValue: JSON.stringify(result),
      reason: result.createdCaseFolder
        ? "Jerarquía real creada en Google Drive"
        : "Jerarquía real existente reutilizada de forma idempotente",
      isDemo: false,
    },
  });

  return { ...result, requestId };
}

export async function commitCaseFolder(folders: CaseFoldersResult, caseCode: string, isDemo: boolean) {
  if (isDemo) return;
  await callGoogleAppsScript(
    "commitCaseFolderHierarchy",
    {
      caseCode,
      caseFolderId: folders.caseFolderId,
      provisioningRequestId: folders.requestId,
    },
    createRequestId("commit_case")
  );
}

export async function rollbackCaseFolder(folders: CaseFoldersResult, caseCode: string, isDemo: boolean) {
  if (isDemo || !folders.createdCaseFolder) return;
  await callGoogleAppsScript(
    "rollbackCaseFolderHierarchy",
    {
      caseCode,
      caseFolderId: folders.caseFolderId,
      provisioningRequestId: folders.requestId,
    },
    createRequestId("rollback_case")
  );
}

export async function createIapDocument(
  caseCode: string,
  folderId: string,
  isDemo: boolean
): Promise<GoogleDocResult> {
  const requestId = createRequestId("iap");
  if (isDemo) {
    const base = caseCode.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    return {
      docId: `demo_iap_${base}`,
      docUrl: `https://docs.google.com/document/d/mock_demo_iap_${base}/edit`,
      createdDocument: false,
      requestId,
    };
  }

  const result = await callGoogleAppsScript<GoogleDocResult>(
    "createIAPDoc",
    { caseCode, folderId },
    requestId
  );
  assertGoogleId(result.docId, "ID del IAP");
  assertGoogleUrl(result.docUrl, ["docs.google.com", "drive.google.com"], "IAP");

  return { ...result, requestId };
}

export async function commitIapDocument(result: GoogleDocResult, isDemo: boolean) {
  if (isDemo || !result.createdDocument) return;
  await callGoogleAppsScript("commitIAPDoc", {
    fileId: result.docId,
    documentRequestId: result.requestId,
  });
}

export async function rollbackIapDocument(result: GoogleDocResult, isDemo: boolean) {
  if (isDemo || !result.createdDocument) return;
  await callGoogleAppsScript("rollbackIAPDoc", {
    fileId: result.docId,
    documentRequestId: result.requestId,
  });
}

export async function scheduleSupervisionEvent(
  perName: string,
  coordName: string,
  date: Date,
  durationMinutes: number,
  isDemo: boolean
): Promise<GoogleCalendarResult> {
  const requestId = createRequestId("supervision");

  if (isDemo) {
    return {
      eventId: `demo_event_${requestId}`,
      eventUrl: `https://calendar.google.com/calendar/event?eid=mock_${requestId}`,
      createdEvent: false,
      requestId,
    };
  }

  const result = await callGoogleAppsScript<GoogleCalendarResult>(
    "scheduleSupervision",
    {
      perName,
      coordName,
      dateStr: date.toISOString(),
      durationMinutes,
    },
    requestId
  );
  assertGoogleId(result.eventId, "ID del evento");
  assertGoogleUrl(result.eventUrl, ["calendar.google.com"], "evento de supervisión");
  return { ...result, requestId };
}

export async function rollbackSupervisionEvent(result: GoogleCalendarResult, isDemo: boolean) {
  if (isDemo || !result.createdEvent) return;
  await callGoogleAppsScript(
    "rollbackSupervision",
    {
      eventId: result.eventId,
      schedulingRequestId: result.requestId,
    },
    createRequestId("rollback_supervision")
  );
}

export async function syncMirrorSheet(
  isDemo: boolean
): Promise<{ success: boolean; rowsSynced: number }> {
  const cases = await prisma.pACase.findMany({
    where: { isDemo },
    include: { per: { include: { user: true } } },
  });

  if (isDemo) {
    return { success: true, rowsSynced: cases.length };
  }

  const formattedCases = cases.map((item) => ({
    code: item.code,
    regionId: item.regionId,
    perName: item.per.user.name,
    status: item.status,
    type: item.type,
    lastSessionDate: item.lastSessionDate?.toISOString() || null,
    createdAt: item.createdAt.toISOString(),
  }));

  const result = await callGoogleAppsScript<{ success: boolean; rowsSynced: number }>(
    "syncMirrorSheet",
    { cases: formattedCases }
  );

  if (!result.success || result.rowsSynced !== cases.length) {
    throw new Error("Google Sheets no confirmó todas las filas enviadas.");
  }

  return result;
}

export async function verifyDriveFile(
  fileId: string,
  expectedCaseFolderId: string,
  isDemo: boolean
): Promise<VerifiedDriveFile> {
  if (isDemo) {
    return {
      fileId,
      fileName: "Documento demostración",
      fileUrl: `https://drive.google.com/open?id=mock_${fileId}`,
      mimeType: "application/vnd.google-apps.document",
    };
  }

  const result = await callGoogleAppsScript<VerifiedDriveFile>("verifyDriveFile", {
    fileId,
    expectedCaseFolderId,
  });
  assertGoogleId(result.fileId, "ID del archivo");
  assertGoogleUrl(result.fileUrl, ["drive.google.com", "docs.google.com"], "archivo entregado");
  return result;
}

export async function copyActaPrimerEncuentro(
  fileId: string,
  destinationFolderId: string,
  caseCode: string,
  isDemo: boolean
): Promise<ValidatedCopyResult> {
  const requestId = createRequestId("acta_copy");
  if (isDemo) {
    return {
      newFileId: `demo_acta_${caseCode}`,
      newRevisionId: "demo",
      fileName: `${caseCode}_Acta_Primer_Encuentro`,
      fileUrl: `https://drive.google.com/open?id=mock_demo_acta_${caseCode}`,
      createdCopy: false,
      requestId,
    };
  }

  const result = await callGoogleAppsScript<ValidatedCopyResult>(
    "copyActaPrimerEncuentro",
    { fileId, destinationFolderId, caseCode },
    requestId
  );
  assertGoogleId(result.newFileId, "ID del Acta");
  assertGoogleUrl(result.fileUrl, ["drive.google.com", "docs.google.com"], "Acta");
  return { ...result, requestId };
}

export async function copyToValidadosFolder(
  fileId: string,
  destFolderId: string,
  caseCode: string,
  instrumentName: string,
  version: string,
  isDemo: boolean
): Promise<ValidatedCopyResult> {
  const requestId = createRequestId("validated_copy");
  if (isDemo) {
    const fileName = `${instrumentName}_${caseCode}_v${version}_DEMO`;
    return {
      newFileId: `demo_validated_${fileId}`,
      newRevisionId: `demo_revision_${version}`,
      fileName,
      fileUrl: `https://drive.google.com/open?id=mock_demo_validated_${fileId}`,
      createdCopy: false,
      requestId,
    };
  }

  const result = await callGoogleAppsScript<ValidatedCopyResult>(
    "copyToValidados",
    { fileId, destFolderId, caseCode, instrumentName, version },
    requestId
  );

  assertGoogleId(result.newFileId, "ID del documento validado");
  assertGoogleUrl(result.fileUrl, ["drive.google.com", "docs.google.com"], "documento validado");
  return { ...result, requestId };
}

export async function commitValidatedCopy(result: ValidatedCopyResult, isDemo: boolean) {
  if (isDemo || !result.createdCopy) return;
  await callGoogleAppsScript("commitValidatedCopy", {
    fileId: result.newFileId,
    copyRequestId: result.requestId,
  });
}

export async function rollbackValidatedCopy(result: ValidatedCopyResult, isDemo: boolean) {
  if (isDemo || !result.createdCopy) return;
  await callGoogleAppsScript("rollbackValidatedCopy", {
    fileId: result.newFileId,
    copyRequestId: result.requestId,
  });
}
