const puppeteer = require('puppeteer');
const fs = require('fs');

const SESSION_FILE = 'base44_session.json';
const BASE44_URL = 'https://schedule-nika.base44.app';

async function login() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled'
        ],
        userDataDir: './base44_userdata'
    });

    const page = await browser.newPage();
    await page.goto(BASE44_URL, { waitUntil: 'networkidle2' });

    console.log('\n=== התחבר לBase44 בדפדפן שנפתח ===');
    console.log('אחרי שהתחברת — חכה שהדף ייטען ואז לחץ Enter כאן\n');

    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));

    // Save cookies
    const cookies = await page.cookies();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
    console.log('✓ סשן נשמר. אפשר לסגור את הדפדפן.');

    await browser.close();
    process.exit(0);
}

login().catch(console.error);
