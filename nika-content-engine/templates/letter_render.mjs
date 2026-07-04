// מנוע רינדור דף-אות אנגלי (A–Z) — NIKA.
// דף לימוד-אות בסיסי: Meet the letter · X is for… · Trace · Circle · Match · הערת-מתווך.
// ★ עיקרון: אות + מילה + תמונה תמיד יחד ומחוברים. המילים מהבנק הסגור (מאומתות שמתחילות באות).
import { p, fs, loadYaml, logoDataUri } from '../scripts/lib.mjs';

let _lb = null;
const lettersBankWords = () => (_lb ||= loadYaml(p('content_banks', 'letters_words.yaml')).letters);

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// שורת "הקף את האות" — האות (רישית) 3 פעמים + 5 מסיחים מובחנים; הראשונה מוקפת כדוגמה.
const DISTRACT = ['m', 'r', 'e', 't', 'o', 's', 'n', 'h', 'a', 'k', 'd', 'p'];
function findRow(letter) {
  const U = letter.toUpperCase(), low = letter.toLowerCase();
  const d = DISTRACT.filter((x) => x !== low).slice(0, 5);
  const seq = [U, d[0], d[1], U, d[2], d[3], U, d[4]];
  return seq.map((c, i) =>
    `<span class="fl${c === U ? ' isU' : ''}${i === 0 ? ' modeled' : ''}">${esc(c)}</span>`).join('');
}

const CSS = `
  :root{
    --ink:#0f1e3d; --body:#3d4a63; --muted:#8a97ad; --line:#e7edf5;
    --pink:#E91E63; --blue:#03A9F4; --purple:#673AB7;
    --rainbow:linear-gradient(90deg,#E91E63,#FF6F00,#FFC107,#8BC34A,#03A9F4,#673AB7);
    --shadow:0 6px 18px rgba(15,30,61,.08);
  }
  @page{ size:A4; margin:0; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ background:#e9edf3; }
  body{ font-family:'Segoe UI',system-ui,Arial,sans-serif; color:var(--body); }
  .page{ position:relative; width:210mm; min-height:297mm; margin:0 auto; padding:9mm 12mm 9mm; background:#fff; overflow:hidden; }
  .arc{ position:absolute; top:-60px; width:190px; height:190px; z-index:0; }
  .arc.r{ right:-56px; } .arc.l{ left:-56px; }
  .cf{ position:absolute; border-radius:3px; opacity:.9; z-index:0; }
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
  .meet{ display:flex; align-items:center; justify-content:center; gap:34px; }
  .bigL{ font-size:96px; font-weight:800; line-height:.9; color:var(--blue); }
  .bigL.small{ color:var(--purple); }
  .bigL .cap{ display:block; text-align:center; font-size:14px; font-weight:700; color:var(--muted); margin-top:10px; }
  .meet-say{ font-size:16px; color:var(--body); font-weight:600; text-align:center; }
  .meet-say b{ color:var(--ink); font-size:20px; }
  .brow{ display:grid; gap:12px; }
  .bcard{ text-align:center; border:2px solid #eef2f8; border-radius:16px; padding:8px 6px 10px; background:#fff; position:relative; }
  .bcard-let{ position:absolute; top:7px; left:11px; font-size:22px; font-weight:800; color:var(--pink); }
  .bcard-emoji{ font-size:64px; line-height:1.15; }
  .bcard-word{ font-size:21px; font-weight:700; color:var(--ink); }
  .bcard-word b{ color:var(--pink); }
  .trace{ font-size:50px; font-weight:800; letter-spacing:20px; -webkit-text-stroke:2.5px #c3d0e2; color:#fff; text-align:center; }
  .trace.small{ letter-spacing:22px; }
  .find{ display:flex; gap:14px; justify-content:center; align-items:center; flex-wrap:wrap; }
  .fl{ font-size:34px; font-weight:800; color:var(--body); width:46px; height:52px; display:inline-flex; align-items:center; justify-content:center; }
  .fl.isU{ color:var(--ink); }
  .fl.modeled{ border:3px solid var(--pink); border-radius:50%; color:var(--pink); }
  .match{ display:flex; justify-content:center; gap:60px; align-items:center; }
  .match .m{ font-size:34px; font-weight:800; color:var(--ink); display:flex; align-items:center; gap:10px; }
  .match .dot{ width:12px; height:12px; border-radius:50%; background:var(--blue); }
  .instr{ font-size:13px; color:var(--muted); font-weight:600; margin-top:7px; text-align:center; }
  .heb{ direction:rtl; text-align:right; background:#fff0f6; border:1.5px dashed #f5b8d0; border-radius:14px; padding:9px 14px; font-size:13.5px; color:#7a2447; font-weight:600; position:relative; z-index:1; margin-top:2px; }
  .heb b{ color:#E91E63; }
  .foot{ text-align:center; font-size:12.5px; color:var(--muted); font-weight:600; margin-top:11px; position:relative; z-index:1; }
`;

export function renderLetterPage(letter) {
  const L = String(letter).toUpperCase();
  const low = L.toLowerCase();
  const data = lettersBankWords()[L];
  if (!data) throw new Error(`אין ערך לאות "${L}" בבנק letters_words.yaml`);
  const logo = logoDataUri();

  const wordCards = data.words.map((w) => {
    const word = esc(w.word);
    const first = word.slice(0, 1), rest = word.slice(1);
    return `<div class="bcard"><div class="bcard-let">${L}</div>
      <div class="bcard-emoji">${w.emoji}</div>
      <div class="bcard-word"><b>${first}</b>${rest}</div></div>`;
  }).join('');
  const cols = data.words.length;

  // הערת מתווך: גשר-צליל עברי רק אם קיים (בלי תעתיק שקרי לתנועות)
  const bridge = data.heb_bridge
    ? `הצליל שלה הוא <b>${esc(data.sound)}</b> — כמו <b>${esc(data.heb_bridge)}</b> בעברית.`
    : `הצליל שלה הוא <b>${esc(data.sound)}</b>. אִמְרו את הצליל יחד עם הילד.`;

  return `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><title>NIKA · The Letter ${L}</title>
<style>${CSS}</style></head>
<body>
<div class="page">
  <svg class="arc r" viewBox="0 0 190 190" fill="none"><path d="M190 44 A146 146 0 0 0 44 190" stroke="#E91E63" stroke-width="12" stroke-linecap="round" opacity=".9"/><path d="M190 78 A112 112 0 0 0 78 190" stroke="#FF9800" stroke-width="12" stroke-linecap="round" opacity=".8"/><path d="M190 112 A78 78 0 0 0 112 190" stroke="#8BC34A" stroke-width="12" stroke-linecap="round" opacity=".8"/></svg>
  <svg class="arc l" viewBox="0 0 190 190" fill="none"><path d="M0 44 A146 146 0 0 1 146 190" stroke="#03A9F4" stroke-width="12" stroke-linecap="round" opacity=".85"/><path d="M0 78 A112 112 0 0 1 112 190" stroke="#673AB7" stroke-width="12" stroke-linecap="round" opacity=".8"/></svg>
  <span class="cf" style="left:150px;top:150px;width:12px;height:12px;background:#FFC107;transform:rotate(20deg)"></span>
  <span class="cf" style="right:150px;top:130px;width:11px;height:11px;background:#E91E63;transform:rotate(40deg)"></span>

  <div class="head"><div class="crumbs">English · Grade 1</div><img src="${logo}" alt="NIKA"><div></div></div>
  <div class="rainbow"></div>
  <div class="title"><span class="badge">★ Letter of the day</span><h1>The Letter <span>${L}</span></h1></div>

  <div class="row"><div class="card tint">
    <div class="h blue">👀 Meet the letter</div>
    <div class="meet">
      <div class="bigL">${L}<span class="cap">big ${L}</span></div>
      <div class="bigL small">${low}<span class="cap">small ${low}</span></div>
      <div class="meet-say">This is the letter <b>${L}${low}</b>.<br>It says <b>${esc(data.sound)}</b>.</div>
    </div>
  </div></div>

  <div class="row"><div class="card">
    <div class="h pink">🔤 <b>${L}</b> is for…</div>
    <div class="brow" style="grid-template-columns:repeat(${cols},1fr)">${wordCards}</div>
    <div class="instr">Every word starts with the letter ${L}. Say the word out loud.</div>
  </div></div>

  <div class="row"><div class="card tint">
    <div class="h lime">✏️ Trace the letter</div>
    <div class="trace">${(L + ' ').repeat(5).trim()}</div>
    <div class="trace small">${(low + ' ').repeat(5).trim()}</div>
  </div></div>

  <div class="row" style="grid-template-columns:1.4fr 1fr">
    <div class="card">
      <div class="h orange">🔎 Circle every letter ${L}</div>
      <div class="find">${findRow(L)}</div>
      <div class="instr">One is done for you.</div>
    </div>
    <div class="card">
      <div class="h blue">🔗 Match ${L} to ${low}</div>
      <div class="match"><div class="m">${L} <span class="dot"></span></div><div class="m"><span class="dot"></span> ${low}</div></div>
      <div class="instr">Draw a line.</div>
    </div>
  </div>

  <div class="heb">למורה/הורה: היום לומדים את האות <b>${L}</b>. ${bridge} עזרו לילד: להגיד "${L}", לעקוב אחרי הקו, ולמצוא את האות ${L} על הדף.</div>
  <div class="foot">NIKA · everyone plays together — one letter at a time.</div>
</div>
</body></html>`;
}
