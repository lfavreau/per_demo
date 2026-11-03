/**
 * Elimina casos duplicados: varias asignaciones creadas para la misma persona (PACandidate)
 * por clics repetidos en "Asignar PER". Deja UN caso por persona:
 *   - el que tenga más actividad real (tareas ya trabajadas o bitácoras), y
 *   - a igual actividad, el más antiguo (código más bajo).
 * El caso conservado queda enlazado a la persona y toma como alias su nombre o alias actual.
 * Los casos sobrantes se borran con todo lo que cuelga de ellos (tareas, IAP, historiales, alertas,
 * bitácoras, avisos que apuntaban a ellos).
 *
 * Por defecto SIMULA. Mismos destinos que los otros scripts:
 *   npx tsx scripts/eliminar-casos-duplicados.ts --local [--aplicar]
 *   npx tsx --env-file=.env.turso scripts/eliminar-casos-duplicados.ts --turso [--aplicar --confirmar-produccion]
 * Hace todo en una sola transacción. Saca un respaldo antes de aplicar en producción.
 */
import { createClient } from "@libsql/client";

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

interface CaseRow {
  id: string;
  code: string;
  candidateId: string;
  isDemo: number;
  createdAt: string;
  activity: number;
}

const inList = (ids: string[]) => ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");

async function main() {
  console.log(`Destino: ${useTurso ? "TURSO (producción)" : dbFile}`);
  console.log(`Modo: ${apply ? "APLICAR (borra)" : "SIMULACIÓN (no borra nada)"}\n`);

  const dupCandidates = await client.execute(
    "SELECT candidateId FROM PACase GROUP BY candidateId HAVING COUNT(*) > 1"
  );
  if (dupCandidates.rows.length === 0) {
    console.log("No hay personas con más de un caso. Nada que hacer.");
    return;
  }

  const toDelete: string[] = [];
  const keepFor: Array<{ keep: string; candidateId: string }> = [];

  for (const dc of dupCandidates.rows) {
    const rs = await client.execute({
      sql: `SELECT c.id, c.code, c.candidateId, c.isDemo, c.createdAt,
              (SELECT COUNT(*) FROM Task t WHERE t.paCaseId = c.id AND t.status NOT IN ('PENDIENTE', 'CANCELADA'))
              + (SELECT COUNT(*) FROM SessionLog s WHERE s.paCaseId = c.id) AS activity
            FROM PACase c WHERE c.candidateId = ? ORDER BY c.code`,
      args: [dc.candidateId as string],
    });
    const cases = rs.rows.map((r) => ({ ...r, activity: Number(r.activity) })) as unknown as CaseRow[];
    // Más actividad primero; a igual actividad, el de código más bajo (ya viene ordenado por code).
    const keep = [...cases].sort((a, b) => b.activity - a.activity || a.code.localeCompare(b.code))[0];
    const extras = cases.filter((c) => c.id !== keep.id);
    keepFor.push({ keep: keep.id, candidateId: keep.candidateId });
    toDelete.push(...extras.map((c) => c.id));

    console.log(`Persona …${String(keep.candidateId).slice(-6)} (${keep.isDemo ? "demo" : "real"}): ${cases.length} casos`);
    for (const c of cases) {
      const mark = c.id === keep.id ? "CONSERVA" : "borra   ";
      console.log(`   ${mark} ${c.code}  actividad=${c.activity}`);
    }
  }

  const ids = inList(toDelete);
  const counts: Array<[string, string]> = [
    ["Casos", `SELECT COUNT(*) AS n FROM PACase WHERE id IN (${ids})`],
    ["Tareas", `SELECT COUNT(*) AS n FROM Task WHERE paCaseId IN (${ids})`],
    ["Bitácoras", `SELECT COUNT(*) AS n FROM SessionLog WHERE paCaseId IN (${ids})`],
    ["Avisos con enlace al caso", `SELECT COUNT(*) AS n FROM Notification WHERE ${toDelete.map((id) => `link LIKE '%${id}%'`).join(" OR ")}`],
  ];
  console.log("\nSe borrarían:");
  for (const [label, sql] of counts) {
    console.log(`  ${label.padEnd(26)} ${Number((await client.execute(sql)).rows[0].n)}`);
  }

  if (!apply) {
    console.log("\nSimulación terminada. Agrega --aplicar para borrar.");
    return;
  }

  const taskIds = `(SELECT id FROM Task WHERE paCaseId IN (${ids}))`;
  const iapIds = `(SELECT id FROM IAPRecord WHERE paCaseId IN (${ids}))`;
  const statements: Array<string | { sql: string; args: string[] }> = [
    `DELETE FROM TaskEvent WHERE taskId IN ${taskIds}`,
    `DELETE FROM Feedback WHERE taskId IN ${taskIds} OR entityId IN (${ids})`,
    `DELETE FROM IAPDomainMap WHERE iapRecordId IN ${iapIds} OR taskId IN ${taskIds}`,
    `DELETE FROM IAPGoal WHERE iapRecordId IN ${iapIds} OR taskId IN ${taskIds}`,
    `DELETE FROM SessionLog WHERE paCaseId IN (${ids})`,
    `DELETE FROM Alert WHERE paCaseId IN (${ids}) OR taskId IN ${taskIds}`,
    `DELETE FROM DocumentRecord WHERE caseId IN (${ids})`,
    `DELETE FROM NetworkActivation WHERE caseId IN (${ids})`,
    `DELETE FROM Task WHERE paCaseId IN (${ids})`,
    `DELETE FROM IAPRecord WHERE paCaseId IN (${ids})`,
    `DELETE FROM CaseStatusHistory WHERE paCaseId IN (${ids})`,
    `DELETE FROM CaseStageHistory WHERE paCaseId IN (${ids})`,
    `DELETE FROM ContactAttempt WHERE paCaseId IN (${ids})`,
    `DELETE FROM Notification WHERE ${toDelete.map((id) => `link LIKE '%${id}%'`).join(" OR ")}`,
    `DELETE FROM PACase WHERE id IN (${ids})`,
  ];
  // El caso conservado queda enlazado a la persona y con su nombre o alias vigente.
  for (const { keep, candidateId } of keepFor) {
    statements.push({ sql: "UPDATE PACandidate SET convertedToCaseId = ? WHERE id = ?", args: [keep, candidateId] });
    statements.push({
      sql: "UPDATE PACase SET alias = (SELECT substr(trim(sourceCenter), 1, 40) FROM PACandidate WHERE id = ?) WHERE id = ?",
      args: [candidateId, keep],
    });
  }
  await client.batch(statements, "write");

  const left = await client.execute(
    "SELECT COUNT(*) AS n FROM (SELECT candidateId FROM PACase GROUP BY candidateId HAVING COUNT(*) > 1)"
  );
  console.log(`\n✔ Duplicados eliminados. Personas que aún tienen más de un caso: ${Number(left.rows[0].n)}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
