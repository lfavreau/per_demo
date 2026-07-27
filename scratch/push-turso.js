const { createClient } = require('@libsql/client');
const fs = require('fs');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error("Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.");
}

const client = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

async function runStatements(sqlContent) {
  const statements = sqlContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await client.execute(stmt);
    } catch (err) {
      console.warn(`Warning on statement ${i+1}: ${err.message}`);
    }
  }
}

async function main() {
  console.log("Applying migration.sql to Turso statement by statement...");
  await runStatements(fs.readFileSync('migration.sql', 'utf8'));
  console.log("Migration complete.");

  console.log("Applying seed_core.sql to Turso...");
  await runStatements(fs.readFileSync('seed_core.sql', 'utf8'));
  console.log("Seed complete.");

  const res = await client.execute("SELECT email, role FROM User");
  console.log("Users in Turso:", res.rows);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
