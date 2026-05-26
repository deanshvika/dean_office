const puppeteer = require('puppeteer');

const BASE44_URL = 'https://schedule-nika.base44.app/SubstitutionRequests';

const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין"];
const LOCATIONS = ["הצלח\"ה איתמר","הצלחה חופית","הצלח\"ה מקיף ח'","הצלח\"ה הדרים ראשל\"צ","איתמר בן אב\"י (גפ\"ן), ת\"א","שורשים","הצלח\"ה הבילויים, ראשל\"צ","בי\"ס שפירא (יול\"א), ת\"א","בי\"ס שורשים (יול\"א), ת\"א","הצלח\"ה עין הקורא, ראשל\"צ","חט\"ב שמיר, ת\"א","בי\"ס איתמר בן אב\"י","בי\"ס המתמיד, ר\"ג","בי\"ס גבריאלי, ת\"א","בי\"ס לפיד, הוד השרון","בי\"ס מגן (יוח\"א), ת\"א","בי\"ס מגן","בי\"ס גבעון (יוח\"א), ת\"א","בי\"ס טבע, ת\"א","בי\"ס גבעון, ת\"א","בי\"ס רוקח, ת\"א","בי\"ס רוקח (יוח\"א), ת\"א","בי\"ס מרחבים, יבנה","בי\"ס שמיר, חולון","בי\"ס אלומות (יוח\"א), ת\"א","בי\"ס בית צורי, ת\"א","בי\"ס בית צורי (יוח\"א), ת\"א","בי\"ס יהודה מכבי (יוח\"א), ת\"א","בי\"ס נופי ים (יוח\"א), ת\"א","בי\"ס צמרות, באר יעקב","בי\"ס יוחנני, הרצליה","בי\"ס כפיר (יוח\"א), ת\"א","בי\"ס בלוך, ת\"א","בי\"ס בלוך (יוח\"א), ת\"א","בי\"ס נופים (יול\"א), ת\"א","נווה זמר, רעננה","נופי ים, ת\"א","אור זבולון, אריאל","בי\"ס כלנא יחד (יוח\"א), יפו","בי\"ס כלנא יחד, יפו","בי\"ס וייצמן, רחובות"];

// התאמה חכמה — מוצא את האפשרות הכי קרובה
function findBest(input, list) {
    if (!input) return null;
    const clean = s => s.replace(/['"״]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const inp = clean(input);

    // התאמה מדויקת
    const exact = list.find(o => clean(o) === inp);
    if (exact) return exact;

    // מכיל
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0]));
    if (contains) return contains;

    // לפי מילה ראשונה (שם פרטי)
    const firstName = inp.split(' ')[0];
    const byFirst = list.find(o => clean(o).startsWith(firstName));
    if (byFirst) return byFirst;

    // לפי כל המילים המשמעותיות (לפחות 3 אותיות)
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byWords = list.find(o => words.every(w => clean(o).includes(w)));
    if (byWords) return byWords;

    // לפי מילה אחת ייחודית
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w)));
    if (byAny) return byAny;

    return null;
}

const data = {
    requestingCoach: "גילי",
    date: "29/05/2026",
    location: "יוחנני הרצליה",
    reason: "חופשה",
    replacementCoach: "",
    paymentDetails: "",
    notes: ""
};

// התאם לשמות המלאים
const matchedCoach = findBest(data.requestingCoach, COACHES);
const matchedLocation = findBest(data.location, LOCATIONS);
const matchedReplacement = findBest(data.replacementCoach, COACHES);

console.log(`מאמן מבקש: "${data.requestingCoach}" → "${matchedCoach}"`);
console.log(`מוקד: "${data.location}" → "${matchedLocation}"`);

async function clickDropdownOption(page, labelText, optionText) {
    if (!optionText) return;
    try {
        // לחץ על הדרופדאון
        await page.evaluate((lbl) => {
            const labels = Array.from(document.querySelectorAll('label'));
            for (const el of labels) {
                if (el.textContent.trim().includes(lbl)) {
                    const container = el.closest('div');
                    const btn = container?.querySelector('button, [role="combobox"], div[class*="select"]');
                    if (btn) { btn.click(); return; }
                    // לחץ על הקונטיינר עצמו
                    container?.click();
                    return;
                }
            }
        }, labelText);

        await new Promise(r => setTimeout(r, 600));

        // בחר את האפשרות
        const clicked = await page.evaluate((opt) => {
            const items = document.querySelectorAll('[role="option"], li, [class*="option"], [class*="item"]');
            for (const item of items) {
                if (item.textContent.trim() === opt && item.offsetParent !== null) {
                    item.click();
                    return true;
                }
            }
            return false;
        }, optionText);

        if (clicked) console.log(`✓ ${labelText}: ${optionText}`);
        else console.log(`⚠ ${labelText}: לא מצאתי "${optionText}" ברשימה`);

        await new Promise(r => setTimeout(r, 400));
    } catch(e) {
        console.log(`⚠ ${labelText}: שגיאה — ${e.message}`);
    }
}

async function fill() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
        userDataDir: './base44_userdata'
    });

    const page = await browser.newPage();
    await page.goto(BASE44_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // תאריך
    try {
        const [day, month, year] = data.date.split('/');
        const formatted = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
        await page.evaluate((val) => {
            const input = document.querySelector('input[type="date"]');
            if (input) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(input, val);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, formatted);
        console.log(`✓ תאריך: ${data.date}`);
    } catch(e) { console.log('⚠ תאריך'); }

    await clickDropdownOption(page, 'מאמן מבקש', matchedCoach);
    await clickDropdownOption(page, 'מוקד פעילות', matchedLocation);
    if (matchedReplacement) await clickDropdownOption(page, 'מאמן מחליף', matchedReplacement);

    // סיבה
    if (data.reason) {
        await page.evaluate((val) => {
            const labels = Array.from(document.querySelectorAll('label'));
            for (const lbl of labels) {
                if (lbl.textContent.includes('סיבת החילוף') || lbl.textContent.includes('סיבה')) {
                    const inp = lbl.closest('div')?.querySelector('input, textarea');
                    if (inp) {
                        const tag = inp.tagName === 'INPUT' ? window.HTMLInputElement : window.HTMLTextAreaElement;
                        const setter = Object.getOwnPropertyDescriptor(tag.prototype, 'value').set;
                        setter.call(inp, val);
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        }, data.reason);
        console.log(`✓ סיבה: ${data.reason}`);
    }

    if (data.paymentDetails) {
        await page.evaluate((val) => {
            const textareas = document.querySelectorAll('textarea');
            for (const ta of textareas) {
                const lbl = ta.closest('div')?.textContent;
                if (lbl?.includes('סיכום')) {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                    setter.call(ta, val);
                    ta.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        }, data.paymentDetails);
    }

    console.log('\n✓ הטופס מולא. בדוק ולחץ "הוסף בקשה".');
}

fill().catch(console.error);
