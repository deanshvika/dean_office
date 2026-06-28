const puppeteer = require('./whatsapp-tool/node_modules/puppeteer');
const TITLE = 'שכר ימי שיא הצלח"ה — יוני 2026';

(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:55163', defaultViewport: null });
    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes('docs.google.com/spreadsheets'));
    if (!page) { console.log('❌ אין גיליון'); process.exit(1); }
    await page.bringToFront();
    await new Promise(r => setTimeout(r, 600));

    // לחץ על שדה השם
    const sel = 'input.docs-title-input';
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.click(sel, { clickCount: 3 });
    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Backspace');
    await page.type(sel, TITLE, { delay: 25 });
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 1500));
    console.log('✅ שם הגיליון עודכן ל:', TITLE);
    browser.disconnect();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
