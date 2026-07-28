/*
 * make_school_coach_sheet.js
 * ---------------------------------------------------------------------------
 * ⚠️ מסלול ה-Sheets API כאן **חסום** — גוגל חסמה את ה-OAuth client של הפרויקט
 *    ("האפליקציה הזו חסומה"). זה משבית גם את outlook_candidates_to_sheet.js
 *    ו-candidates_tracking_sheet.js שנשענים על אותו client.
 *    למסלול העובד: node make_school_coach_xlsx.js  →  node upload_to_drive.js
 *    הקובץ הזה נשאר כי buildRows()/loadTabRows() הם מקור האמת של הנתונים.
 *
 * יוצר Google Sheet לשיבוץ מאמן לכל בית ספר, שנה"ל 26/27.
 *
 * מקורות:
 *   schools_26_27.json                       — רשימת בתי הספר (מקור אמת)
 *   whatsapp-tool/schedule_last_year.json    — אינדיקציית ינו׳–פבר׳ 26 מ-Base44
 *
 * הרצה:
 *   node make_school_coach_sheet.js          — יוצר גיליון חדש
 *   node make_school_coach_sheet.js --add    — מוסיף לגיליון קיים רק בתי ספר חדשים.
 *                                              אפס כתיבה על שורות קיימות.
 *
 * משתמש חוזר בתשתית ה-OAuth + Sheets API v4 מ-outlook_candidates_to_sheet.js.
 */
const fs = require('fs');
const path = require('path');
const { getGoogleToken, sheetsApi } = require('./outlook_candidates_to_sheet');

// ---------- הגדרות ----------
const SCHOOLS_FILE = path.join(__dirname, 'schools_26_27.json');
const LASTYEAR_FILE = path.join(__dirname, 'whatsapp-tool', 'schedule_last_year.json');
const URL_OUT_FILE = path.join(__dirname, 'school_coach_sheet_url.txt');

const TITLE = 'שיבוץ מאמנים לבתי ספר — 26/27';
const TAB_MAIN = 'שיבוץ 26-27'; // מקף ולא לוכסן — Excel אוסר / ? * : [ ] בשמות לשוניות
const TAB_LOAD = 'עומס מאמנים';
const TAB_COACHES = 'מאמנים פעילים';

const HEADERS = ['בית ספר', 'עיר', 'תוכנית', 'ימי פעילות', 'שעות', 'מאמן ינו׳–פבר׳ 26', 'מאמן משובץ 26/27', 'סטטוס', 'הערות'];
const COL = { SCHOOL: 0, CITY: 1, PROGRAM: 2, DAYS: 3, HOURS: 4, LAST: 5, ASSIGNED: 6, STATUS: 7, NOTES: 8 };
const WIDTHS = [150, 90, 80, 150, 170, 190, 190, 100, 260];

const STATUSES = ['פתוח', 'מועמד', 'סוכם', 'לא רלוונטי'];
const MAX_ROWS = 200; // טווח לנוסחאות בלשונית העומס — משאיר מקום לבתי ספר נוספים

// מקור: whatsapp-tool/server.js:13 (COACHES). מי שעזב מסונן דרך inactiveCoaches
// שב-schools_26_27.json — הרשימה כאן נשארת כפי שהיא בבוט, הסינון נעשה בקוד.
const ROSTER = ['קרן דבוש', 'טל וזגיאל', 'דוד אשורי', 'דין שויקה', 'נועם כהן', 'תום בריאולובסקי',
  'ליאור מרגוליס', 'שלו אהרוני', 'דניאל לנדאו', 'סיון טפירו', 'אריק מונטבילסקי', 'אופק סגל',
  'אסף זוהר', 'ליז אפרגן', 'פיקאדו ינאו', 'תמיר חלף', 'דובי מילר', 'וליד אבו חמוד',
  'סהר ליכטנפלד', 'גילי ששון', 'אייל רותם', 'יובל גורפיין', 'עידן אדלר'];

const INACTIVE = new Set(JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf8')).inactiveCoaches || []);
const COACHES = ROSTER.filter(c => !INACTIVE.has(c));

const HEADER_BG = { red: 0.11, green: 0.24, blue: 0.42 }; // #1C3D6B — עקבי עם שאר הגיליונות

// ---------- בניית שורות ----------
function buildRows() {
  const cfg = JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf8'));

  let lastYear = null;
  if (fs.existsSync(LASTYEAR_FILE)) {
    lastYear = JSON.parse(fs.readFileSync(LASTYEAR_FILE, 'utf8'));
  } else {
    console.log('⚠️  אין schedule_last_year.json — עמודות ימים/שעות/מאמן שנה שעברה יישארו ריקות.');
    console.log('   להשלמה: node whatsapp-tool/scrape_last_year.js  ואז להריץ שוב עם --add');
  }
  const byName = Object.fromEntries((lastYear?.schools || []).map(s => [s.school, s]));

  const unknownCoaches = new Set();
  const dropped = [];
  const rows = cfg.schools.map(school => {
    const ly = byName[school.school];
    const notes = [];

    if (school.note) notes.push(school.note);
    if (!ly || ly.source === 'none') {
      notes.push('לא נמצאו נתוני שנה שעברה ב-Base44');
    } else if (ly.source === 'fallback') {
      notes.push(`מקור: ${ly.months.join(', ')} — לא היה פעיל בינו׳–פבר׳`);
    }

    // מאמנים שעזבו יורדים מהאינדיקציה. בי"ס שהם היו בו לבדם — התא נשאר ריק.
    const lastCoaches = (ly?.coaches || []).filter(c => {
      if (INACTIVE.has(c.name)) { dropped.push(`${c.name} (${school.school})`); return false; }
      if (!COACHES.includes(c.name)) unknownCoaches.add(c.name);
      return true;
    });

    return [
      school.school,
      school.city,
      school.program || '',
      ly?.daysText || '',
      ly?.timesText || '',
      lastCoaches.map(c => c.name).join(' | '),
      '',                 // מאמן משובץ 26/27 — למילוי ידני
      STATUSES[0],        // פתוח
      notes.join(' · ')
    ];
  });

  return { rows, cfg, unknownCoaches: [...unknownCoaches], dropped };
}

// ---------- בקשות עיצוב ----------
function formatRequests(mainId, coachesId, rowCount) {
  const headerFmt = sheetId => ({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: {
        userEnteredFormat: {
          backgroundColor: HEADER_BG,
          textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
          horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
    }
  });

  const statusRule = (value, color, idx) => ({
    addConditionalFormatRule: {
      index: idx,
      rule: {
        ranges: [{ sheetId: mainId, startRowIndex: 1, startColumnIndex: COL.STATUS, endColumnIndex: COL.STATUS + 1 }],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: value }] },
          format: { backgroundColor: color }
        }
      }
    }
  });

  return [
    headerFmt(mainId),
    headerFmt(coachesId),

    // רוחבי עמודות
    ...WIDTHS.map((px, i) => ({
      updateDimensionProperties: {
        range: { sheetId: mainId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px }, fields: 'pixelSize'
      }
    })),

    // dropdown מאמנים — מקור חי מלשונית "מאמנים פעילים", כך שהוספת מאמן = הוספת שורה שם
    {
      setDataValidation: {
        range: { sheetId: mainId, startRowIndex: 1, endRowIndex: MAX_ROWS, startColumnIndex: COL.ASSIGNED, endColumnIndex: COL.ASSIGNED + 1 },
        rule: {
          condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `='${TAB_COACHES}'!$A$2:$A$100` }] },
          showCustomUi: true, strict: false // לא strict — כדי לאפשר "מאמן א | מאמן ב" בבי"ס משותף
        }
      }
    },
    // dropdown סטטוס
    {
      setDataValidation: {
        range: { sheetId: mainId, startRowIndex: 1, endRowIndex: MAX_ROWS, startColumnIndex: COL.STATUS, endColumnIndex: COL.STATUS + 1 },
        rule: {
          condition: { type: 'ONE_OF_LIST', values: STATUSES.map(s => ({ userEnteredValue: s })) },
          showCustomUi: true, strict: true
        }
      }
    },

    // צביעה מותנית על הסטטוס — התקדמות במבט אחד
    statusRule('סוכם', { red: 0.78, green: 0.91, blue: 0.79 }, 0),
    statusRule('מועמד', { red: 1.0, green: 0.95, blue: 0.72 }, 1),
    statusRule('לא רלוונטי', { red: 0.90, green: 0.90, blue: 0.90 }, 2),

    // גלישת טקסט בעמודת ההערות
    {
      repeatCell: {
        range: { sheetId: mainId, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: COL.NOTES, endColumnIndex: COL.NOTES + 1 },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP', textFormat: { fontSize: 9 } } },
        fields: 'userEnteredFormat(wrapStrategy,textFormat)'
      }
    },
    // עמודת השיבוץ מודגשת — זו העמודה שדין ממלא
    {
      repeatCell: {
        range: { sheetId: mainId, startRowIndex: 1, endRowIndex: MAX_ROWS, startColumnIndex: COL.ASSIGNED, endColumnIndex: COL.ASSIGNED + 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.97, green: 0.97, blue: 1 } } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)'
      }
    }
  ];
}

// ---------- לשונית עומס מאמנים ----------
function loadTabRows() {
  const M = `'${TAB_MAIN}'`;
  const A = `${M}!$A$2:$A$${MAX_ROWS}`;   // בית ספר
  const D = `${M}!$D$2:$D$${MAX_ROWS}`;   // ימים
  const F = `${M}!$F$2:$F$${MAX_ROWS}`;   // מאמן שנה שעברה
  const G = `${M}!$G$2:$G$${MAX_ROWS}`;   // מאמן משובץ

  // הנוסחאות חייבות לשרוד המרת XLSX → Google Sheets, ולכן משתמשות ב-COUNTIF+FILTER
  // ולא ב-IF מעל טווח: IF מעל טווח הוא נוסחת מערך שדורשת ARRAYFORMULA בגוגל — ופונקציה
  // שלא קיימת ב-Excel הייתה נשברת בייבוא. COUNTIF ו-FILTER עובדות בשתי הסביבות.
  // SEARCH ולא שוויון — כי תא יכול להכיל "מאמן א | מאמן ב" בבי"ס משותף.
  const join = (out, key) =>
    `=IFERROR(TEXTJOIN(", ",TRUE,FILTER(${out},ISNUMBER(SEARCH($A%R%,${key})))),"")`;

  return COACHES.map((coach, i) => {
    const r = i + 2;
    const fill = f => f.replace(/%R%/g, r);
    return [
      coach,
      `=COUNTIF(${G},"*"&$A${r}&"*")`,
      fill(join(A, G)),
      fill(join(D, G)),
      fill(join(A, F))
    ];
  });
}

const LOAD_HEADERS = ['מאמן', 'מס\' בתי ספר', 'בתי ספר משובצים 26/27', 'ימים תפוסים', 'בתי ספר שלו בינו׳–פבר׳ 26'];

// ---------- מצב יצירה ----------
async function create(token, rows, unknownCoaches, dropped) {
  console.log('יוצר גיליון חדש...');
  const created = await sheetsApi('POST', 'https://sheets.googleapis.com/v4/spreadsheets', token, {
    properties: { title: TITLE, locale: 'iw_IL' },
    sheets: [
      { properties: { title: TAB_MAIN, rightToLeft: true, gridProperties: { frozenRowCount: 1, rowCount: MAX_ROWS, columnCount: HEADERS.length } } },
      { properties: { title: TAB_LOAD, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: TAB_COACHES, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } }
    ]
  });

  const id = created.spreadsheetId;
  const url = created.spreadsheetUrl;
  const sheetIdOf = title => created.sheets.find(s => s.properties.title === title).properties.sheetId;

  // 1. לשונית המאמנים ראשונה — היא מקור ה-dropdown
  await sheetsApi('PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${TAB_COACHES}'!A1`)}?valueInputOption=RAW`,
    token, { values: [['מאמן'], ...COACHES.map(c => [c])] });

  // 2. הטבלה הראשית
  await sheetsApi('PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${TAB_MAIN}'!A1`)}?valueInputOption=RAW`,
    token, { values: [HEADERS, ...rows] });

  // 3. לשונית העומס (נוסחאות → USER_ENTERED)
  await sheetsApi('PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${TAB_LOAD}'!A1`)}?valueInputOption=USER_ENTERED`,
    token, { values: [LOAD_HEADERS, ...loadTabRows()] });

  // 4. עיצוב
  const loadId = sheetIdOf(TAB_LOAD);
  await sheetsApi('POST', `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, token, {
    requests: [
      ...formatRequests(sheetIdOf(TAB_MAIN), sheetIdOf(TAB_COACHES), rows.length),
      {
        repeatCell: {
          range: { sheetId: loadId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: HEADER_BG,
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
              horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      },
      ...[150, 110, 300, 200, 300].map((px, i) => ({
        updateDimensionProperties: {
          range: { sheetId: loadId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: px }, fields: 'pixelSize'
        }
      }))
    ]
  });

  fs.writeFileSync(URL_OUT_FILE, url + '\n');
  report(rows, unknownCoaches, dropped);
  console.log(`\nהגיליון: ${url}`);
}

// ---------- מצב הוספה ----------
async function add(token, rows, unknownCoaches, dropped) {
  if (!fs.existsSync(URL_OUT_FILE)) {
    throw new Error(`לא נמצא ${URL_OUT_FILE}. הרץ קודם ללא --add כדי ליצור את הגיליון.`);
  }
  const m = fs.readFileSync(URL_OUT_FILE, 'utf8').match(/\/d\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('לא הצלחתי לחלץ מזהה גיליון מ-' + URL_OUT_FILE);
  const id = m[1];

  // קריאת המצב הקיים — עמודת בתי הספר בלבד
  const existing = await sheetsApi('GET',
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${TAB_MAIN}'!A2:A${MAX_ROWS}`)}`,
    token);
  const present = new Set((existing.values || []).map(r => (r[0] || '').trim()).filter(Boolean));
  console.log(`בגיליון כרגע: ${present.size} בתי ספר.`);

  const fresh = rows.filter(r => !present.has(r[COL.SCHOOL].trim()));
  if (!fresh.length) {
    console.log('✅ אין בתי ספר חדשים להוספה. הגיליון לא שונה.');
    return;
  }

  // append בלבד — לא נוגע בשורות קיימות ובעריכות ידניות
  await sheetsApi('POST',
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`'${TAB_MAIN}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    token, { values: fresh });

  console.log(`✅ נוספו ${fresh.length} בתי ספר: ${fresh.map(r => r[COL.SCHOOL]).join(', ')}`);
  report(fresh, unknownCoaches, dropped);
}

// ---------- דוח ----------
function report(rows, unknownCoaches, dropped = []) {
  const withCoach = rows.filter(r => r[COL.LAST]).length;
  console.log('\n=== סיכום ===');
  console.log(`בתי ספר בטבלה: ${rows.length}`);
  console.log(`מאמנים ב-dropdown: ${COACHES.length} (מתוך ${ROSTER.length}; סוננו: ${[...INACTIVE].join(', ') || '—'})`);
  console.log(`עם אינדיקציית מאמן מינו׳–פבר׳ 26: ${withCoach} | ריק: ${rows.length - withCoach}`);
  if (dropped.length) {
    console.log(`\nהוסרו מהאינדיקציה (מאמנים שעזבו):`);
    dropped.forEach(d => console.log(`   • ${d}`));
    const empty = rows.filter(r => !r[COL.LAST]).map(r => r[COL.SCHOOL]);
    if (empty.length) console.log(`   → נשארו ללא מאמן כלל: ${empty.join(', ')}`);
  }
  if (unknownCoaches.length) {
    console.log(`\n⚠️  מאמנים שלימדו בשנה שעברה אך אינם ברשימת ה-23 הפעילים (לא יופיעו ב-dropdown):`);
    unknownCoaches.forEach(c => console.log(`   • ${c}`));
  }
}

// ---------- main ----------
async function main() {
  const isAdd = process.argv.includes('--add');
  const { rows, unknownCoaches, dropped } = buildRows();

  // --dry: מציג את מה שייכתב בלי לגעת ב-Google. לבדיקה לפני יצירה/הוספה.
  if (process.argv.includes('--dry')) {
    console.log(HEADERS.join(' | '));
    console.log('-'.repeat(100));
    rows.forEach(r => console.log(r.map(c => c || '—').join(' | ')));
    report(rows, unknownCoaches, dropped);
    return;
  }

  const token = await getGoogleToken();
  if (isAdd) await add(token, rows, unknownCoaches, dropped);
  else await create(token, rows, unknownCoaches, dropped);
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}

// נחשף עבור make_school_coach_sheet_browser.js — אותם נתונים בדיוק, מסלול הגשה אחר
module.exports = {
  buildRows, loadTabRows,
  HEADERS, LOAD_HEADERS, COACHES, ROSTER, INACTIVE, STATUSES,
  TITLE, TAB_MAIN, TAB_LOAD, TAB_COACHES, WIDTHS, MAX_ROWS, COL, report
};
