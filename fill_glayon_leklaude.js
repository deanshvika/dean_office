const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg/edit?gid=0#gid=0';

const TABLE = [
  ['מאמן', "3.6 (ד')", "4.6 (ה')", "7.6 (א')", "8.6 (ב')", "10.6 (ד')", "11.6 (ה')", "14.6 (א')", "15.6 (ב')"],
  ['וואליד',     '✅','✅','✅','✅','✅','✅','✅','✅'],
  ['שמעון',      '✅','✅','✅','✅','✅','✅','✅','✅'],
  ['פיקאדו',     '✅','✅','✅','✅','✅','✅','✅','✅'],
  ['תמיר חלף',  '❌','❌','✅','✅','✅','✅','✅','✅'],
  ['קרן',        '❌','❌','✅','✅','✅','✅','✅','✅'],
  ['טל וזגיאל', '✅','✅','❌','✅','❌','❌','❌','❌'],
  ['עידן',       '✅','❌','❌','✅','✅','❌','❌','✅'],
  ['דובי',       '❌','❌','✅','❌','✅','❌','✅','✅'],
  ['להט מעיין', '✅','✅','❌','❌','❌','✅','❌','❌'],
  ['סה"כ זמינים', '6','5','6','7','7','6','6','7'],
];

const TSV = TABLE.map(r => r.join('\t')).join('\n');

// העתק פרופיל Chrome של המשתמש לתיקייה זמנית
const srcProfile = 'C:/Users/דין/AppData/Local/Google/Chrome/User Data/Default';
const tmpProfile = 'C:/Temp/chrome_profile_copy';

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    // דלג על קבצים נעולים
    if (['Cache','Code Cache','GPUCache','Crashpad','blob_storage'].includes(item)) continue;
    const s = path.join(src, item);
    const d = path.join(dest, item);
    try {
      const stat = fs.statSync(s);
      if (stat.isDirectory()) {
        copyDir(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    } catch(e) {}
  }
}

(async () => {
  console.log('מעתיק פרופיל Chrome...');
  const tmpUserData = 'C:/Temp/chrome_userdata';
  const tmpDefault = path.join(tmpUserData, 'Default');
  copyDir(srcProfile, tmpDefault);
  console.log('פרופיל הועתק.');

  const context = await chromium.launchPersistentContext(tmpUserData, {
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--start-maximized', '--no-first-run', '--disable-sync'],
  });

  const page = await context.newPage();

  console.log('פותח גיליון לקלוד...');
  await page.goto(SHEET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  console.log('URL:', page.url());

  // לחץ על Name Box ונווט לתא A1
  await page.click('.waffle-name-box').catch(async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Home');
  });
  await page.waitForTimeout(500);
  await page.keyboard.type('A1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);

  // כתוב TSV ללוח
  await page.evaluate(async (tsv) => {
    try { await navigator.clipboard.writeText(tsv); } catch(e) {}
  }, TSV);

  await page.waitForTimeout(300);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(3000);

  console.log('✅ הטבלה הודבקה ב"גליון לקלוד"!');
  console.log('הדפדפן נשאר פתוח.');
})().catch(e => console.error('שגיאה:', e.message));
