const puppeteer = require('./whatsapp-tool/node_modules/puppeteer');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const CHROME_DEFAULT = 'C:\\Users\\דין\\AppData\\Local\\Google\\Chrome\\User Data\\Default';
const TEMP_PROFILE   = path.join(os.tmpdir(), 'pup_coach_eval_profile');
const TEMP_DEFAULT   = path.join(TEMP_PROFILE, 'Default');
const TEMP_NET       = path.join(TEMP_DEFAULT, 'Network');

const HEADERS = ['#','מאמן','מקצועיות 30%','נוכחות 25%','לקוחות 20%','הנהלה 15%','צמיחה 10%','ציון סופי'];

const COACHES = [
  'קרן דבוש','טל וזגיאל','דוד אשורי','דין שויקה','נועם כהן',
  'תום בריאולובסקי','ליאור מרגוליס','שלו אהרוני','דניאל לנדאו','סיון טפירו',
  'אריק מונטבילסקי','אופק סגל','אסף זוהר','ליז אפרגן','פיקאדו ינאו',
  'תמיר חלף','דובי מילר','וליד אבו חמוד','סהר ליכטנפלד','גילי ששון',
  'אייל רותם','יובל גורפיין','עידן אדלר'
];

// עמודות: A=#  B=מאמן  C=מקצועיות  D=נוכחות  E=לקוחות  F=הנהלה  G=צמיחה  H=ציון סופי
// הנוסחה הפשוטה (ללא פונקציות) עובדת בכל שפת-ממשק. תיתן 0 עד שממלאים ציונים.
function buildRow(i) {
  const r = i + 2;                 // שורת הגיליון (שורה 1 = כותרות)
  const formula = `=(C${r}*0.3+D${r}*0.25+E${r}*0.2+F${r}*0.15+G${r}*0.1)*20`;
  return [String(i + 1), COACHES[i], '', '', '', '', '', formula];
}

const ROWS = COACHES.map((_, i) => buildRow(i));
const TSV  = [HEADERS.join('\t'), ...ROWS.map(r => r.join('\t'))].join('\n');

async function main() {
    console.log('📋 מעתיק cookies ל-temp profile...');
    fs.mkdirSync(TEMP_NET, { recursive: true });

    const files = ['Cookies','Login Data','Local State'];
    for (const f of files) {
        const src  = path.join(CHROME_DEFAULT, 'Network', f);
        const src2 = path.join(CHROME_DEFAULT, f);
        const dst  = path.join(TEMP_NET, f);
        if (fs.existsSync(src))  { try { fs.copyFileSync(src, dst); } catch(_){} }
        if (fs.existsSync(src2)) { try { fs.copyFileSync(src2, path.join(TEMP_DEFAULT, f)); } catch(_){} }
    }
    const ls = path.join('C:\\Users\\דין\\AppData\\Local\\Google\\Chrome\\User Data', 'Local State');
    if (fs.existsSync(ls)) { try { fs.copyFileSync(ls, path.join(TEMP_PROFILE, 'Local State')); } catch(_){} }

    console.log('🚀 פותח Chrome...');
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: TEMP_PROFILE,
        args: ['--no-first-run','--no-default-browser-check','--disable-blink-features=AutomationControlled'],
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation']
    });

    const [page] = await browser.pages();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

    console.log('📄 פותח sheets.new...');
    await page.goto('https://sheets.new', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));

    let url = page.url();
    console.log('📎 URL:', url);

    if (url.includes('accounts.google.com')) {
        console.log('⚠️  צריך כניסה לחשבון — ממתין עד 60 שניות...');
        await page.waitForNavigation({ timeout: 60000, waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000));
    }

    console.log('📊 מדביק נתונים...');
    await page.evaluate(async (tsv) => {
        try { await navigator.clipboard.writeText(tsv); } catch(_) {}
    }, TSV);

    await page.keyboard.down('Control');
    await page.keyboard.press('Home');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 500));

    await page.keyboard.down('Control');
    await page.keyboard.press('v');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 3000));

    const sheetUrl = page.url();
    console.log('\n✅ גיליון הציונים נוצר!');
    console.log('🔗', sheetUrl);

    fs.writeFileSync(path.join(__dirname, 'coach_eval_url.txt'), sheetUrl, 'utf8');
    console.log('\nהקישור נשמר ב: coach_eval_url.txt');

    // משאיר את הדפדפן פתוח כדי שתוכל לראות ולשמור
    console.log('\n(הדפדפן יישאר פתוח — אפשר לסגור ידנית)');
}

main().catch(async e => {
    console.error('❌', e.message);
    console.log('\nמנסה fallback: פותח sheets.new בChrome הפתוח...');
    try { execSync('start chrome "https://sheets.new"'); } catch(_) {}
    process.exit(1);
});
