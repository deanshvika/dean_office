/*
 * backup_sheets.js — גיבוי מלא של גיליונות גוגל לתיקייה מתוארכת.
 * ---------------------------------------------------------------------------
 * רץ לפני כל שינוי. שומר כל לשונית כ-CSV + manifest.json עם ספירות,
 * כדי שיהיה אפשר לשחזר במדויק עם restore_column.js.
 *
 * הרצה:
 *   node backup_sheets.js                    ← מגבה את שני הגיליונות המוגדרים
 *   node backup_sheets.js <id> [<id> ...]    ← מגבה מזהים ספציפיים
 */
const fs = require('fs');
const path = require('path');
const { getBrowser } = require('./chrome_automation');
const L = require('./sheets_lib');

const BACKUP_ROOT = path.join(__dirname, 'גיבויי_גיליונות');

// הגיליונות שהתוכנית נוגעת בהם.
// שיבוץ המאמנים הומר מ-XLSX לגיליון גוגל אמיתי וקיבל מזהה חדש (המזהה הישן
// 1w4nZqah… הוא קובץ התאימות הישן ואינו מתעדכן) — זהו המזהה ש-sync_assignments_to_map.js קורא ממנו.
const DEFAULT_SHEETS = [
  { id: '1kX6y_Xgde3B0PbAwWxcOiJa4NXn0Md2euIS11DLC5qU', label: 'שיבוץ מאמנים — ראשי (מקור השיבוצים)' },
  { id: '1kB3Lsm2jViHGmbz47Qwlv0gTM8-lCcMqxA9Ekfqkmhc', label: 'מפת כח אדם ומוקדים (יעד)' }
];

// שם קובץ בטוח למערכת הקבצים
const safe = s => s.replace(/[\\/:*?"<>|]/g, '_').trim();

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const sheets = ids.length ? ids.map(id => ({ id, label: id })) : DEFAULT_SHEETS;

  const dir = path.join(BACKUP_ROOT, stamp());
  fs.mkdirSync(dir, { recursive: true });
  console.log(`תיקיית גיבוי: ${dir}\n`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  const manifest = { createdAt: new Date().toISOString(), sheets: [] };

  for (const { id, label } of sheets) {
    console.log(`=== ${label} ===`);
    console.log(`    ${id}`);
    const { tabs, data } = await L.readAllTabs(page, id);
    const title = await page.title();
    const entry = { id, label, title, tabs: [] };

    for (const t of tabs) {
      const rows = data[t];
      const file = `${id.slice(0, 8)}__${safe(t)}.csv`;
      fs.writeFileSync(path.join(dir, file), L.toCsv(rows), 'utf8');
      const nonEmpty = rows.reduce((n, r) => n + r.filter(c => c && c.trim()).length, 0);
      entry.tabs.push({ name: t, file, rows: rows.length, cols: rows[0] ? rows[0].length : 0, nonEmptyCells: nonEmpty });
      console.log(`  ✓ ${t}: ${rows.length} שורות × ${rows[0] ? rows[0].length : 0} עמודות (${nonEmpty} תאים מלאים) → ${file}`);
    }
    manifest.sheets.push(entry);
    console.log('');
  }

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✅ גיבוי הושלם. manifest.json נכתב.`);
  console.log(`\nלשחזור עמודה:`);
  console.log(`  node restore_column.js --backup "${dir}" --sheet <id> --tab "<שם לשונית>" --col K`);

  browser.disconnect();
  return dir;
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}

module.exports = { main, BACKUP_ROOT };
