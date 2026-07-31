// Aplica prisma/migrations/20260730_itinerario_y_alias/migration.sql contra Turso.
// Solo DDL aditivo (ALTER TABLE / CREATE INDEX) - cero riesgo de perdida de datos.
// Uso: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scratch/apply-itinerario-migration.js
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error("Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN antes de ejecutar este script.");
}

const client = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

const migrationPath = path.join(__dirname, '..', 'prisma', 'migrations', '20260730_itinerario_y_alias', 'migration.sql');

async function main() {
  console.log(`Leyendo ${migrationPath}...`);
  const raw = fs.readFileSync(migrationPath, 'utf8');
  const lines = raw.split('\n').filter((line) => !line.trim().startsWith('--'));
  const sql = lines.join('\n');
  const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);

  console.log(`Ejecutando ${statements.length} sentencias DDL contra Turso...`);
  for (let i = 0; i < statements.length; i++) {
    try {
      await client.execute(statements[i]);
      console.log(`  ✅ [${i + 1}/${statements.length}] OK`);
    } catch (e) {
      if (e.message.includes('duplicate column name') || e.message.includes('already exists')) {
        console.log(`  ℹ️ [${i + 1}/${statements.length}] Ya existia, se omite: ${e.message}`);
      } else {
        console.error(`  ❌ [${i + 1}/${statements.length}] Error:`, e.message);
      }
    }
  }
  console.log("Migracion completada.");
}

main().catch((err) => {
  console.error("Error fatal en la migracion:", err);
  process.exit(1);
});
