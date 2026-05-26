const puppeteer = require('puppeteer');
const path = require('path');

async function explore() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
        userDataDir: './base44_userdata'
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('https://schedule-nika.base44.app/Calendar', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    console.log('לחץ על פעילות כלשהי בלוח השנה...');
    console.log('אחרי שהפאנל נפתח, המתן — אצלם תמונה תוך 15 שניות');

    await new Promise(r => setTimeout(r, 15000));
    await page.screenshot({ path: path.join(__dirname, 'activity_panel.png'), fullPage: false });
    console.log('תמונה נשמרה: activity_panel.png');

    // אסוף מידע על הכפתורים והטקסט הנראים
    const info = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.textContent.trim(),
            visible: b.offsetParent !== null
        })).filter(b => b.text && b.visible);

        const panels = Array.from(document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="panel"], [class*="drawer"]'))
            .map(el => el.textContent.trim().substring(0, 200));

        return { buttons, panels };
    });
    console.log('כפתורים נראים:', JSON.stringify(info.buttons, null, 2));
    console.log('פאנלים:', JSON.stringify(info.panels, null, 2));

    console.log('\nממתין עוד 20 שניות — לחץ על "בטל פעילות" אם יש...');
    await new Promise(r => setTimeout(r, 20000));
    await page.screenshot({ path: path.join(__dirname, 'activity_panel2.png'), fullPage: false });
    console.log('תמונה 2 נשמרה');

    const html = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]') ||
                       document.querySelector('[class*="modal"]') ||
                       document.querySelector('[class*="panel"]');
        return dialog ? dialog.outerHTML.substring(0, 3000) : 'לא נמצא פאנל';
    });
    console.log('HTML של הפאנל:', html);

    await browser.close();
}

explore().catch(console.error);
