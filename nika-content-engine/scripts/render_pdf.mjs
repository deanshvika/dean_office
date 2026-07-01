// רינדור HTML → PDF (A4) + PNG דרך Playwright/Chromium.
// Chromium נותן את התמיכה הטובה ביותר ב-RTL עברי + ניקוד.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pw = require('playwright');           // נפתר מ-node_modules של תיקיית האב
const { chromium } = pw.default ?? pw;

export async function createRenderer() {
  let browser;
  try { browser = await chromium.launch(); }
  catch { browser = await chromium.launch({ channel: 'chrome' }); }
  const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });

  async function load(html) {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
    await page.waitForTimeout(350);
  }
  return {
    async toPdf(html, pdfPath) {
      await load(html);
      await page.pdf({ path: pdfPath, format: 'A4', printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    },
    async toPng(html, pngPath) {
      await load(html);
      const el = await page.$('.page');
      if (el) await el.screenshot({ path: pngPath });
      else await page.screenshot({ path: pngPath, fullPage: true });
    },
    async close() { await browser.close(); },
  };
}
