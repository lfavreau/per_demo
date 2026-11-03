/**
 * Borra los datos REALES (isDemo = false) y deja intacto todo lo demo, para empezar a cargar
 * datos reales a mano desde admin y coordinación.
 *
 * Qué se conserva:
 *  - Todo registro con isDemo = true (casos, sesiones, tareas, etc. de demostración).
 *  - Las cuentas demo (src/lib/demo-accounts.ts): admin, coordinadores y PER demo.
 *  - Cualquier ADMIN / COORDINATOR (solo se borran usuarios con rol PER que no son demo).
 *  - El catálogo (Instrument) y la configuración (Setting).
 *
 * Qué se borra: PER reales (usuario + perfil), y todo lo que cuelga de datos reales — casos,
 * candidatas, tareas, bitácoras, supervisiones, alertas, documentos, redes, notificaciones,
 * auditoría, snapshots de reportes, etc.
 *
 * Uso (por defecto SIMULA y no toca nada):
 *   npx tsx scripts/limpiar-datos-reales.ts --local                   # simula sobre dev.db
 *   npx tsx scripts/limpiar-datos-reales.ts --local --aplicar         # borra en dev.db
 *   npx tsx scripts/limpiar-datos-reales.ts --db ruta/otra.db         # otra base SQLite
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... \
 *     npx tsx scripts/limpiar-datos-reales.ts --turso                 # simula en producción
 *   ... --turso --aplicar --confirmar-produccion                      # borra en producción
 *
 * Hace todo en una sola transacción: si algo falla, no se borra nada.
 * ANTES de aplicar en producción, saca un respaldo de Turso.
 */
import { createClient } from "@libsql/client";
import { DEMO_ACCOUNTS } from "../src/lib/demo-accounts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const dbIndex = args.indexOf("--db");
const dbFile = dbIndex >= 0 ? args[dbIndex + 1] : flag("--local") ? "dev.db" : null;
const useTurso = flag("--turso");
const apply = flag("--aplicar");

if ((!dbFile && !useTurso) || (dbFile && useTurso)) {
  console.error("Indica el destino: --local | --db <archivo> | --turso");
  process.exit(1);
}
if (useTurso && apply && !flag("--confirmar-produccion")) {
  console.error("Aplicar en Turso (producción) exige además --confirmar-produccion");
  process.exit(1);
}

const url = useTurso ? process.env.TURSO_DATABASE_URL : `file:${dbFile}`;
if (!url) {
  console.error("Falta TURSO_DATABASE_URL (y TURSO_AUTH_TOKEN) para --turso");
  process.exit(1);
}
const client = createClient({ url, authToken: useTurso ? process.env.TURSO_AUTH_TOKEN : undefined });

const demoEmails = DEMO_ACCOUNTS.map((a) => `'${a.email.replace(/'/g, "''")}'`).join(", ");

// Conjuntos de ids "reales". Se expresan como subconsultas y los borrados van de hijos a padres,
// de modo que cada subconsulta siga viendo sus filas cuando se usa.
const REAL_USERS = `(SELECT id FROM User WHERE role = 'PER' AND isDemo = 0 AND email NOT IN (${demoEmails}))`;
const REAL_PROFILES = `(SELECT id FROM PERProfile WHERE userId IN ${REAL_USERS})`;
const REAL_CASES = `(SELECT id FROM PACase WHERE isDemo = 0)`;
const REAL_TASKS = `(SELECT id FROM Task WHERE isDemo = 0 OR paCaseId IN ${REAL_CASES} OR assignedToUserId IN ${REAL_USERS} OR assignedByUserId IN ${REAL_USERS})`;
const REAL_SESSIONS = `(SELECT id FROM SessionLog WHERE isDemo = 0 OR paCaseId IN ${REAL_CASES} OR perId IN ${REAL_USERS})`;
const REAL_DEVICES = `(SELECT id FROM NetworkDevice WHERE isDemo = 0)`;
const REAL_IAP = `(SELECT id FROM IAPRecord WHERE paCaseId IN ${REAL_CASES})`;

// [tabla, condición] en orden de borrado (hijos primero).
const STEPS: Array<[string, string]> = [
  ["TaskEvent", `taskId IN ${REAL_TASKS}`],
  [
    "Feedback",
    `perId IN ${REAL_USERS} OR taskId IN ${REAL_TASKS} OR entityId IN ${REAL_CASES} OR entityId IN ${REAL_SESSIONS} OR entityId IN ${REAL_TASKS}`,
  ],
  ["IAPDomainMap", `iapRecordId IN ${REAL_IAP} OR taskId IN ${REAL_TASKS}`],
  ["IAPGoal", `iapRecordId IN ${REAL_IAP} OR taskId IN ${REAL_TASKS}`],
  ["SessionLog", `id IN ${REAL_SESSIONS}`],
  [
    "Alert",
    `isDemo = 0 OR paCaseId IN ${REAL_CASES} OR perId IN ${REAL_PROFILES} OR perId IN ${REAL_USERS} OR taskId IN ${REAL_TASKS}`,
  ],
  ["DocumentRecord", `isDemo = 0 OR caseId IN ${REAL_CASES} OR uploadedByUserId IN ${REAL_USERS}`],
  ["NetworkActivation", `isDemo = 0 OR caseId IN ${REAL_CASES} OR networkDeviceId IN ${REAL_DEVICES}`],
  ["Phase5Record", `isDemo = 0`],
  ["NetworkDevice", `isDemo = 0`],
  ["Task", `id IN ${REAL_TASKS}`],
  ["IAPRecord", `paCaseId IN ${REAL_CASES}`],
  ["CaseStatusHistory", `paCaseId IN ${REAL_CASES}`],
  ["ContactAttempt", `paCaseId IN ${REAL_CASES}`],
  ["CaseStageHistory", `paCaseId IN ${REAL_CASES}`],
  ["DriveFileRef", `uploadedByUserId IN ${REAL_USERS} OR entityId IN ${REAL_CASES}`],
  ["CalendarEventRef", `paCaseId IN ${REAL_CASES} OR perId IN ${REAL_PROFILES} OR perId IN ${REAL_USERS}`],
  ["Supervision", `isDemo = 0 OR perId IN ${REAL_PROFILES} OR perId IN ${REAL_USERS}`],
  ["TrainingRecord", `perId IN ${REAL_PROFILES}`],
  ["ReportSnapshot", `isDemo = 0`],
  ["Notification", `isDemo = 0 OR userId IN ${REAL_USERS}`],
  ["AuditLog", `isDemo = 0 OR userId IN ${REAL_USERS}`],
  ["PushSubscription", `userId IN ${REAL_USERS}`],
  ["PACase", `isDemo = 0`],
  ["PACandidate", `isDemo = 0`],
  ["PERProfile", `userId IN ${REAL_USERS}`],
  ["User", `id IN ${REAL_USERS}`],
];

async function count(sql: string): Promise<number> {
  const rs = await client.execute(sql);
  return Number(Object.values(rs.rows[0])[0] ?? 0);
}

async function main() {
  console.log(`Destino: ${useTurso ? "TURSO (producción)" : dbFile}`);
  console.log(`Modo: ${apply ? "APLICAR (borra)" : "SIMULACIÓN (no borra nada)"}\n`);

  // Bloqueos: filas que se conservan pero apuntan a algo que se borraría.
  const blockers: Array<[string, string]> = [
    ["casos demo asignados a un PER real", `SELECT COUNT(*) FROM PACase WHERE isDemo = 1 AND perId IN ${REAL_PROFILES}`],
    ["instrumentos creados por un PER real", `SELECT COUNT(*) FROM Instrument WHERE createdByUserId IN ${REAL_USERS}`],
    [
      "tareas demo ligadas a un PER real o a un caso real",
      `SELECT COUNT(*) FROM Task WHERE isDemo = 1 AND (assignedToUserId IN ${REAL_USERS} OR assignedByUserId IN ${REAL_USERS} OR paCaseId IN ${REAL_CASES})`,
    ],
  ];
  let blocked = false;
  for (const [label, sql] of blockers) {
    const n = await count(sql);
    if (n > 0) {
      blocked = true;
      console.error(`⚠ Bloqueo: ${n} ${label}. Revisa antes de borrar.`);
    }
  }

  const realUsers = await client.execute(
    `SELECT email, name FROM User WHERE id IN ${REAL_USERS} ORDER BY email`
  );
  console.log(`PER reales que se borrarán (${realUsers.rows.length}):`);
  for (const r of realUsers.rows) console.log(`  - ${r.email}  (${r.name})`);

  const keptOthers = await client.execute(
    `SELECT email, role, isDemo FROM User WHERE role != 'PER' AND isDemo = 0 AND email NOT IN (${demoEmails}) ORDER BY email`
  );
  if (keptOthers.rows.length) {
    console.log(`\nAdmin/coordinadores NO demo que se CONSERVAN (${keptOthers.rows.length}):`);
    for (const r of keptOthers.rows) console.log(`  - ${r.email}  (${r.role})`);
  }

  console.log("\nFilas por tabla:");
  const plan: Array<[string, number]> = [];
  for (const [table, where] of STEPS) {
    const n = await count(`SELECT COUNT(*) FROM ${table} WHERE ${where}`);
    plan.push([table, n]);
    if (n > 0) console.log(`  ${table.padEnd(18)} ${n}`);
  }
  const total = plan.reduce((s, [, n]) => s + n, 0);
  console.log(`  ${"TOTAL".padEnd(18)} ${total}`);

  if (!apply) {
    console.log("\nSimulación terminada. Para borrar de verdad agrega --aplicar.");
    return;
  }
  if (blocked) {
    console.error("\nNo se aplicó nada por los bloqueos de arriba.");
    process.exit(1);
  }

  await client.batch(
    STEPS.map(([table, where]) => `DELETE FROM ${table} WHERE ${where}`),
    "write"
  );

  console.log("\n✔ Borrado aplicado. Lo que queda:");
  for (const t of ["User", "PERProfile", "PACase", "PACandidate", "Task", "SessionLog", "Supervision"]) {
    const rs = await client.execute(`SELECT isDemo, COUNT(*) AS n FROM ${t === "PERProfile" ? "User" : t} GROUP BY isDemo`);
    if (t === "PERProfile") continue;
    console.log(`  ${t.padEnd(14)} ${rs.rows.map((r) => `isDemo=${r.isDemo}: ${r.n}`).join("  ") || "vacía"}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
