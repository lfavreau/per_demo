// Corrige isDemo=0 SOLO para las 6 cuentas reales (admin + 5 coordinaciones regionales).
// No toca ninguna otra fila. Uso: node scratch/fix-real-accounts-isdemo.js
const { createClient } = require('@libsql/client');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error("Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN antes de ejecutar este script.");
}

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

const REAL_EMAILS = [
  'admin@per2026.cl',
  'coord.metro@per2026.cl',
  'coord.valpo@per2026.cl',
  'coord.tarapaca@per2026.cl',
  'coord.biobio@per2026.cl',
  'coord.losrios@per2026.cl',
];

async function main() {
  const placeholders = REAL_EMAILS.map(() => '?').join(',');
  const before = await client.execute({
    sql: `SELECT email, isDemo FROM User WHERE email IN (${placeholders});`,
    args: REAL_EMAILS,
  });
  console.log("Antes:");
  for (const r of before.rows) console.log(`  ${r.email} isDemo=${r.isDemo}`);

  const res = await client.execute({
    sql: `UPDATE User SET isDemo = 0 WHERE email IN (${placeholders});`,
    args: REAL_EMAILS,
  });
  console.log(`\nFilas actualizadas: ${res.rowsAffected}`);

  const after = await client.execute({
    sql: `SELECT email, role, isDemo FROM User WHERE email IN (${placeholders});`,
    args: REAL_EMAILS,
  });
  console.log("\nDespues:");
  for (const r of after.rows) console.log(`  ${r.email} | ${r.role} | isDemo=${r.isDemo}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
