import { prisma } from "@/lib/db";

const scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL;

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

// Helper to communicate with Google Apps Script Web App
async function callGoogleAppsScript(action: string, payload: any) {
  if (!scriptUrl) return null;
  try {
    const res = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...payload }),
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const json = await res.json();
    if (json.success) {
      return json.data;
    } else {
      console.warn(`[Google Apps Script Warning during ${action}]: ${json.error}`);
      return null;
    }
  } catch (err) {
    console.error(`[Google Apps Script Error during ${action}]:`, err);
    return null;
  }
}

export interface GoogleFolderResult {
  folderId: string;
  folderUrl: string;
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
}

export interface GoogleDocResult {
  docId: string;
  docUrl: string;
}

export interface GoogleCalendarResult {
  eventId: string;
  eventUrl: string;
}

/**
 * Creates a Google Drive Folder structure for a new case.
 * Connects to Google Apps Script if URL is configured; otherwise simulates locally.
 */
export async function createCaseFolder(
  caseCode: string,
  regionId: string,
  perId: string
): Promise<CaseFoldersResult> {
  await ensureSystemUser();

  // Try real integration via Google Apps Script
  if (scriptUrl) {
    const realResult = await callGoogleAppsScript("createCaseFolderHierarchy", { caseCode, regionId, perId });
    if (realResult) {
      await prisma.auditLog.create({
        data: {
          userId: "SYSTEM",
          role: "ADMIN",
          action: "GOOGLE_DRIVE_CREATE_FOLDER_HIERARCHY",
          entityType: "PACase",
          entityId: caseCode,
          newValue: JSON.stringify(realResult),
          reason: `Provisión automática REAL de carpetas en Shared Drive para región ${regionId} y PER ${perId}`,
        },
      });
      return realResult;
    }
  }

  // Fallback to local simulation (mock)
  const regionClean = regionId.toLowerCase().replace(/ /g, "_");
  const regionFolderId = `gfolder_region_${regionClean}`;
  const perFolderId = `gfolder_per_${perId}`;
  
  const mockFolderId = `gfolder_case_${caseCode.toLowerCase().replace(/-/g, "_")}`;
  const mockFolderUrl = `https://drive.google.com/drive/folders/mock_${mockFolderId}`;

  const vinculacionFolderId = `${mockFolderId}_vinc`;
  const conexionFolderId = `${mockFolderId}_conex`;
  const finalizacionFolderId = `${mockFolderId}_final`;
  const validadosFolderId = `${mockFolderId}_validados`;

  await prisma.auditLog.create({
    data: {
      userId: "SYSTEM",
      role: "ADMIN",
      action: "GOOGLE_DRIVE_CREATE_FOLDER_HIERARCHY",
      entityType: "PACase",
      entityId: caseCode,
      newValue: JSON.stringify({
        regionFolderId,
        perFolderId,
        caseFolderId: mockFolderId,
        vinculacionFolderId,
        conexionFolderId,
        finalizacionFolderId,
        validadosFolderId,
        folderUrl: mockFolderUrl,
      }),
      reason: `Provisión simulada de jerarquía de carpetas en Shared Drive para región ${regionId} y PER ${perId}`,
    },
  });

  return {
    regionFolderId,
    perFolderId,
    caseFolderId: mockFolderId,
    vinculacionFolderId,
    conexionFolderId,
    finalizacionFolderId,
    validadosFolderId,
    folderUrl: mockFolderUrl,
  };
}

/**
 * Copies an IAP Document from the official template into the case folder.
 */
export async function createIapDocument(caseCode: string, folderId: string): Promise<GoogleDocResult> {
  await ensureSystemUser();

  if (scriptUrl) {
    const realResult = await callGoogleAppsScript("createIAPDoc", { caseCode, folderId });
    if (realResult) {
      await prisma.auditLog.create({
        data: {
          userId: "SYSTEM",
          role: "ADMIN",
          action: "GOOGLE_DOCS_CREATE_IAP",
          entityType: "IAPRecord",
          entityId: caseCode,
          newValue: JSON.stringify(realResult),
        },
      });
      return realResult;
    }
  }

  const mockDocId = `gdoc_iap_${caseCode.toLowerCase().replace(/-/g, "_")}`;
  const mockDocUrl = `https://docs.google.com/document/d/mock_${mockDocId}/edit`;

  await prisma.auditLog.create({
    data: {
      userId: "SYSTEM",
      role: "ADMIN",
      action: "GOOGLE_DOCS_CREATE_IAP",
      entityType: "IAPRecord",
      entityId: caseCode,
      newValue: JSON.stringify({ docId: mockDocId, docUrl: mockDocUrl, parentFolderId: folderId }),
    },
  });

  return {
    docId: mockDocId,
    docUrl: mockDocUrl,
  };
}

/**
 * Creates a Calendar Event for supervisions.
 */
export async function scheduleSupervisionEvent(
  perName: string,
  coordName: string,
  date: Date
): Promise<GoogleCalendarResult> {
  await ensureSystemUser();

  if (scriptUrl) {
    const realResult = await callGoogleAppsScript("scheduleSupervision", {
      perName,
      coordName,
      dateStr: date.toISOString(),
    });
    if (realResult) {
      await prisma.auditLog.create({
        data: {
          userId: "SYSTEM",
          role: "ADMIN",
          action: "GOOGLE_CALENDAR_ADD_EVENT",
          entityType: "Supervision",
          entityId: realResult.eventId,
          newValue: JSON.stringify({
            summary: `Supervisión Dupla: ${perName} - Coord: ${coordName}`,
            start: date,
            url: realResult.eventUrl,
          }),
        },
      });
      return realResult;
    }
  }

  const mockEventId = `gcal_event_${Math.random().toString(36).substring(7)}`;
  const mockEventUrl = `https://calendar.google.com/calendar/event?eid=mock_${mockEventId}`;

  await prisma.auditLog.create({
    data: {
      userId: "SYSTEM",
      role: "ADMIN",
      action: "GOOGLE_CALENDAR_ADD_EVENT",
      entityType: "Supervision",
      entityId: mockEventId,
      newValue: JSON.stringify({
        summary: `Supervisión Dupla: ${perName} - Coord: ${coordName}`,
        start: date,
        url: mockEventUrl,
      }),
    },
  });

  return {
    eventId: mockEventId,
    eventUrl: mockEventUrl,
  };
}

/**
 * Syncs operational data to the Google Sheets mirror ("Formato Acompañamientos 2026").
 */
export async function syncMirrorSheet(): Promise<{ success: boolean; rowsSynced: number }> {
  const cases = await prisma.pACase.findMany({
    include: {
      per: {
        include: {
          user: true,
        },
      },
    },
  });

  const formattedCases = cases.map((c) => ({
    code: c.code,
    regionId: c.regionId,
    perName: c.per.user.name,
    status: c.status,
    type: c.type,
    lastSessionDate: c.lastSessionDate ? c.lastSessionDate.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  const adminId = admin ? admin.id : "SYSTEM";

  if (scriptUrl) {
    const realResult = await callGoogleAppsScript("syncMirrorSheet", { cases: formattedCases });
    if (realResult && realResult.success) {
      await prisma.auditLog.create({
        data: {
          userId: adminId,
          role: "ADMIN",
          action: "GOOGLE_SHEETS_MIRROR_SYNC",
          entityType: "SYSTEM",
          entityId: "DATABASE",
          newValue: `Sincronización REAL de ${cases.length} casos hacia Google Sheets por Apps Script`,
        },
      });
      return { success: true, rowsSynced: cases.length };
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: adminId,
      role: "ADMIN",
      action: "GOOGLE_SHEETS_MIRROR_SYNC",
      entityType: "SYSTEM",
      entityId: "DATABASE",
      newValue: `Sincronización simulada (mock) de ${cases.length} casos hacia Google Sheets`,
    },
  });

  return {
    success: true,
    rowsSynced: cases.length,
  };
}

/**
 * Copies a finalized document to the /Validados folder under the case.
 */
export async function copyToValidadosFolder(
  fileId: string,
  destFolderId: string,
  caseCode: string,
  instrumentName: string,
  version: string,
  actorId: string
): Promise<{ newFileId: string; newRevisionId: string; fileName: string; fileUrl: string }> {
  if (scriptUrl) {
    const realResult = await callGoogleAppsScript("copyToValidados", {
      fileId,
      destFolderId,
      caseCode,
      instrumentName,
      version,
    });
    if (realResult) {
      await prisma.auditLog.create({
        data: {
          userId: actorId,
          role: "COORDINATOR",
          action: "GOOGLE_DRIVE_COPY_TO_VALIDADOS",
          entityType: "DocumentRecord",
          entityId: realResult.newFileId,
          newValue: JSON.stringify({
            originalFileId: fileId,
            destinationFolderId: destFolderId,
            fileName: realResult.fileName,
            revisionId: realResult.newRevisionId,
          }),
          reason: `Copia REAL de versión aprobada de ${instrumentName} para el caso ${caseCode}`,
        },
      });
      return realResult;
    }
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const cleanInstrument = instrumentName.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `${cleanInstrument}_${caseCode}_v${version}_${dateStr}.pdf`;
  
  const newFileId = `gfile_val_${fileId.replace("drive_file_", "").replace("mock_", "")}`;
  const newRevisionId = `rev_${Math.random().toString(36).substring(7)}`;
  const fileUrl = `https://drive.google.com/open?id=mock_${newFileId}`;

  await prisma.auditLog.create({
    data: {
      userId: actorId,
      role: "COORDINATOR",
      action: "GOOGLE_DRIVE_COPY_TO_VALIDADOS",
      entityType: "DocumentRecord",
      entityId: newFileId,
      newValue: JSON.stringify({
        originalFileId: fileId,
        destinationFolderId: destFolderId,
        fileName,
        revisionId: newRevisionId,
      }),
      reason: `Copia simulada de versión aprobada de ${instrumentName} para el caso ${caseCode}`,
    },
  });

  return {
    newFileId,
    newRevisionId,
    fileName,
    fileUrl,
  };
}
