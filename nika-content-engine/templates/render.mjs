// מנוע רינדור NIKA — בונה HTML עצמאי לכל עמוד מתוך Day Spec.
// עקרון: פריטי ספירה = הדבקת אייקון בדיוק count פעמים (דטרמיניסטי).
import { p, fs, bank, iconSvg, itemWord, label } from '../scripts/lib.mjs';

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
  const svg = iconSvg(item) || '';
  return `<div class="iconrow ${cls}">${Array.from({ length: count }, () => svg).join('')}</div>`;
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
function taskBody(t, niq, worked = false) {
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
      const askWord = t.ask === 'less' ? 'פחות' : 'יותר';
      const prompt = t.prompt ? `<div class="prompt">${esc(t.prompt)}</div>` : '';
      const groups =
        `<div class="mrow"><span class="glabel">קבוצה א׳</span>${iconsRow(t.item, t.a, 'sm')}</div>` +
        `<div class="mrow"><span class="glabel">קבוצה ב׳</span>${iconsRow(t.item, t.b, 'sm')}</div>`;
      const choices =
        `<div class="choicebox"><span class="checkbox"></span>בקבוצה א׳ יש ${askWord}</div>` +
        `<div class="choicebox"><span class="checkbox"></span>בקבוצה ב׳ יש ${askWord}</div>`;
      return `${prompt}<div class="groups">${groups}</div>${choices}`;
    }
    case 'arith': {
      const prompt = t.prompt ? `<div class="prompt">${esc(t.prompt)}</div>` : '';
      const groups = `<div class="two-col" style="margin:0 0 8px">` +
        `<div class="grp"><div class="glabel">קבוצה א׳</div>${iconsRow(t.a.item, t.a.count, 'sm')}</div>` +
        `<div class="grp"><div class="glabel">קבוצה ב׳</div>${iconsRow(t.b.item, t.b.count, 'sm')}</div></div>`;
      const opSym = t.op === 'subtraction' ? '−' : '+';
      const cell = (v) => worked
        ? `<span class="eqbox filled">${v}</span>`
        : `<span class="eqbox"></span>`;
      const eq = `<div class="equation">${cell(t.a.count)}<span>${opSym}</span>${cell(t.b.count)}<span>=</span>${cell(t.result)}</div>`;
      return `${prompt}${groups}${eq}`;
    }
    case 'equalize': {
      const prompt = t.prompt ? `<div class="prompt">${esc(t.prompt)}</div>` : '';
      const groups = `<div class="two-col" style="margin:0 0 8px">` +
        `<div class="grp"><div class="glabel">קבוצה א׳</div>${iconsRow(t.item, t.a, 'sm')}</div>` +
        `<div class="grp"><div class="glabel">קבוצה ב׳</div>${iconsRow(t.item, t.b, 'sm')}</div></div>`;
      const line = worked
        ? `<div class="gline">צריך להוסיף <span class="eqbox filled">${t.answer}</span></div>`
        : `<div class="gline">צריך להוסיף <span class="blank"></span></div>`;
      return `${prompt}${groups}${line}`;
    }
    case 'match': {
      const prompt = t.prompt ? `<div class="prompt">${esc(t.prompt)}</div>` : '';
      const groups = t.pairs.map((g) =>
        `<div class="mrow"><span class="glabel">${esc(g.label)}</span>${iconsRow(g.item, g.count, 'sm')}<span class="dot"></span></div>`
      ).join('');
      const nums = t.numbers.map((n) => `<div class="mn">${n}</div>`).join('');
      return `${prompt}<div class="matchwrap"><div class="match-groups">${groups}</div><div></div><div class="match-nums">${nums}</div></div>`;
    }
    case 'find_count':
    case 'text':
      return `<div class="bonus-body">${esc(t.text)}</div>`;
    default:
      return `<div class="prompt">[סוג משימה לא נתמך: ${esc(t.type)}]</div>`;
  }
}

// ── כותרת עמוד ──
function header(spec, levelKey, role = null) {
  const subj = label('subjects', spec.subject, false);
  const grade = label('grades', spec.audience, false);
  const crumbs = role
    ? `${esc(subj)} | ${esc(grade)} | <span class="role">${esc(role)}</span>`
    : `${esc(subj)} | ${esc(grade)}`;
  const logo = `<div class="logo">NIKA</div>`;
  const scene = `<div class="scene"></div>`;
  const head = `<div class="phead">${scene}
    <div class="brandmark">${logo}<div class="tagline">הפרויקט לשינוי חברתי באמצעות ספורט</div></div>
    <div class="crumbs">${crumbs}</div></div>`;
  if (role) {
    return head + `<div class="titleblock"><div class="daylabel">${esc(spec.day_label)}</div>
      <div class="ptitle">${esc(spec.title)}</div></div>`;
  }
  const lvlName = label('levels', levelKey, false);
  return head + `<div class="titleblock"><div class="daylabel">${esc(spec.day_label)}</div>
    <div class="ptitle">${esc(spec.title)}</div>
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
    <div>${esc(pg.instruction)}</div></div>`;
  const exBox = `<div class="box tint-blue"><div class="box-head blue">★ ${esc(exLabel)}</div>
    ${taskBody(pg.example, niq, true)}
    ${pg.example.caption ? `<div class="gline" style="text-align:center;margin-top:6px">${esc(pg.example.caption)}</div>` : ''}</div>`;

  const tasksHtml = pg.tasks.map((t, i) =>
    `<div class="task"><div class="tnum c${i}">${i + 1}</div>${taskBody(t, niq)}</div>`
  ).join('');
  const taskCols = pg.tasks.length <= 3 ? 'tasks one' : 'tasks';

  const qc = pg.quick_check;
  const qcBox = `<div class="box tint-blue"><div class="box-head blue">⏱ ${esc(qcLabel)}</div>${taskBody(qc, niq)}</div>`;

  const successItems = (pg.success_reflection || []).map((k) =>
    `<div class="ci"><span class="checkbox"></span>${esc(label('success_reflection', k, niq))}</div>`).join('');
  const successBox = `<div class="box tint-mag"><div class="box-head mag">${esc(successLabel)}</div>
    <div class="checkrow">${successItems}</div></div>`;

  const bonusBox = `<div class="box tint-lime"><div class="box-head lime">🎁 ${bonusLabel}</div>
    <div class="bonus-body">${esc(pg.bonus.text)}</div></div>`;

  return `<div class="page">
    ${header(spec, key)}
    <div class="intro">${esc(pg.intro)}</div>
    <div class="two-col">${doBox}${exBox}</div>
    <div class="${taskCols}">${tasksHtml}</div>
    <div class="encourage"><span class="heart">♥</span>${esc(pg.encouraging_message)}</div>
    <div class="bottom">${qcBox}${successBox}${bonusBox}</div>
    <div class="pfooter">${esc(pg.footer)}</div>
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
