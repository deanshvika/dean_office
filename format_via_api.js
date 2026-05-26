const { chromium } = require('playwright');
const { spawn } = require('child_process');

const SPREADSHEET_ID = '1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;

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
  let page = context.pages().find(p => p.url().includes(SPREADSHEET_ID))
    || context.pages()[0];

  if (!page.url().includes(SPREADSHEET_ID)) {
    await page.goto(SHEET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);
  }
  await page.bringToFront();
  console.log('✅ מחובר לגיליון');

  // פתח CDP session על הדף הספציפי
  const cdp = await page.context().newCDPSession(page);

  // הפעל Network monitoring
  await cdp.send('Network.enable');

  let capturedToken = null;
  cdp.on('Network.requestWillBeSent', (event) => {
    const headers = event.request.headers;
    const auth = headers['authorization'] || headers['Authorization'];
    if (auth && auth.startsWith('Bearer ') && !capturedToken) {
      capturedToken = auth.replace('Bearer ', '');
      console.log('🎯 Token תפוס מ-CDP!', capturedToken.substring(0,30)+'...');
    }
  });

  // גרום ל-Sheets לשלוח בקשה — שנה תא ואז בטל
  console.log('מגרה בקשת network...');
  
  // לחץ על תא ריק ושנה ערך
  await page.keyboard.press('Escape');
  await sleep(300);
  
  // נווט לתא ריק (מחוץ לטבלה)
  await page.click('.waffle-name-box').catch(() => {});
  await sleep(200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('K1');
  await page.keyboard.press('Enter');
  await sleep(300);
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await sleep(3000);

  if (!capturedToken) {
    // נסה reload עמוד
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(4000);
  }

  // נקה את ה-x שהוספנו
  await page.click('.waffle-name-box').catch(() => {});
  await sleep(200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('K1');
  await page.keyboard.press('Enter');
  await sleep(200);
  await page.keyboard.press('Delete');
  await sleep(500);

  if (!capturedToken) {
    console.log('❌ Token לא נתפס — עדיין מנסה...');
    // נסה ctrl+Z שיגרום ל-sync
    await page.keyboard.press('Control+z');
    await sleep(3000);
  }

  if (capturedToken) {
    console.log('מעצב דרך API...');
    await applyFormatting(page, capturedToken);
  } else {
    console.log('❌ לא הצלחתי לתפוס token.');
    console.log('פותח Extensions > Apps Script...');
    await openAppsScript(page, browser, context);
  }

})().catch(e => console.error('שגיאה:', e.message));

async function applyFormatting(page, token) {
  const SPREADSHEET_ID = '1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg';
  const sheetId = 0;

  const requests = [
    { repeatCell: { range: {sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:9}, cell: { userEnteredFormat: { backgroundColor:{red:0.08,green:0.08,blue:0.08}, textFormat:{foregroundColor:{red:1,green:1,blue:1},bold:true,fontSize:10}, horizontalAlignment:'CENTER', verticalAlignment:'MIDDLE'}}, fields:'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'}},
    ...Array.from({length:9},(_,i)=>({ repeatCell:{ range:{sheetId,startRowIndex:i+1,endRowIndex:i+2,startColumnIndex:0,endColumnIndex:9}, cell:{userEnteredFormat:{ backgroundColor:i%2===0?{red:0.95,green:0.95,blue:0.95}:{red:1,green:1,blue:1}, textFormat:{foregroundColor:{red:0.1,green:0.1,blue:0.1},fontSize:10}, horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE'}}, fields:'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'}})),
    { repeatCell:{ range:{sheetId,startRowIndex:1,endRowIndex:10,startColumnIndex:0,endColumnIndex:1}, cell:{userEnteredFormat:{textFormat:{bold:true},horizontalAlignment:'RIGHT'}}, fields:'userEnteredFormat(textFormat,horizontalAlignment)'}},
    { repeatCell:{ range:{sheetId,startRowIndex:10,endRowIndex:11,startColumnIndex:0,endColumnIndex:9}, cell:{userEnteredFormat:{ backgroundColor:{red:0.08,green:0.08,blue:0.08}, textFormat:{foregroundColor:{red:1,green:1,blue:1},bold:true,fontSize:10}, horizontalAlignment:'CENTER',verticalAlignment:'MIDDLE'}}, fields:'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'}},
    { updateBorders:{ range:{sheetId,startRowIndex:0,endRowIndex:11,startColumnIndex:0,endColumnIndex:9}, innerHorizontal:{style:'SOLID',color:{red:0.8,green:0.8,blue:0.8}}, innerVertical:{style:'SOLID',color:{red:0.8,green:0.8,blue:0.8}}, top:{style:'SOLID_MEDIUM',color:{red:0.08,green:0.08,blue:0.08}}, bottom:{style:'SOLID_MEDIUM',color:{red:0.08,green:0.08,blue:0.08}}, left:{style:'SOLID_MEDIUM',color:{red:0.08,green:0.08,blue:0.08}}, right:{style:'SOLID_MEDIUM',color:{red:0.08,green:0.08,blue:0.08}}}},
    {updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:0,endIndex:1},properties:{pixelSize:130},fields:'pixelSize'}},
    ...Array.from({length:8},(_,i)=>({updateDimensionProperties:{range:{sheetId,dimension:'COLUMNS',startIndex:i+1,endIndex:i+2},properties:{pixelSize:72},fields:'pixelSize'}})),
    {updateDimensionProperties:{range:{sheetId,dimension:'ROWS',startIndex:0,endIndex:11},properties:{pixelSize:30},fields:'pixelSize'}},
    {updateSheetProperties:{properties:{sheetId,gridProperties:{frozenRowCount:1}},fields:'gridProperties.frozenRowCount'}}
  ];

  const result = await page.evaluate(async ({id, tok, reqs}) => {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
      body: JSON.stringify({ requests: reqs })
    });
    const d = await r.json();
    return { ok: r.ok, status: r.status, error: d?.error?.message };
  }, { id: SPREADSHEET_ID, tok: token, reqs: requests });

  console.log(result.ok ? '✅ עיצוב הושלם!' : '❌ ' + result.error);
}

async function openAppsScript(page, browser, context) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  
  // פתח Extensions menu
  const extMenu = await page.$('[aria-label="Extensions"]');
  if (extMenu) {
    await extMenu.click();
    await sleep(800);
    const appsScriptItem = await page.$('[aria-label="Apps Script"]');
    if (appsScriptItem) {
      await appsScriptItem.click();
      await sleep(3000);
      // חפש דף חדש של Apps Script
      const newPages = context.pages();
      const scriptPage = newPages.find(p => p.url().includes('script.google.com/macros'));
      if (scriptPage) {
        console.log('Apps Script נפתח:', scriptPage.url());
      }
    }
  }
  console.log('ℹ️ פתח Extensions > Apps Script ידנית, הדבק את הסקריפט והרץ formatTable()');
}
