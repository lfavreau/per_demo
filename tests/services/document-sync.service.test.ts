import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  listPendingDocuments,
  syncPendingCaseDocuments,
  findCasesWithPendingDocuments,
  syncAllPendingCaseDocuments,
  hashDocumentPayload,
  type DocumentPayload,
} from "@/server/services/document-sync.service";
import { createCoordinator, createPer, uid, testRegion } from "../helpers/fixtures";

/** Caso mínimo creado directo: estos tests no tocan Drive ni el aprovisionamiento. */
async function createRawCase(
  regionId: string,
  perId: string,
  coordinatorId: string,
  stage = "VINCULACION",
  folders: Partial<{
    driveFolderVinculacionId: string;
    driveFolderConexionId: string;
    driveFolderFinalizacionId: string;
  }> = {}
) {
  return prisma.pACase.create({
    data: {
      code: uid("PA-TST"),
      type: "NUEVO",
      regionId,
      perId,
      coordinatorId,
      status: stage,
      stage,
      isDemo: true,
      ...folders,
    },
  });
}

async function instrumentFor(activityKey: string) {
  const instrument = await prisma.instrument.findFirst({ where: { activityKey } });
  if (!instrument) throw new Error(`Falta el instrumento ${activityKey} en el catálogo sembrado`);
  return instrument;
}

interface TaskActors {
  perUser: { id: string };
  coord: { id: string };
  paCase: { id: string; regionId: string };
}

async function createTask(
  actors: TaskActors,
  activityKey: string,
  status: string,
  contentJson?: Record<string, unknown>
) {
  const instrument = await instrumentFor(activityKey);
  return prisma.task.create({
    data: {
      title: instrument.name,
      instrumentId: instrument.id,
      paCaseId: actors.paCase.id,
      regionId: actors.paCase.regionId,
      assignedToUserId: actors.perUser.id,
      assignedByUserId: actors.coord.id,
      status,
      contentJson: contentJson ? JSON.stringify(contentJson) : null,
      isDemo: true,
    },
  });
}

async function baseCase() {
  const region = testRegion();
  const coord = await createCoordinator(region);
  const { user: perUser, profile: per } = await createPer(region);
  const paCase = await createRawCase(region, per.id, coord.id);
  return { region, coord, perUser, per, paCase };
}

/** Caso con la carpeta de Vinculación ya "provisionada": lo que syncPendingCaseDocuments necesita para escribir. */
async function baseCaseWithFolder() {
  const region = testRegion();
  const coord = await createCoordinator(region);
  const { user: perUser, profile: per } = await createPer(region);
  const paCase = await createRawCase(region, per.id, coord.id, "VINCULACION", {
    driveFolderVinculacionId: "demo_folder_vinculacion",
  });
  return { region, coord, perUser, per, paCase };
}

/** Caso con las tres carpetas de etapa provisionadas, como queda un caso real tras formalizarse. */
async function baseCaseWithAllFolders() {
  const region = testRegion();
  const coord = await createCoordinator(region);
  const { user: perUser, profile: per } = await createPer(region);
  const paCase = await createRawCase(region, per.id, coord.id, "FINALIZACION", {
    driveFolderVinculacionId: "demo_folder_vinculacion",
    driveFolderConexionId: "demo_folder_conexion",
    driveFolderFinalizacionId: "demo_folder_finalizacion",
  });
  return { region, coord, perUser, per, paCase };
}

describe("document-sync.service — elegibilidad", () => {
  it("DOC-01: un instrumento sin validar no genera documento pendiente", async () => {
    const actors = await baseCase();
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "ENVIADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const pending = await listPendingDocuments(actors.paCase.id, true);
    expect(pending.map((p) => p.payload.docKey)).not.toContain("ACTIVIDAD_1_MOTIVACIONES");
  });

  it("DOC-02: al validar aparece como NUEVO con los campos del catálogo", async () => {
    const actors = await baseCase();
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const pending = await listPendingDocuments(actors.paCase.id, true);
    const doc = pending.find((p) => p.payload.docKey === "ACTIVIDAD_1_MOTIVACIONES");

    expect(doc).toBeDefined();
    expect(doc!.reason).toBe("NUEVO");
    expect(doc!.existingFileId).toBeNull();
    expect(doc!.payload.fields.motivations).toBe("Retomar estudios");
    expect(doc!.payload.fields.CODIGO_CASO).toBe(actors.paCase.code);
    expect(doc!.payload.stage).toBe("VINCULACION");
  });

  it("DOC-03: el IAP exige Actividad 3 y 4 validadas, no una sola", async () => {
    const actors = await baseCase();
    await createTask(actors, "ACTIVIDAD_3_MAPA_RECURSOS", "VALIDADA");

    let pending = await listPendingDocuments(actors.paCase.id, true);
    expect(pending.map((p) => p.payload.docKey)).not.toContain("IAP");

    await createTask(actors, "ACTIVIDAD_4_PLANIFICACION", "VALIDADA");
    pending = await listPendingDocuments(actors.paCase.id, true);
    expect(pending.map((p) => p.payload.docKey)).toContain("IAP");
  });

  it("DOC-04: el filtro por etapa solo devuelve documentos de esa carpeta", async () => {
    const actors = await baseCase();
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", { date: "x" });
    await createTask(actors, "ACTIVIDAD_6_REFLEXION_FINAL", "VALIDADA", {
      date: "2026-08-02",
      personalReflections: "Cierre del proceso",
    });

    const vinculacion = await listPendingDocuments(actors.paCase.id, true, { stage: "VINCULACION" });
    const keys = vinculacion.map((p) => p.payload.docKey);
    expect(keys).toContain("ACTIVIDAD_1_MOTIVACIONES");
    expect(keys).not.toContain("ACTIVIDAD_6_REFLEXION_FINAL");
  });

  it("DOC-05: el Registro de Acompañamiento no se genera sin sesiones validadas", async () => {
    const actors = await baseCase();

    let pending = await listPendingDocuments(actors.paCase.id, true);
    expect(pending.map((p) => p.payload.docKey)).not.toContain("REGISTRO_ACOMPANAMIENTO");

    await prisma.sessionLog.create({
      data: {
        paCaseId: actors.paCase.id,
        perId: actors.per.id,
        regionId: actors.paCase.regionId,
        sessionNumber: 1,
        date: new Date("2026-07-15"),
        modality: "PRESENCIAL",
        summary: "Primer contacto semanal",
        attendance: "REALIZADA",
        status: "VALIDADA",
        isDemo: true,
      },
    });

    pending = await listPendingDocuments(actors.paCase.id, true);
    const registro = pending.find((p) => p.payload.docKey === "REGISTRO_ACOMPANAMIENTO");
    expect(registro).toBeDefined();
    expect(registro!.payload.fields.TOTAL_SESIONES).toBe("1");
    expect(registro!.payload.tables[0].rows).toHaveLength(1);
  });
});

describe("document-sync.service — hash y detección de cambios", () => {
  it("DOC-06: el hash es estable ante el orden de las claves", () => {
    const a: DocumentPayload = {
      docKey: "X",
      fileSuffix: "X",
      stage: "VINCULACION",
      anchorActivityKey: "X",
      fields: { b: "2", a: "1" },
      tables: [],
    };
    const b: DocumentPayload = { ...a, fields: { a: "1", b: "2" } };
    expect(hashDocumentPayload(a)).toBe(hashDocumentPayload(b));
  });

  it("DOC-07: un documento ya sincronizado deja de estar pendiente", async () => {
    const actors = await baseCase();
    const instrument = await instrumentFor("ACTIVIDAD_1_MOTIVACIONES");
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const [pending] = (await listPendingDocuments(actors.paCase.id, true)).filter(
      (p) => p.payload.docKey === "ACTIVIDAD_1_MOTIVACIONES"
    );

    await prisma.documentRecord.create({
      data: {
        caseId: actors.paCase.id,
        instrumentId: instrument.id,
        instrumentVersion: instrument.version,
        fileId: "drive-file-1",
        revisionId: "rev-1",
        fileName: `${actors.paCase.code}_Actividad_1_Motivaciones`,
        uploadedByUserId: actors.perUser.id,
        stage: "VINCULACION",
        status: "VALIDADA",
        isFinalVigente: true,
        origin: "GENERATED",
        contentHash: pending.contentHash,
        lastSyncedAt: new Date(),
        isDemo: true,
      },
    });

    const after = await listPendingDocuments(actors.paCase.id, true);
    expect(after.map((p) => p.payload.docKey)).not.toContain("ACTIVIDAD_1_MOTIVACIONES");
  });

  it("DOC-08: corregir el contenido vuelve a marcarlo como DESACTUALIZADO sobre el mismo archivo", async () => {
    const actors = await baseCase();
    const instrument = await instrumentFor("ACTIVIDAD_1_MOTIVACIONES");
    const task = await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const [first] = (await listPendingDocuments(actors.paCase.id, true)).filter(
      (p) => p.payload.docKey === "ACTIVIDAD_1_MOTIVACIONES"
    );
    await prisma.documentRecord.create({
      data: {
        caseId: actors.paCase.id,
        instrumentId: instrument.id,
        instrumentVersion: instrument.version,
        fileId: "drive-file-1",
        revisionId: "rev-1",
        fileName: `${actors.paCase.code}_Actividad_1_Motivaciones`,
        uploadedByUserId: actors.perUser.id,
        stage: "VINCULACION",
        status: "VALIDADA",
        isFinalVigente: true,
        origin: "GENERATED",
        contentHash: first.contentHash,
        lastSyncedAt: new Date(),
        isDemo: true,
      },
    });

    // El coordinador devuelve, el PER corrige y se vuelve a validar: mismo Task, otro contenido.
    await prisma.task.update({
      where: { id: task.id },
      data: {
        contentJson: JSON.stringify({
          date: "2026-08-01",
          motivations: "Retomar estudios y buscar trabajo",
          expectations: "Sentirme acompañada",
        }),
      },
    });

    const after = await listPendingDocuments(actors.paCase.id, true);
    const doc = after.find((p) => p.payload.docKey === "ACTIVIDAD_1_MOTIVACIONES");

    expect(doc).toBeDefined();
    expect(doc!.reason).toBe("DESACTUALIZADO");
    expect(doc!.existingFileId).toBe("drive-file-1");
    expect(doc!.contentHash).not.toBe(first.contentHash);
  });

  it("DOC-09: el mapa de ámbitos del IAP trae siempre las 9 filas oficiales", async () => {
    const actors = await baseCase();
    await createTask(actors, "ACTIVIDAD_3_MAPA_RECURSOS", "VALIDADA");
    await createTask(actors, "ACTIVIDAD_4_PLANIFICACION", "VALIDADA");

    const iapRecord = await prisma.iAPRecord.create({
      data: { paCaseId: actors.paCase.id, status: "EN_DESARROLLO" },
    });
    await prisma.iAPDomainMap.create({
      data: {
        iapRecordId: iapRecord.id,
        recoveryDomainId: "Empleo",
        needs: "Buscar trabajo estable",
        strengths: "Experiencia previa",
        importance: "ALTO",
      },
    });
    await prisma.iAPGoal.create({
      data: {
        iapRecordId: iapRecord.id,
        recoveryDomainId: "Empleo",
        objective: "Postular a tres empleos",
        isCurrent: true,
      },
    });

    const pending = await listPendingDocuments(actors.paCase.id, true);
    const iap = pending.find((p) => p.payload.docKey === "IAP");

    expect(iap).toBeDefined();
    const [ambitos, objetivos] = iap!.payload.tables;
    expect(ambitos.placeholder).toBe("TABLA_AMBITOS");
    expect(ambitos.rows).toHaveLength(9);
    expect(ambitos.rows.find((r) => r[0] === "Empleo")?.[1]).toBe("Buscar trabajo estable");
    expect(objetivos.rows).toHaveLength(1);
  });

  it("DOC-10: un contentJson corrupto produce campos vacíos en vez de voltear la sincronización", async () => {
    const actors = await baseCase();
    const instrument = await instrumentFor("ACTIVIDAD_1_MOTIVACIONES");
    await prisma.task.create({
      data: {
        title: instrument.name,
        instrumentId: instrument.id,
        paCaseId: actors.paCase.id,
        regionId: actors.paCase.regionId,
        assignedToUserId: actors.perUser.id,
        assignedByUserId: actors.coord.id,
        status: "VALIDADA",
        contentJson: "{no es json",
        isDemo: true,
      },
    });

    const pending = await listPendingDocuments(actors.paCase.id, true);
    const doc = pending.find((p) => p.payload.docKey === "ACTIVIDAD_1_MOTIVACIONES");
    expect(doc).toBeDefined();
    expect(doc!.payload.fields.motivations).toBe("");
  });
});

describe("document-sync.service — syncPendingCaseDocuments (modo demo)", () => {
  it("DOC-11: sin carpeta de etapa provisionada, el documento queda pendiente en vez de escribirse", async () => {
    const actors = await baseCase(); // sin driveFolderVinculacionId
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id);
    expect(outcome).toEqual({ synced: [], failed: [], skipped: 1 });

    const record = await prisma.documentRecord.findFirst({ where: { caseId: actors.paCase.id } });
    expect(record).toBeNull();
  });

  it("DOC-12: con carpeta provisionada, el instrumento habilitado se escribe como DocumentRecord GENERATED", async () => {
    const actors = await baseCaseWithFolder();
    const instrument = await instrumentFor("ACTIVIDAD_1_MOTIVACIONES");
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id);
    expect(outcome.synced).toEqual(["ACTIVIDAD_1_MOTIVACIONES"]);
    expect(outcome.failed).toEqual([]);

    const record = await prisma.documentRecord.findFirst({
      where: { caseId: actors.paCase.id, instrumentId: instrument.id, isDemo: true },
    });
    expect(record).not.toBeNull();
    expect(record?.origin).toBe("GENERATED");
    expect(record?.isFinalVigente).toBe(true);
    expect(record?.stage).toBe("VINCULACION");
    expect(record?.fileId).toBeTruthy();
    expect(record?.revisionId).toBeTruthy();
  });

  it("DOC-13: un instrumento validado sin la carpeta de SU etapa provisionada queda pendiente, no se inventa una carpeta", async () => {
    // baseCaseWithFolder() solo aprovisiona driveFolderVinculacionId. El Registro de
    // Acompañamiento es de etapa Conexión: aunque su instrumento esté validado, no hay
    // carpeta destino todavía — tiene que quedar "skipped", nunca escribirse en la carpeta
    // equivocada ni inventar una.
    const actors = await baseCaseWithFolder();
    await prisma.sessionLog.create({
      data: {
        paCaseId: actors.paCase.id,
        perId: actors.per.id,
        regionId: actors.paCase.regionId,
        sessionNumber: 1,
        date: new Date("2026-07-15"),
        modality: "PRESENCIAL",
        summary: "Primer contacto semanal",
        attendance: "REALIZADA",
        status: "VALIDADA",
        isDemo: true,
      },
    });

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id, {
      stage: "CONEXION",
    });
    expect(outcome).toEqual({ synced: [], failed: [], skipped: 1 });

    const record = await prisma.documentRecord.findFirst({ where: { caseId: actors.paCase.id } });
    expect(record).toBeNull();
  });

  it("DOC-14: sin cambios pendientes, un segundo sync no vuelve a escribir nada", async () => {
    const actors = await baseCaseWithFolder();
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const first = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id);
    expect(first.synced).toEqual(["ACTIVIDAD_1_MOTIVACIONES"]);

    const second = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id);
    expect(second).toEqual({ synced: [], failed: [], skipped: 0 });

    const records = await prisma.documentRecord.findMany({ where: { caseId: actors.paCase.id } });
    expect(records).toHaveLength(1);
  });

  it("DOC-15: una corrección validada de nuevo se sincroniza sobre el mismo fileId, sin duplicar el registro", async () => {
    const actors = await baseCaseWithFolder();
    const instrument = await instrumentFor("ACTIVIDAD_1_MOTIVACIONES");
    const task = await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id);
    const before = await prisma.documentRecord.findFirstOrThrow({
      where: { caseId: actors.paCase.id, instrumentId: instrument.id },
    });

    // El coordinador devuelve, el PER corrige y se vuelve a validar.
    await prisma.task.update({
      where: { id: task.id },
      data: {
        contentJson: JSON.stringify({
          date: "2026-08-01",
          motivations: "Retomar estudios y buscar trabajo",
          expectations: "Sentirme acompañada",
        }),
      },
    });

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id);
    expect(outcome.synced).toEqual(["ACTIVIDAD_1_MOTIVACIONES"]);

    const records = await prisma.documentRecord.findMany({
      where: { caseId: actors.paCase.id, instrumentId: instrument.id },
    });
    expect(records).toHaveLength(1);
    expect(records[0].fileId).toBe(before.fileId);
    expect(records[0].contentHash).not.toBe(before.contentHash);
  });
});

describe("document-sync.service — fase 3: instrumentos narrativos habilitados", () => {
  it("DOC-16: el cierre de Vinculación sincroniza en un solo lote los tres narrativos de esa etapa", async () => {
    const actors = await baseCaseWithFolder();
    await createTask(actors, "PRIMER_ENCUENTRO_REFLEXION", "VALIDADA", {
      date: "2026-08-01",
      reflection: "Buena primera conversación",
    });
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });
    await createTask(actors, "ACTIVIDAD_2_ANTECEDENTES", "VALIDADA", {
      date: "2026-08-01",
      talksAboutSelf: "Prefiere que le pregunten",
      freeTimeActivities: "Dibujar",
      howDidYouFeel: "Cómoda",
    });

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id, {
      stage: "VINCULACION",
    });

    expect(outcome.synced.sort()).toEqual(
      ["ACTIVIDAD_1_MOTIVACIONES", "ACTIVIDAD_2_ANTECEDENTES", "PRIMER_ENCUENTRO_REFLEXION"].sort()
    );
    expect(outcome.failed).toEqual([]);

    const records = await prisma.documentRecord.findMany({
      where: { caseId: actors.paCase.id, origin: "GENERATED", isFinalVigente: true },
    });
    expect(records).toHaveLength(3);
  });

  it("DOC-17: la Evaluación Intermedia se escribe en la carpeta de Conexión, no en la de Vinculación", async () => {
    const actors = await baseCaseWithAllFolders();
    await createTask(actors, "ACTIVIDAD_5_INTERMEDIA", "VALIDADA", {
      date: "2026-08-01",
      advances: "Retomó contacto con su familia",
    });

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id, {
      stage: "CONEXION",
    });
    expect(outcome.synced).toEqual(["ACTIVIDAD_5_INTERMEDIA"]);

    const record = await prisma.documentRecord.findFirstOrThrow({
      where: { caseId: actors.paCase.id, origin: "GENERATED" },
    });
    expect(record.stage).toBe("CONEXION");
  });

  it("DOC-18: los dos Formularios de Abandono producen documentos independientes, no uno pisando al otro", async () => {
    const actors = await baseCaseWithAllFolders();
    await createTask(actors, "FORMULARIO_ABANDONO_PA", "VALIDADA", {
      date: "2026-08-01",
      reason: "Decisión personal",
    });
    await createTask(actors, "FORMULARIO_ABANDONO_PER", "VALIDADA", {
      date: "2026-08-01",
      reason: "Cambio de residencia de la persona acompañada",
    });

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id, {
      stage: "FINALIZACION",
    });
    expect(outcome.synced.sort()).toEqual(["FORMULARIO_ABANDONO_PA", "FORMULARIO_ABANDONO_PER"].sort());

    const records = await prisma.documentRecord.findMany({
      where: { caseId: actors.paCase.id, origin: "GENERATED" },
    });
    expect(records).toHaveLength(2);
    expect(records[0].fileId).not.toBe(records[1].fileId);
    expect(records.map((r) => r.fileName).sort()).toEqual(
      [`${actors.paCase.code}_Formulario_Abandono_PA`, `${actors.paCase.code}_Formulario_Abandono_PER`].sort()
    );
  });
});

describe("document-sync.service — fase 4-5: IAP con tablas y Registro de Acompañamiento", () => {
  it("DOC-19: el IAP reescribe el archivo ya provisionado al formalizar, no crea uno nuevo", async () => {
    const actors = await baseCaseWithAllFolders();
    await createTask(actors, "ACTIVIDAD_3_MAPA_RECURSOS", "VALIDADA");
    await createTask(actors, "ACTIVIDAD_4_PLANIFICACION", "VALIDADA");

    // Simula lo que createIapDocument() ya hizo al formalizar: el archivo existe en Drive
    // desde antes de que este pipeline exista, registrado en IAPRecord, no en DocumentRecord.
    await prisma.iAPRecord.create({
      data: { paCaseId: actors.paCase.id, status: "EN_DESARROLLO", driveDocId: "iap_provisionado_al_formalizar" },
    });

    const pending = await listPendingDocuments(actors.paCase.id, true);
    const iapPending = pending.find((p) => p.payload.docKey === "IAP");
    expect(iapPending?.existingFileId).toBe("iap_provisionado_al_formalizar");
    expect(iapPending?.reason).toBe("DESACTUALIZADO");

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id);
    expect(outcome.synced).toEqual(["ACTIVIDAD_4_PLANIFICACION"]);

    const record = await prisma.documentRecord.findFirstOrThrow({
      where: { caseId: actors.paCase.id, origin: "GENERATED" },
    });
    expect(record.fileId).toBe("iap_provisionado_al_formalizar");
  });

  it("DOC-20: reformular en Conexión resincroniza el IAP aunque el flush filtre por esa etapa", async () => {
    const actors = await baseCaseWithAllFolders();
    await createTask(actors, "ACTIVIDAD_3_MAPA_RECURSOS", "VALIDADA");
    await createTask(actors, "ACTIVIDAD_4_PLANIFICACION", "VALIDADA");
    await prisma.iAPRecord.create({
      data: { paCaseId: actors.paCase.id, status: "EN_DESARROLLO", driveDocId: "iap_original" },
    });

    // Primera sincronización, al cerrar Vinculación.
    const first = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id, {
      stage: "VINCULACION",
    });
    expect(first.synced).toEqual(["ACTIVIDAD_4_PLANIFICACION"]);
    const before = await prisma.documentRecord.findFirstOrThrow({
      where: { caseId: actors.paCase.id, origin: "GENERATED" },
    });

    // Ya en Conexión, se reformula: cambia fields.REFORMULADO de "No" a "Sí" en el payload.
    await createTask(actors, "REFORMULAR_ACTIVIDAD_4", "VALIDADA");

    // El flush real ocurriría al salir de CONEXION, no de VINCULACION (el IAP es de Vinculación).
    const second = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id, {
      stage: "CONEXION",
    });
    expect(second.synced).toEqual(["ACTIVIDAD_4_PLANIFICACION"]);

    const after = await prisma.documentRecord.findFirstOrThrow({
      where: { caseId: actors.paCase.id, origin: "GENERATED" },
    });
    expect(after.fileId).toBe(before.fileId);
    expect(after.contentHash).not.toBe(before.contentHash);
  });

  it("DOC-21: el Registro de Acompañamiento ya habilitado sincroniza con las sesiones validadas", async () => {
    const actors = await baseCaseWithAllFolders();
    await prisma.sessionLog.create({
      data: {
        paCaseId: actors.paCase.id,
        perId: actors.per.id,
        regionId: actors.paCase.regionId,
        sessionNumber: 1,
        date: new Date("2026-07-15"),
        modality: "PRESENCIAL",
        summary: "Primer contacto semanal",
        attendance: "REALIZADA",
        status: "VALIDADA",
        isDemo: true,
      },
    });

    const outcome = await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id, {
      stage: "CONEXION",
    });
    expect(outcome.synced).toEqual(["REGISTRO_ACOMPANAMIENTO"]);

    const record = await prisma.documentRecord.findFirstOrThrow({
      where: { caseId: actors.paCase.id, origin: "GENERATED" },
    });
    expect(record.fileName).toBe(`${actors.paCase.code}_Registro_Acompanamiento`);
  });
});

describe("document-sync.service — botón de forzado del admin", () => {
  // El resto de la batería crea casos demo=true en el mismo test.db compartido, así que estas
  // pruebas nunca asumen que la lista devuelta tiene exactamente N elementos — solo que el caso
  // propio aparece (o no) con el conteo correcto, entre lo que haya de otros tests.

  it("DOC-22: findCasesWithPendingDocuments encuentra el caso con pendientes y lo omite una vez sincronizado", async () => {
    const actors = await baseCaseWithFolder();
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const before = await findCasesWithPendingDocuments(true);
    const ours = before.find((c) => c.caseId === actors.paCase.id);
    expect(ours).toBeDefined();
    expect(ours!.pendingCount).toBe(1);

    await syncPendingCaseDocuments(actors.paCase.id, true, actors.coord.id);

    const after = await findCasesWithPendingDocuments(true);
    expect(after.find((c) => c.caseId === actors.paCase.id)).toBeUndefined();
  });

  it("DOC-23: syncAllPendingCaseDocuments respeta el tope maxCases y deja el resto pendiente para el próximo click", async () => {
    const actors = await baseCaseWithFolder();
    await createTask(actors, "ACTIVIDAD_1_MOTIVACIONES", "VALIDADA", {
      date: "2026-08-01",
      motivations: "Retomar estudios",
      expectations: "Sentirme acompañada",
    });

    const capped = await syncAllPendingCaseDocuments(true, actors.coord.id, 0);
    expect(capped.casesProcessed).toBe(0);
    expect(capped.synced).toBe(0);
    expect(capped.casesRemaining).toBeGreaterThanOrEqual(1);

    const record = await prisma.documentRecord.findFirst({ where: { caseId: actors.paCase.id } });
    expect(record).toBeNull(); // con maxCases=0 no se tocó nada todavía

    const full = await syncAllPendingCaseDocuments(true, actors.coord.id, 50);
    expect(full.synced).toBeGreaterThanOrEqual(1);

    const recordAfter = await prisma.documentRecord.findFirst({ where: { caseId: actors.paCase.id } });
    expect(recordAfter).not.toBeNull();
  });
});
