const { chromium } = require('playwright');
const { spawn } = require('child_process');

const SPREADSHEET_ID = '1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;

const TSV = [
  ['מאמן','3.6 (ד\')','4.6 (ה\')','7.6 (א\')','8.6 (ב\')','10.6 (ד\')','11.6 (ה\')','14.6 (א\')','15.6 (ב\')'],
  ['וואליד','✅','✅','✅','✅','✅','✅','✅','✅'],
  ['שמעון','✅','✅','✅','✅','✅','✅','✅','✅'],
  ['פיקאדו','✅','✅','✅','✅','✅','✅','✅','✅'],
  ['תמיר חלף','❌','❌','✅','✅','✅','✅','✅','✅'],
  ['קרן','❌','❌','✅','✅','✅','✅','✅','✅'],
  ['טל וזגיאל','✅','✅','❌','✅','❌','❌','❌','❌'],
  ['עידן','✅','❌','❌','✅','✅','❌','❌','✅'],
  ['דובי','❌','❌','✅','❌','✅','❌','✅','✅'],
  ['להט מעיין','✅','✅','❌','❌','❌','✅','❌','❌'],
  ['סה"כ זמינים','6','5','6','7','7','6','6','7'],
].map(r => r.join('\t')).join('\n');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch {
    spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ['--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1',
       '--user-data-dir=C:/Temp/cr_debug','--no-first-run', SHEET_URL],
      { detached:true, stdio:'ignore' }).unref();
    await sleep(5000);
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  }

  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes(SPREADSHEET_ID)) || context.pages()[0];

  if (!page.url().includes(SPREADSHEET_ID)) {
    await page.goto(SHEET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
  }
  await page.bringToFront();
  console.log('✅ מחובר');

  // 1. בחר הכל ומחק
  console.log('מנקה גיליון...');
  await page.keyboard.press('Control+a');
  await sleep(400);
  await page.keyboard.press('Delete');
  await sleep(800);

  // 2. עבור לתא A1
  await page.click('.waffle-name-box').catch(() => {});
  await sleep(200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('A1');
  await page.keyboard.press('Enter');
  await sleep(500);

  // 3. שים TSV בלוח והדבק
  await page.evaluate(async (tsv) => {
    await navigator.clipboard.writeText(tsv);
  }, TSV);
  await sleep(300);
  await page.keyboard.press('Control+v');
  await sleep(2000);

  console.log('✅ הטבלה הודבקה נכון!');
})().catch(e => console.error('שגיאה:', e.message));
