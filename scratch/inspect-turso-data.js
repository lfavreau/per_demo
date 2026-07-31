// Solo lectura: caracteriza los datos existentes en Turso (sin PII - solo codigos,
// roles y flags isDemo) para entender si la base de produccion ya tiene contaminacion
// de datos de prueba. No modifica nada.
const { createClient } = require('@libsql/client');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

async function main() {
  const usersByRole = await client.execute(
    "SELECT role, isDemo, COUNT(*) as c FROM User GROUP BY role, isDemo ORDER BY role, isDemo;"
  );
  console.log("Usuarios por rol/isDemo:");
  for (const r of usersByRole.rows) console.log(`  role=${r.role} isDemo=${r.isDemo} -> ${r.c}`);

  const allUsers = await client.execute("SELECT email, role, isDemo, active, createdAt FROM User ORDER BY createdAt;");
  console.log("\nTodos los usuarios (email/rol/isDemo/activo/creado):");
  for (const r of allUsers.rows) console.log(`  ${r.email} | ${r.role} | isDemo=${r.isDemo} | active=${r.active} | ${r.createdAt}`);

  const casesByDemo = await client.execute("SELECT isDemo, COUNT(*) as c FROM PACase GROUP BY isDemo;");
  console.log("\nCasos por isDemo:");
  for (const r of casesByDemo.rows) console.log(`  isDemo=${r.isDemo} -> ${r.c}`);

  const caseCodes = await client.execute("SELECT code, isDemo, status, createdAt FROM PACase ORDER BY createdAt;");
  console.log("\nCodigos de caso (sin PII):");
  for (const r of caseCodes.rows) console.log(`  ${r.code} | isDemo=${r.isDemo} | status=${r.status} | ${r.createdAt}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
