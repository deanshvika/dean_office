const { chromium } = require('playwright');

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

(async () => {
  // התחבר ל-Chrome הרגיל דרך debug port
  console.log('מתחבר ל-Chrome...');
  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✅ מחובר!');
  } catch(e) {
    console.log('❌ לא הצלחתי להתחבר:', e.message);
    process.exit(1);
  }

  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  
  // מצא את הדף עם Google Sheets
  let page = pages.find(p => p.url().includes('spreadsheets'));
  if (!page) {
    console.log('פותח דף חדש...');
    page = await context.newPage();
    await page.goto('https://docs.google.com/spreadsheets/d/1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg/edit');
    await page.waitForTimeout(5000);
  }

  console.log('URL:', page.url());
  await page.bringToFront();
  await page.waitForTimeout(1000);

  // שים TSV בלוח דרך JavaScript
  await page.evaluate(async (tsv) => {
    await navigator.clipboard.writeText(tsv);
  }, TSV);

  // לחץ על Name Box ועבור ל-A1
  console.log('עובר לתא A1...');
  try {
    await page.click('.waffle-name-box', { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.keyboard.selectAll();
    await page.keyboard.type('A1');
    await page.keyboard.press('Enter');
  } catch {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Home');
  }
  
  await page.waitForTimeout(800);
  
  // הדבק
  console.log('מדביק...');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(2000);

  console.log('✅ הטבלה הודבקה!');
  await browser.close();
})().catch(e => console.error('שגיאה:', e.message));
