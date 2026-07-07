// מחולל מוקאפ — דף פרופיל אישי לילד (מובייל, נסרק מ-QR). דמו בלבד, נתונים לדוגמה.
// מה שההורה רואה: שם · מה נעשה בכיתה/באימון · קצב התקדמות · מדליות/גביעים.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const logo = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, 'assets', 'logo', 'nika_logo.png')).toString('base64')}`;

// ── נתוני דמו ──
const child = { name: 'יעל כהן', avatar: '🦁', sub: 'כיתה א׳ · קבוצת נמרים · מאמן: אריק', overall: 68 };
const medals = [
  { icon: '🥉', label: '5 אותיות', got: true },
  { icon: '🥈', label: 'חצי אלפבית', got: true },
  { icon: '🏆', label: 'אלוף התמדה', got: true },
  { icon: '🥇', label: 'כל האלפבית', got: false },
  { icon: '⭐', label: 'אלוף חשבון', got: false },
];
const activity = [
  { date: '4 ביולי', icon: '🔤', text: 'למד את האותיות A–D' },
  { date: '2 ביולי', icon: '➕', text: 'חיבור עד 10 — 8 מתוך 10' },
  { date: '30 ביוני', icon: '⚽', text: 'אימון כדוריד — השתתפות מלאה' },
  { date: '28 ביוני', icon: '📖', text: 'זיהוי אותיות בעברית' },
];
const areas = [
  { icon: '🔤', name: 'אנגלית (אותיות)', pct: 40, color: '#03A9F4' },
  { icon: '📖', name: 'שפה', pct: 70, color: '#E91E63' },
  { icon: '➕', name: 'חשבון', pct: 65, color: '#8BC34A' },
  { icon: '⚽', name: 'ספורט', pct: 85, color: '#FF6F00' },
];

const medalsHtml = medals.map((m) =>
  `<div class="medal${m.got ? '' : ' locked'}"><div class="mcoin">${m.got ? m.icon : '🔒'}</div><div class="mlbl">${m.label}</div></div>`).join('');
const activityHtml = activity.map((a) =>
  `<div class="act"><div class="act-ic">${a.icon}</div><div class="act-body"><div class="act-txt">${a.text}</div><div class="act-date">${a.date}</div></div></div>`).join('');
const areasHtml = areas.map((a) =>
  `<div class="area"><div class="area-top"><span>${a.icon} ${a.name}</span><b>${a.pct}%</b></div><div class="bar"><span style="width:${a.pct}%;background:${a.color}"></span></div></div>`).join('');

const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NIKA · פרופיל אישי</title>
<style>
  :root{ --ink:#0f1e3d; --body:#3d4a63; --muted:#8a97ad;
    --rainbow:linear-gradient(90deg,#E91E63,#FF6F00,#FFC107,#8BC34A,#03A9F4,#673AB7); }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ background:#eef1f6; font-family:'Segoe UI',system-ui,Arial,sans-serif; color:var(--body); }
  .page{ width:400px; margin:0 auto; background:#fff; min-height:820px; position:relative; }
  .top{ background:linear-gradient(160deg,#673AB7,#03A9F4); padding:16px 18px 60px; text-align:center; position:relative; }
  .top img{ height:40px; }
  .rainbow{ height:5px; background:var(--rainbow); border-radius:99px; margin:9px 40px 0; }
  .qrhint{ position:absolute; top:16px; left:14px; font-size:10px; color:#fff; opacity:.75; font-weight:600; }

  /* כרטיס ילד — מרחף על הגרדיאנט */
  .hero{ background:#fff; border-radius:20px; box-shadow:0 10px 26px rgba(15,30,61,.14); margin:-46px 16px 0; padding:16px; text-align:center; position:relative; z-index:2; }
  .ava{ width:76px; height:76px; border-radius:50%; background:linear-gradient(135deg,#FFC107,#FF6F00); display:flex; align-items:center; justify-content:center; font-size:42px; margin:-52px auto 6px; border:4px solid #fff; box-shadow:0 4px 12px rgba(0,0,0,.12); }
  .hero h1{ color:var(--ink); font-size:21px; font-weight:800; }
  .hero .sub{ font-size:12.5px; color:var(--muted); font-weight:600; margin-top:3px; }

  .ring-wrap{ display:flex; align-items:center; gap:14px; justify-content:center; margin-top:12px; }
  .ring{ width:96px; height:96px; border-radius:50%; background:conic-gradient(#8BC34A 0% ${child.overall}%, #e9edf3 ${child.overall}% 100%); display:flex; align-items:center; justify-content:center; }
  .ring::before{ content:''; position:absolute; }
  .ring .inner{ width:72px; height:72px; border-radius:50%; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .ring .pct{ font-size:23px; font-weight:800; color:var(--ink); line-height:1; }
  .ring .lbl{ font-size:10px; color:var(--muted); font-weight:700; }
  .ring-txt{ text-align:right; max-width:150px; }
  .ring-txt b{ color:var(--ink); font-size:14px; }
  .ring-txt div{ font-size:12px; color:var(--body); margin-top:2px; }

  .sec{ margin:16px; }
  .sec-h{ font-size:15px; font-weight:800; color:var(--ink); margin-bottom:9px; display:flex; align-items:center; gap:6px; }

  /* מדליות */
  .medals{ display:flex; gap:8px; overflow-x:auto; padding-bottom:2px; }
  .medal{ flex:none; width:74px; text-align:center; }
  .mcoin{ width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg,#FFF3C4,#FFD54F); display:flex; align-items:center; justify-content:center; font-size:30px; margin:0 auto 5px; box-shadow:0 3px 9px rgba(255,160,0,.3); }
  .medal.locked .mcoin{ background:#eef2f7; box-shadow:none; filter:grayscale(1); opacity:.7; }
  .mlbl{ font-size:10.5px; font-weight:700; color:var(--body); line-height:1.2; }
  .medal.locked .mlbl{ color:var(--muted); }

  /* פעילות */
  .act{ display:flex; gap:11px; align-items:center; padding:9px 0; border-bottom:1px solid #f0f3f8; }
  .act:last-child{ border-bottom:none; }
  .act-ic{ width:38px; height:38px; border-radius:12px; background:#f2f7ff; display:flex; align-items:center; justify-content:center; font-size:20px; flex:none; }
  .act-txt{ font-size:13.5px; font-weight:600; color:var(--ink); }
  .act-date{ font-size:11px; color:var(--muted); margin-top:1px; }

  /* פסי תחומים */
  .area{ margin-bottom:11px; }
  .area-top{ display:flex; justify-content:space-between; font-size:12.5px; font-weight:700; color:var(--body); margin-bottom:4px; }
  .area-top b{ color:var(--ink); }
  .bar{ height:9px; background:#eef2f7; border-radius:99px; overflow:hidden; }
  .bar span{ display:block; height:100%; border-radius:99px; }

  .cheer{ margin:16px; background:#fff0f6; border:1.5px solid #f8c6da; border-radius:16px; padding:13px 15px; text-align:center; font-size:14px; font-weight:700; color:#b0245e; }
  .foot{ text-align:center; font-size:11px; color:var(--muted); font-weight:600; padding:6px 0 18px; }
</style></head>
<body>
<div class="page">
  <div class="top">
    <div class="qrhint">📷 נסרק מ-QR</div>
    <img src="${logo}" alt="NIKA">
    <div class="rainbow"></div>
  </div>

  <div class="hero">
    <div class="ava">${child.avatar}</div>
    <h1>${child.name}</h1>
    <div class="sub">${child.sub}</div>
    <div class="ring-wrap">
      <div class="ring"><div class="inner"><div class="pct">${child.overall}%</div><div class="lbl">התקדמות</div></div></div>
      <div class="ring-txt"><b>יפה מאוד!</b><div>3 מדליות החודש · בקצב טוב 🎯</div></div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-h">🏅 מדליות והישגים</div>
    <div class="medals">${medalsHtml}</div>
  </div>

  <div class="sec">
    <div class="sec-h">📅 מה עשינו לאחרונה</div>
    ${activityHtml}
  </div>

  <div class="sec">
    <div class="sec-h">📊 התקדמות לפי תחום</div>
    ${areasHtml}
  </div>

  <div class="cheer">כל הכבוד, יעל! 💪<br>עוד 3 אותיות — ומגיעה לך מדליית הזהב 🥇</div>
  <div class="foot">NIKA · ספורט וקהילה — כל ילד מתקדם בקצב שלו</div>
</div>
</body></html>`;

const outHtml = path.join(os.homedir(), 'Desktop', 'NIKA_child_profile_demo.html');
fs.writeFileSync(outHtml, html, 'utf8');
console.log('✓ HTML:', outHtml);

const outPng = path.join(ROOT, 'output', 'child_profile_demo.png');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
const el = await page.$('.page');
await el.screenshot({ path: outPng });
await browser.close();
console.log('✓ PNG:', outPng);
