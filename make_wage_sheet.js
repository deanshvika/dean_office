const puppeteer = require('./whatsapp-tool/node_modules/puppeteer');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const CHROME_DEFAULT = 'C:\\Users\\דין\\AppData\\Local\\Google\\Chrome\\User Data\\Default';
const TEMP_PROFILE   = path.join(os.tmpdir(), 'pup_wage_profile');
const TEMP_DEFAULT   = path.join(TEMP_PROFILE, 'Default');
const TEMP_NET       = path.join(TEMP_DEFAULT, 'Network');

// ===== נתוני השכר — ימי שיא הצלח"ה (687.5₪ ליום, 6 ימי פעילות) =====
const TITLE = 'שכר ימי שיא הצלח"ה — יוני 2026';

const ROWS = [
    ['מאמן', 'הימים שעבד', 'מס\' ימים', 'תעריף יומי (₪)', 'שכר לתשלום (₪)'],
    ['שמעון',  '3.6, 4.6, 7.6, 10.6, 11.6, 14.6', '6', '687.5', '4125'],
    ['שליו',   '3.6, 4.6, 7.6, 10.6, 11.6, 14.6', '6', '687.5', '4125'],
    ['וואליד', '3.6, 4.6, 7.6, 14.6',             '4', '687.5', '2750'],
    ['תמיר',   '7.6, 10.6, 11.6, 14.6',           '4', '687.5', '2750'],
    ['קרן',    '7.6, 10.6, 11.6, 14.6',           '4', '687.5', '2750'],
    ['פיקאדו', '3.6, 4.6, 10.6',                  '3', '687.5', '2062.5'],
    ['דובי',   '7.6, 10.6, 14.6',                 '3', '687.5', '2062.5'],
    ['סיוון',  '4.6, 11.6',                       '2', '687.5', '1375'],
    ['טל',     '3.6, 4.6',                        '2', '687.5', '1375'],
    ['עידן',   '3.6',                             '1', '687.5', '687.5'],
    ['יוני',   '11.6',                            '1', '687.5', '687.5'],
    ['סה"כ',   '6 ימי פעילות: 3.6,4.6,7.6,10.6,11.6,14.6', '36', '', '24750'],
];

const TSV = ROWS.map(r => r.join('\t')).join('\n');

async function main() {
    console.log('📋 מעתיק cookies ל-temp profile...');
    fs.mkdirSync(TEMP_NET, { recursive: true });

    const files = ['Cookies', 'Login Data', 'Local State'];
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
        args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
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

    // הדבק את הנתונים מתא A1
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

    // שנה את שם הגיליון
    console.log('✏️  קובע שם לגיליון...');
    try {
        await page.click('input.docs-title-input, .docs-title-input-label-inner input', { clickCount: 3 });
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.type(TITLE, { delay: 20 });
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        console.log('   (לא הצלחתי לשנות שם אוטומטית:', e.message, ')');
    }

    const sheetUrl = page.url();
    console.log('\n✅ הגיליון נוצר!');
    console.log('🔗', sheetUrl);

    fs.writeFileSync(path.join(__dirname, 'wage_sheet_url.txt'), sheetUrl, 'utf8');
    console.log('\nהקישור נשמר ב: wage_sheet_url.txt');

    // השאר את הדפדפן פתוח 5 שניות לוודא שמירה
    await new Promise(r => setTimeout(r, 5000));
}

main().catch(async e => {
    console.error('❌', e.message);
    console.log('\nמנסה fallback: פותח sheets.new בChrome הרגיל...');
    try { execSync('start chrome "https://sheets.new"'); } catch(_) {}
    process.exit(1);
});
