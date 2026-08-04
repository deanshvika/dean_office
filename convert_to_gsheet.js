/*
 * convert_to_gsheet.js — ממיר קובץ XLSX ב-Drive לגיליון גוגל אמיתי,
 * ומוכיח שאף תא לא אבד בדרך.
 * ---------------------------------------------------------------------------
 * למה צריך הוכחה: עמודות עם dataValidation מסוג רשימה מכילות אצל דין ערכים
 * שאינם ברשימה ("אופק (?)", "בסימן שאלה"). הם נוצרו עם allowInvalid ואמורים
 * לשרוד — אבל בדיוק הם מה שהיה נמחק אם ההמרה תאכוף את הרשימה.
 *
 * ההמרה **לא הרסנית**: היא יוצרת קובץ חדש ומשאירה את המקור שלם.
 *
 * הרצה:  node convert_to_gsheet.js <id> [--backup "<תיקיית גיבוי>"]
 */
const fs = require('fs');
const path = require('path');
const { getBrowser } = require('./chrome_automation');
const L = require('./sheets_lib');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}

async function clickByText(page, pats, label) {
  const spot = await page.evaluate(ps => {
    const rx = ps.map(p => new RegExp(p));
    for (const el of document.querySelectorAll('[role="menuitem"],[id^="docs-"],div[role="button"],span')) {
      const t = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim();
      if (!t || t.length > 90) continue;
      if (!rx.some(r => r.test(t))) continue;
      const r2 = el.getBoundingClientRect();
      if (r2.width > 8 && r2.height > 8) return { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2, t };
    }
    return null;
  }, pats);
  if (!spot) { console.log(`  ✗ ${label} — לא נמצא`); return false; }
  await page.mouse.click(spot.x, spot.y);
  console.log(`  ✓ ${label}`);
  return true;
}

// השוואה עמוקה של שתי מטריצות, מדווחת כל הבדל
function diffMatrix(a, b, tabName) {
  const issues = [];
  const rows = Math.max(a.length, b.length);
  for (let r = 0; r < rows; r++) {
    const ra = a[r] || [], rb = b[r] || [];
    const cols = Math.max(ra.length, rb.length);
    for (let c = 0; c < cols; c++) {
      const va = (ra[c] || '').trim(), vb = (rb[c] || '').trim();
      if (va !== vb) issues.push(`${tabName} ${L.colLetter(c + 1)}${r + 1}: "${va}" → "${vb}"`);
    }
  }
  return issues;
}

async function main() {
  const srcId = process.argv[2];
  if (!srcId || srcId.startsWith('--')) throw new Error('שימוש: node convert_to_gsheet.js <id> [--backup "<תיקייה>"]');

  const browser = await getBrowser();
  const page = await browser.newPage();

  console.log('=== קורא את המצב לפני ===');
  const before = await L.readAllTabs(page, srcId);
  console.log(`לשוניות: ${before.tabs.join(' | ')}`);
  for (const t of before.tabs) {
    const n = before.data[t].reduce((s, r) => s + r.filter(c => c && c.trim()).length, 0);
    console.log(`  ${t}: ${before.data[t].length} שורות, ${n} תאים מלאים`);
  }

  console.log('\n=== ממיר (קובץ → שמירה בתור Google Sheets) ===');
  await page.bringToFront();
  await L.sleep(1500);
  if (!await clickByText(page, ['^קובץ$', '^File$'], 'תפריט קובץ')) throw new Error('תפריט קובץ לא נמצא');
  await L.sleep(1800);
  if (!await clickByText(page, ['שמירה בתור Google Sheets', 'Save as Google Sheets'], 'שמירה בתור Google Sheets'))
    throw new Error('פריט ההמרה לא נמצא — ייתכן שהקובץ כבר גיליון גוגל');

  let newId = null;
  for (let i = 0; i < 40; i++) {
    await L.sleep(2500);
    const nw = (await browser.pages()).find(p => /\/spreadsheets\/d\//.test(p.url()) && !p.url().includes(srcId));
    if (nw) { newId = nw.url().match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)[1]; break; }
  }
  if (!newId) throw new Error('ההמרה לא יצרה קובץ חדש');
  console.log(`  קובץ חדש: ${newId}`);
  await L.sleep(9000);

  console.log('\n=== קורא את המצב אחרי ===');
  const page2 = await browser.newPage();
  const after = await L.readAllTabs(page2, newId);
  console.log(`לשוניות: ${after.tabs.join(' | ')}`);

  console.log('\n=== השוואה תא-תא ===');
  const issues = [];
  if (before.tabs.length !== after.tabs.length)
    issues.push(`מספר לשוניות: ${before.tabs.length} → ${after.tabs.length}`);
  for (const t of before.tabs) {
    if (!after.data[t]) { issues.push(`לשונית נעלמה: ${t}`); continue; }
    issues.push(...diffMatrix(before.data[t], after.data[t], t));
  }

  if (issues.length) {
    console.log(`⚠️ ${issues.length} הבדלים:`);
    issues.slice(0, 40).forEach(i => console.log('   ' + i));
    if (issues.length > 40) console.log(`   ...ועוד ${issues.length - 40}`);
    console.log(`\n❗ המקור לא נגע: https://docs.google.com/spreadsheets/d/${srcId}/edit`);
  } else {
    const total = before.tabs.reduce((s, t) =>
      s + before.data[t].reduce((n, r) => n + r.filter(c => c && c.trim()).length, 0), 0);
    console.log(`✅ הכל תואם — ${total} תאים זהים בדיוק, ${after.tabs.length} לשוניות.`);
  }

  console.log(`\n🔗 https://docs.google.com/spreadsheets/d/${newId}/edit`);
  fs.writeFileSync(path.join(__dirname, '_converted_id.txt'), newId, 'utf8');
  browser.disconnect();
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}
