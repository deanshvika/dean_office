// שער הוולידציה — מחסל טעויות לפני רינדור.
// בודק: מבנה, שלמות מספרית (ספירה=מספר=תשובה), מדיניות ניקוד, אוצר סגור.
import { p, loadYaml, loadDay, hasIcon, hasNiqqud, hebrewWords, bank, itemWord, splitClusters } from './lib.mjs';

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
      case 'pic_word': {
        checkIcon(page, t.item);
        const opts = t.options || [t.item, ...(t.distractors || [])];
        if (!opts.includes(t.item)) E(page, `${ctx}: הפריט הנכון אינו בין אפשרויות המילים`);
        if (new Set(opts).size !== opts.length) E(page, `${ctx}: מילות בחירה כפולות [${opts}]`);
        opts.forEach((k) => { if (!bank().items[k]) E(page, `${ctx}: המילה "${k}" אינה באוצר הבנק הסגור`); });
        return null;
      }
      case 'missing_letter': {
        checkIcon(page, t.item);
        if (!t.answer) { E(page, `${ctx}: חסרה האות החסרה (answer)`); return null; }
        const opts = t.options || [];
        if (opts.length < 2) E(page, `${ctx}: נדרשות לפחות 2 אפשרויות אותיות`);
        if (!opts.includes(t.answer)) E(page, `${ctx}: האות "${t.answer}" אינה בין האפשרויות`);
        if (new Set(opts).size !== opts.length) E(page, `${ctx}: אותיות כפולות [${opts}]`);
        // ודא שהאות אכן חלק מהמילה שבבנק — כך ה"חור" אמיתי (אפס טעות)
        const item = bank().items[t.item];
        if (!item) E(page, `${ctx}: הפריט "${t.item}" אינו בבנק`);
        else {
          const word = itemWord(t.item, { niqqud: true });
          const cs = splitClusters(word);
          if (!cs.includes(t.answer) && !cs.some((c) => c[0] === String(t.answer)[0]))
            E(page, `${ctx}: האות "${t.answer}" אינה מופיעה במילה "${word}"`);
        }
        return null;
      }
      case 'complete_sentence': {
        if (!t.sentence || !/_{2,}/.test(t.sentence)) E(page, `${ctx}: חסר משפט עם ___`);
        const wb = t.word_bank || [];
        if (wb.length < 2) E(page, `${ctx}: בנק המילים חייב לפחות 2 מילים`);
        if (!wb.includes(t.answer)) E(page, `${ctx}: התשובה "${t.answer}" אינה בבנק המילים`);
        if (new Set(wb).size !== wb.length) E(page, `${ctx}: מילים כפולות בבנק [${wb}]`);
        if (t.item && !hasIcon(t.item)) E(page, `${ctx}: אין אייקון לפריט "${t.item}"`);
        return null;
      }
      case 'vertical_arith': {
        const res = t.op === 'subtraction' ? t.a - t.b : t.a + t.b;
        if (res !== t.result)
          E(page, `${ctx}: ${t.a} ${t.op === 'subtraction' ? '−' : '+'} ${t.b} = ${res}, אבל result=${t.result}`);
        for (const [lbl, v] of [['a', t.a], ['b', t.b], ['result', t.result]])
          if (!(Number.isInteger(v) && v >= 0 && v <= 1000)) E(page, `${ctx}: ${lbl}=${v} מחוץ לטווח (0–1000)`);
        if (t.op === 'subtraction' && t.a < t.b) E(page, `${ctx}: חיסור שלילי (a<b)`);
        return t.result;
      }
      case 'place_value': {
        const n = t.number;
        if (!(Number.isInteger(n) && n >= 0 && n <= 1000)) E(page, `${ctx}: number=${n} מחוץ לטווח (0–1000)`);
        const ask = t.ask || 'total';
        if (!['tens', 'units', 'total'].includes(ask)) E(page, `${ctx}: ask חייב tens/units/total`);
        const answer = ask === 'tens' ? Math.floor(n / 10) : ask === 'units' ? n % 10 : n;
        const opts = t.options || [answer - 1, answer, answer + 1];
        if (!opts.includes(answer)) E(page, `${ctx}: options=[${opts}] לא מכיל את התשובה ${answer}`);
        if (new Set(opts).size !== opts.length) E(page, `${ctx}: אפשרויות כפולות [${opts}]`);
        return null;
      }
      case 'multiply': {
        if (t.rows * t.cols !== t.result) E(page, `${ctx}: ${t.rows}×${t.cols}=${t.rows * t.cols}, אבל result=${t.result}`);
        if (!(t.rows >= 1 && t.rows <= 6 && t.cols >= 1 && t.cols <= 6)) E(page, `${ctx}: גורמים מחוץ לטווח הוויזואלי (1–6)`);
        if (t.item) checkIcon(page, t.item);
        return t.result;
      }
      case 'reading_comprehension': {
        if (!t.passage) E(page, `${ctx}: חסר passage`);
        if (!t.question) E(page, `${ctx}: חסרה שאלה`);
        const opts = t.options || [];
        if (opts.length < 2) E(page, `${ctx}: נדרשות לפחות 2 אפשרויות`);
        if (!opts.includes(t.answer)) E(page, `${ctx}: התשובה "${t.answer}" אינה באפשרויות`);
        if (new Set(opts).size !== opts.length) E(page, `${ctx}: אפשרויות כפולות`);
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
function collectTaskText(t, push) {
  if (!t) return;
  push(t.prompt); push(t.word); push(t.caption); push(t.passage); push(t.question); push(t.sentence); push(t.line);
  (t.groups || []).forEach((g) => { push(g.line); push(g.label); });
  (t.pairs || []).forEach((g) => push(g.label));
  (t.options || []).forEach(push);       // מספרים מסוננים אוטומטית (רק מחרוזות נבדקות)
  (t.word_bank || []).forEach(push);
}
function collectText(pg) {
  const out = [];
  const push = (s) => { if (typeof s === 'string') out.push(s); };
  push(pg.intro); push(pg.instruction); push(pg.encouraging_message); push(pg.footer);
  collectTaskText(pg.example, push);
  (pg.tasks || []).forEach((t) => collectTaskText(t, push));
  collectTaskText(pg.quick_check, push);
  if (pg.bonus) { push(pg.bonus.text); push(pg.bonus.title); }
  return out;
}

// אות בודדת + גרש/גרשיים = מספר סודר/תווית (א׳, ב׳) — לא מילה שניתן לנקד
const isOrdinal = (w) => /^[א-ת][׳״'"]?$/.test(w);

function checkNiqqud(page, strings, expected, E) {
  for (const s of strings) {
    const words = hebrewWords(s);
    if (expected) {
      const missing = words.filter((w) => w.length > 1 && !hasNiqqud(w) && !isOrdinal(w));
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
