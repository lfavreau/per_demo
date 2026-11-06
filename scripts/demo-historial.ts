/**
 * Da historia a los casos del modo demo: completa (envía y valida, con contenido inventado) las actividades
 * ANTERIORES a la que cada caso demo ya tiene, para poder revisarlas desde el historial.
 *
 * Solo escribe en casos con isDemo = 1. No toca datos reales. Por defecto solo MUESTRA qué haría.
 * Después de aplicarlo, guarda el estado como línea base del reinicio (scripts/demo-linea-base.ts --guardar).
 *
 * Uso:
 *   npx tsx scripts/demo-historial.ts                                  # local: plan, sin escribir
 *   npx tsx scripts/demo-historial.ts --aplicar                        # local: escribe en dev.db
 *   npx tsx --env-file=.env.turso scripts/demo-historial.ts                                    # producción: solo plan
 *   npx tsx --env-file=.env.turso scripts/demo-historial.ts --aplicar --confirmar-produccion   # producción: escribe
 *   ... --casos PA-VAL-005,PA-MET-001     # limitar a algunos casos
 *
 * En producción saca antes un respaldo: npx tsx --env-file=.env.turso scripts/respaldar-base.ts --turso
 */
import { fillDemoHistory, planDemoHistory } from "../src/server/services/demo-history.service";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const isProduction = Boolean(process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || process.env.STORAGE_TURSO_DATABASE_URL);
const codes = value("--casos")?.split(",").map((c) => c.trim()).filter(Boolean);

async function main() {
  console.log(`Base: ${isProduction ? "TURSO (producción)" : "local (dev.db)"}`);
  if (flag("--aplicar") && isProduction && !flag("--confirmar-produccion")) {
    console.error("Es producción: agrega --confirmar-produccion para escribir.");
    process.exit(1);
  }

  const plan = await planDemoHistory(codes);
  let total = 0;
  for (const item of plan) {
    total += item.fill.length;
    const detail = item.note ? `(${item.note})` : item.fill.length ? `${item.fill.length} actividad(es): ${item.fill.map((t) => t.split(":")[0]).join(", ")}` : "nada que completar";
    console.log(`  ${item.code}  ${item.stage.padEnd(12)} ${item.status.padEnd(12)} ${detail}`);
  }
  console.log(`Total: ${total} actividad(es) en ${plan.filter((p) => p.fill.length).length} caso(s) demo.`);

  if (!flag("--aplicar")) {
    console.log("Solo se mostró el plan. Agrega --aplicar para escribir.");
    return;
  }
  const done = await fillDemoHistory(codes);
  console.log(`Listo: ${done.reduce((sum, d) => sum + d.filled, 0)} actividad(es) completadas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
