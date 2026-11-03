/**
 * Respaldo completo (esquema + datos) de una base SQLite/Turso a un archivo .db local.
 * Solo LEE el origen. Verifica que cada tabla tenga las mismas filas en el respaldo.
 *
 * El respaldo contiene datos reales de personas: queda en respaldos/ (ignorado por git).
 * No lo subas a ningún lado ni lo compartas.
 *
 * Uso:
 *   npx tsx scripts/respaldar-base.ts --local                 # respalda dev.db
 *   npx tsx scripts/respaldar-base.ts --db ruta/otra.db
 *   npx tsx --env-file=.env.turso scripts/respaldar-base.ts --turso   # producción
 *   ... --salida respaldos/mi-respaldo.db                      # nombre propio (opcional)
 */
import { createClient } from "@libsql/client";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const dbFile = value("--db") ?? (flag("--local") ? "dev.db" : null);
const useTurso = flag("--turso");
if ((!dbFile && !useTurso) || (dbFile && useTurso)) {
  console.error("Indica el origen: --local | --db <archivo> | --turso");
  process.exit(1);
}
const sourceUrl = useTurso ? process.env.TURSO_DATABASE_URL : `file:${dbFile}`;
if (!sourceUrl) {
  console.error("Falta TURSO_DATABASE_URL (y TURSO_AUTH_TOKEN) para --turso");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = value("--salida") ?? `respaldos/${useTurso ? "turso" : "local"}-${stamp}.db`;
if (existsSync(outPath)) {
  console.error(`Ya existe ${outPath}; elige otro nombre con --salida`);
  process.exit(1);
}
mkdirSync(dirname(outPath), { recursive: true });

const source = createClient({ url: sourceUrl, authToken: useTurso ? process.env.TURSO_AUTH_TOKEN : undefined });
const target = createClient({ url: `file:${outPath}` });

// Un respaldo incompleto no debe quedar en disco pareciendo válido. En Windows hay que cerrar la
// conexión antes de borrar el archivo.
function discardPartialBackup() {
  try {
    target.close();
    rmSync(outPath, { force: true });
  } catch {
    console.error(`No se pudo borrar el respaldo parcial; bórralo a mano: ${outPath}`);
  }
}

const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;
const BATCH = 200;

async function main() {
  console.log(`Origen: ${useTurso ? "TURSO (producción)" : dbFile}`);
  console.log(`Respaldo: ${outPath}\n`);

  const objects = await source.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name"
  );
  const tables = objects.rows.filter((o) => o.type === "table").map((o) => String(o.name));

  await target.execute("PRAGMA foreign_keys = OFF");
  for (const o of objects.rows) await target.execute(String(o.sql));

  let totalRows = 0;
  const mismatches: string[] = [];
  for (const table of tables) {
    const rs = await source.execute(`SELECT * FROM ${quote(table)}`);
    const cols = rs.columns.map(quote).join(", ");
    const placeholders = rs.columns.map(() => "?").join(", ");
    for (let i = 0; i < rs.rows.length; i += BATCH) {
      const chunk = rs.rows.slice(i, i + BATCH);
      await target.batch(
        chunk.map((row) => ({
          sql: `INSERT INTO ${quote(table)} (${cols}) VALUES (${placeholders})`,
          args: rs.columns.map((c) => row[c] as never),
        })),
        "write"
      );
    }
    const back = Number((await target.execute(`SELECT COUNT(*) AS n FROM ${quote(table)}`)).rows[0].n);
    totalRows += back;
    if (back !== rs.rows.length) mismatches.push(`${table}: origen ${rs.rows.length} ≠ respaldo ${back}`);
    if (rs.rows.length > 0) console.log(`  ${table.padEnd(22)} ${String(back).padStart(6)} filas`);
  }

  if (mismatches.length) {
    console.error("\n✖ El respaldo NO coincide con el origen:\n  " + mismatches.join("\n  "));
    discardPartialBackup();
    process.exit(1);
  }
  console.log(`\n✔ Respaldo verificado: ${tables.length} tablas, ${totalRows} filas → ${outPath}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  discardPartialBackup();
  process.exit(1);
});
