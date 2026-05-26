const puppeteer = require('puppeteer');
const fs = require('fs');

async function getOptions() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
        userDataDir: './base44_userdata'
    });

    const page = await browser.newPage();
    await page.goto('https://schedule-nika.base44.app/SubstitutionRequests', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const result = {};

    // מצא את כל הדרופדאונים לפי כותרת
    const dropdownLabels = ['מאמן מבקש', 'מוקד פעילות', 'מאמן מחליף'];

    for (const labelText of dropdownLabels) {
        try {
            // מצא את הכפתור/דרופדאון לפי label
            const clicked = await page.evaluate((lbl) => {
                const labels = Array.from(document.querySelectorAll('label, span, div'));
                for (const el of labels) {
                    if (el.textContent.trim().startsWith(lbl)) {
                        const container = el.closest('div');
                        const btn = container?.querySelector('button, [role="combobox"], select, input');
                        if (btn) { btn.click(); return true; }
                    }
                }
                return false;
            }, labelText);

            if (!clicked) { result[labelText] = 'לא נמצא'; continue; }

            await new Promise(r => setTimeout(r, 800));

            // אסוף את האפשרויות שנפתחו
            const options = await page.evaluate(() => {
                const lists = document.querySelectorAll('[role="listbox"], [role="option"], .dropdown-item, ul li, .option');
                if (lists.length > 0) {
                    return Array.from(lists).map(o => o.textContent.trim()).filter(t => t.length > 0);
                }
                // נסה גישה אחרת
                const allVisible = Array.from(document.querySelectorAll('li, [class*="option"], [class*="item"]'))
                    .filter(el => el.offsetParent !== null)
                    .map(el => el.textContent.trim())
                    .filter(t => t.length > 1 && t.length < 100);
                return allVisible;
            });

            result[labelText] = options;

            // סגור על ידי Escape
            await page.keyboard.press('Escape');
            await new Promise(r => setTimeout(r, 300));

        } catch(e) {
            result[labelText] = `שגיאה: ${e.message}`;
        }
    }

    fs.writeFileSync('base44_options.json', JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
}

getOptions().catch(console.error);
