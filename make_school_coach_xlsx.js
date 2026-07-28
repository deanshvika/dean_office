/*
 * make_school_coach_xlsx.js
 * ---------------------------------------------------------------------------
 * בונה את גיליון "שיבוץ מאמנים לבתי ספר 26/27" כקובץ XLSX מקומי.
 *
 * למה XLSX ולא Sheets API: ה-OAuth client של הפרויקט חסום ע"י גוגל
 * ("האפליקציה הזו חסומה"), ו-Apps Script דורש קליק אישור ידני.
 * העיקרון של סקיל text-to-gdocs פותר את זה — בונים את הקובץ מקומית ומעלים
 * ל-Drive, וגוגל ממירה אותו בעצמה. אפס מסכי הרשאה.
 *
 * הנתונים מגיעים מ-make_school_coach_sheet.js (buildRows/loadTabRows) —
 * מקור אחד, שני מסלולי הגשה.
 *
 * הרצה:  node make_school_coach_xlsx.js
 * ואז:   powershell -File .claude/skills/text-to-gdocs/html_to_gdoc.ps1 -Step upload -Docx "<הנתיב שיודפס>"
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const S = require('./make_school_coach_sheet');

const OUT = path.join(process.env.USERPROFILE || __dirname, 'Desktop', 'שיבוץ_מאמנים_26_27.xlsx');
const HEADER_BG = 'FF1C3D6B';

// שורה שמתחילה ב-"=" היא נוסחה, לא טקסט
const cellValue = v => (typeof v === 'string' && v.startsWith('=')) ? { formula: v.slice(1) } : v;

function styleHeader(ws, cols) {
  const row = ws.getRow(1);
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  row.height = 30;
}

function main() {
  const { rows, unknownCoaches, dropped } = S.buildRows();
  const loadRows = S.loadTabRows();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'dean_office';

  // ── לשונית 1: שיבוץ 26/27 ──────────────────────────────────────────────
  const main = wb.addWorksheet(S.TAB_MAIN, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
  });
  main.addRow(S.HEADERS);
  rows.forEach(r => main.addRow(r));
  styleHeader(main, S.HEADERS.length);
  S.WIDTHS.forEach((px, i) => { main.getColumn(i + 1).width = Math.round(px / 7); });

  const cAssigned = S.COL.ASSIGNED + 1;
  const cStatus = S.COL.STATUS + 1;
  const cNotes = S.COL.NOTES + 1;

  // הערות — טקסט קטן עם גלישה
  for (let r = 2; r <= rows.length + 1; r++) {
    const c = main.getCell(r, cNotes);
    c.font = { size: 9 };
    c.alignment = { wrapText: true, vertical: 'top' };
  }

  // עמודת השיבוץ מודגשת + dropdown; סטטוס — dropdown סגור
  for (let r = 2; r <= S.MAX_ROWS; r++) {
    const a = main.getCell(r, cAssigned);
    a.font = { bold: true };
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4FF' } };
    // allowBlank + showErrorMessage:false — כדי לאפשר "מאמן א | מאמן ב" בבי"ס משותף
    a.dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: false,
      formulae: [`'${S.TAB_COACHES}'!$A$2:$A$100`]
    };
    main.getCell(r, cStatus).dataValidation = {
      type: 'list', allowBlank: true, showErrorMessage: true,
      formulae: [`"${S.STATUSES.join(',')}"`]
    };
  }

  // צביעה מותנית על הסטטוס — התקדמות במבט אחד
  const dxf = argb => ({ fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } });
  const colLetter = n => String.fromCharCode(64 + n);
  main.addConditionalFormatting({
    ref: `${colLetter(cStatus)}2:${colLetter(cStatus)}${S.MAX_ROWS}`,
    rules: [
      { type: 'cellIs', operator: 'equal', priority: 1, formulae: ['"סוכם"'], style: dxf('FFC6E7C9') },
      { type: 'cellIs', operator: 'equal', priority: 2, formulae: ['"מועמד"'], style: dxf('FFFFF3B8') },
      { type: 'cellIs', operator: 'equal', priority: 3, formulae: ['"לא רלוונטי"'], style: dxf('FFE6E6E6') }
    ]
  });

  // ── לשונית 2: עומס מאמנים ──────────────────────────────────────────────
  const load = wb.addWorksheet(S.TAB_LOAD, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
  });
  load.addRow(S.LOAD_HEADERS);
  loadRows.forEach(r => load.addRow(r.map(cellValue)));
  styleHeader(load, S.LOAD_HEADERS.length);
  [22, 14, 42, 28, 42].forEach((w, i) => { load.getColumn(i + 1).width = w; });

  // ── לשונית 3: מאמנים פעילים (מקור ה-dropdown) ─────────────────────────
  const coaches = wb.addWorksheet(S.TAB_COACHES, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
  });
  coaches.addRow(['מאמן']);
  S.COACHES.forEach(c => coaches.addRow([c]));
  styleHeader(coaches, 1);
  coaches.getColumn(1).width = 24;

  return wb.xlsx.writeFile(OUT).then(() => {
    S.report(rows, unknownCoaches, dropped);
    const kb = Math.round(fs.statSync(OUT).size / 1024);
    console.log(`\n✅ נוצר: ${OUT}  (${kb} KB)`);
    console.log('\nלהעלאה ל-Drive:');
    console.log(`  powershell -File .claude/skills/text-to-gdocs/html_to_gdoc.ps1 -Step upload -Docx "${OUT}" -Shot "_verify_upload.png"`);
  });
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}
