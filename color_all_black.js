const { chromium } = require('playwright');
const { spawn } = require('child_process');

const SPREADSHEET_ID = '1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    console.log('מחובר ל-Chrome קיים');
  } catch {
    console.log('פותח Chrome עם debugging port...');
    spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ['--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1',
       '--user-data-dir=C:/Temp/cr_debug', '--no-first-run', SHEET_URL],
      { detached: true, stdio: 'ignore' }).unref();
    await sleep(6000);
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  }

  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes(SPREADSHEET_ID))
    || context.pages()[0];

  if (!page.url().includes(SPREADSHEET_ID)) {
    await page.goto(SHEET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
  }
  await page.bringToFront();
  console.log('דף Sheets פעיל');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');

  let token = null;
  cdp.on('Network.requestWillBeSent', e => {
    const auth = e.request.headers['authorization'] || e.request.headers['Authorization'];
    if (auth && auth.startsWith('Bearer ') && !token) {
      token = auth.replace('Bearer ', '');
      console.log('Token תפוס:', token.substring(0, 30) + '...');
    }
  });

  // מגרה בקשת רשת — נווט לתא ריק, הקלד משהו, ובטל
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.click('.waffle-name-box').catch(() => {});
  await sleep(200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Z1');
  await page.keyboard.press('Enter');
  await sleep(400);
  await page.keyboard.type('.');
  await page.keyboard.press('Enter');
  await sleep(2500);
  // נקה
  await page.click('.waffle-name-box').catch(() => {});
  await sleep(200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Z1');
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.press('Delete');
  await sleep(500);

  if (!token) {
    console.log('Token לא נתפס — מנסה שוב אחרי reload...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(4000);
  }

  if (!token) {
    console.log('שגיאה: לא הצלחתי לתפוס token');
    process.exit(1);
  }

  // מביא מטא-דאטה של ה-spreadsheet
  console.log('מביא מטא-דאטה של הגיליון...');
  const meta = await page.evaluate(async ({ id, tok }) => {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(sheetId,title,gridProperties))`, {
      headers: { 'Authorization': `Bearer ${tok}` }
    });
    return await r.json();
  }, { id: SPREADSHEET_ID, tok: token });

  if (meta.error) {
    console.log('שגיאת API:', meta.error.message);
    process.exit(1);
  }

  console.log(`נמצאו ${meta.sheets.length} גיליונות:`);
  meta.sheets.forEach(s => console.log(`  - "${s.properties.title}" (${s.properties.gridProperties.rowCount}x${s.properties.gridProperties.columnCount})`));

  // בונה requests לצביעה שחורה של כל הגיליונות
  const requests = [];
  for (const sheet of meta.sheets) {
    const sheetId = sheet.properties.sheetId;
    const rows = sheet.properties.gridProperties.rowCount;
    const cols = sheet.properties.gridProperties.columnCount;

    // צבע רקע שחור + טקסט לבן לכל הגיליון
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: cols },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0, green: 0, blue: 0 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat.foregroundColor)'
      }
    });
  }

  console.log(`שולח ${requests.length} בקשות עיצוב...`);
  const result = await page.evaluate(async ({ id, tok, reqs }) => {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
      body: JSON.stringify({ requests: reqs })
    });
    const d = await r.json();
    return { ok: r.ok, status: r.status, error: d?.error?.message };
  }, { id: SPREADSHEET_ID, tok: token, reqs: requests });

  if (result.ok) {
    console.log('✅ הצבעת רקע שחור הושלמה בהצלחה!');
  } else {
    console.log('❌ שגיאה:', result.error || result.status);
    process.exit(1);
  }

  process.exit(0);
})().catch(e => { console.error('שגיאה:', e.message); process.exit(1); });
