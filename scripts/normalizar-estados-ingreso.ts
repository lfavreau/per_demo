/**
 * Lleva los estados de ingreso antiguos de PACandidate a los dos vigentes:
 *   SELECCIONADA  — se le puede asignar PER
 *   EN_ESPERA     — lista de espera
 *
 * Reglas:
 *   - Con PER asignado (convertedToCaseId)          → SELECCIONADA
 *   - ADMISIBLE, SELECCIONADA                       → SELECCIONADA
 *   - DERIVADA, CONTACTADA, PREINSCRITA, ENTREVISTADA, NO_ADMISIBLE, DESCARTADA, EN_ESPERA
 *                                                   → EN_ESPERA
 *
 * Solo toca registros DEMO (isDemo = 1); los reales se dejan como están salvo --incluir-reales.
 * Por defecto SIMULA. Mismos destinos que limpiar-datos-reales.ts:
 *   npx tsx scripts/normalizar-estados-ingreso.ts --local [--aplicar]
 *   npx tsx --env-file=.env.turso scripts/normalizar-estados-ingreso.ts --turso [--aplicar --confirmar-produccion]
 */
import { createClient } from "@libsql/client";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const dbIndex = args.indexOf("--db");
const dbFile = dbIndex >= 0 ? args[dbIndex + 1] : flag("--local") ? "dev.db" : null;
const useTurso = flag("--turso");
const apply = flag("--aplicar");
const scope = flag("--incluir-reales") ? "1 = 1" : "isDemo = 1";

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

const TO_SELECTED = `convertedToCaseId IS NOT NULL OR status IN ('ADMISIBLE', 'SELECCIONADA')`;
const STEPS: Array<[string, string, string]> = [
  ["→ SELECCIONADA", "SELECCIONADA", `${scope} AND status != 'SELECCIONADA' AND (${TO_SELECTED})`],
  ["→ EN_ESPERA", "EN_ESPERA", `${scope} AND status != 'EN_ESPERA' AND NOT (${TO_SELECTED})`],
];

async function main() {
  console.log(`Destino: ${useTurso ? "TURSO (producción)" : dbFile}`);
  console.log(`Modo: ${apply ? "APLICAR" : "SIMULACIÓN (no cambia nada)"}\n`);

  const before = await client.execute("SELECT status, isDemo, COUNT(*) AS n FROM PACandidate GROUP BY status, isDemo ORDER BY isDemo, status");
  console.log("Estados actuales:");
  for (const r of before.rows) console.log(`  ${r.isDemo ? "demo" : "real"}  ${String(r.status).padEnd(14)} ${r.n}`);

  console.log("\nCambios:");
  for (const [label, , where] of STEPS) {
    const n = Number((await client.execute(`SELECT COUNT(*) AS n FROM PACandidate WHERE ${where}`)).rows[0].n);
    console.log(`  ${label.padEnd(16)} ${n}`);
  }
  if (!apply) {
    console.log("\nSimulación terminada. Agrega --aplicar para cambiar.");
    return;
  }

  await client.batch(
    STEPS.map(([, to, where]) => ({
      sql: `UPDATE PACandidate SET status = ? WHERE ${where}`,
      args: [to],
    })),
    "write"
  );

  const after = await client.execute("SELECT status, isDemo, COUNT(*) AS n FROM PACandidate GROUP BY status, isDemo ORDER BY isDemo, status");
  console.log("\n✔ Aplicado. Estados ahora:");
  for (const r of after.rows) console.log(`  ${r.isDemo ? "demo" : "real"}  ${String(r.status).padEnd(14)} ${r.n}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
