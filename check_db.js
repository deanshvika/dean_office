const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Find the DB files
const convDir = path.join(process.env.USERPROFILE, '.gemini', 'antigravity', 'conversations');
const files = fs.readdirSync(convDir).filter(f => f.endsWith('.db') && !f.endsWith('-shm') && !f.endsWith('-wal'));

for (const file of files) {
  const dbPath = path.join(convDir, file);
  console.log(`\n=== ${file} ===`);
  try {
    const db = new DatabaseSync(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));
    for (const t of tables) {
      try {
        const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
        console.log(`  ${t.name}: ${count.cnt} rows`);
        // Sample a few rows
        const sample = db.prepare(`SELECT * FROM "${t.name}" LIMIT 2`).all();
        if (sample.length > 0) {
          console.log('  Sample keys:', Object.keys(sample[0]).join(', '));
        }
      } catch(e2) { console.log(`  Error on ${t.name}: ${e2.message}`); }
    }
    db.close();
  } catch(e) {
    console.error('Error:', e.message);
  }
}
