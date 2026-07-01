/*
 * chrome_automation.js — חיבור לפרופיל Chrome הייעודי לאוטומציה (פורט 9222).
 *
 * רקע: Chrome 149 חוסם remote-debugging על הפרופיל הרגיל (מגבלת אבטחה מ-v136+),
 * לכן יש פרופיל נפרד ייעודי המחובר לחשבון הגוגל של דין (deanshvika@gmail.com).
 *   user-data-dir: C:\Users\דין\ChromeAutomation
 *   port: 9222   |   קיצור הפעלה: "Chrome אוטומציה (9222).lnk" על שולחן העבודה
 *
 * שימוש:
 *   const { getBrowser, openPage } = require('./chrome_automation');
 *   const b = await getBrowser();                 // מפעיל את הפרופיל אם צריך ומתחבר
 *   const page = await openPage(b, 'https://docs.google.com/...');
 *   ...  // page.keyboard / page.mouse / clipboard — הקלט הולך לדף הספציפי, בטוח
 *   b.disconnect();                               // החלון נשאר פתוח
 */
const puppeteer = require('./whatsapp-tool/node_modules/puppeteer');
const { execFile } = require('child_process');

const PORT = 9222;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = 'C:\\Users\\דין\\ChromeAutomation';

async function portAlive() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return res.ok;
  } catch { return false; }
}

function launch() {
  execFile(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check'
  ], () => {});
}

async function getBrowser() {
  if (!(await portAlive())) {
    launch();
    for (let i = 0; i < 20 && !(await portAlive()); i++) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
}

async function openPage(browser, url) {
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });
  await page.bringToFront();
  return page;
}

module.exports = { getBrowser, openPage, PORT, PROFILE };

// הרצה ישירה: בדיקת חיבור וזיהוי החשבון
if (require.main === module) {
  (async () => {
    const b = await getBrowser();
    const p = await openPage(b, 'https://myaccount.google.com/');
    await new Promise(r => setTimeout(r, 2500));
    const email = await p.evaluate(() => (document.body.innerText.match(/[\w.%+-]+@gmail\.com/) || [])[0] || null);
    console.log('מחובר כ:', email || '(לא מזוהה — צריך התחברות חד-פעמית בחלון)');
    b.disconnect();
  })().catch(e => console.error('שגיאה:', e.message));
}
