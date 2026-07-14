/*
 * add_candidates_to_chai_sheet.js
 * -------------------------------------------------------------------------
 * הוספה בטוחה (append בלבד) של מועמדים ידניים (שם + טלפון + תיאור) לטבלת
 * הלידים הקיימת של חי: "מאמנים מועמדים | לידים (דף נחיתה)".
 *
 * עקרונות בטיחות:
 *   • כתיבה דרך Sheets API בלבד — לא נוגעים בתאים קיימים דרך ה-UI.
 *   • values.append עם insertDataOption=INSERT_ROWS → מוסיף שורות חדשות בסוף,
 *     אף תא/שורה קיימים לא נדרסים.
 *   • valueInputOption=RAW → טלפון נשמר כטקסט עם 0 מוביל, בלי פרשנות של Sheets.
 *   • דדופ מול שם+טלפון קיימים → הרצה חוזרת לא מכפילה.
 *
 * הרצה:
 *   node add_candidates_to_chai_sheet.js --dry   # תצוגה מקדימה בלבד, בלי כתיבה
 *   node add_candidates_to_chai_sheet.js         # כתיבה אמיתית
 */
const { getGoogleToken, sheetsApi } = require('./outlook_candidates_to_sheet');

const SPREADSHEET_ID = '1ubxkWp-6k_4YOe5DpWzTOXsuvNfAxwJ8_fTi4sPLRH8';
const GID = 0;                 // לשונית היעד (גיליון1)
const TODAY = '09/07/2026';    // תאריך שליחה לשורות החדשות (החלטת דין)

// 5 המועמדים הידניים: [שם מלא, טלפון (0 מוביל), תיאור/תפקיד → מוטיבציה]
const CANDIDATES = [
  ['עידית דגן',        '052-8984880', 'מאמנת נבחרת לאליפויות הארץ בהחלקה אומנותית'],
  ['בן נגר',           '050-2034353', 'מורה לחנ"ג'],
  ['אנאבל וקסלר לביא',  '052-5256686', 'מאמנת תנועה עם ניסיון, תומכת שיקום, פילאטיס וספורתרפיה. עובדת גם בבתי ספר'],
  ['אילן וסטלר',       '050-2220599', 'מורה לחנ"ג'],
  ['גלית קרקליס',      '054-4649902', 'מורה לחנ"ג מלבון ליד כרמיאל'],
];

// מבנה עמודות היעד (A..M):
// A תאריך שליחה | B שם מלא | C גיל | D עיר | E טלפון נייד | F מייל |
// G ניסיון | H ימים פנויים | I זמינות בוקר | J זמינות צהריים | K פרילנס | L ביטוח | M מוטיבציה
function buildRow([name, phone, motivation]) {
  return [TODAY, name, '', '', phone, '', '', '', '', '', '', '', motivation];
}

const phoneDigits = s => (s || '').replace(/\D/g, '').replace(/^0/, '');

async function main() {
  const dry = process.argv.includes('--dry');
  console.log(dry ? '=== מצב DRY RUN (בלי כתיבה) ===\n' : '=== כתיבה אמיתית ===\n');

  const token = await getGoogleToken();

  // 1) מטא-דאטה → לאמת את שם לשונית היעד (gid=0)
  const meta = await sheetsApi('GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=properties.title,sheets(properties(sheetId,title))`,
    token);
  const prop = (meta.sheets.find(s => s.properties.sheetId === GID) || meta.sheets[0]).properties;
  const tab = prop.title;
  console.log(`קובץ: "${meta.properties.title}"`);
  console.log(`לשונית יעד: "${tab}" (sheetId=${prop.sheetId})\n`);

  // 2) קריאה מקדימה A1:M → מבנה, שורה אחרונה, דדופ
  const range = encodeURIComponent(`'${tab}'!A1:M`);
  const cur = await sheetsApi('GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`, token);
  const rows = cur.values || [];
  const header = rows[0] || [];
  const dataRows = rows.slice(1);
  const lastRow = rows.length; // אינדקס השורה האחרונה שיש בה תוכן (1-based)

  console.log(`כותרות: ${header.join(' | ')}`);
  console.log(`שורות נתונים קיימות: ${dataRows.length}`);
  dataRows.forEach((r, i) => console.log(`  שורה ${i + 2}: ${r[1] || '—'}  |  ${r[4] || '—'}`));

  // דדופ מול שם/טלפון קיימים
  const existNames = new Set(dataRows.map(r => (r[1] || '').trim()));
  const existPhones = new Set(dataRows.map(r => phoneDigits(r[4])).filter(Boolean));
  const fresh = CANDIDATES.filter(c =>
    !existNames.has(c[0].trim()) && !existPhones.has(phoneDigits(c[1])));
  const skipped = CANDIDATES.length - fresh.length;

  const newRows = fresh.map(buildRow);
  console.log(`\nלהוספה: ${fresh.length}  |  דולגו ככפולים: ${skipped}`);
  console.log(`השורות ייכנסו החל משורה ${lastRow + 1}:`);
  newRows.forEach((r, i) =>
    console.log(`  שורה ${lastRow + 1 + i}:  A="${r[0]}"  B="${r[1]}"  E="${r[4]}"  M="${r[12]}"`));

  if (dry) { console.log('\n[DRY RUN] לא נכתב דבר.'); return; }
  if (!newRows.length) { console.log('\nאין מועמדים חדשים להוסיף.'); return; }

  // 4) append — INSERT_ROWS + RAW (שורות חדשות בלבד, אף תא קיים לא נדרס)
  const appendRange = encodeURIComponent(`'${tab}'!A1`);
  const res = await sheetsApi('POST',
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token, { values: newRows });
  console.log(`\n✅ נוספו ${newRows.length} שורות. טווח מעודכן: ${res.updates && res.updates.updatedRange}`);

  // 5) קריאה חוזרת לאימות
  const after = await sheetsApi('GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`, token);
  const afterData = (after.values || []).slice(1);
  console.log(`שורות נתונים אחרי ההוספה: ${afterData.length}`);
  console.log('הטבלה כעת (שם | טלפון):');
  afterData.forEach((r, i) => console.log(`  שורה ${i + 2}: ${r[1] || '—'}  |  ${r[4] || '—'}`));
}

main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
