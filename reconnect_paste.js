const puppeteer = require('./whatsapp-tool/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const ROWS = [
    ['מאמן', 'הימים שעבד', 'מס\' ימים', 'תעריף יומי (ש"ח)', 'שכר לתשלום (ש"ח)'],
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

(async () => {
    const browser = await puppeteer.connect({
        browserURL: 'http://127.0.0.1:55163',
        defaultViewport: null
    });
    console.log('✅ התחברתי ל-Chrome הקיים');

    const pages = await browser.pages();
    let page = null;
    for (const p of pages) {
        const u = p.url();
        console.log('   דף:', u.slice(0, 70));
        if (u.includes('docs.google.com/spreadsheets')) page = p;
    }
    if (!page) { console.log('❌ לא נמצא דף גיליון פתוח'); process.exit(1); }

    console.log('📄 נמצא הגיליון:', page.url());
    await page.bringToFront();
    await new Promise(r => setTimeout(r, 800));

    // קליק על תא בתוך הגריד כדי למקד את הפוקוס (קואורדינטות viewport)
    const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    console.log('   viewport:', vp.w, 'x', vp.h);
    // תא בתוך הגריד — אזור מרכזי-ימני (RTL), נתקן ל-A1 עם Ctrl+Home
    await page.mouse.click(Math.round(vp.w * 0.45), Math.round(vp.h * 0.45));
    await new Promise(r => setTimeout(r, 500));

    // עבור ל-A1
    await page.keyboard.down('Control');
    await page.keyboard.press('Home');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 400));

    // כתוב את הנתונים ללוח (הדף ממוקד אז writeText מותר)
    await page.evaluate(async (tsv) => {
        await navigator.clipboard.writeText(tsv);
    }, TSV);
    await new Promise(r => setTimeout(r, 300));

    // הדבק
    await page.keyboard.down('Control');
    await page.keyboard.press('v');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 2500));

    // צילום אימות דרך puppeteer (נקי ואמין)
    await page.screenshot({ path: path.join(__dirname, 'reconnect_verify.png') });
    console.log('📸 צילום אימות נשמר: reconnect_verify.png');

    const url = page.url();
    fs.writeFileSync(path.join(__dirname, 'wage_sheet_url.txt'), url, 'utf8');
    console.log('🔗 URL הגיליון:', url);

    browser.disconnect();
    console.log('✅ סיום (החלון נשאר פתוח)');
})().catch(e => { console.error('❌', e.message); process.exit(1); });
