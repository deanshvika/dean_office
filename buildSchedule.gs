/**
 * שיבוץ שיחות חתך — יוני 2026
 * הרץ את buildSchedule() כדי לבנות את הטבלה
 */

function buildSchedule() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // מחיקת גיליונות קודמים אם קיימים
  ['שיבוץ חתך יוני', 'רשימת מאמנים'].forEach(name => {
    const s = ss.getSheetByName(name);
    if (s) ss.deleteSheet(s);
  });

  const sheet = ss.insertSheet('שיבוץ חתך יוני');
  sheet.setRightToLeft(true);

  const coaches = [
    'קרן דבוש', 'טל וזגיאל', 'דוד אשורי', 'נועם כהן', 'תום בריאולובסקי',
    'ליאור מרגוליס', 'שמעון יצחק', 'רומי לני', 'דניאל לנדאו', 'סיון טפירו',
    'אריק מונטבילסקי', 'אופק סגל', 'אסף זוהר', 'ליז אפרגן', 'פיקאדו ינאו',
    'תמיר חלף', 'חי ניר', 'דובי מילר', 'וליד אבו חמוד', 'סהר ליכטנפלד',
    'גילי ששון', 'אייל רותם', 'יובל גורפיין', 'עידן אדלר'
  ];

  // --- כותרת ראשית ---
  sheet.getRange(1, 1, 1, 5).merge()
    .setValue('שיחות חתך — יוני 2026')
    .setBackground('#1A237E')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(16)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 40);

  // --- שורת הוראות ---
  sheet.getRange(2, 1, 1, 5).merge()
    .setValue('הוראות: בחר/י שורה פנויה ורשום/י את שמך בעמודה "שם מאמן" (כל שיחה 20 דקות)')
    .setBackground('#E8EAF6')
    .setFontColor('#3949AB')
    .setFontStyle('italic')
    .setFontSize(11)
    .setHorizontalAlignment('center');
  sheet.setRowHeight(2, 28);

  // --- שורה ריקה ---
  sheet.setRowHeight(3, 10);

  // --- כותרות עמודות ---
  const HEADER_ROW = 4;
  const headers = ['תאריך', 'יום', 'שעת התחלה', 'שעת סיום', 'שם מאמן'];
  const headerRange = sheet.getRange(HEADER_ROW, 1, 1, 5);
  headerRange.setValues([headers])
    .setBackground('#37474F')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center');
  sheet.setRowHeight(HEADER_ROW, 30);

  // --- לוח הזמנים ---
  const schedule = [
    { date: '21/06/2026', day: 'ראשון',  start: '10:00', end: '12:00', color: '#E8F5E9', darkColor: '#C8E6C9' },
    { date: '22/06/2026', day: 'שני',    start: '16:00', end: '18:00', color: '#E3F2FD', darkColor: '#BBDEFB' },
    { date: '23/06/2026', day: 'שלישי',  start: '13:00', end: '15:00', color: '#FFF3E0', darkColor: '#FFE0B2' },
    { date: '25/06/2026', day: 'חמישי',  start: '19:30', end: '21:00', color: '#F3E5F5', darkColor: '#E1BEE7' },
    { date: '28/06/2026', day: 'ראשון',  start: '10:00', end: '12:00', color: '#E8F5E9', darkColor: '#C8E6C9' },
    { date: '29/06/2026', day: 'שני',    start: '16:00', end: '18:00', color: '#E3F2FD', darkColor: '#BBDEFB' },
    { date: '30/06/2026', day: 'שלישי',  start: '13:00', end: '15:00', color: '#FFF3E0', darkColor: '#FFE0B2' },
  ];

  let row = HEADER_ROW + 1;
  const firstDataRow = row;

  for (const dayData of schedule) {
    const slots = generateSlots(dayData.start, dayData.end, 20);
    const isFirstSlot = true;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const rowRange = sheet.getRange(row, 1, 1, 5);

      rowRange.setValues([[dayData.date, dayData.day, slot.start, slot.end, '']]);
      rowRange.setBackground(i === 0 ? dayData.darkColor : dayData.color);
      rowRange.setHorizontalAlignment('center');
      rowRange.setVerticalAlignment('middle');
      rowRange.setBorder(true, true, true, true, false, false, '#BDBDBD', SpreadsheetApp.BorderStyle.SOLID);

      // עמודת "שם מאמן" — רקע לבן כדי שייראה ברור
      sheet.getRange(row, 5).setBackground('#FFFFFF').setFontColor('#000000').setFontWeight('normal');

      sheet.setRowHeight(row, 26);
      row++;
    }

    // קו מפריד בין ימים
    sheet.getRange(row - 1, 1, 1, 5).setBorder(
      false, false, true, false, false, false,
      '#78909C', SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );
  }

  const lastDataRow = row - 1;
  const totalSlots = lastDataRow - firstDataRow + 1;

  // --- Dropdown לשמות המאמנים ---
  const coachValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(coaches, true)
    .setAllowInvalid(true)
    .setHelpText('בחר שם מהרשימה או הקלד ידנית')
    .build();
  sheet.getRange(firstDataRow, 5, totalSlots, 1).setDataValidation(coachValidation);

  // --- עיצוב עמודות ---
  sheet.setColumnWidth(1, 110); // תאריך
  sheet.setColumnWidth(2, 80);  // יום
  sheet.setColumnWidth(3, 105); // התחלה
  sheet.setColumnWidth(4, 105); // סיום
  sheet.setColumnWidth(5, 180); // שם מאמן

  // --- הקפאת שורות כותרת ---
  sheet.setFrozenRows(HEADER_ROW);

  // --- עיצוב מותנה: שורה תופסת = אפור ---
  const takenRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$E${firstDataRow}<>""`)
    .setBackground('#CFD8DC')
    .setFontColor('#607D8B')
    .setRanges([sheet.getRange(firstDataRow, 1, totalSlots, 5)])
    .build();
  sheet.setConditionalFormatRules([takenRule]);

  // --- גיליון רשימת מאמנים ---
  const coachSheet = ss.insertSheet('רשימת מאמנים');
  coachSheet.setRightToLeft(true);
  coachSheet.getRange(1, 1, 1, 2).setValues([['#', 'שם מאמן']])
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center');
  coachSheet.setRowHeight(1, 28);
  const coachData = coaches.map((c, i) => [i + 1, c]);
  coachSheet.getRange(2, 1, coachData.length, 2).setValues(coachData)
    .setHorizontalAlignment('center');
  coachSheet.setColumnWidth(1, 50);
  coachSheet.setColumnWidth(2, 180);

  // --- הצגת הגיליון הראשי ---
  ss.setActiveSheet(sheet);

  SpreadsheetApp.getUi().alert(
    '✅ הטבלה נבנתה בהצלחה!\n\n' +
    `סה"כ ${totalSlots} שורות לשיבוץ (${coaches.length} מאמנים).\n\n` +
    'שתף את הקישור עם המאמנים עם הרשאת עריכה.'
  );
}

// --- עוזר: פירוק חלון זמן לשיחות של N דקות ---
function generateSlots(startTime, endTime, durationMin) {
  const slots = [];
  let [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const endMinutes = eh * 60 + em;

  while (sh * 60 + sm + durationMin <= endMinutes) {
    const startStr = pad(sh) + ':' + pad(sm);
    let nm = sm + durationMin, nh = sh;
    if (nm >= 60) { nh++; nm -= 60; }
    slots.push({ start: startStr, end: pad(nh) + ':' + pad(nm) });
    sh = nh; sm = nm;
  }
  return slots;
}

function pad(n) { return String(n).padStart(2, '0'); }
