// שער ולידציה לדפי-אות אנגלית — מחסל את הכשל הקודם ("מילים לא קשורות").
// ★ הבדיקה הקריטית: כל word חייב להתחיל באות שהוא מייצג. כך הקשר אות↔מילה↔תמונה תמיד אמיתי.
import { p, loadYaml } from './lib.mjs';

let _lb = null;
const bankWords = () => (_lb ||= loadYaml(p('content_banks', 'letters_words.yaml')).letters);

export function validateLetter(letter) {
  const errors = [];
  const L = String(letter || '').toUpperCase();
  const E = (m) => errors.push(m);

  if (!/^[A-Z]$/.test(L)) { E(`"${letter}" אינה אות A–Z בודדת`); return { pass: false, errors }; }
  const data = bankWords()[L];
  if (!data) { E(`אין ערך לאות ${L} בבנק letters_words.yaml`); return { pass: false, errors }; }

  if (!data.sound) E(`${L}: חסר sound`);
  const words = data.words || [];
  if (words.length < 2 || words.length > 3) E(`${L}: נדרשות 2–3 מילים (יש ${words.length})`);

  const seen = new Set();
  for (const w of words) {
    const word = String(w.word || '');
    // ★ הליבה: המילה חייבת להתחיל באות
    if (word.toUpperCase()[0] !== L)
      E(`${L}: המילה "${word}" אינה מתחילה באות ${L}`);
    if (!w.emoji || !String(w.emoji).trim())
      E(`${L}: למילה "${word}" חסר אימוג'י`);
    if (seen.has(word.toLowerCase())) E(`${L}: מילה כפולה "${word}"`);
    seen.add(word.toLowerCase());
  }
  return { pass: errors.length === 0, errors };
}

// הרצה עצמאית: node scripts/validate_letters.mjs [A]  (או ריק = כל A–Z)
if (process.argv[1]?.endsWith('validate_letters.mjs')) {
  const arg = process.argv[2];
  const list = arg ? [arg.toUpperCase()] : Object.keys(bankWords());
  let fail = 0;
  for (const L of list) {
    const r = validateLetter(L);
    if (r.pass) console.log(`PASS ✔  ${L}`);
    else { fail++; console.log(`FAIL ✗  ${L}`); r.errors.forEach((e) => console.log(`   ${e}`)); }
  }
  console.log(`\n${list.length - fail}/${list.length} עברו.`);
  process.exit(fail ? 1 : 0);
}
