const puppeteer = require('./whatsapp-tool/node_modules/puppeteer');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const CHROME_DEFAULT = 'C:\\Users\\דין\\AppData\\Local\\Google\\Chrome\\User Data\\Default';
const TEMP_PROFILE   = path.join(os.tmpdir(), 'pup_sheets_profile');
const TEMP_DEFAULT   = path.join(TEMP_PROFILE, 'Default');
const TEMP_NET       = path.join(TEMP_DEFAULT, 'Network');

const TIMES   = ['16:30 – 16:50','16:50 – 17:10','17:10 – 17:30','17:30 – 17:50','17:50 – 18:10','18:10 – 18:30'];
const HEADERS = ['שעה','שני 15/06','רביעי 17/06','שני 22/06','רביעי 24/06'];

const TSV = [HEADERS.join('\t'), ...TIMES.map(t => [t,'','','',''].join('\t'))].join('\n');

function copyDir(src, dst) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, f.name), d = path.join(dst, f.name);
        if (f.isDirectory()) copyDir(s, d);
        else { try { fs.copyFileSync(s, d); } catch(_) {} }
    }
}

async function main() {
    // בנה פרופיל זמני עם cookies מהפרופיל האמיתי
    console.log('📋 מעתיק cookies ל-temp profile...');
    fs.mkdirSync(TEMP_NET, { recursive: true });

    // קבצי auth קריטיים
    const files = ['Cookies','Login Data','Local State'];
    for (const f of files) {
        const src = path.join(CHROME_DEFAULT, 'Network', f);
        const src2 = path.join(CHROME_DEFAULT, f);
        const dst  = path.join(TEMP_NET, f);
        if (fs.existsSync(src))  { try { fs.copyFileSync(src, dst); } catch(_){} }
        if (fs.existsSync(src2)) { try { fs.copyFileSync(src2, path.join(TEMP_DEFAULT, f)); } catch(_){} }
    }

    // Local State (חשוב לגוגל)
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

    const url = page.url();
    console.log('📎 URL:', url);

    if (url.includes('accounts.google.com')) {
        console.log('⚠️  צריך כניסה לחשבון — ממתין עד 60 שניות...');
        await page.waitForNavigation({ timeout: 60000, waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000));
    }

    // הדבק TSV עם Ctrl+V
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

    // שם גיליון
    const sheetUrl = page.url();
    console.log('\n✅ הטבלה נוצרה!');
    console.log('🔗', sheetUrl);

    // שמור קישור לקובץ
    fs.writeFileSync(path.join(__dirname, 'sheet_url.txt'), sheetUrl, 'utf8');
    console.log('\nהקישור נשמר ב: sheet_url.txt');
}

main().catch(async e => {
    console.error('❌', e.message);
    // fallback — פתח sheets.new בChrome הרגיל
    console.log('\nמנסה fallback: פותח sheets.new בChrome הפתוח...');
    try { execSync('start chrome "https://sheets.new"'); } catch(_) {}
    process.exit(1);
});
