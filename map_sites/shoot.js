'use strict';
/**
 * אימות ויזואלי — עוטף את קובץ העמוד בדיוק כמו שהארטיפקט עוטף אותו,
 * ומצלם בתמה בהירה וכהה. הרצה: node map_sites/shoot.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const HERE = __dirname;
const SRC = path.join(HERE, 'מפת_מוקדים.html');
const TMP = path.join(HERE, '_preview.html');

(async () => {
  const body = fs.readFileSync(SRC, 'utf8');
  fs.writeFileSync(TMP, `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>*{margin:0}</style></head><body>${body}</body></html>`, 'utf8');

  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('file:///' + TMP.replace(/\\/g, '/'));
    await page.waitForTimeout(700);

    await page.screenshot({ path: path.join(HERE, `shot_${scheme}_top.png`) });
    if (scheme === 'light') {
      // מצב נבחר, כדי לוודא שפאנל הפרטים מתמלא
      await page.locator('.map-a').screenshot({ path: path.join(HERE, 'shot_mapa.png') });
      await page.locator('.stage').screenshot({ path: path.join(HERE, 'shot_stage.png') });
      await page.locator('.metro').screenshot({ path: path.join(HERE, 'shot_metro.png') });
      await page.click('.map-a .pin[data-id="kulana"] .pin-dot');
      await page.waitForTimeout(250);
      await page.locator('.rail').screenshot({ path: path.join(HERE, 'shot_detail.png') });
      await page.locator('.lists').screenshot({ path: path.join(HERE, 'shot_lists.png') });

      // חפיפת תוויות — נמדדת מתיבות הטקסט בפועל, לא מאומדן רוחב תו
      for (const map of ['.map-a', '.map-b']) {
        const hits = await page.evaluate(sel => {
          const nodes = [...document.querySelectorAll(sel + ' .pin-label, ' + sel + ' .note')];
          const boxes = nodes.map(n => ({ t: n.textContent, b: n.getBoundingClientRect() }));
          const out = [];
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].b, c = boxes[j].b;
            if (!(a.right < c.left || c.right < a.left || a.bottom < c.top || c.bottom < a.top)) {
              out.push(boxes[i].t + ' ✕ ' + boxes[j].t);
            }
          }
          return out;
        }, map);
        console.log(`${map} — ${hits.length ? '✗ חפיפות: ' + hits.join(', ') : '✓ אין חפיפת תוויות'}`);
      }

      // המסנן חייב לעמעם סיכות ולהסתיר שורות בשתי המפות ובכל הרשימות
      await page.click('.lg[data-filter="gap"]');
      await page.waitForTimeout(250);
      const dim = await page.locator('.pin.dim').count();
      const hid = await page.locator('.row.hide').count();
      console.log(`מסנן "חסר מאמן": ${dim} סיכות מעומעמות מתוך 39, ${hid} שורות מוסתרות מתוך 26`);
      await page.click('.lg[data-filter="gap"]');
      await page.waitForTimeout(200);
      // בדיקת גלישה אופקית
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log('גלישה אופקית:', overflow, 'px', overflow > 1 ? '✗' : '✓');
      // צר
      await page.setViewportSize({ width: 400, height: 900 });
      await page.waitForTimeout(300);
      const ov2 = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log('גלישה אופקית ב-400px:', ov2, 'px', ov2 > 1 ? '✗' : '✓');
      await page.screenshot({ path: path.join(HERE, 'shot_narrow.png'), fullPage: false });
    }
    console.log(scheme, errors.length ? '✗ שגיאות: ' + errors.join(' | ') : '✓ ללא שגיאות');
    await ctx.close();
  }
  await browser.close();
  fs.unlinkSync(TMP);
})();
