import { prisma } from "@/lib/db";

/**
 * Reinicio del modo demo. Los datos de demostración (filas con isDemo = 1 y todo lo que cuelga de ellas)
 * vuelven a una foto guardada ("línea base") cuando la ventana de uso de 5 minutos se cumplió. No hay ningún
 * proceso vigilando: se calcula cuando alguien con sesión demo hace una petición (ver getCurrentUser).
 *
 * Solo toca lo demo. Los datos reales (isDemo = 0) jamás se leen ni se borran: el alcance se calcula con las
 * claves foráneas del propio esquema, así que una tabla nueva queda cubierta sin tocar este archivo.
 */

export const DEMO_WINDOW_MINUTES = 5;
export const DEMO_BASELINE_KEY = "demo_baseline";
export const DEMO_WINDOW_KEY = "demo_window_started_at";

type Db = Pick<typeof prisma, "$queryRawUnsafe" | "$executeRawUnsafe">;

interface TableInfo {
  name: string;
  columns: string[];
  hasIsDemo: boolean;
  /** Claves foráneas hacia otras tablas: columna propia → tabla y columna de destino. */
  parents: Array<{ from: string; table: string; to: string }>;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const asText = (value: unknown) => String(value);

/** Tablas del esquema, en orden de inserción (primero las de las que otras dependen). Setting queda fuera. */
async function loadSchema(db: Db): Promise<TableInfo[]> {
  const names = (
    (await db.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_prisma%' ESCAPE '\\' ORDER BY name`
    )) as Array<{ name: string }>
  )
    .map((r) => r.name)
    .filter((name) => name !== "Setting");

  const infos = new Map<string, TableInfo>();
  for (const name of names) {
    const cols = (await db.$queryRawUnsafe(`PRAGMA table_info(${quote(name)})`)) as Array<{ name: string }>;
    const fks = (await db.$queryRawUnsafe(`PRAGMA foreign_key_list(${quote(name)})`)) as Array<{ table: string; from: string; to: string }>;
    const columns = cols.map((c) => asText(c.name));
    infos.set(name, {
      name,
      columns,
      hasIsDemo: columns.includes("isDemo"),
      parents: fks.filter((fk) => names.includes(asText(fk.table))).map((fk) => ({ from: asText(fk.from), table: asText(fk.table), to: asText(fk.to) })),
    });
  }

  const ordered: TableInfo[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (name: string) => {
    if (state.has(name)) return; // ya visitada, o ciclo (autorreferencia): se corta
    state.set(name, "visiting");
    for (const parent of infos.get(name)!.parents) visit(parent.table);
    state.set(name, "done");
    ordered.push(infos.get(name)!);
  };
  names.forEach(visit);
  return ordered;
}

/**
 * Condición SQL (sin parámetros) de las filas demo de una tabla: las marcadas isDemo = 1 y las que cuelgan de
 * una fila demo por clave foránea (lo mismo que borraría una eliminación en cascada).
 */
function demoScope(table: TableInfo, tables: Map<string, TableInfo>, path: string[] = []): string {
  const clauses: string[] = [];
  if (table.hasIsDemo) clauses.push(`${quote(table.name)}.${quote("isDemo")} = 1`);
  for (const parent of table.parents) {
    if (path.includes(parent.table) || parent.table === table.name) continue;
    const parentInfo = tables.get(parent.table)!;
    const parentScope = demoScope(parentInfo, tables, [...path, table.name]);
    if (!parentScope) continue;
    clauses.push(
      `${quote(table.name)}.${quote(parent.from)} IN (SELECT ${quote(parent.to)} FROM ${quote(parent.table)} WHERE ${parentScope})`
    );
  }
  return clauses.length ? `(${clauses.join(" OR ")})` : "";
}

/** Valores de una fila a JSON: fechas y enteros grandes no son serializables tal cual. */
function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Uint8Array) throw new Error("El respaldo demo no admite columnas binarias");
  return value;
}

function fromJsonValue(value: unknown): unknown {
  if (value && typeof value === "object" && "$date" in value) return new Date((value as { $date: string }).$date);
  return value;
}

export interface DemoBaseline {
  version: 1;
  capturedAt: string;
  tables: Record<string, { columns: string[]; rows: unknown[][] }>;
}

/** Lee la foto de los datos demo actuales (aún no la guarda). */
export async function snapshotDemoData(db: Db = prisma): Promise<DemoBaseline> {
  const schema = await loadSchema(db);
  const byName = new Map(schema.map((t) => [t.name, t]));
  const tables: DemoBaseline["tables"] = {};
  for (const table of schema) {
    const scope = demoScope(table, byName);
    if (!scope) continue;
    const rows = (await db.$queryRawUnsafe(`SELECT * FROM ${quote(table.name)} WHERE ${scope}`)) as Array<Record<string, unknown>>;
    if (rows.length === 0) continue;
    tables[table.name] = { columns: table.columns, rows: rows.map((row) => table.columns.map((c) => toJsonValue(row[c]))) };
  }
  return { version: 1, capturedAt: new Date().toISOString(), tables };
}

/** Guarda la foto actual de los datos demo como la línea base a la que vuelve cada reinicio. */
export async function captureDemoBaseline(db: typeof prisma = prisma): Promise<{ tables: number; rows: number }> {
  const baseline = await snapshotDemoData(db);
  const value = JSON.stringify(baseline);
  await db.setting.upsert({
    where: { key: DEMO_BASELINE_KEY },
    update: { value },
    create: { key: DEMO_BASELINE_KEY, value },
  });
  const rows = Object.values(baseline.tables).reduce((sum, t) => sum + t.rows.length, 0);
  return { tables: Object.keys(baseline.tables).length, rows };
}

const INSERT_CHUNK_PARAMS = 600;

/**
 * Deja los datos demo como en la línea base: borra lo demo (hijos antes que padres) y lo vuelve a insertar
 * (padres antes que hijos), todo en una transacción. Si algo falla no cambia nada. Devuelve false si todavía
 * no hay línea base guardada.
 */
export async function resetDemoData(): Promise<boolean> {
  const stored = await prisma.setting.findUnique({ where: { key: DEMO_BASELINE_KEY } });
  if (!stored) return false;
  const baseline = JSON.parse(stored.value) as DemoBaseline;
  if (baseline.version !== 1) throw new Error("Versión de línea base demo no soportada");

  await prisma.$transaction(
    async (tx) => {
      const schema = await loadSchema(tx);
      const byName = new Map(schema.map((t) => [t.name, t]));

      for (const table of [...schema].reverse()) {
        const scope = demoScope(table, byName);
        if (scope) await tx.$executeRawUnsafe(`DELETE FROM ${quote(table.name)} WHERE ${scope}`);
      }

      for (const table of schema) {
        const saved = baseline.tables[table.name];
        if (!saved || saved.rows.length === 0) continue;
        // Solo las columnas que siguen existiendo; las nuevas toman su valor por defecto.
        const keep = saved.columns.map((c, index) => ({ c, index })).filter(({ c }) => table.columns.includes(c));
        if (keep.length === 0) continue;
        const perRow = Math.max(1, Math.floor(INSERT_CHUNK_PARAMS / keep.length));
        const columnList = keep.map(({ c }) => quote(c)).join(", ");
        const placeholders = `(${keep.map(() => "?").join(", ")})`;
        for (let start = 0; start < saved.rows.length; start += perRow) {
          const chunk = saved.rows.slice(start, start + perRow);
          const params = chunk.flatMap((row) => keep.map(({ index }) => fromJsonValue(row[index])));
          await tx.$executeRawUnsafe(
            `INSERT INTO ${quote(table.name)} (${columnList}) VALUES ${chunk.map(() => placeholders).join(", ")}`,
            ...params
          );
        }
      }
    },
    { timeout: 120_000, maxWait: 15_000 }
  );
  return true;
}

/**
 * Se llama en cada petición con sesión demo. Si la ventana de uso (5 minutos desde el primer clic tras el
 * último reinicio) ya se cumplió, devuelve los datos demo a la línea base y abre una ventana nueva con este
 * mismo clic. Varias peticiones a la vez no reinician dos veces: solo gana quien logra tomar la ventana.
 * Nunca lanza: un fallo se registra y el modo demo sigue con los datos que tenga.
 */
export async function ensureDemoWindow(now = new Date()): Promise<{ reset: boolean }> {
  try {
    const baseline = await prisma.setting.findUnique({ where: { key: DEMO_BASELINE_KEY }, select: { key: true } });
    if (!baseline) return { reset: false }; // sin línea base el reinicio no está activo

    const stamp = now.toISOString();
    const current = await prisma.setting.findUnique({ where: { key: DEMO_WINDOW_KEY } });
    const startedAt = current ? new Date(current.value).getTime() : NaN;
    if (current && Number.isFinite(startedAt) && now.getTime() - startedAt < DEMO_WINDOW_MINUTES * 60_000) {
      return { reset: false };
    }

    // Tomar la ventana: solo una petición lo logra (otra ya la tomó si el valor cambió o la fila ya existe).
    let claimed = false;
    if (current) {
      claimed = (await prisma.setting.updateMany({ where: { key: DEMO_WINDOW_KEY, value: current.value }, data: { value: stamp } })).count === 1;
    } else {
      try {
        await prisma.setting.create({ data: { key: DEMO_WINDOW_KEY, value: stamp } });
        claimed = true;
      } catch {
        claimed = false;
      }
    }
    if (!claimed) return { reset: false };

    try {
      await resetDemoData();
    } catch (error) {
      // Se devuelve la ventana vencida para que el próximo clic lo intente de nuevo.
      if (current) await prisma.setting.updateMany({ where: { key: DEMO_WINDOW_KEY, value: stamp }, data: { value: current.value } });
      else await prisma.setting.deleteMany({ where: { key: DEMO_WINDOW_KEY, value: stamp } });
      throw error;
    }
    return { reset: true };
  } catch (error) {
    console.error("No se pudo reiniciar el modo demo:", error);
    return { reset: false };
  }
}
