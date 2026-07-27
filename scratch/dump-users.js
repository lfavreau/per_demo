const BetterSqlite3 = require('better-sqlite3');
const fs = require('fs');

const db = new BetterSqlite3('dev.db');
const coreTables = ['Setting', 'User', 'PERProfile', 'Instrument', 'PACandidate', 'PACase'];

let sql = '';
for (const name of coreTables) {
  const rows = db.prepare(`SELECT * FROM "${name}"`).all();
  for (const row of rows) {
    const keys = Object.keys(row).map(k => `"${k}"`).join(', ');
    const values = Object.values(row).map(v => {
      if (v === null) return 'NULL';
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'number') return v;
      return `'${String(v).replace(/'/g, "''")}'`;
    }).join(', ');
    sql += `INSERT OR REPLACE INTO "${name}" (${keys}) VALUES (${values});\n`;
  }
}

fs.writeFileSync('seed_core.sql', sql, 'utf8');
console.log('Done dumping seed_core.sql, size:', fs.statSync('seed_core.sql').size);
