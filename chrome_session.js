// שליטה קבועה ב-Chrome דרך CDP על פרופיל ייעודי מחובר (בלי מלחמות פוקוס, בלי דפדפן זמני).
// שימוש:
//   node chrome_session.js check           -> פותח/מתחבר ובודק אם מחובר לגוגל
//   node chrome_session.js paste-coaches    -> יוצר גיליון חדש ומדביק את רשימת המאמנים
//
// הפרופיל: C:\Users\דין\ChromeDebug  — נשאר מחובר לתמיד אחרי התחברות ראשונה אחת.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE    = 'C:\\Users\\דין\\ChromeDebug';
const PORT       = 9222;
const CDP        = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const COACHES = [
  'קרן דבוש','טל וזגיאל','דוד אשורי','דין שויקה','נועם כהן',
  'תום בריאולובסקי','ליאור מרגוליס','שלו אהרוני','דניאל לנדאו','סיון טפירו',
  'אריק מונטבילסקי','אופק סגל','אסף זוהר','ליז אפרגן','פיקאדו ינאו',
  'תמיר חלף','דובי מילר','וליד אבו חמוד','סהר ליכטנפלד','גילי ששון',
  'אייל רותם','יובל גורפיין','עידן אדלר'
];
const HEADERS = ['#','שם המאמן','מוקד','טלפון','סטטוס'];
const TSV = [HEADERS.join('\t'), ...COACHES.map((n,i)=>[i+1,n,'','','פעיל'].join('\t'))].join('\n');

async function ensureBrowser() {
  let browser = await chromium.connectOverCDP(CDP).catch(() => null);
  if (browser) { console.log('✅ מחובר לפרופיל הקיים'); return browser; }

  console.log('🚀 מפעיל את פרופיל ה-Chrome הייעודי עם debug port...');
  fs.mkdirSync(PROFILE, { recursive: true });
  const proc = spawn(CHROME_EXE, [
    `--remote-debugging-port=${PORT}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    'https://sheets.new'
  ], { detached: true, stdio: 'ignore' });
  proc.unref();

  for (let i = 0; i < 20 && !browser; i++) {
    await sleep(1500);
    browser = await chromium.connectOverCDP(CDP).catch(() => null);
  }
  if (!browser) throw new Error('Chrome לא עלה עם debug port');
  console.log('✅ מחובר');
  return browser;
}

async function getPage(browser) {
  const ctx = browser.contexts()[0];
  await sleep(1500);
  let pages = ctx.pages();
  let page = pages.find(p => p.url().includes('spreadsheets') || p.url().includes('sheets') || p.url().includes('accounts.google'));
  if (!page) page = pages[0] || await ctx.newPage();
  return page;
}

(async () => {
  const cmd = process.argv[2] || 'check';
  const browser = await ensureBrowser();
  const page = await getPage(browser);
  await sleep(3000);
  const url = page.url();
  console.log('URL:', url);

  const loggedIn = !url.includes('accounts.google') && !url.includes('signin');
  if (!loggedIn) {
    console.log('\n⚠️  צריך התחברות חד-פעמית: בחלון ה-Chrome שנפתח, התחבר לחשבון/ות Google שלך.');
    console.log('אחרי שאתה מחובר ורואה גיליון ריק — תגיד לי "המשך" ואני ממשיך אוטומטית.\n');
    console.log('STATUS: NEED_LOGIN');
    return;
  }
  console.log('STATUS: LOGGED_IN');

  if (cmd === 'paste-coaches') {
    // ודא שיש גיליון פתוח
    if (!page.url().includes('spreadsheets')) {
      await page.goto('https://sheets.new', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(6000);
    }
    await page.bringToFront();
    await page.evaluate(async (t) => { try { await navigator.clipboard.writeText(t); } catch {} }, TSV);
    try {
      await page.click('.waffle-name-box', { timeout: 4000 });
      await page.keyboard.press('Control+a');
      await page.keyboard.type('A1');
      await page.keyboard.press('Enter');
    } catch {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+Home');
    }
    await sleep(700);
    await page.keyboard.press('Control+v');
    await sleep(2500);
    const sheetUrl = page.url();
    fs.writeFileSync(path.join(__dirname, 'coaches_sheet_url.txt'), sheetUrl, 'utf8');
    console.log('✅ הרשימה הודבקה!');
    console.log('SHEET_URL:', sheetUrl);
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });
