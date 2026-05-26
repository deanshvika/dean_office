const { chromium } = require('playwright');

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
  ['סה"כ זמינים', 6, 5, 6, 7, 7, 6, 6, 7],
];

// בנה TSV (Tab-Separated Values) להעתקה לשיטס
const tsv = TABLE.map(row => row.join('\t')).join('\n');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    storageState: undefined,
  });

  const page = await context.newPage();

  console.log('פותח גיליון חדש בגוגל שיטס...');
  await page.goto('https://sheets.new', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // לחץ על תא A1
  console.log('לוחץ על תא A1...');
  const cell = page.locator('.cell-renderer-container').first();
  if (await cell.count() > 0) {
    await cell.click();
  } else {
    // נסה דרך קיצור מקלדת
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Home');
  }
  await page.waitForTimeout(1000);

  // העתק TSV ללוח
  console.log('מדביק את הטבלה...');
  await page.evaluate((tsvData) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', tsvData);
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    }));
  }, tsv);

  await page.waitForTimeout(2000);

  // אם זה לא עבד — נשתמש בקיצור Ctrl+V עם clipboard
  await page.evaluate(async (tsvData) => {
    await navigator.clipboard.writeText(tsvData);
  }, tsv).catch(() => {});

  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(3000);

  console.log('✅ הושלם! הטבלה הודבקה בגוגל שיטס.');
  console.log('הדפדפן נשאר פתוח כדי שתוכל לשנות שם לגיליון ולשמור.');

  // אל תסגור את הדפדפן
})().catch(e => {
  console.error('שגיאה:', e.message);
});
