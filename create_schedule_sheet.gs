function createScheduleSheet() {
  const ss = SpreadsheetApp.create('שיחות אישיות — יוני 2026');
  const sheet = ss.getActiveSheet();
  sheet.setName('שיבוץ');
  sheet.setRightToLeft(true);

  // ─── כותרת ───────────────────────────────────────────────
  sheet.getRange('A1:E1').merge()
    .setValue('📅 שיחות אישיות — יוני 2026 | ימי שני ורביעי מ-16:30')
    .setFontSize(14).setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBackground('#1a73e8').setFontColor('#ffffff');

  // ─── כותרות עמודות ────────────────────────────────────────
  const headers = [['שעה', 'שני 15/06', 'רביעי 17/06', 'שני 22/06', 'רביעי 24/06']];
  sheet.getRange('A2:E2').setValues(headers)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBackground('#d2e3fc');

  // ─── משבצות זמן ──────────────────────────────────────────
  const times = [
    '16:30 – 16:50',
    '16:50 – 17:10',
    '17:10 – 17:30',
    '17:30 – 17:50',
    '17:50 – 18:10',
    '18:10 – 18:30'
  ];

  for (let i = 0; i < times.length; i++) {
    const row = i + 3;
    sheet.getRange(row, 1).setValue(times[i])
      .setFontWeight('bold')
      .setBackground('#f8f9fa')
      .setHorizontalAlignment('center');

    // 4 תאים ריקים לשיבוץ (עמודות B-E)
    const cells = sheet.getRange(row, 2, 1, 4);
    cells.setBackground('#ffffff')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    // שורות סירוגין — גוון אפור עדין
    if (i % 2 === 1) {
      cells.setBackground('#f1f3f4');
      sheet.getRange(row, 1).setBackground('#e8eaed');
    }
  }

  // ─── עיצוב גבולות ────────────────────────────────────────
  const table = sheet.getRange('A2:E8');
  table.setBorder(true, true, true, true, true, true,
    '#c0c0c0', SpreadsheetApp.BorderStyle.SOLID);

  // ─── גודל עמודות ─────────────────────────────────────────
  sheet.setColumnWidth(1, 140);  // שעה
  sheet.setColumnWidth(2, 160);  // 15/06
  sheet.setColumnWidth(3, 160);  // 17/06
  sheet.setColumnWidth(4, 160);  // 22/06
  sheet.setColumnWidth(5, 160);  // 24/06
  sheet.setRowHeight(1, 40);
  for (let r = 2; r <= 8; r++) sheet.setRowHeight(r, 36);

  // ─── הגנה על עמודת השעות ─────────────────────────────────
  const protection = sheet.getRange('A1:A8').protect();
  protection.setDescription('שעות — לא לעריכה');
  protection.setWarningOnly(true);

  // ─── הקפאת שורת כותרות ───────────────────────────────────
  sheet.setFrozenRows(2);

  // ─── הדפסת קישור ─────────────────────────────────────────
  const url = ss.getUrl();
  Logger.log('✅ ה-Sheet נוצר: ' + url);
  SpreadsheetApp.getUi().alert('✅ הטבלה נוצרה!\n\n' + url);
}
