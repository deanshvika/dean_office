/*
 * sync_chen.js — משיכת מקור האמת של המוקדים מהגיליון של חן.
 * ---------------------------------------------------------------------------
 * מקור מחייב: "טבלת ניהול לידים ולקוחות.xlsx" של חן צור (Google Drive).
 * ❌ לא Base44, לא schedule_last_year.json — החלטה של דין, 03/08/2026.
 *
 * למה דרך CDP ולא Sheets API: ה-OAuth client של הפרויקט חסום ע"י גוגל.
 * הקובץ הוא XLSX במצב תאימות, ולכן גם gviz/tq לא מחזיר CSV — רק הורדת
 * הקובץ המקורי מ-drive.usercontent עובדת. ה-cookies נשלפים מפרופיל
 * האוטומציה המאומת (פורט 9222) דרך CDP Network.getAllCookies.
 *
 * הרצה:  node מונטי-קליטה/sync_chen.js
 * פלט:   מונטי-קליטה/מקור_חן.json  (snapshot מתוארך)
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const puppeteer = require('../whatsapp-tool/node_modules/puppeteer');

const FILE_ID = '1WVY4kCr2cwOLUHVHOqXj0mEzroLwgrdj';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${FILE_ID}/edit`;
const TMP = path.join(__dirname, '_chen_snapshot.xlsx');
const OUT = path.join(__dirname, 'מקור_חן.json');

const txt = v => {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.text || v.result || v.hyperlink || '').trim();
  return String(v).trim();
};

async function download() {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes(FILE_ID)) || pages[0];
  const client = await page.target().createCDPSession();
  const { cookies } = await client.send('Network.getAllCookies');
  b.disconnect();

  const jar = cookies
    .filter(c => /google\.com$/.test(c.domain.replace(/^\./, '')))
    .map(c => `${c.name}=${c.value}`).join('; ');

  const url = `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download`;
  const r = await fetch(url, { headers: { cookie: jar, 'user-agent': 'Mozilla/5.0' }, redirect: 'follow' });
  const buf = Buffer.from(await r.arrayBuffer());
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) {
    throw new Error('ההורדה לא החזירה XLSX. ודא שחלון "Chrome אוטומציה (9222)" פתוח ומחובר.');
  }
  fs.writeFileSync(TMP, buf);
  return TMP;
}

function rowsOf(ws) {
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, i) => {
    if (i === 1) return;
    const v = row.values.slice(1).map(txt);
    if (v.some(x => x)) out.push(v);
  });
  return out;
}

async function main() {
  const file = await download();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const get = name => {
    const ws = wb.worksheets.find(w => w.name.trim() === name);
    if (!ws) throw new Error(`לשונית חסרה בגיליון של חן: "${name}"`);
    return rowsOf(ws);
  };

  // בתי ספר קיימים: בית ספר | סטטוס | היקף | השלב הבא | המשך | ימים | שעות | מאמן
  const existing = get('בתי ספר קיימים').map(r => ({
    school: r[0], status: r[1], scope: r[2], nextStep: r[3],
    note: r[4], days: r[5], hours: r[6], coach: r[7]
  }));

  // בתי ספר חדשים: בית ספר | סטטוס | היקף | ימים | שעות | מאמן
  const fresh = get('בתי ספר חדשים').map(r => ({
    school: r[0], status: r[1], scope: r[2], days: r[3], hours: r[4], coach: r[5]
  }));

  // פרוייקט הצלחה: שם המרכז | מסגרת | מחצית | שם הרכזת | ימים | מאמן
  const hatzlacha = get('פרוייקט הצלחה').map(r => ({
    school: r[0], framework: r[1], half: r[2], coordinator: r[3], days: r[4], coach: r[5]
  }));

  const snap = {
    _comment: 'snapshot מהגיליון של חן צור — מקור האמת היחיד למוקדי פעילות. לרענון: node מונטי-קליטה/sync_chen.js',
    source: { owner: 'חן צור', file: 'טבלת ניהול לידים ולקוחות.xlsx', url: SHEET_URL },
    syncedAt: new Date().toISOString(),
    existing, fresh, hatzlacha
  };
  fs.writeFileSync(OUT, JSON.stringify(snap, null, 2), 'utf8');
  fs.unlinkSync(file);

  console.log(`✅ סונכרן מהגיליון של חן — ${OUT}`);
  console.log(`   קיימים: ${existing.length} · חדשים: ${fresh.length} · הצלחה: ${hatzlacha.length}`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
module.exports = { OUT, SHEET_URL };
