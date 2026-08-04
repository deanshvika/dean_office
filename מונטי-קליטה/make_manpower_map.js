/*
 * make_manpower_map.js — מפת כח אדם ומוקדי פעילות 26/27
 * ---------------------------------------------------------------------------
 * קלט:  מונטי-קליטה/מקור_חן.json   (נוצר ע"י sync_chen.js — הגיליון של חן)
 *        schools_26_27.json          (להשלמת עיר ותוכנית בלבד)
 * פלט:  מונטי-קליטה/מפת_כח_אדם_ומוקדים.md   — לקריאה מהירה
 *        Desktop/מפת_כח_אדם_ומוקדים_26_27.xlsx — להעלאה ל-Drive
 *
 * העלאה:  node upload_to_drive.js "<path>" --open
 *         ואז בגיליון: קובץ → "שמירה בתור Google Sheets"
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'מקור_חן.json');
const OUT_MD = path.join(__dirname, 'מפת_כח_אדם_ומוקדים.md');
const OUT_XLSX = path.join(process.env.USERPROFILE, 'Desktop', 'מפת_כח_אדם_ומוקדים_26_27.xlsx');

const HEADER_BG = 'FF1C3D6B';
const MAX_ROWS = 80;

// מאמנים פעילים — בסיס ל-dropdown. חי ניר ודניאל לנדאו הוסרו (עזבו).
const COACHES = [
  'קרן דבוש', 'טל וזגיאל', 'דוד אשורי', 'נועם כהן', 'תום בריאולובסקי',
  'ליאור מרגוליס', 'שלו אהרוני', 'סיון טפירו', 'אריק מונטבילסקי', 'אופק סגל',
  'אסף זוהר', 'ליז אפרגן', 'פיקאדו ינאו', 'תמיר חלף', 'דובי מילר',
  'וליד אבו חמוד', 'סהר ליכטנפלד', 'גילי ששון', 'אייל רותם', 'יובל גורפיין',
  'עידן אדלר', 'דין שויקה'
];

const STATUSES = ['סוכם', 'מועמד', 'לגייס', 'לא רלוונטי'];

// ── נרמול שם בי"ס לצורך התאמה בין המקורות ────────────────────────────────
const norm = s => String(s || '')
  .replace(/["']/g, '').replace(/בית הספר|בית ספר|בי"?ס|חט"?ב/g, '')
  .replace(/\s+/g, ' ').trim();

// ערים שמופיעות בתוך שם המוקד אצל חן — מקור ראשון, אמין יותר מהתאמת שם
const CITIES = [['ת"א', /ת"א|תל אביב/], ['יפו', /יפו/], ['חולון', /חולון/], ['רחובות', /רחובות/],
  ['באר יעקב', /באר יעקב/], ['הוד השרון', /הוד השרון/], ['רעננה', /רעננה/], ['ר"ג', /ר"ג|רמת גן/],
  ['הרצליה', /הרצליה/], ['יבנה', /יבנה/], ['אריאל', /אריאל|אוריאל/], ['לוד', /לוד/]];

const cityInName = name => (CITIES.find(([, re]) => re.test(name)) || [''])[0];

function cityOf(name) {
  const schools = JSON.parse(fs.readFileSync(path.join(ROOT, 'schools_26_27.json'), 'utf8')).schools;
  const n = norm(name);
  const inName = cityInName(name);
  let hit = schools.find(s => norm(s.school) === n)
    || schools.find(s => n.includes(norm(s.school)) || norm(s.school).includes(n));
  // שמות דומים בערים שונות (למשל "שמיר" ת"א מול חולון) — העיר שבשם גוברת
  if (hit && inName && hit.city !== inName) hit = null;
  return { city: inName || (hit ? hit.city : ''), program: hit ? (hit.program || '') : '' };
}

// ── ודאות השיבוץ, נגזרת מהניסוח של חן ────────────────────────────────────
function coachHint(raw, note) {
  if (raw) {
    if (/ביקש|רוצים את/.test(raw)) return { hint: raw, certainty: 'בקשת ביה״ס', fromNote: false };
    if (/\?/.test(raw)) return { hint: raw, certainty: 'משוער', fromNote: false };
    return { hint: raw, certainty: 'ודאי', fromNote: false };
  }
  // אין עמודת מאמן — לפעמים הבקשה מופיעה בהערה ("רוצים את מונטי")
  if (note && /ביקש|רוצים את/.test(note)) return { hint: note, certainty: 'בקשת ביה״ס', fromNote: true };
  return { hint: '', certainty: 'חסר', fromNote: false };
}

function classify(status) {
  const s = String(status || '').trim();
  if (/^ממשיכ/.test(s)) return 'ממשיך';
  if (/^עוזב/.test(s)) return 'עוזב';
  if (/הזמנת עבודה|הצעת מחיר/.test(s)) return 'חדש';
  return 'לא ידוע';
}

function build() {
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const rows = [];

  for (const r of src.existing) {
    const { city, program } = cityOf(r.school);
    const { hint, certainty, fromNote } = coachHint(r.coach, r.note);
    rows.push({
      school: r.school.trim(), city, kind: 'בי"ס קיים', state: classify(r.status),
      program, scope: r.scope, days: r.days, hours: r.hours,
      hint, certainty, nextStep: r.nextStep, note: fromNote ? '' : r.note
    });
  }
  for (const r of src.fresh) {
    const { city, program } = cityOf(r.school);
    const { hint, certainty } = coachHint(r.coach, '');
    rows.push({
      school: r.school.trim(), city, kind: 'בי"ס חדש', state: 'חדש',
      program, scope: r.scope, days: r.days, hours: r.hours,
      hint, certainty, nextStep: r.status, note: ''
    });
  }
  for (const r of src.hatzlacha) {
    const { hint, certainty } = coachHint(r.coach, '');
    rows.push({
      school: r.school.trim(), city: '', kind: 'מרכז הצלח"ה', state: 'ממשיך',
      program: `${r.framework} · מחצית ${r.half}`.trim(), scope: '', days: r.days, hours: '',
      hint, certainty, nextStep: '', note: r.coordinator ? `רכזת: ${r.coordinator}` : ''
    });
  }
  return { rows, syncedAt: src.syncedAt, url: src.source.url };
}

// ── XLSX ──────────────────────────────────────────────────────────────────
const HEADERS = ['מוקד', 'עיר', 'סוג', 'סטטוס 26/27', 'תוכנית', 'היקף',
  'ימים', 'שעות', 'רמז מאמן (חן)', 'ודאות', 'מאמן 26/27', 'סטטוס שיבוץ', 'השלב הבא', 'הערה'];
const WIDTHS = [26, 12, 13, 13, 18, 20, 14, 10, 22, 14, 22, 14, 30, 40];

function styleHeader(ws, n) {
  const row = ws.getRow(1);
  for (let c = 1; c <= n; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  row.height = 32;
}

async function writeXlsx({ rows, syncedAt, url }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'dean_office';

  const ws = wb.addWorksheet('מוקדים 26-27', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.addRow(HEADERS);
  rows.forEach(r => ws.addRow([
    r.school, r.city, r.kind, r.state, r.program, r.scope,
    r.days, r.hours, r.hint, r.certainty, '', '', r.nextStep, r.note
  ]));
  styleHeader(ws, HEADERS.length);
  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  for (let r = 2; r <= rows.length + 1; r++) {
    ws.getCell(r, 14).font = { size: 9 };
    ws.getCell(r, 14).alignment = { wrapText: true, vertical: 'top' };
    ws.getCell(r, 13).alignment = { wrapText: true, vertical: 'top' };
  }
  for (let r = 2; r <= MAX_ROWS; r++) {
    const a = ws.getCell(r, 11);
    a.font = { bold: true };
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4FF' } };
    a.dataValidation = { type: 'list', allowBlank: true, showErrorMessage: false, formulae: ["'מאמנים'!$A$2:$A$100"] };
    ws.getCell(r, 12).dataValidation = { type: 'list', allowBlank: true, showErrorMessage: true, formulae: [`"${STATUSES.join(',')}"`] };
  }

  const dxf = argb => ({ fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } });
  ws.addConditionalFormatting({
    ref: `D2:D${MAX_ROWS}`,
    rules: [
      { type: 'cellIs', operator: 'equal', priority: 1, formulae: ['"עוזב"'], style: dxf('FFF2C4C4') },
      { type: 'cellIs', operator: 'equal', priority: 2, formulae: ['"חדש"'], style: dxf('FFC9DDF5') },
      { type: 'cellIs', operator: 'equal', priority: 3, formulae: ['"לא ידוע"'], style: dxf('FFFFF3B8') }
    ]
  });
  ws.addConditionalFormatting({
    ref: `J2:J${MAX_ROWS}`,
    rules: [
      { type: 'cellIs', operator: 'equal', priority: 1, formulae: ['"חסר"'], style: dxf('FFF2C4C4') },
      { type: 'cellIs', operator: 'equal', priority: 2, formulae: ['"משוער"'], style: dxf('FFFFF3B8') },
      { type: 'cellIs', operator: 'equal', priority: 3, formulae: ['"בקשת ביה״ס"'], style: dxf('FFDCD2F0') },
      { type: 'cellIs', operator: 'equal', priority: 4, formulae: ['"ודאי"'], style: dxf('FFC6E7C9') }
    ]
  });

  // לשונית פערים — מה חייב להיסגר עד 23.8
  const active = rows.filter(r => r.state !== 'עוזב');
  const gaps = active.filter(r => r.certainty === 'חסר' || r.certainty === 'משוער');
  const g = wb.addWorksheet('פערים לסגירה', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  g.addRow(['מוקד', 'עיר', 'סטטוס 26/27', 'ודאות', 'רמז מאמן', 'היקף', 'השלב הבא']);
  gaps.forEach(r => g.addRow([r.school, r.city, r.state, r.certainty, r.hint, r.scope, r.nextStep]));
  styleHeader(g, 7);
  [26, 12, 13, 14, 22, 20, 32].forEach((w, i) => { g.getColumn(i + 1).width = w; });

  // לשונית עומס מאמנים
  const l = wb.addWorksheet('עומס מאמנים', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  l.addRow(['מאמן', 'מס׳ מוקדים 26/27', 'המוקדים']);
  COACHES.forEach((c, i) => {
    const row = i + 2;
    l.addRow([c,
      { formula: `COUNTIF('מוקדים 26-27'!$K$2:$K$${MAX_ROWS},$A${row})` },
      { formula: `TEXTJOIN(", ",TRUE,FILTER('מוקדים 26-27'!$A$2:$A$${MAX_ROWS},'מוקדים 26-27'!$K$2:$K$${MAX_ROWS}=$A${row}))` }
    ]);
  });
  styleHeader(l, 3);
  [24, 18, 70].forEach((w, i) => { l.getColumn(i + 1).width = w; });

  const c = wb.addWorksheet('מאמנים', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  c.addRow(['מאמן']);
  COACHES.forEach(x => c.addRow([x]));
  styleHeader(c, 1);
  c.getColumn(1).width = 24;

  const m = wb.addWorksheet('מקור', { views: [{ rightToLeft: true }] });
  m.addRow(['מקור הנתונים', 'הגיליון של חן צור — "טבלת ניהול לידים ולקוחות"']);
  m.addRow(['קישור', url]);
  m.addRow(['סונכרן', syncedAt]);
  m.addRow(['רענון', 'node מונטי-קליטה/sync_chen.js && node מונטי-קליטה/make_manpower_map.js']);
  m.addRow(['הערה', 'Base44 אינו מקור למוקדים — החלטה של דין, 03/08/2026']);
  m.getColumn(1).width = 18; m.getColumn(2).width = 90;
  m.getColumn(1).font = { bold: true };

  await wb.xlsx.writeFile(OUT_XLSX);
  return { gaps, active };
}

// ── MD ────────────────────────────────────────────────────────────────────
function writeMd({ rows, syncedAt, url }, gaps, active) {
  const by = s => rows.filter(r => r.state === s);
  const tbl = (list, cols) => [
    `| ${cols.map(c => c[0]).join(' | ')} |`,
    `|${cols.map(() => '---').join('|')}|`,
    ...list.map(r => `| ${cols.map(c => (c[1](r) || '').toString().replace(/\|/g, '/')).join(' | ')} |`)
  ].join('\n');

  const md = `# מפת כח אדם ומוקדי פעילות — 26/27

> **מקור:** הגיליון של חן צור — [טבלת ניהול לידים ולקוחות](${url})
> **סונכרן:** ${new Date(syncedAt).toLocaleString('he-IL')} · לרענון: \`node מונטי-קליטה/sync_chen.js && node מונטי-קליטה/make_manpower_map.js\`
> ⚠️ Base44 **אינו** מקור למוקדים (החלטה, 03/08/2026).

## התמונה במספרים

| | כמות |
|---|:-:|
| מוקדים פעילים 26/27 | **${active.length}** |
| ממשיכים | ${by('ממשיך').length} |
| חדשים | ${by('חדש').length} |
| לא ידוע | ${by('לא ידוע').length} |
| עוזבים | ${by('עוזב').length} |
| **פערי שיבוץ לסגירה עד 23.8** | **${gaps.length}** |

---

## 🔴 פערי שיבוץ — מוקדים ללא מאמן ודאי

היעד במפת התהליך: **23.8 — כל הקצוות בכוח אדם סגורים.**

${tbl(gaps, [['מוקד', r => r.school], ['עיר', r => r.city], ['סטטוס', r => r.state], ['ודאות', r => r.certainty], ['רמז מחן', r => r.hint], ['היקף', r => r.scope], ['השלב הבא', r => r.nextStep]])}

---

## מוקדים ממשיכים

${tbl(by('ממשיך'), [['מוקד', r => r.school], ['עיר', r => r.city], ['סוג', r => r.kind], ['היקף', r => r.scope], ['ימים', r => r.days], ['מאמן (רמז)', r => r.hint], ['ודאות', r => r.certainty], ['השלב הבא', r => r.nextStep], ['הערה', r => r.note]])}

## מוקדים חדשים

${tbl(by('חדש'), [['מוקד', r => r.school], ['עיר', r => r.city], ['היקף', r => r.scope], ['ימים', r => r.days], ['מאמן (רמז)', r => r.hint], ['סטטוס מסחרי', r => r.nextStep]])}

## סטטוס לא ידוע

${tbl(by('לא ידוע'), [['מוקד', r => r.school], ['עיר', r => r.city], ['השלב הבא', r => r.nextStep], ['הערה', r => r.note]])}

## עוזבים — לא לשבץ

${tbl(by('עוזב'), [['מוקד', r => r.school], ['עיר', r => r.city], ['הערה', r => r.nextStep || r.note]])}

---

## מקרא ודאות

| ודאות | משמעות | מה עושים |
|---|---|---|
| **ודאי** | חן רשמה שם מאמן בלי סימן שאלה | לאשר מול המאמן |
| **משוער** | שם עם "?" — הנחה, לא סגור | לאמת מול המאמן ומול ביה"ס |
| **בקשת ביה״ס** | ביה"ס ביקש מאמן מסוים | לבדוק זמינות; אם לא — לתאם ציפיות |
| **חסר** | אין שם כלל | לגייס / לשבץ |
`;
  fs.writeFileSync(OUT_MD, md, 'utf8');
}

async function main() {
  const data = build();
  const { gaps, active } = await writeXlsx(data);
  writeMd(data, gaps, active);
  console.log(`✅ ${OUT_MD}`);
  console.log(`✅ ${OUT_XLSX}`);
  console.log(`\n   מוקדים פעילים: ${active.length} · פערי שיבוץ: ${gaps.length}`);
  console.log(`\nלהעלאה:  node upload_to_drive.js "${OUT_XLSX}" --open`);
}

if (require.main === module) main().catch(e => { console.error('❌', e.message); process.exit(1); });
