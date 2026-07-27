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

async function main() {
  console.log("Reading seed_core.sql...");
  const raw = fs.readFileSync('seed_core.sql', 'utf8');
  const statements = raw.split('\n').map(s => s.trim()).filter(s => s.length > 0);

  console.log(`Inserting ${statements.length} seed records into Turso...`);
  for (let i = 0; i < statements.length; i++) {
    try {
      await client.execute(statements[i]);
    } catch (e) {
      console.error(`Error on insert ${i + 1}:`, e.message);
    }
  }
  console.log("Seed data inserted successfully.");

  const res = await client.execute("SELECT email, role FROM User");
  console.log("Users currently in Turso:", res.rows);
}

main().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
