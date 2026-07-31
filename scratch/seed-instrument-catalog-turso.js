// Puebla el catalogo de Instrument (y Setting) contra Turso de produccion, sin usar Prisma
// (solo @libsql/client, mismo patron que los otros scripts de scratch/ ya ejecutados).
// Idempotente: verifica por activityKey (o por name+stageId=null para los 4 instrumentos
// legacy fuera del itinerario) antes de insertar, igual que prisma/seed-bootstrap.ts.
// Uso: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scratch/seed-instrument-catalog-turso.js
const { createClient } = require('@libsql/client');
const crypto = require('crypto');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error("Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN antes de ejecutar este script.");
}
const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

const EFFECTIVE_FROM = "2026-03-01T00:00:00.000+00:00";

const SETTINGS_CATALOG = [
  { key: "alert_days_vinculacion", value: "10" },
  { key: "alert_days_conexion", value: "14" },
  { key: "alert_days_finalizacion", value: "10" },
  { key: "alert_days_validacion_pendiente", value: "5" },
  { key: "duration_months_vinculacion", value: "1" },
  { key: "duration_months_conexion", value: "6" },
  { key: "duration_months_finalizacion", value: "2" },
];

function buildInstrumentCatalog(createdByUserId) {
  const base = {
    googleResourceId: null, regionId: null, targetRole: "PER", scope: "NACIONAL",
    version: "1.0", status: "VIGENTE", effectiveFrom: EFFECTIVE_FROM,
    validationRequired: true, createdByUserId,
  };
  return [
    { ...base, name: "Inducción y Caracterización PER", description: "Recopilación de antecedentes iniciales de los PER", type: "GOOGLE_FORM", googleUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf123_induccion_per/viewform", phaseId: "FASE_1", stageId: null, order: 0, activityKey: null, submissionMode: "EXTERNAL_LINK", optional: false, triggerCondition: "SEQUENTIAL", targetRole: "PER", mandatory: true, blocksProgress: true, criticalTask: false, templateFileId: "mock_template_induccion_per", defaultDueDays: null },
    { ...base, name: "Formulario de Preinscripción PA", description: "Preinscripción de candidatas en Fase 2", type: "GOOGLE_FORM", googleUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf456_preinscripcion_pa/viewform", phaseId: "FASE_2", stageId: null, order: 0, activityKey: null, submissionMode: "EXTERNAL_LINK", optional: false, triggerCondition: "SEQUENTIAL", targetRole: "COORDINATOR", mandatory: true, blocksProgress: true, criticalTask: false, templateFileId: "mock_template_preinscripcion_pa", defaultDueDays: null },
    { ...base, name: "Acta de Primer Encuentro y Encuadre", description: "Registro de conformación y primer encuentro de la dupla", type: "GOOGLE_DOC", googleUrl: "https://docs.google.com/document/d/1_acta_primer_encuentro/edit", phaseId: "FASE_3", stageId: null, order: 0, activityKey: null, submissionMode: "EXTERNAL_LINK", optional: false, triggerCondition: "SEQUENTIAL", targetRole: "PER", mandatory: true, blocksProgress: true, criticalTask: true, templateFileId: "mock_template_acta_primer_encuentro", defaultDueDays: null },
    { ...base, name: "Itinerario de Acompañamiento Personalizado (IAP)", description: "Documento paraguas del IAP (el contenido real vive en las Actividades 1-4 del itinerario)", type: "GOOGLE_DOC", googleUrl: "https://docs.google.com/document/d/1_iap_plan/edit", phaseId: "FASE_4", stageId: null, order: 0, activityKey: null, submissionMode: "EXTERNAL_LINK", optional: false, triggerCondition: "SEQUENTIAL", targetRole: "PER", mandatory: true, blocksProgress: false, criticalTask: false, templateFileId: "mock_template_iap_plan", defaultDueDays: null },

    { ...base, name: "Primer encuentro. Reflexión personal del PER.", description: "Reflexión personal del PER sobre el primer encuentro con la persona acompañada", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_4", stageId: "VINCULACION", order: 1, activityKey: "PRIMER_ENCUENTRO_REFLEXION", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: true, criticalTask: false, templateFileId: "mock_template_primer_encuentro_reflexion", defaultDueDays: 7 },
    { ...base, name: "Actividad 1: Motivaciones y expectativas del acompañado", description: "Motivaciones y expectativas de la persona acompañada frente al proceso", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_4", stageId: "VINCULACION", order: 2, activityKey: "ACTIVIDAD_1_MOTIVACIONES", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: true, criticalTask: false, templateFileId: "mock_template_actividad_1", defaultDueDays: 15 },
    { ...base, name: "Actividad 2: Guía para la exploración de antecedentes y contexto personal", description: "Exploración de antecedentes familiares, de salud, sociales y educacionales/laborales", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_4", stageId: "VINCULACION", order: 3, activityKey: "ACTIVIDAD_2_ANTECEDENTES", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: true, criticalTask: false, templateFileId: "mock_template_actividad_2", defaultDueDays: 15 },
    { ...base, name: "Actividad 3: Mapa de recursos y necesidades", description: "Necesidades, fortalezas e importancia por cada uno de los 9 ámbitos de recuperación", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_4", stageId: "VINCULACION", order: 4, activityKey: "ACTIVIDAD_3_MAPA_RECURSOS", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: true, criticalTask: true, templateFileId: "mock_template_actividad_3", defaultDueDays: 20 },
    { ...base, name: "Actividad 4: Planificación de objetivos y acciones", description: "Objetivos, recursos, actividades y plazos por ámbito de recuperación", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_4", stageId: "VINCULACION", order: 5, activityKey: "ACTIVIDAD_4_PLANIFICACION", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: true, criticalTask: true, templateFileId: "mock_template_actividad_4", defaultDueDays: 20 },

    { ...base, name: "Actividad 5: Evaluación conjunta del proceso (Intermedia)", description: "Evaluación intermedia del proceso de acompañamiento", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_4", stageId: "CONEXION", order: 1, activityKey: "ACTIVIDAD_5_INTERMEDIA", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: false, criticalTask: false, templateFileId: "mock_template_evaluacion_intermedia", defaultDueDays: 30 },
    { ...base, name: "Reformular Actividad 4: Planificación de objetivos y acciones", description: "Reformulación del plan de trabajo según resultado de la Evaluación Intermedia (solo si aplica)", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_4", stageId: "CONEXION", order: 2, activityKey: "REFORMULAR_ACTIVIDAD_4", submissionMode: "NATIVE_FORM", optional: true, triggerCondition: "SEQUENTIAL", mandatory: false, blocksProgress: false, criticalTask: false, templateFileId: "mock_template_reformular_actividad_4", defaultDueDays: 15 },

    { ...base, name: "Actividad 5: Evaluación conjunta del proceso (Final)", description: "Evaluación final / diagnóstica ex-post", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_5", stageId: "FINALIZACION", order: 1, activityKey: "ACTIVIDAD_5_FINAL", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: true, criticalTask: true, templateFileId: "mock_template_evaluacion_ex_post", defaultDueDays: 15 },
    { ...base, name: "Actividad 6: Reflexiones finales del PER", description: "Reflexiones finales del PER sobre el proceso de acompañamiento", type: "MANUAL_TASK", googleUrl: null, phaseId: "FASE_5", stageId: "FINALIZACION", order: 2, activityKey: "ACTIVIDAD_6_REFLEXION_FINAL", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: true, criticalTask: false, templateFileId: "mock_template_actividad_6", defaultDueDays: 10 },
    { ...base, name: "Encuesta de Satisfacción PA", description: "Evaluación de calidad y satisfacción del proceso", type: "GOOGLE_FORM", googleUrl: "https://docs.google.com/forms/d/e/1FAIpQLSf789_satisfaccion/viewform", phaseId: "FASE_5", stageId: "FINALIZACION", order: 3, activityKey: "ENCUESTA_SATISFACCION", submissionMode: "EXTERNAL_LINK", optional: false, triggerCondition: "SEQUENTIAL", mandatory: true, blocksProgress: false, criticalTask: false, validationRequired: false, createdByUserId, templateFileId: "mock_template_satisfaccion", defaultDueDays: 10, effectiveFrom: EFFECTIVE_FROM },

    { ...base, name: "Formulario de Abandono — Persona Acompañada", description: "Registro oficial de retiro/deserción de la persona acompañada", type: "MANUAL_TASK", googleUrl: null, phaseId: "TRANSVERSAL", stageId: "FINALIZACION", order: 0, activityKey: "FORMULARIO_ABANDONO_PA", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "ON_WITHDRAWAL", version: "1.1", mandatory: true, blocksProgress: false, criticalTask: false, templateFileId: "mock_template_retiro", defaultDueDays: 7 },
    { ...base, name: "Formulario de Abandono — PER", description: "Registro oficial de abandono del proceso por parte del PER", type: "MANUAL_TASK", googleUrl: null, phaseId: "TRANSVERSAL", stageId: "FINALIZACION", order: 0, activityKey: "FORMULARIO_ABANDONO_PER", submissionMode: "NATIVE_FORM", optional: false, triggerCondition: "ON_WITHDRAWAL", mandatory: true, blocksProgress: false, criticalTask: false, templateFileId: "mock_template_retiro_per", defaultDueDays: 7 },
  ];
}

async function main() {
  const adminRes = await client.execute({
    sql: "SELECT id FROM User WHERE email = ?;",
    args: ["admin@per2026.cl"],
  });
  if (adminRes.rows.length === 0) throw new Error("No se encontro admin@per2026.cl");
  const adminId = adminRes.rows[0].id;
  console.log(`Usando createdByUserId = ${adminId}`);

  console.log("\nSincronizando Settings...");
  for (const s of SETTINGS_CATALOG) {
    await client.execute({ sql: "INSERT OR IGNORE INTO Setting (key, value) VALUES (?, ?);", args: [s.key, s.value] });
  }
  console.log(`Settings: ${SETTINGS_CATALOG.length} verificados.`);

  console.log("\nSincronizando Instrumentos...");
  const catalog = buildInstrumentCatalog(adminId);
  let created = 0;
  for (const inst of catalog) {
    const existing = inst.activityKey
      ? await client.execute({ sql: "SELECT id FROM Instrument WHERE activityKey = ?;", args: [inst.activityKey] })
      : await client.execute({ sql: "SELECT id FROM Instrument WHERE name = ? AND stageId IS NULL;", args: [inst.name] });

    if (existing.rows.length > 0) {
      console.log(`  ℹ️ ya existe: ${inst.activityKey || inst.name}`);
      continue;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO Instrument
        (id, name, description, type, googleResourceId, googleUrl, phaseId, stageId, "order", activityKey,
         submissionMode, optional, triggerCondition, targetRole, scope, regionId, version, status,
         effectiveFrom, templateFileId, mandatory, blocksProgress, criticalTask, defaultDueDays,
         validationRequired, createdByUserId, createdAt, updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
      args: [
        id, inst.name, inst.description, inst.type, inst.googleResourceId, inst.googleUrl, inst.phaseId,
        inst.stageId, inst.order, inst.activityKey, inst.submissionMode, inst.optional ? 1 : 0,
        inst.triggerCondition, inst.targetRole, inst.scope, inst.regionId, inst.version, inst.status,
        inst.effectiveFrom, inst.templateFileId, inst.mandatory ? 1 : 0, inst.blocksProgress ? 1 : 0,
        inst.criticalTask ? 1 : 0, inst.defaultDueDays, inst.validationRequired ? 1 : 0,
        inst.createdByUserId, now, now,
      ],
    });
    console.log(`  ✅ creado: ${inst.activityKey || inst.name}`);
    created++;
  }
  console.log(`\nInstrumentos: ${created} nuevos, ${catalog.length - created} ya existian.`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
