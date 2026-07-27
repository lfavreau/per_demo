// Aplica a Turso la columna isDemo que faltaba en Notification, ReportSnapshot y NetworkDevice.
// Corresponde a prisma/migrations/20260723_mode_isolation/migration.sql, que nunca se aplico
// en produccion porque scratch/update-turso-columns.js no incluia estas 3 tablas.
//
// Uso (PowerShell, parado en la carpeta per_demo):
//   $env:TURSO_DATABASE_URL="libsql://..."
//   $env:TURSO_AUTH_TOKEN="..."
//   node scratch/fix-notification-isdemo.js

const { createClient } = require('@libsql/client');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error('Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN antes de ejecutar este script.');
}

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

const statements = [
  `ALTER TABLE "ReportSnapshot" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "NetworkDevice" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Notification" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false`,
  `UPDATE "ReportSnapshot" SET "isDemo" = true`,
  `UPDATE "NetworkDevice" SET "isDemo" = true`,
  `UPDATE "Notification" SET "isDemo" = true`,
];

async function main() {
  for (const sql of statements) {
    try {
      const res = await client.execute(sql);
      console.log(`OK (${res.rowsAffected ?? 0} filas): ${sql}`);
    } catch (e) {
      if (/duplicate column name/i.test(e.message)) {
        console.log(`SKIP (ya existe): ${sql}`);
      } else {
        console.error(`FAIL: ${sql}\n  -> ${e.message}`);
      }
    }
  }

  console.log('\n--- Verificando schema ---');
  for (const table of ['Notification', 'ReportSnapshot', 'NetworkDevice']) {
    const info = await client.execute(`PRAGMA table_info("${table}")`);
    const cols = info.rows.map((r) => r.name);
    console.log(`${table}: ${cols.includes('isDemo') ? 'isDemo OK' : 'isDemo FALTA'} (${cols.join(', ')})`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
