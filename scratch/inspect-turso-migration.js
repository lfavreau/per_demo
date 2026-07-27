// Inspect Turso columns and apply migration if needed
const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const tables = ['ReportSnapshot', 'NetworkDevice', 'Notification'];
  
  for (const table of tables) {
    try {
      const info = await client.execute(`PRAGMA table_info(${table})`);
      const cols = info.rows.map(r => r.name);
      console.log(`${table}: columns = [${cols.join(', ')}]`);
      
      if (cols.includes('isDemo')) {
        console.log(`  ✅ isDemo already exists in ${table}`);
      } else {
        console.log(`  ⚠️ isDemo MISSING — applying ALTER TABLE...`);
        await client.execute(`ALTER TABLE ${table} ADD COLUMN isDemo BOOLEAN DEFAULT 0;`);
        await client.execute(`UPDATE ${table} SET isDemo = 1;`);
        console.log(`  ✅ Added isDemo and marked existing rows as demo`);
      }
    } catch (e) {
      console.error(`  ❌ Error on ${table}: ${e.message}`);
    }
  }
  
  console.log('\nMigration inspection complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
