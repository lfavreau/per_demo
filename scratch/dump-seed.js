const BetterSqlite3 = require('better-sqlite3');
const fs = require('fs');

const db = new BetterSqlite3('dev.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'").all();

let sql = '';
for (const { name } of tables) {
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

fs.writeFileSync('seed.sql', sql, 'utf8');
console.log('Done dumping seed.sql, total bytes:', fs.statSync('seed.sql').size);
