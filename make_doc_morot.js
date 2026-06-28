const puppeteer = require('./whatsapp-tool/node_modules/puppeteer');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const CHROME_DEFAULT = 'C:\\Users\\דין\\AppData\\Local\\Google\\Chrome\\User Data\\Default';
const TEMP_PROFILE   = path.join(os.tmpdir(), 'pup_doc_profile');
const TEMP_DEFAULT   = path.join(TEMP_PROFILE, 'Default');
const TEMP_NET       = path.join(TEMP_DEFAULT, 'Network');

const HTML  = fs.readFileSync(path.join(__dirname, 'doc_morot.html'), 'utf8');
const PLAIN = fs.readFileSync(path.join(__dirname, 'doc_morot.txt'), 'utf8');
const DOC_TITLE = 'הנחיות למורות - יום שיא הורים וילדים';

function copyAuth() {
    fs.mkdirSync(TEMP_NET, { recursive: true });
    for (const f of ['Cookies','Login Data']) {
        const src = path.join(CHROME_DEFAULT, 'Network', f);
        const dst = path.join(TEMP_NET, f);
        if (fs.existsSync(src)) { try { fs.copyFileSync(src, dst); } catch(_){} }
    }
    const ls = path.join('C:\\Users\\דין\\AppData\\Local\\Google\\Chrome\\User Data', 'Local State');
    if (fs.existsSync(ls)) { try { fs.copyFileSync(ls, path.join(TEMP_PROFILE, 'Local State')); } catch(_){} }
}

async function main() {
    console.log('📋 מעתיק cookies...');
    copyAuth();

    console.log('🚀 פותח Chrome...');
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: TEMP_PROFILE,
        args: ['--no-first-run','--no-default-browser-check','--disable-blink-features=AutomationControlled','--start-maximized'],
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation']
    });

    const ctx = browser.defaultBrowserContext();
    await ctx.overridePermissions('https://docs.google.com', ['clipboard-read','clipboard-write']);

    const [page] = await browser.pages();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');

    console.log('📄 פותח docs.new...');
    await page.goto('https://docs.new', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));

    if (page.url().includes('accounts.google.com')) {
        console.log('⚠️  ממתין לכניסה...');
        await page.waitForNavigation({ timeout: 90000, waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 4000));
    }

    console.log('⏳ ממתין לעורך...');
    await page.waitForSelector('.kix-appview-editor', { timeout: 45000 }).catch(()=>{});
    await new Promise(r => setTimeout(r, 3000));
    await page.bringToFront();

    // שם מסמך — נשאר ממוקד בשדה הכותרת (frame ראשי) לצורך כתיבה ללוח
    try {
        await page.click('.docs-title-input', { clickCount: 3 });
        await new Promise(r => setTimeout(r, 400));
        await page.keyboard.type(DOC_TITLE);
        await new Promise(r => setTimeout(r, 500));
        console.log('✏️  שם נקבע');
    } catch(e) { console.log('⚠️ שם:', e.message); }

    // מקד את גוף המסמך (מחייב את הכותרת)
    await page.click('.kix-appview-editor');
    await new Promise(r => setTimeout(r, 800));

    // הזרם HTML+טקסט ללוח המערכת דרך PowerShell (לא דורש focus בדפדפן)
    console.log('📋 כותב ללוח המערכת...');
    try {
        const out = execSync(
            `powershell -STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${path.join(__dirname,'set_clip_html.ps1')}" -Path "${path.join(__dirname,'doc_morot.html')}" -TextPath "${path.join(__dirname,'doc_morot.txt')}"`,
            { encoding: 'utf8' });
        console.log('   ', out.trim());
    } catch(e) { console.log('⚠️ clip:', e.message); }
    await new Promise(r => setTimeout(r, 800));

    // ודא שהעורך עדיין ממוקד
    await page.click('.kix-appview-editor');
    await new Promise(r => setTimeout(r, 500));

    // הדבק
    console.log('📥 מדביק...');
    await page.keyboard.down('Control');
    await page.keyboard.press('v');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 6000));

    // בדיקת תוכן
    const textLen = await page.evaluate(() => {
        const els = document.querySelectorAll('.kix-paragraphrenderer');
        let s = '';
        els.forEach(e => s += e.textContent);
        return s.length;
    });
    console.log('📏 אורך טקסט בעורך:', textLen);

    await page.screenshot({ path: path.join(__dirname, 'doc_morot_check.png') }).catch(()=>{});

    const docUrl = page.url();
    console.log('\n🔗', docUrl);
    fs.writeFileSync(path.join(__dirname, 'doc_morot_url.txt'), docUrl, 'utf8');

    await new Promise(r => setTimeout(r, 3000));
    await browser.close();
    console.log('✅ סיום');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });