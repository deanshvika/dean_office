/*
 * sync_assignments_to_map.js
 * ---------------------------------------------------------------------------
 * מעביר שיבוצי מאמנים מטבלת "שיבוץ מאמנים 26-27 — ראשי" לעמודת "מאמן 26/27"
 * במפת כח האדם והמוקדים.
 *
 * שני כללי ברזל:
 *   1. **אפס כתיבה על תא מלא.** התא נבדק שהוא ריק רגע לפני הכתיבה.
 *   2. **העתקה מילה במילה.** ערך שאינו שם מאמן ("אופק (?)", "בסימן שאלה")
 *      מועתק כמו שהוא — הסימנים האלה הם שיקול הדעת של דין.
 *
 * הרצה:
 *   node sync_assignments_to_map.js            ← תצוגה בלבד (dry)
 *   node sync_assignments_to_map.js --apply    ← כתיבה בפועל
 *
 * לפני --apply הרץ תמיד:  node backup_sheets.js
 */
const { getBrowser } = require('./chrome_automation');
const L = require('./sheets_lib');

const SRC = { id: '1kX6y_Xgde3B0PbAwWxcOiJa4NXn0Md2euIS11DLC5qU', tab: 'שיבוץ 26-27', keyCol: 'בית ספר', cityCol: 'עיר', valCol: 'מאמן משובץ 26/27' };
const DST = { id: '1kB3Lsm2jViHGmbz47Qwlv0gTM8-lCcMqxA9Ekfqkmhc', tab: 'מוקדים 26-27', keyCol: 'מוקד', cityCol: 'עיר', valCol: 'מאמן 26/27' };

// ⚠️ ההתאמה היא לפי שם **ועיר** ולא לפי שם בלבד.
// יש בתי ספר שונים עם אותו שם בערים שונות — "חט״ב שמיר, ת״א" מול
// "בי״ס שמיר, חולון". התאמה לפי שם בלבד שייכה את השיבוץ לבי״ס הלא נכון.
const CITIES = ['ת"א', 'תל אביב', 'יפו', 'יבנה', 'אריאל', 'הרצליה', 'ר"ג', 'רמת גן',
  'רעננה', 'הוד השרון', 'חולון', 'באר יעקב', 'רחובות', 'אוריאל'];

function norm(s) {
  let t = String(s || '').replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(בית הספר|בית ספר|ביה"?ס|בי"?ס|חט"?ב|חטיבת ביניים)\s*/u, '');
  for (const c of CITIES) {
    const cc = c.replace(/["'״׳]/g, '');
    t = t.replace(new RegExp('[\\s,]+' + cc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'u'), '');
  }
  return t.replace(/\s+/g, ' ').trim();
}

const normCity = c => String(c || '').replace(/["'״׳\s]/g, '').trim();
const key = (name, city) => `${norm(name)}@${normCity(city)}`;

// התאמה: קודם מפתח מדויק (שם+עיר). אם אין — התאמת הכלה **בתוך אותה עיר בלבד**
// ורק אם היא חד-משמעית ("כלנא" מול "כלנא יחד"). לעולם לא חוצה ערים.
function lookup(source, name, city) {
  const k = key(name, city);
  if (source.has(k)) return source.get(k);

  const n = norm(name), c = normCity(city);
  if (!n || !c) return null;
  const cands = [...source.entries()].filter(([kk, v]) =>
    normCity(v.city) === c && (norm(v.name).includes(n) || n.includes(norm(v.name))));
  return cands.length === 1 ? cands[0][1] : null;
}

function findCol(header, name) {
  const i = header.findIndex(h => (h || '').trim() === name);
  if (i < 0) throw new Error(`עמודה "${name}" לא נמצאה. כותרות: ${header.join(' | ')}`);
  return i;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const browser = await getBrowser();

  // --- מקור ---
  const p1 = await browser.newPage();
  const srcRows = await L.readTab(await L.openSheet(p1, SRC.id), SRC.id, SRC.tab);
  const sK = findCol(srcRows[0], SRC.keyCol), sC = findCol(srcRows[0], SRC.cityCol), sV = findCol(srcRows[0], SRC.valCol);
  const source = new Map();
  for (const r of srcRows.slice(1)) {
    const val = (r[sV] || '').trim();
    if (!r[sK] || !val) continue;
    source.set(key(r[sK], r[sC]), { name: r[sK], city: r[sC], val });
  }
  console.log(`מקור: ${source.size} שיבוצים מתוך ${srcRows.length - 1} שורות\n`);

  // --- יעד ---
  const p2 = await browser.newPage();
  const dstRows = await L.readTab(await L.openSheet(p2, DST.id), DST.id, DST.tab);
  const dK = findCol(dstRows[0], DST.keyCol), dC = findCol(dstRows[0], DST.cityCol), dV = findCol(dstRows[0], DST.valCol);
  const colLetter = L.colLetter(dV + 1);

  const writes = [], skipFilled = [], skipNoSrc = [], conflicts = [], nearMiss = [];
  for (let i = 1; i < dstRows.length; i++) {
    const row = i + 1;
    const name = dstRows[i][dK], city = dstRows[i][dC];
    if (!name || !name.trim()) continue;
    const cur = (dstRows[i][dV] || '').trim();
    const hit = lookup(source, name, city);

    // שם תואם אבל עיר שונה — בי"ס אחר לגמרי. מדווח כדי שהמלכודת תישאר גלויה.
    if (!hit) {
      const other = [...source.values()].find(v => norm(v.name) === norm(name));
      if (other) nearMiss.push({ row, name, city, srcCity: other.city, val: other.val });
    }

    if (cur) {
      skipFilled.push({ row, name, cur });
      if (hit && hit.val !== cur) conflicts.push({ row, name, cur, src: hit.val });
      continue;
    }
    if (!hit) { skipNoSrc.push({ row, name, city }); continue; }
    writes.push({ row, ref: `${colLetter}${row}`, name, val: hit.val });
  }

  // --- דוח ---
  console.log(`=== ${writes.length} כתיבות מתוכננות (עמודה ${colLetter}) ===`);
  writes.forEach(w => console.log(`  ${w.ref}  ${w.name}  →  "${w.val}"`));

  console.log(`\n=== לא נוגעים — כבר מלא (${skipFilled.length}) ===`);
  skipFilled.forEach(s => console.log(`  שורה ${s.row}  ${s.name}  = "${s.cur}"`));

  console.log(`\n=== אין ערך במקור (${skipNoSrc.length}) ===`);
  skipNoSrc.forEach(s => console.log(`  שורה ${s.row}  ${s.name}${s.city ? ' (' + s.city + ')' : ''}`));

  if (nearMiss.length) {
    console.log(`\n🛑 שם זהה בעיר אחרת — בי"ס שונה, לא מועתק:`);
    nearMiss.forEach(m => console.log(`  שורה ${m.row} "${m.name}" ב${m.city} ≠ "${m.name}" ב${m.srcCity} (שם היה "${m.val}")`));
  }

  if (conflicts.length) {
    console.log(`\n⚠️ סתירות (היעד מלא וערך שונה מהמקור) — לא נוגעים:`);
    conflicts.forEach(c => console.log(`  שורה ${c.row} ${c.name}: יעד="${c.cur}" מקור="${c.src}"`));
  }

  if (!apply) {
    console.log('\n(תצוגה בלבד. לכתיבה בפועל: --apply, ורק אחרי backup_sheets.js)');
    browser.disconnect();
    return;
  }

  // --- כתיבה ---
  console.log('\n=== כותב ===');
  await L.activateTab(p2, DST.tab);
  let done = 0;
  for (const w of writes) {
    // בדיקה אחרונה רגע לפני הכתיבה — התא עדיין ריק?
    const fresh = await L.readTab(p2, DST.id, DST.tab);
    if (((fresh[w.row - 1] || [])[dV] || '').trim()) {
      console.log(`  ⏭  ${w.ref} התמלא בינתיים — מדלג`);
      continue;
    }
    await L.writeCell(p2, w.ref, w.val);
    console.log(`  ✓ ${w.ref} = "${w.val}"`);
    done++;
  }

  // --- אימות ---
  console.log('\n=== אימות ===');
  const after = await L.readTab(p2, DST.id, DST.tab);
  let ok = 0, bad = 0;
  for (const w of writes) {
    const got = ((after[w.row - 1] || [])[dV] || '').trim();
    if (got === w.val) ok++;
    else { console.log(`  ❌ ${w.ref}: ציפיתי "${w.val}" קיבלתי "${got}"`); bad++; }
  }
  for (const s of skipFilled) {
    const got = ((after[s.row - 1] || [])[dV] || '').trim();
    if (got !== s.cur) { console.log(`  ❌ תא קיים השתנה! שורה ${s.row}: "${s.cur}" → "${got}"`); bad++; }
  }
  console.log(bad === 0
    ? `\n✅ ${ok} תאים נכתבו ואומתו. ${skipFilled.length} תאים קיימים לא נגעו.`
    : `\n⚠️ ${bad} בעיות. לשחזור: node restore_column.js --backup "<תיקייה>" --sheet ${DST.id} --tab "${DST.tab}" --col ${colLetter} --apply`);

  browser.disconnect();
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}
