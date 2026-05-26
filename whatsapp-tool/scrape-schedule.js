const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין"];
const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

async function scrape() {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox'],
        userDataDir: './base44_userdata',
        protocolTimeout: 120000
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    let events = null;
    let appId = null;
    page.on('response', async (response) => {
        if (response.url().includes('/entities/Event?')) {
            try { events = await response.json(); } catch {}
        }
        const m = response.url().match(/apps\/([a-f0-9]+)\/entities/);
        if (m) appId = m[1];
    });

    await page.goto('https://schedule-nika.base44.app/Calendar', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));

    // שמור טוקן לשימוש עתידי
    const token = await page.evaluate(() => localStorage.getItem('base44_access_token') || localStorage.getItem('token'));
    if (token && appId) {
        fs.writeFileSync(path.join(__dirname, 'base44_token.json'), JSON.stringify({ token, appId, savedAt: new Date().toISOString() }), 'utf8');
        console.log('טוקן נשמר ב-base44_token.json');
    }

    await browser.close();

    if (!events) { console.log('לא נמצאו events'); return; }

    const list = Array.isArray(events) ? events : events.data || [];
    console.log(`נטענו ${list.length} אירועים`);

    // דוגמה לרשומה
    console.log('\nשדות:', Object.keys(list[0] || {}));
    console.log('\nדוגמה:', JSON.stringify(list[0], null, 2));

    // בנה תמציות
    const locationDays = {};      // location → Set<dayOfWeek>
    const locationCoaches = {};   // location → Set<coach>
    const coachLocations = {};    // coach → { location → Set<dayOfWeek> }
    const dateToLocations = {};   // date (DD/MM/YYYY) → [location]

    const today = new Date();
    today.setHours(0,0,0,0);

    for (const ev of list) {
        if (!ev.date) continue;
        const evDate = new Date(ev.date);
        if (evDate < today) continue; // רק עתידי

        const [year, month, day] = ev.date.split('-');
        const dateStr = `${day}/${month}/${year}`;
        const dayOfWeek = hebrewDays[evDate.getDay()];

        const location = ev.clientName || ev.client_name || '';
        const coach = ev.coachName || ev.coach_name || '';

        if (!location) continue;

        // locationDays
        if (!locationDays[location]) locationDays[location] = new Set();
        locationDays[location].add(dayOfWeek);

        // locationCoaches
        if (coach) {
            if (!locationCoaches[location]) locationCoaches[location] = new Set();
            locationCoaches[location].add(coach);
        }

        // coachLocations
        if (coach) {
            if (!coachLocations[coach]) coachLocations[coach] = {};
            if (!coachLocations[coach][location]) coachLocations[coach][location] = new Set();
            coachLocations[coach][location].add(dayOfWeek);
        }

        // dateToLocations
        if (!dateToLocations[dateStr]) dateToLocations[dateStr] = new Set();
        dateToLocations[dateStr].add(location);
    }

    const s = v => v instanceof Set ? [...v].sort() : v;
    const sd = obj => Object.fromEntries(Object.entries(obj).map(([k,v]) => [k, s(v)]));
    const sdd = obj => Object.fromEntries(Object.entries(obj).map(([k,v]) => [k, sd(v)]));

    const summary = {
        generatedAt: new Date().toISOString(),
        totalEvents: list.length,
        locationDays: sd(locationDays),
        locationCoaches: sd(locationCoaches),
        coachLocations: sdd(coachLocations),
        dateToLocations: Object.fromEntries(Object.entries(dateToLocations).map(([k,v]) => [k, [...v].sort()]))
    };

    fs.writeFileSync(path.join(__dirname, 'schedule_data.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n✅ נשמר schedule_data.json`);
    console.log(`מוקדים: ${Object.keys(summary.locationDays).length}`);
    console.log(`מאמנים: ${Object.keys(summary.coachLocations).length}`);
    console.log(`תאריכים עתידיים: ${Object.keys(summary.dateToLocations).length}`);

    console.log('\n=== מוקד → ימים ===');
    for (const [loc, days] of Object.entries(summary.locationDays)) {
        console.log(`  ${loc}: ${days.join(', ')}`);
    }
    console.log('\n=== מאמן → מוקדים ===');
    for (const [coach, locs] of Object.entries(summary.coachLocations)) {
        const locStr = Object.entries(locs).map(([l,d]) => `${l}(${d.join('/')})`).join(' | ');
        console.log(`  ${coach}: ${locStr}`);
    }
}

scrape().catch(console.error);
