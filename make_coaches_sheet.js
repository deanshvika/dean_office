// יצירת Google Sheet עם רשימת המאמנים הפעילים (23) — עדכון 08/06/2026
// שיטה: מפעיל את Chrome עם הפרופיל האמיתי + debug port (היוזרים המחוברים נשמרים),
//        מתחבר דרך CDP, פותח גיליון חדש ומדביק את הרשימה. (לא profile מועתק — זה נכשל בלוגין.)
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_EXE   = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
// פרופיל debug ייעודי שכבר מחובר לגוגל (לא ברירת המחדל — Chrome חוסם debug port עליה)
const USER_DATA    = 'C:/Temp/cr_debug';
const NEW_SHEET    = 'https://sheets.new';

const HEADERS = ['#', 'שם המאמן', 'מוקד', 'טלפון', 'סטטוס'];
const COACHES = [
  'קרן דבוש','טל וזגיאל','דוד אשורי','דין שויקה','נועם כהן',
  'תום בריאולובסקי','ליאור מרגוליס','שלו אהרוני','דניאל לנדאו','סיון טפירו',
  'אריק מונטבילסקי','אופק סגל','אסף זוהר','ליז אפרגן','פיקאדו ינאו',
  'תמיר חלף','דובי מילר','וליד אבו חמוד','סהר ליכטנפלד','גילי ששון',
  'אייל רותם','יובל גורפיין','עידן אדלר'
];
const ROWS = COACHES.map((name, i) => [String(i + 1), name, '', '', 'פעיל']);
const TSV  = [HEADERS.join('\t'), ...ROWS.map(r => r.join('\t'))].join('\n');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. נסה להתחבר לפרופיל ה-debug אם כבר רץ; אחרת הפעל אותו (instance נפרד — לא נוגע ב-Chrome הראשי)
  let browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(() => null);
  if (!browser) {
    console.log('🚀 מפעיל פרופיל debug ייעודי + debug port...');
    const proc = spawn(CHROME_EXE, [
      '--remote-debugging-port=9222',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${USER_DATA}`,
      '--no-first-run',
      '--no-default-browser-check',
      NEW_SHEET
    ], { detached: true, stdio: 'ignore' });
    proc.unref();

    console.log('🔌 מתחבר דרך CDP...');
    for (let i = 0; i < 15 && !browser; i++) {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222'); }
      catch { await sleep(1500); }
    }
  }
  if (!browser) { console.log('❌ Chrome לא עלה עם debug port'); process.exit(1); }
  console.log('✅ מחובר!');

  const context = browser.contexts()[0];
  await sleep(4000);
  let pages = context.pages();

  // מצא את הטאב של הגיליון החדש
  let page = pages.find(p => p.url().includes('spreadsheets') || p.url().includes('create'));
  if (!page) { page = await context.newPage(); await page.goto(NEW_SHEET); }
  await sleep(4000);
  console.log('📎 URL:', page.url());

  if (page.url().includes('accounts.google')) {
    console.log('⚠️ נפתח דף התחברות — תתחבר ידנית ואז הרץ את הסקריפט שוב.');
    return;
  }

  await page.bringToFront();
  await sleep(1000);

  // הדבק
  await page.evaluate(async (tsv) => { try { await navigator.clipboard.writeText(tsv); } catch {} }, TSV);
  try {
    await page.click('.waffle-name-box', { timeout: 4000 });
    await page.keyboard.press('Control+a');
    await page.keyboard.type('A1');
    await page.keyboard.press('Enter');
  } catch {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Home');
  }
  await sleep(800);
  await page.keyboard.press('Control+v');
  await sleep(2500);

  const sheetUrl = page.url();
  console.log('\n✅ גיליון רשימת המאמנים נוצר!');
  console.log('🔗', sheetUrl);
  fs.writeFileSync(path.join(__dirname, 'coaches_sheet_url.txt'), sheetUrl, 'utf8');
  console.log('הקישור נשמר ב: coaches_sheet_url.txt');
  // משאיר את הדפדפן פתוח
})().catch(e => console.error('שגיאה:', e.message));
