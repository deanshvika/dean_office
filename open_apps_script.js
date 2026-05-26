const { chromium } = require('playwright');
const { spawn } = require('child_process');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg/edit';

const FORMAT_SCRIPT = `function formatTable() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var all = sheet.getRange(1, 1, 11, 9);
  all.clearFormat();
  // כותרת שחורה
  var h = sheet.getRange(1,1,1,9);
  h.setBackground('#141414');
  h.setFontColor('#ffffff');
  h.setFontWeight('bold');
  h.setFontSize(10);
  h.setHorizontalAlignment('center');
  h.setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  // שורות נתונים
  for (var i = 2; i <= 10; i++) {
    var r = sheet.getRange(i,1,1,9);
    r.setBackground(i%2===0 ? '#f2f2f2' : '#ffffff');
    r.setFontColor('#1a1a1a');
    r.setFontSize(10);
    r.setHorizontalAlignment('center');
    r.setVerticalAlignment('middle');
    sheet.setRowHeight(i, 28);
  }
  // עמודת מאמן
  sheet.getRange(2,1,9,1).setHorizontalAlignment('right').setFontWeight('bold');
  // שורת סה"כ
  var t = sheet.getRange(11,1,1,9);
  t.setBackground('#141414');
  t.setFontColor('#ffffff');
  t.setFontWeight('bold');
  t.setFontSize(10);
  t.setHorizontalAlignment('center');
  t.setVerticalAlignment('middle');
  sheet.setRowHeight(11, 30);
  // גבולות
  var bStyle = SpreadsheetApp.BorderStyle.SOLID;
  var bMed = SpreadsheetApp.BorderStyle.SOLID_MEDIUM;
  all.setBorder(true,true,true,true,true,true,'#cccccc',bStyle);
  h.setBorder(true,true,true,true,false,false,'#000000',bMed);
  t.setBorder(true,true,true,true,false,false,'#000000',bMed);
  // רוחב עמודות
  sheet.setColumnWidth(1,130);
  for (var c=2;c<=9;c++) sheet.setColumnWidth(c,72);
  // הקפא שורה 1
  sheet.setFrozenRows(1);
  SpreadsheetApp.getUi().alert('✅ הטבלה עוצבה בהצלחה!');
}`;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('✅ מחובר לChrome');
  } catch {
    spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ['--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1',
       '--user-data-dir=C:/Temp/cr_debug','--no-first-run', SHEET_URL],
      { detached:true, stdio:'ignore' }).unref();
    await sleep(5000);
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  }

  const context = browser.contexts()[0];
  const ID = '1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg';
  let page = context.pages().find(p => p.url().includes(ID)) || context.pages()[0];

  if (!page.url().includes(ID)) {
    await page.goto(SHEET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
  }
  await page.bringToFront();
  console.log('דף:', page.url().substring(0, 60));

  // פתח Extensions > Apps Script דרך תפריט
  console.log('פותח Extensions...');
  
  // לחץ על Extensions בתפריט
  const extBtn = await page.$('[aria-label="Extensions"], #docs-extensions-menu');
  if (extBtn) {
    await extBtn.click();
    await sleep(800);
  } else {
    // נסה לחיצה לפי coordinates של תפריט
    await page.evaluate(() => {
      const items = document.querySelectorAll('.docs-menubar-menu-button');
      for (const item of items) {
        if (item.textContent.includes('תוספות') || item.textContent.includes('Extensions') || item.getAttribute('aria-label')?.includes('Extensions')) {
          item.click();
          return;
        }
      }
    });
    await sleep(800);
  }

  // לחץ על Apps Script
  const appsScriptItem = await page.$('[aria-label="Apps Script"]');
  if (appsScriptItem) {
    await appsScriptItem.click();
    console.log('Apps Script נלחץ');
    await sleep(4000);
  } else {
    // נסה לחפש בתפריט
    await page.evaluate(() => {
      const items = document.querySelectorAll('[role="menuitem"]');
      for (const item of items) {
        if (item.textContent.includes('Apps Script') || item.textContent.includes('סקריפט')) {
          item.click();
          return;
        }
      }
    });
    await sleep(4000);
  }

  // חפש דף Apps Script שנפתח
  let scriptPage = null;
  for (let i = 0; i < 10; i++) {
    scriptPage = context.pages().find(p => p.url().includes('script.google.com'));
    if (scriptPage) break;
    await sleep(1000);
  }

  if (!scriptPage) {
    console.log('❌ Apps Script לא נפתח. URL חלופי...');
    scriptPage = await context.newPage();
    await scriptPage.goto(`https://script.google.com/macros/d/create?parentId=${ID}`, { timeout: 20000 });
    await sleep(4000);
  }

  console.log('Apps Script URL:', scriptPage.url());
  await scriptPage.bringToFront();
  await sleep(2000);

  // מחק קוד קיים
  await scriptPage.keyboard.press('Control+a');
  await sleep(300);

  // הדבק קוד
  await scriptPage.evaluate(async (code) => {
    await navigator.clipboard.writeText(code);
  }, FORMAT_SCRIPT);
  await scriptPage.keyboard.press('Control+v');
  await sleep(1000);

  // שמור
  await scriptPage.keyboard.press('Control+s');
  await sleep(2000);
  console.log('✅ קוד נשמר');

  // הרץ — לחץ על כפתור Run
  const runBtn = await scriptPage.$('[aria-label="Run"], .run-icon, [title="Run"]');
  if (runBtn) {
    await runBtn.click();
    console.log('▶️ הרצה...');
  } else {
    // לחץ דרך תפריט Run
    await scriptPage.evaluate(() => {
      const btns = document.querySelectorAll('button, [role="button"]');
      for (const b of btns) {
        if (b.textContent.includes('Run') || b.getAttribute('aria-label')?.includes('Run')) {
          b.click(); return;
        }
      }
    });
    console.log('▶️ הרצה דרך evaluate');
  }

  await sleep(3000);
  console.log('\n✅ סיים! אם תראה בקשת הרשאה — לחץ "Allow" פעם אחת בלבד.');

})().catch(e => console.error('שגיאה:', e.message));
