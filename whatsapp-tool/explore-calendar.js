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
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: path.join(__dirname, 'calendar_1.png'), fullPage: true });
    console.log('screenshot 1 saved');

    // לחץ על יום כלשהו כדי לראות פעילויות
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(__dirname, 'calendar_2.png'), fullPage: true });
    console.log('screenshot 2 saved');
    console.log('URL:', page.url());

    // הדפס את מבנה הדף
    const structure = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t);
        return { buttons: buttons.slice(0, 30), title: document.title, url: window.location.href };
    });
    console.log(JSON.stringify(structure, null, 2));

    console.log('\nהדפדפן פתוח — נווט ללוח השנה ולחץ על פעילות. תוך 30 שניות אצלם עוד תמונה.');
    await new Promise(r => setTimeout(r, 30000));
    await page.screenshot({ path: path.join(__dirname, 'calendar_3.png'), fullPage: true });
    console.log('screenshot 3 saved');
    await browser.close();
}

explore().catch(console.error);
