const puppeteer = require('puppeteer');

async function debug() {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox'],
        userDataDir: './base44_userdata',
        protocolTimeout: 120000
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto('https://schedule-nika.base44.app/Calendar', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    // לחץ על יום 3
    const dayPos = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('td, [class*="day"], [class*="cell"], div'));
        for (const el of all) {
            const direct = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
            const firstChild = el.children[0]?.textContent?.trim();
            if ((direct === '3' || firstChild === '3') && el.getBoundingClientRect().width > 20) {
                const r = el.getBoundingClientRect();
                if (r.y > 100) { el.scrollIntoView({block:'center'}); const r2=el.getBoundingClientRect(); return {x:r2.x+r2.width/2,y:r2.y+r2.height/2}; }
            }
        }
        return null;
    });
    if (!dayPos) { console.log('יום 3 לא נמצא'); await browser.close(); return; }
    await page.mouse.click(dayPos.x, dayPos.y);
    await new Promise(r => setTimeout(r, 2500));

    // דמפ מבנה DOM לכל כפתור בטל פעילות
    const info = await page.evaluate(() => {
        const modal = Array.from(document.querySelectorAll('div')).find(d => {
            const c = d.className || '';
            return c.includes('fixed') && c.includes('inset-0') && c.includes('z-50');
        });
        if (!modal) return { error: 'no modal' };

        const sections = Array.from(modal.querySelectorAll('div')).filter(d => {
            const c = d.className || '';
            return c.includes('bg-gradient-to-br') && c.includes('rounded-2xl') && c.includes('shadow-md');
        });
        const section = sections.find(s => s.querySelector('h3')?.textContent.trim() === 'אור זבולון, אריאל');
        if (!section) return { error: 'section not found', available: sections.map(s=>s.querySelector('h3')?.textContent.trim()) };

        const btns = Array.from(section.querySelectorAll('button')).filter(b => b.textContent.trim() === 'בטל פעילות');
        return btns.map((btn, idx) => {
            const levels = [];
            let el = btn.parentElement;
            for (let d = 0; d < 6; d++) {
                if (!el || el === section) break;
                const children = Array.from(el.children).map(c => ({
                    tag: c.tagName,
                    text: c.textContent.trim().substring(0, 50),
                    isBtn: c === btn,
                    containsBtn: c.contains(btn)
                }));
                levels.push({ depth: d, tagName: el.tagName, className: (el.className||'').substring(0,60), children });
                el = el.parentElement;
            }
            return { btnIdx: idx, levels };
        });
    });

    console.log(JSON.stringify(info, null, 2));
    await browser.close();
}

debug().catch(console.error);
