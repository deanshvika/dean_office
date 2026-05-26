const { chromium } = require('playwright');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg/edit';

const TABLE = [
  ['מאמן', "3.6 (ד')", "4.6 (ה')", "7.6 (א')", "8.6 (ב')", "10.6 (ד')", "11.6 (ה')", "14.6 (א')", "15.6 (ב')"],
  ['וואליד',    '✅','✅','✅','✅','✅','✅','✅','✅'],
  ['שמעון',     '✅','✅','✅','✅','✅','✅','✅','✅'],
  ['פיקאדו',    '✅','✅','✅','✅','✅','✅','✅','✅'],
  ['תמיר חלף', '❌','❌','✅','✅','✅','✅','✅','✅'],
  ['קרן',       '❌','❌','✅','✅','✅','✅','✅','✅'],
  ['טל וזגיאל','✅','✅','❌','✅','❌','❌','❌','❌'],
  ['עידן',      '✅','❌','❌','✅','✅','❌','❌','✅'],
  ['דובי',      '❌','❌','✅','❌','✅','❌','✅','✅'],
  ['להט מעיין','✅','✅','❌','❌','❌','✅','❌','❌'],
  ['סה"כ זמינים','6','5','6','7','7','6','6','7'],
];
const TSV = TABLE.map(r => r.join('\t')).join('\n');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('מתחבר ל-Chrome...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  console.log('✅ מחובר!');

  const context = browser.contexts()[0];
  const pages = context.pages();

  // מצא דף של Google Sheets או פתח חדש
  let page = pages.find(p => p.url().includes('spreadsheets'));
  if (!page) {
    page = await context.newPage();
    await page.goto(SHEET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
  } else {
    await page.bringToFront();
    // אם עדיין בלוגין — נווט לגיליון
    if (!page.url().includes('spreadsheets')) {
      await page.goto(SHEET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
    }
  }

  console.log('URL:', page.url());
  await page.bringToFront();
  await sleep(1000);

  // שים TSV בלוח הגזירים
  await page.evaluate(async (tsv) => {
    try { await navigator.clipboard.writeText(tsv); } catch(e) {}
  }, TSV);

  // נווט לתא A1 דרך Name Box
  console.log('עובר לתא A1...');
  try {
    await page.click('.waffle-name-box', { timeout: 4000 });
    await sleep(300);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('A1');
    await page.keyboard.press('Enter');
  } catch {
    await page.keyboard.press('Escape');
    await sleep(200);
    await page.keyboard.press('Control+Home');
  }

  await sleep(800);

  // הדבק
  console.log('מדביק...');
  await page.keyboard.press('Control+v');
  await sleep(2000);

  console.log('✅ הטבלה הודבקה ב"גליון לקלוד"!');
})().catch(e => console.error('שגיאה:', e.message));
