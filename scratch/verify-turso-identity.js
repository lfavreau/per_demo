// Solo lectura: corrobora que la base apuntada por TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
// es la base real del proyecto PER (admin + 5 coordinaciones regionales esperadas).
// No modifica nada. Uso: node scratch/verify-turso-identity.js
const { createClient } = require('@libsql/client');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error("Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN antes de ejecutar este script.");
}

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

async function main() {
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
  console.log(`Tablas encontradas: ${tables.rows.length}`);
  console.log(tables.rows.map((r) => r.name).join(', '));

  const hasUser = tables.rows.some((r) => r.name === 'User');
  if (!hasUser) {
    console.log("\n⚠️ No hay tabla 'User' — no parece ser la base de la app PER.");
    return;
  }

  const users = await client.execute(
    "SELECT email, role, regionId, isDemo FROM User WHERE email IN ('admin@per2026.cl','coord.metro@per2026.cl','coord.valpo@per2026.cl','coord.tarapaca@per2026.cl','coord.biobio@per2026.cl','coord.losrios@per2026.cl');"
  );
  console.log(`\nCoincidencias esperadas (admin + 5 coordinaciones): ${users.rows.length}/6`);
  for (const r of users.rows) {
    console.log(`  - ${r.email} | rol=${r.role} | region=${r.regionId} | isDemo=${r.isDemo}`);
  }

  const totalUsers = await client.execute("SELECT COUNT(*) as c FROM User;");
  const totalCases = await client.execute("SELECT COUNT(*) as c FROM PACase;");
  console.log(`\nTotal usuarios en la base: ${totalUsers.rows[0].c}`);
  console.log(`Total casos (PACase) en la base: ${totalCases.rows[0].c}`);

  const pacaseCols = await client.execute("PRAGMA table_info(PACase);");
  const hasAlias = pacaseCols.rows.some((c) => c.name === 'alias');
  console.log(`\n¿PACase.alias ya existe? ${hasAlias ? 'SI (la migracion ya fue aplicada)' : 'NO (falta aplicar la migracion)'}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
