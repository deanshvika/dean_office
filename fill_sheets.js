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
  ['סה"כ זמינים', '6','5','6','7','7','6','6','7'],
];

// בנה TSV
const tsv = TABLE.map(row => row.join('\t')).join('\n');

(async () => {
  // מצא את הדפדפן הפתוח
  const browser = await chromium.connectOverCDP('http://localhost:9222').catch(() => null);
  
  // אם אין דפדפן פתוח — פתח חדש
  const br = browser || await chromium.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--start-maximized'],
  });

  const pages = br.contexts ? (await br.contexts()[0]?.pages()) : [];
  const page = pages.find(p => p.url().includes('sheets.google')) 
    || (await br.newPage());

  if (!page.url().includes('sheets.google')) {
    await page.goto('https://sheets.new', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
  }

  console.log('הגעתי לגוגל שיטס, מתחיל למלא...');

  // לחץ על תא A1 דרך Name Box
  await page.click('.waffle-name-box').catch(() => {});
  await page.waitForTimeout(300);
  await page.keyboard.type('A1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // הדבק דרך לוח הגזירים — כתוב TSV לקליפבורד ואז Ctrl+V
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text);
  }, tsv);

  await page.waitForTimeout(300);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(2000);

  // בדוק אם הנתונים הופיעו
  const cellA1 = await page.evaluate(() => {
    const cells = document.querySelectorAll('.cell-input, [role="gridcell"]');
    return cells[0]?.textContent || '';
  });

  console.log('תא A1:', cellA1 || '(לא נקרא)');
  console.log('✅ הושלם! בדוק את הגיליון.');

})().catch(e => console.error('שגיאה:', e.message));
