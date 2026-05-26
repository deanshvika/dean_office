const puppeteer = require('puppeteer');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BASE44_URL = 'https://schedule-nika.base44.app/SubstitutionRequests';

async function parseSubstitution(userText) {
    const today = new Date().toLocaleDateString('he-IL');
    const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
            role: 'user',
            content: `אתה עוזר למנהל מאמנים בניקה ספורט. חלץ פרטי חילוף מהטקסט הבא.
החזר JSON בלבד (ללא הסברים):
{
  "requestingCoach": "שם המאמן המבקש חילוף",
  "date": "DD/MM/YYYY (אם לא צוין שנה — ${new Date().getFullYear()})",
  "location": "שם המוקד/בית הספר",
  "reason": "סיבה (חופשה/משחק/מחלה/עבודה בבית הספר/אחר)",
  "replacementCoach": "שם המחליף (ריק אם לא ידוע)",
  "paymentDetails": "פרטי תשלום (לדוג׳: 110 שח + נסיעות)",
  "notes": "הערות נוספות"
}

טקסט: "${userText}"`
        }]
    });

    try {
        const raw = msg.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(raw);
    } catch {
        console.error('שגיאה בפענוח:', msg.content[0].text);
        process.exit(1);
    }
}

async function fillForm(data) {
    console.log('\n📋 פרטים שחולצו:');
    console.log(`  מאמן מבקש:  ${data.requestingCoach || '—'}`);
    console.log(`  תאריך:      ${data.date || '—'}`);
    console.log(`  מוקד:       ${data.location || '—'}`);
    console.log(`  סיבה:       ${data.reason || '—'}`);
    console.log(`  מחליף:      ${data.replacementCoach || '—'}`);
    console.log(`  תשלום:      ${data.paymentDetails || '—'}`);
    console.log(`  הערות:      ${data.notes || '—'}`);
    console.log('\nלחץ Enter לפתוח את הטופס ולמלא, או Ctrl+C לבטל');

    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
        userDataDir: './base44_userdata'
    });

    const page = await browser.newPage();
    console.log('\nנכנס למערכת...');
    await page.goto(BASE44_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // תאריך
    if (data.date) {
        try {
            const [day, month, year] = data.date.split('/');
            const formatted = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
            await page.evaluate((val) => {
                const input = document.querySelector('input[type="date"]');
                if (input) {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    nativeInputValueSetter.call(input, val);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, formatted);
            console.log(`✓ תאריך: ${data.date}`);
        } catch(e) { console.log('⚠ תאריך — יש למלא ידנית'); }
    }

    // dropdowns — מחפש לפי טקסט
    async function setDropdown(labelText, value) {
        if (!value) return;
        try {
            await page.evaluate((lbl, val) => {
                const labels = Array.from(document.querySelectorAll('label, div'));
                for (const el of labels) {
                    if (el.textContent.trim().includes(lbl)) {
                        const container = el.closest('div');
                        const select = container?.querySelector('select');
                        if (select) {
                            const option = Array.from(select.options).find(o =>
                                o.text.includes(val) || val.includes(o.text)
                            );
                            if (option) {
                                select.value = option.value;
                                select.dispatchEvent(new Event('change', { bubbles: true }));
                                return true;
                            }
                        }
                    }
                }
            }, labelText, value);
            console.log(`✓ ${labelText}: ${value}`);
        } catch(e) { console.log(`⚠ ${labelText} — יש למלא ידנית`); }
    }

    await setDropdown('מאמן מבקש', data.requestingCoach);
    await new Promise(r => setTimeout(r, 500));
    await setDropdown('מוקד פעילות', data.location);
    await new Promise(r => setTimeout(r, 500));
    await setDropdown('מאמן מחליף', data.replacementCoach);

    // סיבה
    if (data.reason) {
        try {
            await page.evaluate((val) => {
                const inputs = document.querySelectorAll('input[type="text"], input:not([type="date"]):not([type="checkbox"])');
                for (const inp of inputs) {
                    const lbl = inp.closest('div')?.querySelector('label');
                    if (lbl?.textContent.includes('סיבה')) {
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        setter.call(inp, val);
                        inp.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                }
            }, data.reason);
            console.log(`✓ סיבה: ${data.reason}`);
        } catch(e) { console.log('⚠ סיבה — יש למלא ידנית'); }
    }

    // תשלום
    if (data.paymentDetails) {
        try {
            await page.evaluate((val) => {
                const textareas = document.querySelectorAll('textarea');
                for (const ta of textareas) {
                    const lbl = ta.closest('div')?.querySelector('label, div');
                    if (lbl?.textContent.includes('סיכום')) {
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                        setter.call(ta, val);
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                }
            }, data.paymentDetails);
            console.log(`✓ תשלום: ${data.paymentDetails}`);
        } catch(e) { console.log('⚠ תשלום — יש למלא ידנית'); }
    }

    // הערות
    if (data.notes) {
        try {
            await page.evaluate((val) => {
                const textareas = document.querySelectorAll('textarea');
                for (const ta of textareas) {
                    const lbl = ta.closest('div')?.querySelector('label, div');
                    if (lbl?.textContent.includes('הערות')) {
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                        setter.call(ta, val);
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                }
            }, data.notes);
            console.log(`✓ הערות: ${data.notes}`);
        } catch(e) { console.log('⚠ הערות — יש למלא ידנית'); }
    }

    console.log('\n✓ סיום מילוי. בדוק את הטופס ולחץ "הוסף בקשה" בעצמך.');
    console.log('(הדפדפן יישאר פתוח — סגור אותו כשתסיים)\n');
}

// ── הרצה ──
const userInput = process.argv.slice(2).join(' ');
if (!userInput) {
    console.log('שימוש: node base44-fill.js "קרן דבוש לא יכולה ב-5/5 בהצלחה הדרים, סיון מחליפה, 110 שח"');
    process.exit(0);
}

console.log('מפענח בקשה...');
parseSubstitution(userInput).then(fillForm).catch(console.error);
