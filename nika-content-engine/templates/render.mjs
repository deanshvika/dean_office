// מנוע רינדור NIKA — בונה HTML עצמאי לכל עמוד מתוך Day Spec.
// עקרון: פריטי ספירה = הדבקת אייקון בדיוק count פעמים (דטרמיניסטי).
import { p, fs, bank, iconSvg, itemEmoji, itemWord, label, logoDataUri, displayWord, splitClusters } from '../scripts/lib.mjs';

// ייצוג ויזואלי של פריט: SVG מותג אם קיים, אחרת אימוג'י מהבנק (חיות/תמות חדשות), אחרת ריק.
function glyph(key) {
  const svg = iconSvg(key);
  if (svg) return svg;
  const e = itemEmoji(key);
  return e ? `<span class="emo">${e}</span>` : '';
}

const CSS = fs.readFileSync(p('templates', 'shared.css'), 'utf8');
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// טקסט עם ___ → תיבת מילוי ריקה
const withBlank = (s) => esc(s).replace(/_{2,}/g, '<span class="blank"></span>');

const PAGE_NUM = { beginner: 1, mid: 2, challenge: 3, coach_guide: 4 };
const LEVEL_CLASS = { beginner: '', mid: 'mid', challenge: 'challenge' };
const STAR = { beginner: '★', mid: '★★', challenge: '★★★' };

// ── רכיבים בסיסיים ──
function iconsRow(item, count, cls = '') {
  const g = glyph(item);
  return `<div class="iconrow ${cls}">${Array.from({ length: count }, () => g).join('')}</div>`;
}
function optionBubbles(options) {
  return `<div class="opts">${options.map((o) => `<div class="opt">${o}</div>`).join('')}</div>`;
}
function defaultOptions(n) {
  if (n <= 1) return [1, 2, 3];
  if (n >= 10) return [8, 9, 10];
  return [n - 1, n, n + 1];
}

// ── גוף משימה לפי סוג (worked=true מציג תשובות, לדוגמה) ──
function taskBody(t, niq, worked = false, subject = 'math') {
  switch (t.type) {
    case 'count': {
      const opts = t.options || defaultOptions(t.count);
      return iconsRow(t.item, t.count) + optionBubbles(opts);
    }
    case 'write_count': {
      return `<div class="groups">` + t.groups.map((g) =>
        `<div class="grp">${iconsRow(g.item, g.count, 'sm')}<div class="gline">${withBlank(g.line)}</div></div>`
      ).join('') + `</div>`;
    }
    case 'compare': {
      const askWord = esc(label('math_labels', t.ask === 'less' ? 'less' : 'more', niq));
      const gA = esc(label('math_labels', 'group_a', niq)), gB = esc(label('math_labels', 'group_b', niq));
      const inA = esc(label('math_labels', 'in_group_a', niq)), inB = esc(label('math_labels', 'in_group_b', niq));
      const prompt = t.prompt ? `<div class="prompt" dir="auto">${esc(t.prompt)}</div>` : '';
      const groups =
        `<div class="mrow"><span class="glabel">${gA}</span>${iconsRow(t.item, t.a, 'sm')}</div>` +
        `<div class="mrow"><span class="glabel">${gB}</span>${iconsRow(t.item, t.b, 'sm')}</div>`;
      const choices =
        `<div class="choicebox"><span class="checkbox"></span>${inA} ${askWord}</div>` +
        `<div class="choicebox"><span class="checkbox"></span>${inB} ${askWord}</div>`;
      return `${prompt}<div class="groups">${groups}</div>${choices}`;
    }
    case 'arith': {
      const gA = esc(label('math_labels', 'group_a', niq)), gB = esc(label('math_labels', 'group_b', niq));
      const prompt = t.prompt ? `<div class="prompt" dir="auto">${esc(t.prompt)}</div>` : '';
      const groups = `<div class="two-col" style="margin:0 0 8px">` +
        `<div class="grp"><div class="glabel">${gA}</div>${iconsRow(t.a.item, t.a.count, 'sm')}</div>` +
        `<div class="grp"><div class="glabel">${gB}</div>${iconsRow(t.b.item, t.b.count, 'sm')}</div></div>`;
      const opSym = t.op === 'subtraction' ? '−' : '+';
      const cell = (v) => worked
        ? `<span class="eqbox filled">${v}</span>`
        : `<span class="eqbox"></span>`;
      const eq = `<div class="equation">${cell(t.a.count)}<span>${opSym}</span>${cell(t.b.count)}<span>=</span>${cell(t.result)}</div>`;
      return `${prompt}${groups}${eq}`;
    }
    case 'equalize': {
      const gA = esc(label('math_labels', 'group_a', niq)), gB = esc(label('math_labels', 'group_b', niq));
      const addLbl = esc(label('math_labels', 'add', niq));
      const prompt = t.prompt ? `<div class="prompt" dir="auto">${esc(t.prompt)}</div>` : '';
      const groups = `<div class="two-col" style="margin:0 0 8px">` +
        `<div class="grp"><div class="glabel">${gA}</div>${iconsRow(t.item, t.a, 'sm')}</div>` +
        `<div class="grp"><div class="glabel">${gB}</div>${iconsRow(t.item, t.b, 'sm')}</div></div>`;
      const line = worked
        ? `<div class="gline">${addLbl} <span class="eqbox filled">${t.answer}</span></div>`
        : `<div class="gline">${addLbl} <span class="blank"></span></div>`;
      return `${prompt}${groups}${line}`;
    }
    case 'match': {
      const prompt = t.prompt ? `<div class="prompt">${esc(t.prompt)}</div>` : '';
      const groups = t.pairs.map((g) =>
        `<div class="mrow"><span class="glabel">${esc(g.label)}</span>${iconsRow(g.item, g.count, 'sm')}<span class="dot"></span></div>`
      ).join('');
      const nums = t.numbers.map((n) => `<div class="mnrow"><span class="dot"></span><div class="mn">${n}</div></div>`).join('');
      return `${prompt}<div class="matchwrap"><div class="match-groups">${groups}</div><div class="match-band"></div><div class="match-nums">${nums}</div></div>`;
    }
    case 'word_picture': {
      const word = t.word || itemWord(t.item, { niqqud: niq });
      const theWord = t.word_label || label('ui_labels', 'the_word', niq);
      const opts = t.options || [t.item, ...(t.distractors || [])];
      const boxes = opts.map((k) => `<div class="wp-opt${worked && k === t.item ? ' correct' : ''}">${glyph(k)}</div>`).join('');
      return `<div class="wp"><div class="wp-word" dir="auto">${esc(theWord)} <b>${esc(word)}</b></div><div class="wp-opts">${boxes}</div></div>`;
    }
    case 'pic_word': {
      // תמונה מוצגת → בחירת המילה הנכונה. המילים תמיד מהבנק הסגור (אפס טעות ניקוד).
      const opts = t.options || [t.item, ...(t.distractors || [])];
      const pic = `<div class="pw-pic">${glyph(t.item)}</div>`;
      const boxes = opts.map((k) => {
        const w = displayWord(subject, k, niq);
        const correct = worked && k === t.item ? ' correct' : '';
        return `<div class="pw-opt${correct}" dir="auto">${esc(w)}</div>`;
      }).join('');
      return `<div class="pw">${pic}<div class="pw-opts">${boxes}</div></div>`;
    }
    case 'spell_choice': {
      // תמונה + בחירת האיות הנכון (אנגלית, שכבות ב-ג). options = מחרוזות; answer = הנכון.
      const pic = `<div class="pw-pic">${glyph(t.item)}</div>`;
      const boxes = (t.options || []).map((o) =>
        `<div class="pw-opt${worked && o === t.answer ? ' correct' : ''}" dir="ltr">${esc(o)}</div>`).join('');
      return `<div class="pw">${pic}<div class="pw-opts">${boxes}</div></div>`;
    }
    case 'missing_letter': {
      // מילה עברית עם אות חסרה. המילה נשלפת מהבנק המנוקד ומפוצלת לאשכולות —
      // אף אות/ניקוד לא מוקלד ידנית.
      const word = itemWord(t.item, { niqqud: niq });
      const cs = splitClusters(word);
      let idx = cs.findIndex((c) => c === t.answer);
      if (idx < 0) idx = cs.findIndex((c) => c[0] === String(t.answer || '')[0]);
      const wordHtml = cs.map((c, i) => i === idx
        ? `<span class="ml-box">${worked ? esc(t.answer) : ''}</span>`
        : `<span class="ml-ch">${esc(c)}</span>`).join('');
      const pic = glyph(t.item) ? `<div class="ml-pic">${glyph(t.item)}</div>` : '';
      const opts = (t.options || []).map((o) =>
        `<div class="opt ml-opt${worked && o === t.answer ? ' correct' : ''}">${esc(o)}</div>`).join('');
      const prompt = t.prompt ? `<div class="prompt" dir="auto">${esc(t.prompt)}</div>` : '';
      return `${prompt}<div class="ml"><div class="ml-word" dir="rtl">${wordHtml}</div>${pic}</div><div class="opts">${opts}</div>`;
    }
    case 'complete_sentence': {
      // משפט עם ___ + בנק מילים. answer ∈ word_bank. משמש לאנגלית (משפט) ולעברית (בחירת מילה).
      const sent = esc(t.sentence).replace(/_{2,}/,
        worked && t.answer ? `<span class="cs-blank filled">${esc(t.answer)}</span>` : `<span class="cs-blank"></span>`);
      const chips = (t.word_bank || []).map((w) =>
        `<span class="chip-word${worked && w === t.answer ? ' correct' : ''}">${esc(w)}</span>`).join('');
      const pic = t.item && glyph(t.item) ? `<div class="cs-pic">${glyph(t.item)}</div>` : '';
      const bankLabel = subject === 'english' ? 'Word bank:' : (esc(label('ui_labels', 'word_bank', niq)) + ':');
      return `<div class="cs"><div class="cs-sent" dir="auto">${sent}</div>${pic}<div class="cs-bank"><span class="cs-bank-label">${bankLabel}</span> ${chips}</div></div>`;
    }
    case 'vertical_arith': {
      // חיבור/חיסור אנכי (טורים) — מספרי, ללא אייקונים. שכבות ב-ג.
      const opSym = t.op === 'subtraction' ? '−' : '+';
      const ansBoxes = worked
        ? String(t.result).split('').map((d) => `<span class="vbox filled">${d}</span>`).join('')
        : Array.from({ length: String(t.result).length }, () => `<span class="vbox"></span>`).join('');
      const prompt = t.prompt ? `<div class="prompt" dir="auto">${esc(t.prompt)}</div>` : '';
      return `${prompt}<div class="varith" dir="ltr">
        <div class="vnum">${esc(String(t.a))}</div>
        <div class="vnum"><span class="vop">${opSym}</span>${esc(String(t.b))}</div>
        <div class="vline"></div>
        <div class="vans">${ansBoxes}</div>
      </div>`;
    }
    case 'place_value': {
      // ערך מקום — פסי-עשרות + יחידות, נגזרים מהמספר. שכבות ב-ג.
      const n = t.number;
      const tens = Math.floor(n / 10), units = n % 10;
      const tensBlocks = Array.from({ length: tens }, () => `<span class="pv-ten"></span>`).join('');
      const unitBlocks = Array.from({ length: units }, () => `<span class="pv-unit"></span>`).join('');
      const askMap = { tens: 'כמה עשרות?', units: 'כמה יחידות?', total: 'כמה בסך הכול?' };
      const askText = t.prompt || askMap[t.ask] || askMap.total;
      const answer = t.ask === 'tens' ? tens : t.ask === 'units' ? units : n;
      const opts = t.options || [answer - 1, answer, answer + 1];
      return `<div class="pv"><div class="pv-blocks"><span class="pv-tens">${tensBlocks}</span><span class="pv-units">${unitBlocks}</span></div>
        <div class="prompt" dir="auto" style="text-align:center">${esc(askText)}</div>${optionBubbles(opts)}</div>`;
    }
    case 'multiply': {
      // כפל כמערך (שורות×עמודות). שכבות ב-ג.
      const svg = glyph(t.item || 'ball');
      const rowsHtml = Array.from({ length: t.rows }, () =>
        `<div class="mul-row">${Array.from({ length: t.cols }, () => svg).join('')}</div>`).join('');
      const cell = worked ? `<span class="eqbox filled">${t.result}</span>` : `<span class="eqbox"></span>`;
      const eq = `<div class="equation">${t.rows}<span>×</span>${t.cols}<span>=</span>${cell}</div>`;
      const prompt = t.prompt ? `<div class="prompt" dir="auto">${esc(t.prompt)}</div>` : '';
      return `${prompt}<div class="mul-grid">${rowsHtml}</div>${eq}`;
    }
    case 'reading_comprehension': {
      // הבנת הנקרא — קטע + שאלה + בחירה. שכבות ב-ג (ללא ניקוד).
      const passage = `<div class="rc-passage" dir="auto">${esc(t.passage)}</div>`;
      const q = `<div class="rc-q" dir="auto">${esc(t.question)}</div>`;
      const opts = (t.options || []).map((o) =>
        `<div class="opt rc-opt${worked && o === t.answer ? ' correct' : ''}" dir="auto">${esc(o)}</div>`).join('');
      return `<div class="rc">${passage}${q}<div class="rc-opts">${opts}</div></div>`;
    }
    case 'find_count':
    case 'text':
      return `<div class="bonus-body" dir="auto">${esc(t.text)}</div>`;
    default:
      return `<div class="prompt">[סוג משימה לא נתמך: ${esc(t.type)}]</div>`;
  }
}

// ── דקורציית מותג (קשתות פינה + קונפטי) ──
function decorations() {
  const cf = [[70, 150, '#E91E63'], [120, 86, '#FFC107'], [690, 120, '#03A9F4'], [720, 210, '#8BC34A'], [60, 540, '#673AB7'], [730, 560, '#E91E63'], [400, 58, '#8BC34A']]
    .map(([x, y, c], i) => `<span class="cf" style="left:${x}px;top:${y}px;width:${9 + i % 3 * 3}px;height:${9 + i % 3 * 3}px;background:${c};transform:rotate(${i * 40}deg)"></span>`).join('');
  return `<svg class="deco deco-r" viewBox="0 0 180 180" fill="none"><path d="M180 40 A140 140 0 0 0 40 180" stroke="#E91E63" stroke-width="11" stroke-linecap="round" opacity=".9"/><path d="M180 72 A108 108 0 0 0 72 180" stroke="#FF9800" stroke-width="11" stroke-linecap="round" opacity=".8"/><path d="M180 104 A76 76 0 0 0 104 180" stroke="#8BC34A" stroke-width="11" stroke-linecap="round" opacity=".8"/></svg>
  <svg class="deco deco-l" viewBox="0 0 170 170" fill="none"><path d="M0 40 A130 130 0 0 1 130 170" stroke="#03A9F4" stroke-width="10" stroke-linecap="round" opacity=".85"/><path d="M0 72 A98 98 0 0 1 98 170" stroke="#673AB7" stroke-width="10" stroke-linecap="round" opacity=".8"/></svg>
  ${cf}`;
}

// ── פרח דקורטיבי (ממלא מרחב פנוי בקופסה דלילה) ──
function flourish() {
  return `<svg class="flourish" viewBox="0 0 220 42" fill="none" aria-hidden="true">
    <path d="M8 30 Q62 8 112 24 T212 18" stroke="#8BC34A" stroke-width="4" stroke-linecap="round" opacity=".5"/>
    <circle cx="40" cy="20" r="4.5" fill="#E91E63"/>
    <circle cx="120" cy="27" r="4.5" fill="#03A9F4"/>
    <circle cx="188" cy="18" r="4.5" fill="#FF6F00"/>
    <polygon points="95,5 98,13 106,13 100,18 102,27 95,22 88,27 90,18 84,13 92,13" fill="#FFC107"/>
  </svg>`;
}
// ── אשכול דקורטיבי לפינת הכותרת (במקום ה-scene הריק) ──
function sceneDeco() {
  return `<svg viewBox="0 0 120 70" fill="none" aria-hidden="true">
    <circle cx="26" cy="34" r="13" fill="#03A9F4" opacity=".9"/>
    <circle cx="54" cy="26" r="9" fill="#E91E63" opacity=".85"/>
    <polygon points="80,16 84,27 96,27 86,34 90,46 80,39 70,46 74,34 64,27 76,27" fill="#FFC107"/>
    <circle cx="96" cy="50" r="7" fill="#8BC34A" opacity=".9"/>
    <path d="M14 58 Q40 48 70 56 T108 52" stroke="#673AB7" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  </svg>`;
}

// ── כותרת עמוד ──
function header(spec, levelKey, role = null) {
  const niq = role ? false : !!spec.niqqud;
  const subj = label('subjects', spec.subject, niq);
  const grade = label('grades', spec.audience, niq);
  const crumbs = role
    ? `${esc(subj)} | ${esc(grade)} | <span class="role">${esc(role)}</span>`
    : `${esc(subj)} | ${esc(grade)}`;
  const logo = `<img class="logo-img" src="${logoDataUri()}" alt="NIKA">`;
  const head = `<div class="phead">
    <div class="crumbs">${crumbs}</div>
    <div class="brandmark">${logo}</div>
    <div class="scene">${sceneDeco()}</div>
  </div>
  <div class="rainbowbar"></div>`;
  if (role) {
    return head + `<div class="titleblock"><div class="daylabel">${esc(spec.day_label)}</div>
      <div class="ptitle" dir="auto">${esc(spec.title)}</div></div>`;
  }
  const lvlName = label('levels', levelKey, niq);
  return head + `<div class="titleblock"><div class="daylabel">${esc(spec.day_label)}</div>
    <div class="ptitle" dir="auto">${esc(spec.title)}</div>
    <div class="levelbadge ${LEVEL_CLASS[levelKey]}"><span class="stars">${STAR[levelKey]}</span> ${esc(lvlName)}</div></div>`;
}

// ── עמוד תלמיד ──
function studentPage(spec, key) {
  const pg = spec.pages[key];
  const niq = !!spec.niqqud;
  const whatLabel = label('ui_labels', 'what_to_do', niq);
  const exLabel = label('ui_labels', 'example', niq);
  const qcLabel = label('ui_labels', 'quick_check', niq);
  const successLabel = label('ui_labels', 'today_success', niq);
  const bonusLabel = pg.bonus && pg.bonus.title ? esc(pg.bonus.title)
    : label('ui_labels', 'bonus_champions', niq);

  const doBox = `<div class="box tint-lime"><div class="box-head lime">✔ ${esc(whatLabel)}</div>
    <div dir="auto">${esc(pg.instruction)}</div>${flourish()}</div>`;
  const exBox = `<div class="box tint-blue"><div class="box-head blue">★ ${esc(exLabel)}</div>
    ${taskBody(pg.example, niq, true, spec.subject)}
    ${pg.example.caption ? `<div class="gline" dir="auto" style="text-align:center;margin-top:6px">${esc(pg.example.caption)}</div>` : ''}</div>`;

  const tasksHtml = pg.tasks.map((t, i) =>
    `<div class="task${t.type === 'match' ? ' wide' : ''}"><div class="tnum c${i}">${i + 1}</div>${taskBody(t, niq, false, spec.subject)}</div>`
  ).join('');
  const taskCols = pg.tasks.length <= 3 ? 'tasks one' : 'tasks';

  const qc = pg.quick_check;
  const qcBox = `<div class="box tint-blue"><div class="box-head blue">⏱ ${esc(qcLabel)}</div>${taskBody(qc, niq, false, spec.subject)}</div>`;

  const successItems = (pg.success_reflection || []).map((k) =>
    `<div class="ci"><span class="checkbox"></span>${esc(label('success_reflection', k, niq))}</div>`).join('');
  const successBox = `<div class="box tint-mag"><div class="box-head mag">${esc(successLabel)}</div>
    <div class="checkrow">${successItems}</div></div>`;

  const bonusBox = `<div class="box tint-lime"><div class="box-head lime">🎁 ${bonusLabel}</div>
    <div class="bonus-body" dir="auto">${esc(pg.bonus.text)}</div></div>`;

  return `<div class="page">
    ${decorations()}
    ${header(spec, key)}
    <div class="intro" dir="auto">${esc(pg.intro)}</div>
    <div class="two-col">${doBox}${exBox}</div>
    <div class="${taskCols}">${tasksHtml}</div>
    <div class="encourage"><span class="heart">♥</span><span dir="auto">${esc(pg.encouraging_message)}</span></div>
    <div class="bottom">${qcBox}${successBox}${bonusBox}</div>
    <div class="pfooter" dir="auto">${esc(pg.footer)}</div>
    <div class="pagenum">${PAGE_NUM[key]}/4</div>
  </div>`;
}

// ── דף מדריך ──
function coachPage(spec) {
  const c = spec.pages.coach_guide;
  const goal = `<div class="box tint-mag"><div class="box-head mag">🎯 מטרת היום</div>
    <ul>${c.daily_goal.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>`;
  const value = `<div class="box tint-lime"><div class="box-head lime">♥ הערך המוביל</div>
    <div><b>${esc(c.leading_value.name)}</b><br>${esc(c.leading_value.text)}</div></div>`;

  const cols = c.pages_overview.map((o) => {
    const lvlName = label('levels', o.level, false);
    return `<div class="box"><div class="colhead">${STAR[o.level]} עמוד — ${esc(lvlName)}</div>
      <div style="font-size:13px;color:var(--muted);margin:4px 0">${esc(o.audience)}</div>
      <ul>${o.points.map((pt) => `<li>${esc(pt)}</li>`).join('')}</ul></div>`;
  }).join('');

  const mediate = `<div class="box tint-blue"><div class="box-head blue">💡 איך לתווך?</div>
    <ul>${c.how_to_mediate.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  const adapt = `<div class="box"><div class="box-head mag">🖐 התאמות לילדים שמתקשים</div>
    <ul>${c.adaptations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  const fast = `<div class="box tint-lime"><div class="box-head lime">🚀 מי שמסיים מהר</div>
    <ul>${c.fast_finishers.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;

  const msg = `<div class="box tint-mag"><div class="box-head mag">📣 מסר למדריך/ה</div>
    <div>${esc(c.coach_message.lead)}</div>
    <div class="valchips">${c.coach_message.values.map((v) => `<span class="valchip">${esc(v)}</span>`).join('')}</div></div>`;
  const phrases = `<div class="box"><div class="box-head blue">💬 משפטים שאפשר לומר לילדים</div>
    ${c.phrases.map((x) => `<div class="phrase">"${esc(x)}"</div>`).join('')}</div>`;

  return `<div class="page coach">
    ${decorations()}
    ${header(spec, null, 'למדריך/ה')}
    <div class="coach-grid2">${goal}${value}</div>
    <div style="text-align:center;font-weight:800;color:var(--ink);margin:2px 0 8px">איך עובדים עם הדפים?</div>
    <div class="coach-grid3">${cols}</div>
    <div class="coach-grid3">${mediate}${adapt}${fast}</div>
    <div class="coach-grid2">${msg}${phrases}</div>
    <div class="legend">${c.footer_legend.map((l) => `● ${esc(l)}`).join('')}</div>
    <div class="pagenum">4/4</div>
  </div>`;
}

// ── מסמך HTML עצמאי ──
function buildDoc(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700;800;900&family=Varela+Round&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>${bodyHtml}</body></html>`;
}

export function renderPage(spec, key) {
  const body = key === 'coach_guide' ? coachPage(spec) : studentPage(spec, key);
  return buildDoc(`${spec.day_id} · ${key}`, body);
}

export function renderAll(spec) {
  const out = {};
  for (const key of ['beginner', 'mid', 'challenge', 'coach_guide']) {
    if (spec.pages[key]) out[key] = renderPage(spec, key);
  }
  return out;
}
