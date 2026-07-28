/*
 * candidates_tracking_sheet.js
 * -------------------------------------------------------------------------
 * קורא שמות וטלפונים מגיליון "מאמנים מועמדים דף נחיתה" (קריאה בלבד!)
 * ומייצר Google Sheet חדש ונקי למעקב עם 4 עמודות: שם | טלפון | סטטוס | תאריך.
 *
 * הרצה:  node candidates_tracking_sheet.js ["<URL של גיליון המקור>"]
 *   - ללא ארגומנט → משתמש ב-SOURCE_ID ברירת המחדל.
 *   - דגלים:  --name-col=<אות/מס'>  --phone-col=<אות/מס'>  (עקיפת זיהוי אוטומטי)
 *
 * משתמש חוזר בתשתית ה-OAuth + Sheets API v4 מ-outlook_candidates_to_sheet.js.
 * המקור נקרא ב-GET בלבד — אף פעולת כתיבה לא מכוונת אליו.
 */
const fs = require('fs');
const path = require('path');
const { getGoogleToken, sheetsApi } = require('./outlook_candidates_to_sheet');

// ---------- הגדרות ----------
const SOURCE_ID_DEFAULT = '1ubxkWp-6k_4YOe5DpWzTOXsuvNfAxwJ8_fTi4sPLRH8';
const TARGET_TITLE = 'מעקב מאמנים מועמדים';
const TAB_TITLE = 'מעקב';
const HEADERS = ['שם', 'טלפון', 'סטטוס', 'תאריך'];
const URL_OUT_FILE = path.join(__dirname, 'candidates_tracking_url.txt');

const NAME_HINTS = ['שם'];
const PHONE_HINTS = ['טלפון', 'נייד', 'פלאפון', 'פלא', 'מספר', 'phone', 'mobile'];

// ---------- עזרי CLI ----------
function parseArgs(argv) {
  const out = { url: null, nameCol: null, phoneCol: null };
  for (const a of argv) {
    if (a.startsWith('--name-col=')) out.nameCol = a.split('=')[1];
    else if (a.startsWith('--phone-col=')) out.phoneCol = a.split('=')[1];
    else if (!a.startsWith('--')) out.url = a;
  }
  return out;
}

function idFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([A-Za-z0-9_-]+)/) || url.match(/^([A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

// ממיר אות עמודה ('A'/'b') או מספר ('0'/'1') לאינדקס 0-based, אחרת null
function colToIndex(spec) {
  if (spec == null) return null;
  const s = String(spec).trim();
  if (/^[A-Za-z]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

// ---------- זיהוי עמודות ----------
function findCol(headerRow, hints) {
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').toLowerCase();
    if (hints.some(hint => h.includes(hint.toLowerCase()))) return i;
  }
  return -1;
}

// ---------- נרמול ----------
function cleanName(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}
function cleanPhone(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}
function phoneKey(v) {
  return cleanPhone(v).replace(/\D/g, '');
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceId = idFromUrl(args.url) || SOURCE_ID_DEFAULT;
  console.log(`מקור: ${sourceId}${args.url ? '' : ' (ברירת מחדל)'}`);

  const token = await getGoogleToken();

  // --- קריאת המקור (GET בלבד) ---
  const meta = await sheetsApi('GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sourceId}?fields=properties(title),sheets(properties(sheetId,title,gridProperties(rowCount)))`,
    token);
  console.log(`שם קובץ המקור: "${meta.properties?.title}"`);
  const srcTab = meta.sheets[0].properties.title;
  console.log(`קורא מטאב: "${srcTab}"`);

  const valsResp = await sheetsApi('GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${sourceId}/values/${encodeURIComponent(`'${srcTab}'!A1:Z`)}`,
    token);
  const rows = valsResp.values || [];
  if (rows.length < 2) throw new Error('לא נמצאו שורות נתונים במקור.');

  const header = rows[0];
  console.log(`כותרות המקור: ${header.map((h, i) => `[${String.fromCharCode(65 + i)}] ${h}`).join(' | ')}`);

  // --- זיהוי עמודות שם/טלפון ---
  let nameIdx = colToIndex(args.nameCol);
  let phoneIdx = colToIndex(args.phoneCol);
  if (nameIdx == null) nameIdx = findCol(header, NAME_HINTS);
  if (phoneIdx == null) phoneIdx = findCol(header, PHONE_HINTS);

  if (nameIdx < 0 || phoneIdx < 0) {
    console.error('\n❌ לא הצלחתי לזהות אוטומטית את עמודות השם/הטלפון.');
    console.error('   הרץ שוב עם עקיפה ידנית, למשל:  --name-col=B --phone-col=C');
    process.exit(2);
  }
  console.log(`עמודת שם: [${String.fromCharCode(65 + nameIdx)}] "${header[nameIdx]}"  |  עמודת טלפון: [${String.fromCharCode(65 + phoneIdx)}] "${header[phoneIdx]}"`);

  // --- בניית שורות + דדופ ---
  const seen = new Set();
  const outRows = [];
  let skippedEmpty = 0, skippedDup = 0;
  for (let r = 1; r < rows.length; r++) {
    const name = cleanName(rows[r][nameIdx]);
    const phone = cleanPhone(rows[r][phoneIdx]);
    if (!name && !phone) { skippedEmpty++; continue; }
    const key = phoneKey(phone) || `name:${name}`;
    if (seen.has(key)) { skippedDup++; continue; }
    seen.add(key);
    outRows.push([name, phone]);
  }
  console.log(`שורות נתונים במקור: ${rows.length - 1} | ייחודיות: ${outRows.length} | דילוג ריקים: ${skippedEmpty} | דילוג כפולים: ${skippedDup}`);
  if (!outRows.length) throw new Error('אין שורות תקינות להעתקה.');

  // --- יצירת גיליון היעד ---
  console.log('יוצר גיליון מעקב חדש...');
  const created = await sheetsApi('POST', 'https://sheets.googleapis.com/v4/spreadsheets', token, {
    properties: { title: TARGET_TITLE, locale: 'iw_IL' },
    sheets: [{ properties: { title: TAB_TITLE, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } }]
  });
  const targetId = created.spreadsheetId;
  const targetSheetId = created.sheets[0].properties.sheetId;
  const targetUrl = created.spreadsheetUrl;

  // --- כותרות ---
  await sheetsApi('PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent(`'${TAB_TITLE}'!A1`)}?valueInputOption=RAW`,
    token, { values: [HEADERS] });

  // --- עיצוב: כותרת + עמודת טלפון כטקסט + רוחבי עמודות ---
  await sheetsApi('POST', `https://sheets.googleapis.com/v4/spreadsheets/${targetId}:batchUpdate`, token, {
    requests: [
      // שורת כותרת: רקע כחול כהה + טקסט לבן מודגש + יישור מרכזי
      { repeatCell: {
        range: { sheetId: targetSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
        cell: { userEnteredFormat: {
          backgroundColor: { red: 0.11, green: 0.24, blue: 0.42 },
          textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
          horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE'
        } },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }},
      // עמודת טלפון (B) כטקסט — שמירת אפס מוביל
      { repeatCell: {
        range: { sheetId: targetSheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
        cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
        fields: 'userEnteredFormat.numberFormat'
      }},
      // רוחבי עמודות נוחים
      { updateDimensionProperties: { range: { sheetId: targetSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' }},
      { updateDimensionProperties: { range: { sheetId: targetSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 130 }, fields: 'pixelSize' }},
      { updateDimensionProperties: { range: { sheetId: targetSheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 140 }, fields: 'pixelSize' }},
      { updateDimensionProperties: { range: { sheetId: targetSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 120 }, fields: 'pixelSize' }}
    ]
  });

  // --- כתיבת נתונים (שם+טלפון בלבד; סטטוס+תאריך נשארים ריקים) ---
  await sheetsApi('PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent(`'${TAB_TITLE}'!A2`)}?valueInputOption=RAW`,
    token, { values: outRows });

  fs.writeFileSync(URL_OUT_FILE, targetUrl + '\n');
  console.log('\n=== סיכום ===');
  console.log(`נוספו שורות: ${outRows.length}`);
  console.log(`הגיליון החדש: ${targetUrl}`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}
