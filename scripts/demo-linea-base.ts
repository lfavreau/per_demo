/**
 * Línea base del reinicio del modo demo: guarda una foto de los datos demo actuales (filas isDemo = 1 y lo que
 * cuelga de ellas) en el ajuste `demo_baseline`. A esa foto vuelve el modo demo cuando se cumplen 5 minutos de uso.
 * Mientras no haya línea base el reinicio está apagado.
 *
 * Solo LEE los datos demo y escribe una única fila en Setting. No toca datos reales.
 *
 * Uso:
 *   npx tsx scripts/demo-linea-base.ts                              # local: muestra qué se guardaría
 *   npx tsx scripts/demo-linea-base.ts --guardar                    # local: la guarda en dev.db
 *   npx tsx --env-file=.env.turso scripts/demo-linea-base.ts                                   # producción: solo muestra
 *   npx tsx --env-file=.env.turso scripts/demo-linea-base.ts --guardar --confirmar-produccion  # producción: la guarda
 *   ... --quitar [--confirmar-produccion]   # apaga el reinicio (borra la línea base y la ventana)
 *
 * Antes de guardar, deja los datos demo como quieres que partan siempre; saca un respaldo si es producción
 * (npx tsx --env-file=.env.turso scripts/respaldar-base.ts --turso).
 */
import { prisma } from "../src/lib/db";
import { DEMO_BASELINE_KEY, DEMO_WINDOW_KEY, captureDemoBaseline, snapshotDemoData } from "../src/server/services/demo.service";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const isProduction = Boolean(process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || process.env.STORAGE_TURSO_DATABASE_URL);

async function main() {
  console.log(`Base: ${isProduction ? "TURSO (producción)" : "local (dev.db)"}`);
  if ((flag("--guardar") || flag("--quitar")) && isProduction && !flag("--confirmar-produccion")) {
    console.error("Es producción: agrega --confirmar-produccion para escribir.");
    process.exit(1);
  }

  if (flag("--quitar")) {
    const removed = await prisma.setting.deleteMany({ where: { key: { in: [DEMO_BASELINE_KEY, DEMO_WINDOW_KEY] } } });
    console.log(`Reinicio del modo demo apagado (${removed.count} ajuste(s) borrado(s)).`);
    return;
  }

  const snapshot = await snapshotDemoData();
  const tables = Object.entries(snapshot.tables);
  for (const [name, table] of tables) console.log(`  ${name.padEnd(22)} ${String(table.rows.length).padStart(4)} filas`);
  const total = tables.reduce((sum, [, t]) => sum + t.rows.length, 0);
  console.log(`Total: ${tables.length} tablas, ${total} filas demo.`);

  const existing = await prisma.setting.findUnique({ where: { key: DEMO_BASELINE_KEY }, select: { key: true } });
  console.log(existing ? "Ya hay una línea base guardada (se reemplazaría)." : "Todavía no hay línea base: el reinicio está apagado.");

  if (!flag("--guardar")) {
    console.log("Solo se mostró. Agrega --guardar para guardarla.");
    return;
  }
  await captureDemoBaseline();
  console.log("Línea base guardada. El modo demo se reinicia a ella tras 5 minutos de uso.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
