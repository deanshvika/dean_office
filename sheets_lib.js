/*
 * sheets_lib.js — עזרי קריאה/כתיבה לגיליונות גוגל דרך פרופיל האוטומציה (9222).
 * ---------------------------------------------------------------------------
 * למה לא Sheets API: ה-OAuth client של הפרויקט חסום ע"י גוגל.
 * הקריאה נעשית ב-gviz/tq (fetch same-origin מתוך הדף הטעון), והכתיבה דרך
 * תיבת השם + הקלדה בדף — הכל page-level, אפס קליקים עיוורים.
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- CSV ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function toCsv(rows) {
  return rows.map(r => r.map(c => {
    const s = c == null ? '' : String(c);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
}

// ---------- קריאה ----------
async function openSheet(page, id, waitMs = 13000) {
  if (!page.url().includes(id)) {
    await page.goto(`https://docs.google.com/spreadsheets/d/${id}/edit`,
      { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(waitMs);
  }
  return page;
}

async function listTabs(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.docs-sheet-tab-name')].map(e => e.textContent.trim()));
}

// קריאת לשונית כמטריצה. חייב שהדף של אותו גיליון יהיה טעון (same-origin).
async function readTab(page, id, tabName) {
  const csv = await page.evaluate(async (sid, n) => {
    const url = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=out:csv&sheet=` + encodeURIComponent(n);
    const r = await fetch(url, { credentials: 'include' });
    return r.ok ? await r.text() : null;
  }, id, tabName);
  if (csv == null) throw new Error(`קריאת "${tabName}" נכשלה`);
  return parseCsv(csv);
}

async function readAllTabs(page, id) {
  await openSheet(page, id);
  const tabs = await listTabs(page);
  const data = {};
  for (const t of tabs) data[t] = await readTab(page, id, t);
  return { tabs, data };
}

// ---------- ניווט וכתיבה ----------
const colLetter = n => {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
};

// בוחר לשונית לפי שם (קליק page-level על הטאב)
async function activateTab(page, tabName) {
  const spot = await page.evaluate(n => {
    const tabs = [...document.querySelectorAll('.docs-sheet-tab')];
    const i = tabs.findIndex(t => (t.querySelector('.docs-sheet-tab-name')?.textContent || '').trim() === n);
    if (i < 0) return null;
    const r = tabs[i].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, tabName);
  if (!spot) throw new Error(`לשונית "${tabName}" לא נמצאה`);
  await page.mouse.click(spot.x, spot.y);
  await sleep(2500);
}

// ניווט לתא דרך תיבת השם — מדויק, לא תלוי בגלילה
async function gotoCell(page, ref) {
  const box = await page.evaluate(() => {
    const el = document.querySelector('.waffle-name-box');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!box) throw new Error('תיבת השם לא נמצאה');
  await page.mouse.click(box.x, box.y);
  await sleep(500);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await sleep(200);
  await page.keyboard.type(ref, { delay: 40 });
  await page.keyboard.press('Enter');
  await sleep(900);
}

// כותב ערך לתא. הטקסט מודבק מהלוח כדי לשמר עברית וסימנים במדויק.
async function writeCell(page, ref, value) {
  await gotoCell(page, ref);
  await page.evaluate(async v => { await navigator.clipboard.writeText(v); }, String(value));
  await sleep(300);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyV'); await page.keyboard.up('Control');
  await sleep(500);
  await page.keyboard.press('Enter');
  await sleep(700);
}

// שינוי שם הקובץ דרך תיבת הכותרת
async function renameSheet(page, id, newName) {
  await openSheet(page, id);
  await page.bringToFront();
  await sleep(1500);
  const box = await page.evaluate(() => {
    const el = document.querySelector('.docs-title-input,.docs-title-input-label-inner,#docs-title-widget input');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!box) throw new Error('תיבת שם הקובץ לא נמצאה');
  await page.mouse.click(box.x, box.y);
  await sleep(1200);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await sleep(400);
  await page.evaluate(async t => { await navigator.clipboard.writeText(t); }, newName);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyV'); await page.keyboard.up('Control');
  await sleep(800);
  await page.keyboard.press('Enter');
  await sleep(5000);
  return page.title();
}

module.exports = {
  sleep, parseCsv, toCsv, colLetter,
  openSheet, listTabs, readTab, readAllTabs,
  activateTab, gotoCell, writeCell, renameSheet
};
