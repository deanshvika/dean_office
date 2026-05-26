const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

function copyDir(src, dest) {
  const skip = new Set(['Cache','Code Cache','GPUCache','Crashpad','blob_storage','ShaderCache','GrShaderCache','GraphiteDawnCache','DawnCache']);
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    if (skip.has(item)) continue;
    const s = path.join(src, item), d = path.join(dest, item);
    try {
      if (fs.statSync(s).isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    } catch {}
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // 1. העתק פרופיל
  const srcProfile = 'C:/Users/דין/AppData/Local/Google/Chrome/User Data/Default';
  const tmpDir = 'C:/Temp/cr_debug';
  const tmpDefault = path.join(tmpDir, 'Default');
  console.log('מעתיק פרופיל...');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  copyDir(srcProfile, tmpDefault);
  console.log('הועתק.');

  // 2. פתח Chrome עם debug port ופרופיל מועתק (instance נפרד)
  console.log('מפעיל Chrome עם debug port...');
  const chromeProc = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--remote-debugging-port=9222',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${tmpDir}`,
      '--no-first-run',
      '--disable-sync',
      '--no-default-browser-check',
      SHEET_URL
    ],
    { detached: true, stdio: 'ignore' }
  );
  chromeProc.unref();

  // 3. המתן לChrome לעלות
  console.log('ממתין ל-Chrome...');
  await sleep(4000);

  // 4. בדוק שה-port פעיל
  let tries = 0;
  let browser = null;
  while (tries < 10) {
    try {
      browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
      console.log('✅ מחובר!');
      break;
    } catch {
      await sleep(1500);
      tries++;
    }
  }

  if (!browser) { console.log('❌ Chrome לא נפתח עם debug port'); process.exit(1); }

  const context = browser.contexts()[0];
  let pages = context.pages();
  let page = pages.find(p => p.url().includes('spreadsheets')) || pages[0];
  
  // אם צריך לנווט
  if (!page.url().includes('spreadsheets')) {
    await page.goto(SHEET_URL);
  }

  await page.waitForTimeout(4000);
  console.log('URL:', page.url());

  // אם מועבר ל-login — נודיע
  if (page.url().includes('accounts.google')) {
    console.log('⚠️ דף ה-login נפתח — Google לא זיהה את הסשן. הסשן מוצפן ב-DPAPI ואי אפשר להעביר אותו.');
    console.log('נשאיר Chrome פתוח — אפשר להתחבר ידנית ואז לקרוא לסקריפט שוב.');
    return;
  }

  await page.bringToFront();

  // שים ב-clipboard
  await page.evaluate(async (tsv) => {
    try { await navigator.clipboard.writeText(tsv); } catch {}
  }, TSV);

  // עבור לA1
  try {
    await page.click('.waffle-name-box', { timeout: 3000 });
    await page.keyboard.press('Control+a');
    await page.keyboard.type('A1');
    await page.keyboard.press('Enter');
  } catch {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Home');
  }

  await page.waitForTimeout(800);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(2000);

  console.log('✅ הטבלה הודבקה!');
  // השאר פתוח
})().catch(e => console.error('שגיאה:', e.message));
