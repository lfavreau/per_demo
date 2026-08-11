import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import {
  RECOVERY_DOMAINS,
  getStepByActivityKey,
  type CaseStage,
} from "@/lib/instrument-itinerary";
import { syncCaseDocuments as syncCaseDocumentsRemote, type DocumentSyncItem } from "@/server/google/workspace";

// Construye el payload canónico de cada documento que la app materializa en Drive y decide
// cuáles quedaron desactualizados. No habla con Google: eso lo hace quien consuma esto.
//
// El contrato con Apps Script es {campos planos} + {tablas}: la plantilla trae los
// placeholders {{clave}} y, para las tablas, un párrafo {{TABLA_X}} que se reemplaza por
// una tabla real. Por eso los valores viajan siempre como texto ya formateado.

export interface DocumentTablePayload {
  placeholder: string;
  header: string[];
  rows: string[][];
}

export interface DocumentPayload {
  docKey: string;
  /** Sufijo del nombre en Drive: "{codigoCaso}_{fileSuffix}". */
  fileSuffix: string;
  stage: CaseStage;
  /** Instrumento al que se ancla el DocumentRecord (un doc puede alimentarse de varios). */
  anchorActivityKey: string;
  fields: Record<string, string>;
  tables: DocumentTablePayload[];
}

export interface PendingDocument {
  payload: DocumentPayload;
  contentHash: string;
  /** DocumentRecord vigente, si el documento ya existe en Drive. */
  existingRecordId: string | null;
  existingFileId: string | null;
  reason: "NUEVO" | "DESACTUALIZADO";
}

interface GeneratedDocDef {
  docKey: string;
  fileSuffix: string;
  stage: CaseStage;
  anchorActivityKey: string;
  /** Instrumentos cuya validación habilita y alimenta el documento. */
  requiredActivityKeys: string[];
  /** Instrumentos que enriquecen el documento si están validados, pero no lo bloquean. */
  optionalActivityKeys?: string[];
}

// Las Actividades 3 y 4 no generan archivo propio: son las dos tablas del IAP, que es el
// documento que ya se crea al formalizar la dupla. La reformulación reescribe la tabla de
// objetivos del mismo archivo en vez de agregar uno nuevo.
export const GENERATED_DOCUMENTS: GeneratedDocDef[] = [
  {
    docKey: "IAP",
    fileSuffix: "IAP",
    stage: "VINCULACION",
    anchorActivityKey: "ACTIVIDAD_4_PLANIFICACION",
    requiredActivityKeys: ["ACTIVIDAD_3_MAPA_RECURSOS", "ACTIVIDAD_4_PLANIFICACION"],
    optionalActivityKeys: ["REFORMULAR_ACTIVIDAD_4"],
  },
  {
    docKey: "PRIMER_ENCUENTRO_REFLEXION",
    fileSuffix: "Primer_Encuentro",
    stage: "VINCULACION",
    anchorActivityKey: "PRIMER_ENCUENTRO_REFLEXION",
    requiredActivityKeys: ["PRIMER_ENCUENTRO_REFLEXION"],
  },
  {
    docKey: "ACTIVIDAD_1_MOTIVACIONES",
    fileSuffix: "Actividad_1_Motivaciones",
    stage: "VINCULACION",
    anchorActivityKey: "ACTIVIDAD_1_MOTIVACIONES",
    requiredActivityKeys: ["ACTIVIDAD_1_MOTIVACIONES"],
  },
  {
    docKey: "ACTIVIDAD_2_ANTECEDENTES",
    fileSuffix: "Actividad_2_Antecedentes",
    stage: "VINCULACION",
    anchorActivityKey: "ACTIVIDAD_2_ANTECEDENTES",
    requiredActivityKeys: ["ACTIVIDAD_2_ANTECEDENTES"],
  },
  {
    docKey: "REGISTRO_ACOMPANAMIENTO",
    fileSuffix: "Registro_Acompanamiento",
    stage: "CONEXION",
    anchorActivityKey: "REGISTRO_ACOMPANAMIENTO",
    requiredActivityKeys: [],
  },
  {
    docKey: "ACTIVIDAD_5_INTERMEDIA",
    fileSuffix: "Evaluacion_Intermedia",
    stage: "CONEXION",
    anchorActivityKey: "ACTIVIDAD_5_INTERMEDIA",
    requiredActivityKeys: ["ACTIVIDAD_5_INTERMEDIA"],
  },
  {
    docKey: "ACTIVIDAD_5_FINAL",
    fileSuffix: "Evaluacion_Final",
    stage: "FINALIZACION",
    anchorActivityKey: "ACTIVIDAD_5_FINAL",
    requiredActivityKeys: ["ACTIVIDAD_5_FINAL"],
  },
  {
    docKey: "ACTIVIDAD_6_REFLEXION_FINAL",
    fileSuffix: "Actividad_6_Reflexiones_Finales",
    stage: "FINALIZACION",
    anchorActivityKey: "ACTIVIDAD_6_REFLEXION_FINAL",
    requiredActivityKeys: ["ACTIVIDAD_6_REFLEXION_FINAL"],
  },
  {
    docKey: "FORMULARIO_ABANDONO_PA",
    fileSuffix: "Formulario_Abandono_PA",
    stage: "FINALIZACION",
    anchorActivityKey: "FORMULARIO_ABANDONO_PA",
    requiredActivityKeys: ["FORMULARIO_ABANDONO_PA"],
  },
  {
    docKey: "FORMULARIO_ABANDONO_PER",
    fileSuffix: "Formulario_Abandono_PER",
    stage: "FINALIZACION",
    anchorActivityKey: "FORMULARIO_ABANDONO_PER",
    requiredActivityKeys: ["FORMULARIO_ABANDONO_PER"],
  },
];

function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (value instanceof Date) return formatDate(value);
  return String(value);
}

function parseContentJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // Un contentJson corrupto no debe voltear la sincronización del resto del caso: el
    // documento sale con los campos vacíos y el hash refleja ese estado.
    return {};
  }
}

// Serialización estable: sin esto, dos objetos equivalentes con las claves en distinto orden
// producirían hashes distintos y el documento se reescribiría en cada sincronización.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize(source[key]);
        return acc;
      }, {});
  }
  return value;
}

export function hashDocumentPayload(payload: DocumentPayload): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

/** Campos de un instrumento NATIVE_FORM plano, en el orden que declara el catálogo. */
function fieldsFromTaskJson(activityKey: string, contentJson: string | null): Record<string, string> {
  const step = getStepByActivityKey(activityKey);
  const content = parseContentJson(contentJson);
  const fields: Record<string, string> = {};
  for (const def of step?.fields ?? []) {
    fields[def.key] = asText(content[def.key]);
  }
  return fields;
}

type CaseContext = Awaited<ReturnType<typeof loadCaseContext>>;

async function loadCaseContext(caseId: string, isDemo: boolean) {
  const paCase = await prisma.pACase.findUnique({
    where: { id: caseId },
    include: {
      per: { include: { user: { select: { name: true } } } },
      tasks: { include: { instrument: true } },
      iapRecords: { include: { domainMaps: true, goals: true } },
      sessionLogs: { orderBy: [{ sessionNumber: "asc" }, { date: "asc" }] },
    },
  });
  if (!paCase) throw new Error("Caso no encontrado");
  if (paCase.isDemo !== isDemo) throw new Error("El caso no pertenece al modo de trabajo actual");
  return paCase;
}

function findTask(paCase: CaseContext, activityKey: string) {
  const matches = paCase.tasks.filter((task) => task.instrument?.activityKey === activityKey);
  if (!matches.length) return null;
  // La reformulación crea iteraciones sucesivas del mismo instrumento; manda la última.
  return matches.reduce((latest, task) =>
    task.iterationNumber > latest.iterationNumber ? task : latest
  );
}

function isValidated(paCase: CaseContext, activityKey: string): boolean {
  return findTask(paCase, activityKey)?.status === "VALIDADA";
}

function buildIapTables(paCase: CaseContext): DocumentTablePayload[] {
  const record = paCase.iapRecords[0];
  const domainMaps = record?.domainMaps ?? [];
  const goals = (record?.goals ?? []).filter((goal) => goal.isCurrent);

  // Las 9 filas del mapa de recursos van siempre en el orden oficial de ámbitos, exista o no
  // la fila en la base: un IAP con ámbitos faltantes se lee como incompleto, no como distinto.
  const domainRows = RECOVERY_DOMAINS.map((domain) => {
    const row = domainMaps.find((item) => item.recoveryDomainId === domain);
    return [domain, asText(row?.needs), asText(row?.strengths), asText(row?.importance)];
  });

  const goalRows = goals
    .slice()
    .sort((a, b) => a.recoveryDomainId.localeCompare(b.recoveryDomainId) || a.id.localeCompare(b.id))
    .map((goal) => [
      goal.recoveryDomainId,
      asText(goal.objective),
      asText(goal.resources),
      asText(goal.activities),
      formatDate(goal.deadline),
      asText(goal.result),
    ]);

  return [
    {
      placeholder: "TABLA_AMBITOS",
      header: ["Ámbito", "Necesidades", "Fortalezas", "Importancia"],
      rows: domainRows,
    },
    {
      placeholder: "TABLA_OBJETIVOS",
      header: ["Ámbito", "Objetivo", "Recursos", "Actividades", "Plazo", "Resultado"],
      rows: goalRows,
    },
  ];
}

function buildSessionTable(paCase: CaseContext): DocumentTablePayload {
  const validated = paCase.sessionLogs.filter((log) => log.status === "VALIDADA");
  return {
    placeholder: "TABLA_SESIONES",
    header: ["N°", "Fecha", "Modalidad", "Asistencia", "Resumen", "Acuerdos", "Próxima acción"],
    rows: validated.map((log) => [
      String(log.sessionNumber),
      formatDate(log.date),
      asText(log.modality),
      asText(log.attendance),
      asText(log.summary),
      asText(log.agreements),
      asText(log.nextAction),
    ]),
  };
}

function buildPayload(paCase: CaseContext, def: GeneratedDocDef): DocumentPayload | null {
  const allRequiredValidated = def.requiredActivityKeys.every((key) => isValidated(paCase, key));
  if (!allRequiredValidated) return null;

  // Cabecera común a todas las plantillas. Solo el código correlativo del caso: nunca nombre
  // ni RUN de la persona acompañada.
  const fields: Record<string, string> = {
    CODIGO_CASO: paCase.code,
    REGION: paCase.regionId,
    PER: paCase.per.user.name,
    ETAPA: def.stage,
  };
  const tables: DocumentTablePayload[] = [];

  if (def.docKey === "IAP") {
    tables.push(...buildIapTables(paCase));
    const reformulated = isValidated(paCase, "REFORMULAR_ACTIVIDAD_4");
    fields.REFORMULADO = reformulated ? "Sí" : "No";
  } else if (def.docKey === "REGISTRO_ACOMPANAMIENTO") {
    const table = buildSessionTable(paCase);
    // Sin sesiones validadas no hay nada que registrar: no se crea un archivo vacío.
    if (!table.rows.length) return null;
    tables.push(table);
    fields.TOTAL_SESIONES = String(table.rows.length);
  } else {
    const task = findTask(paCase, def.anchorActivityKey);
    Object.assign(fields, fieldsFromTaskJson(def.anchorActivityKey, task?.contentJson ?? null));
  }

  return {
    docKey: def.docKey,
    fileSuffix: def.fileSuffix,
    stage: def.stage,
    anchorActivityKey: def.anchorActivityKey,
    fields,
    tables,
  };
}

/**
 * Documentos del caso que deben escribirse en Drive: los que nunca se subieron y los que
 * cambiaron desde la última sincronización. Es la consulta que alimenta tanto el volcado al
 * cerrar etapa como el botón de forzado del admin.
 */
export async function listPendingDocuments(
  caseId: string,
  isDemo: boolean,
  options: { stage?: CaseStage } = {}
): Promise<PendingDocument[]> {
  const paCase = await loadCaseContext(caseId, isDemo);

  // El IAP se sale del filtro de etapa a propósito: su carpeta destino es siempre la de
  // Vinculación, pero su contenido puede cambiar en Conexión (Reformular Actividad 4). Si
  // solo se revisara al salir de Vinculación, una reformulación posterior nunca dispararía
  // una reescritura — por eso se evalúa en cualquier flush, sin importar qué etapa lo gatilló.
  const definitions = options.stage
    ? GENERATED_DOCUMENTS.filter((def) => def.stage === options.stage || def.docKey === "IAP")
    : GENERATED_DOCUMENTS;

  const records = await prisma.documentRecord.findMany({
    where: { caseId, isDemo, origin: "GENERATED", isFinalVigente: true },
    include: { instrument: { select: { activityKey: true } } },
  });

  const pending: PendingDocument[] = [];
  for (const def of definitions) {
    const payload = buildPayload(paCase, def);
    if (!payload) continue;

    const contentHash = hashDocumentPayload(payload);
    const existing = records.find(
      (record) => record.instrument.activityKey === def.anchorActivityKey
    );
    // El IAP ya existe en Drive desde que se formalizó el caso (createIapDocument, fuera de
    // este pipeline) — su primer DocumentRecord todavía no existe la primera vez que se
    // sincroniza, pero el archivo sí. Sin este fallback, la primera sincronización crearía una
    // copia nueva de la plantilla en vez de rellenar la que ya está en la carpeta del caso.
    const existingFileId =
      existing?.fileId ?? (def.docKey === "IAP" ? paCase.iapRecords[0]?.driveDocId ?? null : null);
    if (existing?.contentHash === contentHash) continue;

    pending.push({
      payload,
      contentHash,
      existingRecordId: existing?.id ?? null,
      existingFileId,
      reason: existingFileId ? "DESACTUALIZADO" : "NUEVO",
    });
  }

  return pending;
}

const STAGE_FOLDER_FIELD: Record<
  CaseStage,
  "driveFolderVinculacionId" | "driveFolderConexionId" | "driveFolderFinalizacionId"
> = {
  VINCULACION: "driveFolderVinculacionId",
  CONEXION: "driveFolderConexionId",
  FINALIZACION: "driveFolderFinalizacionId",
};

// Documentos que la app ya sabe materializar en Drive. Los 7 narrativos (fase 3) más el IAP con
// tablas y el Registro de Acompañamiento acumulativo (fase 4-5). Requieren cada uno su propia
// Script Property TEMPLATE_DOC_{activityKey} en Apps Script — ver GoogleAppsScript.gs.
export const ENABLED_GENERATED_DOCUMENT_KEYS: readonly string[] = [
  "PRIMER_ENCUENTRO_REFLEXION",
  "ACTIVIDAD_1_MOTIVACIONES",
  "ACTIVIDAD_2_ANTECEDENTES",
  "IAP", // anchorActivityKey real es ACTIVIDAD_4_PLANIFICACION — ver GENERATED_DOCUMENTS
  "REGISTRO_ACOMPANAMIENTO",
  "ACTIVIDAD_5_INTERMEDIA",
  "ACTIVIDAD_5_FINAL",
  "ACTIVIDAD_6_REFLEXION_FINAL",
  "FORMULARIO_ABANDONO_PA",
  "FORMULARIO_ABANDONO_PER",
];

export interface DocumentSyncOutcome {
  synced: string[];
  failed: { docKey: string; message: string }[];
  /** Pendientes que no se intentaron: no habilitados aún o sin carpeta de etapa provisionada. */
  skipped: number;
}

/**
 * Escribe en Drive los documentos generados que están pendientes para el caso. Se llama fuera
 * de cualquier transacción de Prisma: es una llamada de red que puede tardar hasta el timeout
 * de sincronización, y no hay nada que revertir si falla — el documento simplemente sigue
 * pendiente para el próximo intento (cierre de la siguiente etapa o botón de forzado).
 */
export async function syncPendingCaseDocuments(
  caseId: string,
  isDemo: boolean,
  uploadedByUserId: string,
  options: { stage?: CaseStage } = {}
): Promise<DocumentSyncOutcome> {
  const pending = (await listPendingDocuments(caseId, isDemo, options)).filter((doc) =>
    ENABLED_GENERATED_DOCUMENT_KEYS.includes(doc.payload.docKey)
  );
  if (!pending.length) return { synced: [], failed: [], skipped: 0 };

  const paCase = await prisma.pACase.findUniqueOrThrow({ where: { id: caseId } });

  const items: DocumentSyncItem[] = [];
  const itemsByActivityKey = new Map<string, PendingDocument>();
  for (const doc of pending) {
    const folderId = paCase[STAGE_FOLDER_FIELD[doc.payload.stage]];
    if (!folderId) continue; // Caso sin esa carpeta de etapa provisionada (dato legado): se omite, no revienta el lote.
    items.push({
      activityKey: doc.payload.anchorActivityKey,
      fileSuffix: doc.payload.fileSuffix,
      targetFolderId: folderId,
      existingFileId: doc.existingFileId,
      fields: doc.payload.fields,
      tables: doc.payload.tables,
    });
    itemsByActivityKey.set(doc.payload.anchorActivityKey, doc);
  }
  if (!items.length) return { synced: [], failed: [], skipped: pending.length };

  const response = await syncCaseDocumentsRemote(paCase.code, items, isDemo);

  for (const result of response.results) {
    const doc = itemsByActivityKey.get(result.activityKey);
    if (!doc) continue;
    const instrument = await prisma.instrument.findFirst({ where: { activityKey: result.activityKey } });
    if (!instrument) continue;

    // Misma fileId a través de correcciones (política "sobrescribir + revisionId"): si ya
    // existe un DocumentRecord para este archivo se actualiza en sitio; solo se crea uno nuevo
    // la primera vez.
    await prisma.$transaction(async (tx) => {
      const existingRecord = await tx.documentRecord.findFirst({
        where: { caseId, instrumentId: instrument.id, fileId: result.fileId, isDemo },
      });

      if (existingRecord) {
        await tx.documentRecord.update({
          where: { id: existingRecord.id },
          data: {
            revisionId: result.revisionId,
            fileUrl: result.fileUrl,
            contentHash: doc.contentHash,
            lastSyncedAt: new Date(),
            isFinalVigente: true,
          },
        });
      } else {
        await tx.documentRecord.updateMany({
          where: { caseId, instrumentId: instrument.id, isFinalVigente: true, isDemo },
          data: { isFinalVigente: false },
        });
        await tx.documentRecord.create({
          data: {
            caseId,
            instrumentId: instrument.id,
            instrumentVersion: instrument.version,
            fileId: result.fileId,
            revisionId: result.revisionId,
            fileName: `${paCase.code}_${doc.payload.fileSuffix}`,
            fileUrl: result.fileUrl,
            uploadedByUserId,
            stage: doc.payload.stage,
            status: "VALIDADA",
            isFinalVigente: true,
            origin: "GENERATED",
            contentHash: doc.contentHash,
            lastSyncedAt: new Date(),
            isDemo,
          },
        });
      }
    });
  }

  return {
    synced: response.results.map((r) => r.activityKey),
    failed: response.errors.map((e) => ({ docKey: e.activityKey, message: e.message })),
    skipped: pending.length - items.length,
  };
}

export interface CaseWithPendingDocuments {
  caseId: string;
  code: string;
  pendingCount: number;
}

// Barre todos los casos del modo actual buscando documentos pendientes. Cara a cara con Drive
// solo a través de listPendingDocuments (lectura + hash, sin red) — nunca llama a Apps Script
// acá, así que es seguro correrla solo para mostrar el contador en el panel de admin.
export async function findCasesWithPendingDocuments(isDemo: boolean): Promise<CaseWithPendingDocuments[]> {
  const cases = await prisma.pACase.findMany({
    where: { isDemo },
    select: { id: true, code: true },
    orderBy: { code: "asc" },
  });

  const withPending: CaseWithPendingDocuments[] = [];
  for (const c of cases) {
    const pending = (await listPendingDocuments(c.id, isDemo)).filter((doc) =>
      ENABLED_GENERATED_DOCUMENT_KEYS.includes(doc.payload.docKey)
    );
    if (pending.length) withPending.push({ caseId: c.id, code: c.code, pendingCount: pending.length });
  }
  return withPending;
}

export interface BulkSyncFailure {
  caseCode: string;
  docKey: string;
  message: string;
}

export interface BulkSyncOutcome {
  casesProcessed: number;
  /** Casos con pendientes que no alcanzaron a procesarse en este llamado — re-clickear el botón los toma. */
  casesRemaining: number;
  synced: number;
  failed: number;
  /** Detalle de cada falla: sin esto, "failed: 3" no dice nada de por qué. */
  failures: BulkSyncFailure[];
}

// Botón de forzado del admin: por caso ya validado, syncPendingCaseDocuments hace una llamada
// de red a Apps Script — con muchos casos pendientes, un solo click podría exceder el límite de
// ejecución de la función serverless. Se acota a maxCases por invocación; lo que no alcanza a
// procesarse queda igual de pendiente (nada se pierde) para el próximo click.
export async function syncAllPendingCaseDocuments(
  isDemo: boolean,
  actorId: string,
  maxCases = 10
): Promise<BulkSyncOutcome> {
  const withPending = await findCasesWithPendingDocuments(isDemo);
  const toProcess = withPending.slice(0, maxCases);

  let synced = 0;
  const failures: BulkSyncFailure[] = [];
  for (const c of toProcess) {
    try {
      const outcome = await syncPendingCaseDocuments(c.caseId, isDemo, actorId);
      synced += outcome.synced.length;
      for (const f of outcome.failed) {
        failures.push({ caseCode: c.code, docKey: f.docKey, message: f.message });
        console.error(`Falló la sincronización de ${f.docKey} en el caso ${c.code}: ${f.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ caseCode: c.code, docKey: "(lote completo)", message });
      console.error(`No se pudo sincronizar documentos del caso ${c.code}:`, error);
    }
  }

  return {
    casesProcessed: toProcess.length,
    casesRemaining: withPending.length - toProcess.length,
    synced,
    failed: failures.length,
    failures,
  };
}
