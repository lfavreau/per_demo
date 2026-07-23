const { createClient } = require('@libsql/client');

const client = createClient({
  url: "libsql://database-bronze-door-vercel-icfg-kr9ot02rwjilayv17wpe6fak.aws-us-east-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3ODQ3MDQzNjksImlkIjoiMDE5Zjg4YWItODIwMS03OTI0LTk1YzItNTIyYzMxZDU5OTFjIiwia2lkIjoiT1FlQnhjZDNzeGlCNUlkRG1DSm9VY2xOSnlLalFCMHZQVkg3Qi1TcHhXRSIsInJpZCI6IjQ5YWM5ZjJhLTExM2YtNDRkMy1iYTAxLWFlZGJmZGQ2N2U0YiJ9.xOcZ7fF6tITMSXZg9aj06v2i86plXx4iyU2bZT_u7Wt9r0R2iGG5v4qvPhyLPGrV1MwLat9TIUURd-pXE4mIBw",
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
