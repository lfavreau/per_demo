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
  console.log("Reading migration.sql...");
  const raw = fs.readFileSync('migration.sql', 'utf8');
  const lines = raw.split('\n').filter(line => !line.trim().startsWith('--'));
  const sql = lines.join('\n');
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

  console.log(`Executing ${statements.length} DDL statements on Turso...`);
  for (let i = 0; i < statements.length; i++) {
    try {
      await client.execute(statements[i]);
    } catch (e) {
      console.error(`Error on statement ${i + 1}:`, e.message);
    }
  }
  console.log("All DDL statements executed.");
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
