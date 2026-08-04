/*
 * verify_against_backup.js — משווה גיליון חי מול גיבוי, תא-תא.
 * ---------------------------------------------------------------------------
 * הרצה:
 *   node verify_against_backup.js --backup "<תיקייה>" --source <id-בגיבוי> --target <id-חי>
 *
 * --source הוא המזהה כפי שנשמר ב-manifest, --target הוא הגיליון שרוצים לבדוק.
 * כשהם זהים — בדיקה שהגיליון לא השתנה. כששונים — אימות שהמרה/העתקה שימרה הכל.
 */
const fs = require('fs');
const path = require('path');
const { getBrowser } = require('./chrome_automation');
const L = require('./sheets_lib');

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};

async function main() {
  const backupDir = arg('backup');
  const sourceId = arg('source');
  const targetId = arg('target', sourceId);
  if (!backupDir || !sourceId) throw new Error('שימוש: --backup "<תיקייה>" --source <id> [--target <id>]');

  const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));
  const entry = manifest.sheets.find(s => s.id === sourceId);
  if (!entry) throw new Error(`${sourceId} לא נמצא בגיבוי`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  const live = await L.readAllTabs(page, targetId);

  console.log(`גיבוי : ${entry.tabs.length} לשוניות — ${entry.tabs.map(t => t.name).join(' | ')}`);
  console.log(`חי    : ${live.tabs.length} לשוניות — ${live.tabs.join(' | ')}\n`);

  let issues = 0, cells = 0;
  for (const tab of entry.tabs) {
    const saved = L.parseCsv(fs.readFileSync(path.join(backupDir, tab.file), 'utf8'));
    const now = live.data[tab.name];
    if (!now) { console.log(`❌ לשונית חסרה בגיליון החי: "${tab.name}"`); issues++; continue; }

    const bad = [];
    const rows = Math.max(saved.length, now.length);
    for (let r = 0; r < rows; r++) {
      const ra = saved[r] || [], rb = now[r] || [];
      const cols = Math.max(ra.length, rb.length);
      for (let c = 0; c < cols; c++) {
        const va = (ra[c] || '').trim(), vb = (rb[c] || '').trim();
        if (va) cells++;
        if (va !== vb) bad.push(`${L.colLetter(c + 1)}${r + 1}: גיבוי="${va}" חי="${vb}"`);
      }
    }
    if (bad.length) {
      console.log(`❌ ${tab.name} — ${bad.length} הבדלים:`);
      bad.slice(0, 15).forEach(x => console.log('     ' + x));
      if (bad.length > 15) console.log(`     ...ועוד ${bad.length - 15}`);
      issues += bad.length;
    } else {
      console.log(`✅ ${tab.name} — זהה (${saved.length} שורות)`);
    }
  }

  console.log(issues === 0
    ? `\n✅ אימות עבר. ${cells} תאים מלאים תואמים במדויק.`
    : `\n⚠️ ${issues} אי-התאמות.`);
  browser.disconnect();
  process.exitCode = issues === 0 ? 0 : 2;
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}
