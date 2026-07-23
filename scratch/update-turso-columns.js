const { createClient } = require('@libsql/client');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error(
    "Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN antes de ejecutar este script.",
  );
}

const client = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

const tables = [
  "User",
  "PACandidate",
  "PACase",
  "Task",
  "SessionLog",
  "Supervision",
  "Alert",
  "AuditLog",
  "DocumentRecord",
  "NetworkActivation",
  "Phase5Record"
];

async function main() {
  console.log("Adding isDemo column to Turso tables...");
  for (const table of tables) {
    try {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN isDemo BOOLEAN DEFAULT 0;`);
      console.log(`✅ Added isDemo column to ${table}`);
    } catch (e) {
      if (e.message.includes("duplicate column name") || e.message.includes("already exists")) {
        console.log(`ℹ️ Column isDemo already exists in ${table}`);
      } else {
        console.warn(`⚠️ Warning altering ${table}:`, e.message);
      }
    }
  }

  console.log("Updating existing seed records on Turso to isDemo = 1...");
  for (const table of tables) {
    try {
      const res = await client.execute(`UPDATE ${table} SET isDemo = 1;`);
      console.log(`✅ Marked ${res.rowsAffected} rows as isDemo = 1 in ${table}`);
    } catch (e) {
      console.warn(`⚠️ Error updating ${table}:`, e.message);
    }
  }

  console.log("Turso schema migration and data update completed successfully!");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
