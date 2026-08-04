/*
 * restore_column.js — שחזור עמודה בגיליון גוגל מתוך גיבוי.
 * ---------------------------------------------------------------------------
 * משחזר תא-תא **רק את העמודה שנפגעה**, ולא מדביק גיליון שלם — כדי לא להרוס
 * נוסחאות, עיצוב או dropdown שקיימים בשאר הגיליון.
 *
 * הרצה:
 *   node restore_column.js --backup "<תיקייה>" --sheet <id> --tab "<לשונית>" --col K [--dry]
 *
 * ברירת מחדל: --dry. חייבים --apply מפורש כדי לכתוב בפועל.
 */
const fs = require('fs');
const path = require('path');
const { getBrowser } = require('./chrome_automation');
const L = require('./sheets_lib');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}

const colIndex = letters =>
  letters.toUpperCase().split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

async function main() {
  const backupDir = arg('backup');
  const sheetId = arg('sheet');
  const tabName = arg('tab');
  const col = (arg('col') || '').toUpperCase();
  const apply = process.argv.includes('--apply');

  if (!backupDir || !sheetId || !tabName || !col) {
    throw new Error('שימוש: node restore_column.js --backup "<תיקייה>" --sheet <id> --tab "<לשונית>" --col K [--apply]');
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));
  const sheet = manifest.sheets.find(s => s.id === sheetId);
  if (!sheet) throw new Error(`הגיליון ${sheetId} לא נמצא בגיבוי`);
  const tab = sheet.tabs.find(t => t.name === tabName);
  if (!tab) throw new Error(`הלשונית "${tabName}" לא נמצאה בגיבוי`);

  const backup = L.parseCsv(fs.readFileSync(path.join(backupDir, tab.file), 'utf8'));
  const ci = colIndex(col);
  console.log(`גיבוי: ${tab.file} (${backup.length} שורות)`);
  console.log(`משחזר עמודה ${col} בלשונית "${tabName}" של ${sheetId}\n`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  await L.openSheet(page, sheetId);
  await L.activateTab(page, tabName);

  const live = await L.readTab(page, sheetId, tabName);

  // משווים ומשחזרים רק שורות שהערך בהן שונה מהגיבוי
  const diffs = [];
  for (let r = 1; r < backup.length; r++) {
    const want = (backup[r][ci] || '').trim();
    const got = ((live[r] || [])[ci] || '').trim();
    if (want !== got) diffs.push({ row: r + 1, label: backup[r][0], want, got });
  }

  if (!diffs.length) {
    console.log('✅ העמודה זהה לגיבוי — אין מה לשחזר.');
    browser.disconnect();
    return;
  }

  console.log(`נמצאו ${diffs.length} הבדלים:`);
  diffs.forEach(d => console.log(`  שורה ${d.row} (${d.label}): "${d.got}" → "${d.want}"`));

  if (!apply) {
    console.log('\n(מצב תצוגה בלבד. להרצה בפועל הוסף --apply)');
    browser.disconnect();
    return;
  }

  console.log('\nמשחזר...');
  for (const d of diffs) {
    await L.writeCell(page, `${col}${d.row}`, d.want);
    console.log(`  ✓ ${col}${d.row} = "${d.want}"`);
  }

  const after = await L.readTab(page, sheetId, tabName);
  const bad = diffs.filter(d => ((after[d.row - 1] || [])[ci] || '').trim() !== d.want);
  console.log(bad.length ? `\n⚠️ ${bad.length} תאים לא השתחזרו` : `\n✅ ${diffs.length} תאים שוחזרו ואומתו.`);
  browser.disconnect();
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}
