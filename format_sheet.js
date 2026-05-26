const { chromium } = require('playwright');

const SPREADSHEET_ID = '1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('מתחבר ל-Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();

  let page = pages.find(p => p.url().includes('spreadsheets')) || pages[0];
  await page.bringToFront();
  await sleep(500);

  console.log('מנסה לעצב דרך Apps Script...');

  // פתח את Apps Script Editor דרך Extensions menu
  // נשתמש בקיצור דרך ישיר לריצת script דרך ה-URL
  const scriptUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
  if (!page.url().includes(SPREADSHEET_ID)) {
    await page.goto(scriptUrl);
    await sleep(4000);
  }

  // הרץ Apps Script דרך ה-URL של script editor
  // יצור Google Apps Script bound לגיליון
  const appsScriptCode = `
function formatTable() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  
  // נקה פורמט קיים
  var dataRange = sheet.getRange(1, 1, 11, 9);
  dataRange.clearFormat();
  
  // === שורת כותרות (שורה 1) ===
  var headerRange = sheet.getRange(1, 1, 1, 9);
  headerRange.setBackground('#1a1a1a');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  
  // === שורות נתונים (2-10) ===
  for (var i = 2; i <= 10; i++) {
    var row = sheet.getRange(i, 1, 1, 9);
    var bg = (i % 2 === 0) ? '#f5f5f5' : '#ffffff';
    row.setBackground(bg);
    row.setFontColor('#1a1a1a');
    row.setFontSize(10);
    row.setHorizontalAlignment('center');
    row.setVerticalAlignment('middle');
    sheet.setRowHeight(i, 28);
    
    // עמודת מאמן — שמאל
    sheet.getRange(i, 1).setHorizontalAlignment('right');
    sheet.getRange(i, 1).setFontWeight('bold');
  }
  
  // === שורת סה"כ (שורה 11) ===
  var totalRow = sheet.getRange(11, 1, 1, 9);
  totalRow.setBackground('#2d2d2d');
  totalRow.setFontColor('#ffffff');
  totalRow.setFontWeight('bold');
  totalRow.setFontSize(10);
  totalRow.setHorizontalAlignment('center');
  totalRow.setVerticalAlignment('middle');
  sheet.setRowHeight(11, 30);
  
  // === רוחב עמודות ===
  sheet.setColumnWidth(1, 120); // מאמן
  for (var c = 2; c <= 9; c++) {
    sheet.setColumnWidth(c, 72);
  }
  
  // === גבולות ===
  var style = SpreadsheetApp.BorderStyle.SOLID;
  dataRange.setBorder(true, true, true, true, true, true, '#cccccc', style);
  
  // גבול חזק לכותרת ולסה"כ
  headerRange.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  totalRow.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  
  // === הקפא שורת כותרות ===
  sheet.setFrozenRows(1);
  
  SpreadsheetApp.getUi().alert('✅ הטבלה עוצבה בהצלחה!');
}
`;

  // פתח Apps Script editor
  console.log('פותח Apps Script editor...');
  const editorPage = await context.newPage();
  await editorPage.goto(`https://script.google.com/macros/d/create?template=sheetsMacro&parentId=${SPREADSHEET_ID}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(4000);

  // אם נפתח Editor — מחק קוד קיים והדבק חדש
  const editorUrl = editorPage.url();
  console.log('Editor URL:', editorUrl);

  if (editorUrl.includes('script.google.com')) {
    // בחר הכל ומחק
    await editorPage.keyboard.press('Control+a');
    await sleep(200);

    // הדבק את הקוד
    await editorPage.evaluate(async (code) => {
      await navigator.clipboard.writeText(code);
    }, appsScriptCode);
    await editorPage.keyboard.press('Control+v');
    await sleep(1000);

    // שמור (Ctrl+S)
    await editorPage.keyboard.press('Control+s');
    await sleep(2000);

    // הרץ את הפונקציה
    console.log('מריץ formatTable...');
    // לחץ על כפתור Run
    await editorPage.click('[aria-label="Run"]').catch(async () => {
      // נסה דרך התפריט
      await editorPage.keyboard.press('Alt+r');
    });
    await sleep(5000);
    console.log('✅ עיצוב הופעל!');
  } else {
    console.log('❌ Apps Script Editor לא נפתח');
  }

})().catch(e => console.error('שגיאה:', e.message));
