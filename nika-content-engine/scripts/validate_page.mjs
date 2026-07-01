// שער הוולידציה — מחסל טעויות לפני רינדור.
// בודק: מבנה, שלמות מספרית (ספירה=מספר=תשובה), מדיניות ניקוד, אוצר סגור.
import { p, loadYaml, loadDay, hasIcon, hasNiqqud, hebrewWords } from './lib.mjs';

const STUDENT_PAGES = ['beginner', 'mid', 'challenge'];

// טווחי מספרים
function ranges(subject) {
  if (subject === 'math') {
    const mb = loadYaml(p('content_banks', 'math_bank.yaml'));
    return mb.number_ranges;
  }
  return { grade_1: { min: 1, max: 10 }, grades_2_3: { min: 1, max: 20 } };
}

export function validateDay(spec) {
  const errors = [];
  const warn = [];
  const E = (page, msg) => errors.push({ page, msg });
  const W = (page, msg) => warn.push({ page, msg });

  // מבנה עליון
  for (const f of ['day_id', 'subject', 'audience', 'title', 'pages']) {
    if (spec[f] == null) E('root', `שדה חובה חסר: ${f}`);
  }
  if (!spec.pages) return { pass: false, errors, warn };

  const rng = ranges(spec.subject)[spec.audience] || { min: 1, max: 999 };
  const inRange = (n) => Number.isInteger(n) && n >= rng.min && n <= rng.max;
  const niqExpected = !!spec.niqqud;

  const checkIcon = (page, item) => { if (!hasIcon(item)) E(page, `אין אייקון לפריט "${item}" (assets/icons/${item}.svg)`); };

  // ── בדיקת משימה בודדת ──
  function checkTask(page, t, ctx) {
    switch (t.type) {
      case 'count': {
        if (!inRange(t.count)) E(page, `${ctx}: count=${t.count} מחוץ לטווח ${rng.min}-${rng.max}`);
        checkIcon(page, t.item);
        if (t.options) {
          if (!t.options.includes(t.count))
            E(page, `${ctx}: options=[${t.options}] לא מכיל את התשובה count=${t.count}`);
          if (new Set(t.options).size !== t.options.length)
            E(page, `${ctx}: אפשרויות כפולות [${t.options}]`);
        }
        return t.count;
      }
      case 'arith': {
        const a = t.a.count, b = t.b.count;
        const res = t.op === 'subtraction' ? a - b : a + b;
        if (res !== t.result)
          E(page, `${ctx}: ${a} ${t.op === 'subtraction' ? '−' : '+'} ${b} = ${res}, אבל result=${t.result}`);
        for (const [lbl, v] of [['a', a], ['b', b], ['result', t.result]])
          if (!inRange(v)) E(page, `${ctx}: ${lbl}=${v} מחוץ לטווח`);
        checkIcon(page, t.a.item); checkIcon(page, t.b.item);
        return t.result;
      }
      case 'compare': {
        if (t.a === t.b) E(page, `${ctx}: השוואה בין ערכים שווים (a=${t.a}, b=${t.b})`);
        if (!['more', 'less'].includes(t.ask)) E(page, `${ctx}: ask חייב להיות more/less`);
        if (!inRange(t.a) || !inRange(t.b)) E(page, `${ctx}: a/b מחוץ לטווח`);
        checkIcon(page, t.item);
        return null;
      }
      case 'equalize': {
        if (t.answer !== t.a - t.b)
          E(page, `${ctx}: השלמה שגויה — ${t.a}-${t.b}=${t.a - t.b}, אבל answer=${t.answer}`);
        if (t.a < t.b) E(page, `${ctx}: a<b לא תקין להשלמה חיובית`);
        checkIcon(page, t.item);
        return null;
      }
      case 'write_count': {
        for (const g of t.groups) {
          if (!inRange(g.count)) E(page, `${ctx}: group count=${g.count} מחוץ לטווח`);
          checkIcon(page, g.item);
        }
        return null;
      }
      case 'match': {
        const counts = t.pairs.map((x) => x.count).sort();
        const nums = [...t.numbers].sort();
        if (JSON.stringify(counts) !== JSON.stringify(nums))
          E(page, `${ctx}: המספרים [${t.numbers}] אינם תואמים לכמויות המצוירות [${t.pairs.map((x) => x.count)}]`);
        t.pairs.forEach((g) => checkIcon(page, g.item));
        return null;
      }
      case 'word_picture': {
        checkIcon(page, t.item);
        const opts = t.options || [t.item, ...(t.distractors || [])];
        opts.forEach((k) => checkIcon(page, k));
        if (!opts.includes(t.item)) E(page, `${ctx}: הפריט הנכון אינו בין אפשרויות התמונה`);
        return null;
      }
      case 'text': case 'find_count':
        if (!t.text) E(page, `${ctx}: חסר text`);
        return null;
      default:
        E(page, `${ctx}: סוג משימה לא מוכר "${t.type}"`);
        return null;
    }
  }

  // ── עמודי תלמיד ──
  for (const key of STUDENT_PAGES) {
    const pg = spec.pages[key];
    if (!pg) { W(key, 'עמוד חסר'); continue; }
    for (const f of ['intro', 'instruction', 'example', 'tasks', 'encouraging_message', 'quick_check', 'success_reflection', 'bonus', 'footer'])
      if (pg[f] == null) E(key, `שדה חובה חסר בעמוד: ${f}`);

    if (pg.example) checkTask(key, pg.example, 'example');
    const counts = [];
    (pg.tasks || []).forEach((t, i) => { const c = checkTask(key, t, `task_${i + 1}`); if (c != null) counts.push(c); });
    if (pg.quick_check) checkTask(key, pg.quick_check, 'quick_check');

    // בונוס find_count: היעד חייב להופיע כתשובה באחת המשימות בעמוד
    if (pg.bonus && pg.bonus.type === 'find_count') {
      if (!counts.includes(pg.bonus.target))
        E(key, `בונוס: לא קיים ציור עם בדיוק ${pg.bonus.target} פריטים בעמוד (יעדי count: [${counts}])`);
    }

    // ניקוד: כל הטקסט הגלוי חייב להתאים למדיניות
    checkNiqqud(key, collectText(pg), niqExpected, E);
  }

  // ── דף מדריך ──
  const c = spec.pages.coach_guide;
  if (!c) W('coach_guide', 'דף מדריך חסר');
  else for (const f of ['daily_goal', 'leading_value', 'pages_overview', 'how_to_mediate', 'adaptations', 'fast_finishers', 'coach_message', 'phrases'])
    if (c[f] == null) E('coach_guide', `שדה חובה חסר בדף מדריך: ${f}`);

  return { pass: errors.length === 0, errors, warn };
}

// אוסף טקסט גלוי מעמוד (לבדיקת ניקוד)
function collectText(pg) {
  const out = [];
  const push = (s) => { if (typeof s === 'string') out.push(s); };
  push(pg.intro); push(pg.instruction); push(pg.encouraging_message); push(pg.footer);
  if (pg.example) { push(pg.example.caption); push(pg.example.prompt); push(pg.example.word); }
  (pg.tasks || []).forEach((t) => {
    push(t.prompt); push(t.word);
    (t.groups || []).forEach((g) => { push(g.line); push(g.label); });
    (t.pairs || []).forEach((g) => push(g.label));
  });
  if (pg.quick_check) { push(pg.quick_check.line); (pg.quick_check.groups || []).forEach((g) => push(g.line)); }
  if (pg.bonus) { push(pg.bonus.text); push(pg.bonus.title); }
  return out;
}

function checkNiqqud(page, strings, expected, E) {
  for (const s of strings) {
    const words = hebrewWords(s);
    if (expected) {
      const missing = words.filter((w) => w.length > 1 && !hasNiqqud(w));
      if (missing.length) E(page, `ניקוד חסר (שכבה מנוקדת) במילים: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`);
    } else {
      const extra = words.filter((w) => hasNiqqud(w));
      if (extra.length) E(page, `ניקוד עודף (שכבה ללא ניקוד) במילים: ${extra.slice(0, 4).join(', ')}${extra.length > 4 ? '…' : ''}`);
    }
  }
}

// ── הרצה עצמאית ──
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate_page.mjs')) {
  const arg = process.argv[2];
  if (!arg) { console.error('שימוש: node scripts/validate_page.mjs <day_id | path.yaml>'); process.exit(2); }
  const spec = arg.endsWith('.yaml') ? loadYaml(arg) : loadDay(arg);
  const r = validateDay(spec);
  if (r.pass) {
    console.log(`PASS ✔  ${spec.day_id} — כל הבדיקות עברו${r.warn.length ? ` (${r.warn.length} אזהרות)` : ''}`);
  } else {
    console.log(`FAIL ✗  ${spec.day_id} — ${r.errors.length} שגיאות:`);
    r.errors.forEach((e) => console.log(`   [${e.page}] ${e.msg}`));
  }
  r.warn.forEach((w) => console.log(`   ⚠ [${w.page}] ${w.msg}`));
  process.exit(r.pass ? 0 : 1);
}
