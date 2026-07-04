// מחולל דמו — דף עבודה אנגלית, לימוד אותיות הכי בסיסי (האות B).
// עצמאי: קורא את לוגו NIKA, בונה HTML, כותב לשולחן העבודה, ומרנדר PNG לאימות.
// ★ העיקרון: אות + מילה + תמונה תמיד יחד ומחוברים (B is for Ball ⚽) — לא תמונה→אות מנותק.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.join(ROOT, 'assets', 'logo', 'nika_logo.png');
const logo = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;

// שורת אותיות ל"הקף את B" — B מודגשות, האחרות מסיחות
const findRow = ['B', 'd', 'p', 'B', 'b', 'R', 'B', 'a']
  .map((c, i) => `<span class="fl${c === 'B' ? ' isB' : ''}${i === 0 ? ' modeled' : ''}">${c}</span>`).join('');

// כרטיסי "B is for..." — אות + תמונה + מילה (מחוברים!)
const words = [
  { emoji: '⚽', word: 'Ball' },
  { emoji: '🎒', word: 'Bag' },
  { emoji: '🐻', word: 'Bear' },
];
const wordCards = words.map((w) => `
  <div class="bcard">
    <div class="bcard-let">B</div>
    <div class="bcard-emoji">${w.emoji}</div>
    <div class="bcard-word"><b>B</b>${w.word.slice(1)}</div>
  </div>`).join('');

const html = `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><title>NIKA · The Letter B</title>
<style>
  :root{
    --ink:#0f1e3d; --body:#3d4a63; --muted:#8a97ad; --line:#e7edf5;
    --pink:#E91E63; --orange:#FF6F00; --yellow:#FFC107; --lime:#8BC34A; --blue:#03A9F4; --purple:#673AB7;
    --rainbow:linear-gradient(90deg,#E91E63,#FF6F00,#FFC107,#8BC34A,#03A9F4,#673AB7);
    --shadow:0 6px 18px rgba(15,30,61,.08);
  }
  @page{ size:A4; margin:0; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ background:#e9edf3; }
  body{ font-family:'Segoe UI',system-ui,Arial,sans-serif; color:var(--body); }
  .page{ position:relative; width:210mm; min-height:297mm; margin:0 auto; padding:9mm 12mm 9mm; background:#fff; overflow:hidden; }

  /* דקורציה */
  .arc{ position:absolute; top:-60px; width:190px; height:190px; z-index:0; }
  .arc.r{ right:-56px; } .arc.l{ left:-56px; }
  .cf{ position:absolute; border-radius:3px; opacity:.9; z-index:0; }

  /* כותרת */
  .head{ display:grid; grid-template-columns:1fr auto 1fr; align-items:center; position:relative; z-index:1; }
  .crumbs{ font-size:13px; font-weight:700; color:var(--ink); }
  .head img{ height:52px; display:block; margin:0 auto; }
  .rainbow{ height:6px; background:var(--rainbow); border-radius:99px; margin:8px 0 10px; position:relative; z-index:1; }
  .title{ text-align:center; position:relative; z-index:1; margin-bottom:9px; }
  .title .badge{ display:inline-block; background:linear-gradient(135deg,#03A9F4,#673AB7); color:#fff; font-weight:800; font-size:12px; letter-spacing:.5px; padding:4px 15px; border-radius:999px; }
  .title h1{ color:var(--ink); font-size:27px; font-weight:800; margin-top:5px; }
  .title h1 span{ color:var(--pink); }

  .row{ display:grid; gap:11px; position:relative; z-index:1; margin-bottom:8px; }
  .card{ background:#fff; border:1.5px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:11px 13px; }
  .card.tint{ background:#f7fbff; }
  .h{ display:inline-flex; align-items:center; gap:7px; font-weight:800; font-size:14px; color:#fff; padding:4px 13px; border-radius:999px; margin-bottom:9px; }
  .h.blue{ background:linear-gradient(135deg,#03A9F4,#673AB7); }
  .h.lime{ background:linear-gradient(135deg,#8BC34A,#C0CA33); }
  .h.pink{ background:linear-gradient(135deg,#E91E63,#FF4081); }
  .h.orange{ background:linear-gradient(135deg,#FF6F00,#FFC107); color:#3d2b00; }

  /* Meet the letter */
  .meet{ display:flex; align-items:center; justify-content:center; gap:34px; }
  .bigL{ font-size:96px; font-weight:800; line-height:.9; color:var(--blue); }
  .bigL.small{ color:var(--purple); }
  .bigL .cap{ display:block; text-align:center; font-size:14px; font-weight:700; color:var(--muted); margin-top:2px; }
  .meet-say{ font-size:16px; color:var(--body); font-weight:600; text-align:center; }
  .meet-say b{ color:var(--ink); font-size:20px; }

  /* B is for... */
  .brow{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
  .bcard{ text-align:center; border:2px solid #eef2f8; border-radius:16px; padding:8px 6px 10px; background:#fff; position:relative; }
  .bcard-let{ position:absolute; top:7px; left:11px; font-size:22px; font-weight:800; color:var(--pink); }
  .bcard-emoji{ font-size:66px; line-height:1.1; }
  .bcard-word{ font-size:22px; font-weight:700; color:var(--ink); }
  .bcard-word b{ color:var(--pink); }

  /* Trace */
  .trace{ font-size:52px; font-weight:800; letter-spacing:20px; -webkit-text-stroke:2.5px #c3d0e2; color:#fff; text-align:center; }
  .trace.small{ letter-spacing:22px; }

  /* Find & circle */
  .find{ display:flex; gap:14px; justify-content:center; align-items:center; flex-wrap:wrap; }
  .fl{ font-size:34px; font-weight:800; color:var(--body); width:46px; height:52px; display:inline-flex; align-items:center; justify-content:center; }
  .fl.isB{ color:var(--ink); }
  .fl.modeled{ border:3px solid var(--pink); border-radius:50%; color:var(--pink); }

  /* Match */
  .match{ display:flex; justify-content:center; gap:60px; align-items:center; }
  .match .col{ display:flex; flex-direction:column; gap:12px; }
  .match .m{ font-size:34px; font-weight:800; color:var(--ink); display:flex; align-items:center; gap:10px; }
  .match .dot{ width:12px; height:12px; border-radius:50%; background:var(--blue); }

  .instr{ font-size:13px; color:var(--muted); font-weight:600; margin-top:7px; text-align:center; }

  /* הערת מתווך */
  .heb{ direction:rtl; text-align:right; background:#fff0f6; border:1.5px dashed #f5b8d0; border-radius:14px; padding:9px 14px; font-size:13.5px; color:#7a2447; font-weight:600; position:relative; z-index:1; margin-top:2px; }
  .heb b{ color:#E91E63; }

  .foot{ text-align:center; font-size:12.5px; color:var(--muted); font-weight:600; margin-top:11px; position:relative; z-index:1; }
</style></head>
<body>
<div class="page">
  <!-- דקורציה -->
  <svg class="arc r" viewBox="0 0 190 190" fill="none"><path d="M190 44 A146 146 0 0 0 44 190" stroke="#E91E63" stroke-width="12" stroke-linecap="round" opacity=".9"/><path d="M190 78 A112 112 0 0 0 78 190" stroke="#FF9800" stroke-width="12" stroke-linecap="round" opacity=".8"/><path d="M190 112 A78 78 0 0 0 112 190" stroke="#8BC34A" stroke-width="12" stroke-linecap="round" opacity=".8"/></svg>
  <svg class="arc l" viewBox="0 0 190 190" fill="none"><path d="M0 44 A146 146 0 0 1 146 190" stroke="#03A9F4" stroke-width="12" stroke-linecap="round" opacity=".85"/><path d="M0 78 A112 112 0 0 1 112 190" stroke="#673AB7" stroke-width="12" stroke-linecap="round" opacity=".8"/></svg>
  <span class="cf" style="left:150px;top:150px;width:12px;height:12px;background:#FFC107;transform:rotate(20deg)"></span>
  <span class="cf" style="right:150px;top:130px;width:11px;height:11px;background:#E91E63;transform:rotate(40deg)"></span>

  <!-- כותרת -->
  <div class="head">
    <div class="crumbs">English · Grade 1</div>
    <img src="${logo}" alt="NIKA">
    <div></div>
  </div>
  <div class="rainbow"></div>
  <div class="title">
    <span class="badge">★ Letter of the day</span>
    <h1>The Letter <span>B</span></h1>
  </div>

  <!-- 1) Meet the letter -->
  <div class="row"><div class="card tint">
    <div class="h blue">👀 Meet the letter</div>
    <div class="meet">
      <div class="bigL">B<span class="cap">big B</span></div>
      <div class="bigL small">b<span class="cap">small b</span></div>
      <div class="meet-say">This is the letter <b>Bb</b>.<br>It says <b>/b/</b>.</div>
    </div>
  </div></div>

  <!-- 2) B is for... (האות + התמונה + המילה — מחוברים!) -->
  <div class="row"><div class="card">
    <div class="h pink">🅱️ <b>B</b> is for…</div>
    <div class="brow">${wordCards}</div>
    <div class="instr">Every word starts with the letter B. Say the word out loud.</div>
  </div></div>

  <!-- 3) Trace the letter -->
  <div class="row"><div class="card tint">
    <div class="h lime">✏️ Trace the letter</div>
    <div class="trace">B B B B B</div>
    <div class="trace small">b b b b b</div>
  </div></div>

  <!-- 4) Find & circle + 5) Match -->
  <div class="row" style="grid-template-columns:1.4fr 1fr">
    <div class="card">
      <div class="h orange">🔎 Circle every letter B</div>
      <div class="find">${findRow}</div>
      <div class="instr">One is done for you.</div>
    </div>
    <div class="card">
      <div class="h blue">🔗 Match B to b</div>
      <div class="match">
        <div class="col"><div class="m">B <span class="dot"></span></div></div>
        <div class="col"><div class="m"><span class="dot"></span> b</div></div>
      </div>
      <div class="instr">Draw a line.</div>
    </div>
  </div>

  <!-- הערת מתווך -->
  <div class="heb">למורה/הורה: היום לומדים את האות <b>B</b>. הצליל שלה הוא <b>/b/</b> — כמו <b>בּ</b> בעברית. עזרו לילד: להגיד "B", לעקוב אחרי הקו, ולמצוא את האות B על הדף.</div>

  <div class="foot">NIKA · everyone plays together — one letter at a time.</div>
</div>
</body></html>`;

const outHtml = path.join(os.homedir(), 'Desktop', 'NIKA_letter_B_demo.html');
fs.writeFileSync(outHtml, html, 'utf8');
console.log('✓ HTML נכתב:', outHtml);

// רינדור PNG לאימות
const outPng = path.join(ROOT, 'output', 'letter_B_demo.png');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
const el = await page.$('.page');
const box = await el.boundingBox();
console.log('גובה .page (px):', Math.round(box.height), '| A4 =', 1122);
await el.screenshot({ path: outPng });
await browser.close();
console.log('✓ PNG נכתב:', outPng);
