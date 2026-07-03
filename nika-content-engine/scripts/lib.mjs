// עוזרים משותפים למנוע NIKA
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

export const p = (...parts) => path.join(ROOT, ...parts);

export function loadYaml(absPath) {
  return yaml.load(fs.readFileSync(absPath, 'utf8'));
}

export function loadDay(dayId) {
  return loadYaml(p('curriculum', 'days', `${dayId}.yaml`));
}

let _bank = null;
export function bank() {
  if (!_bank) _bank = loadYaml(p('content_banks', 'niqqud_bank.yaml'));
  return _bank;
}

// אייקון: מחזיר את תוכן ה-SVG מ-assets/icons/<key>.svg (עם cache)
const _icons = {};
export function iconSvg(key) {
  if (!(key in _icons)) {
    const f = p('assets', 'icons', `${key}.svg`);
    _icons[key] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
  }
  return _icons[key];
}
export function hasIcon(key) { return iconSvg(key) !== null; }

// לוגו NIKA כ-data URI (מוטמע ב-HTML כדי שהרינדור יהיה עצמאי)
let _logo = null;
export function logoDataUri() {
  if (_logo === null) {
    _logo = '';
    for (const name of ['nika_logo.png', 'nika_logo.jpg', 'nika_logo.jpeg', 'nika_logo.svg']) {
      const f = p('assets', 'logo', name);
      if (fs.existsSync(f)) {
        const buf = fs.readFileSync(f);
        const mime = name.endsWith('.svg') ? 'svg+xml'
          : (buf[0] === 0xFF && buf[1] === 0xD8) ? 'jpeg' : 'png';
        _logo = `data:image/${mime};base64,${buf.toString('base64')}`;
        break;
      }
    }
  }
  return _logo;
}

// מילת פריט מהבנק לפי מדיניות ניקוד/ריבוי
export function itemWord(key, { niqqud = false, plural = false } = {}) {
  const it = bank().items[key];
  if (!it) return key;
  if (plural) return niqqud ? (it.plural_niqqud || it.plural_plain) : it.plural_plain;
  return niqqud ? (it.niqqud || it.plain) : it.plain;
}

// תווית ממשק מהבנק
export function label(group, key, niqqud = false) {
  const g = bank()[group];
  const e = g && g[key];
  if (!e) return key;
  return niqqud ? (e.niqqud || e.plain) : e.plain;
}

// זיהוי סימני ניקוד (טווח U+05B0–U+05C7)
const NIQQUD_RE = /[ְ-ׇ]/;
export const hasNiqqud = (s) => NIQQUD_RE.test(String(s || ''));
// מילים עבריות בטקסט (רצפי אותיות א–ת, ללא סימני ניקוד)
export const hebrewWords = (s) => String(s || '').match(/[א-ת][א-תְ-ׇ'"׳״]*/g) || [];

// פיצול מילה לאשכולות "אות בסיס + סימני הניקוד שאחריה".
// למשל "כַּדּוּר" → ["כַּ","דּ","וּ","ר"]. משמש למשימת אות-חסרה כדי לשלוף
// את האות מהבנק המנוקד בלי להקליד ניקוד ידני (אפס טעות ניקוד).
const HEB_BASE = /[א-ת]/;
export function splitClusters(word) {
  const out = [];
  for (const ch of String(word || '')) {
    if (HEB_BASE.test(ch)) out.push(ch);          // אות בסיס חדשה
    else if (out.length) out[out.length - 1] += ch; // סימן ניקוד — נדבק לאשכול הקודם
    else out.push(ch);
  }
  return out;
}

// מילת התצוגה של פריט לפי תחום ומדיניות ניקוד — תמיד מהבנק הסגור (אפס טעות).
// אנגלית → השדה en; עברית → מנוקד/plain לפי המדיניות.
export function displayWord(subject, key, niqqud = false) {
  const it = bank().items[key];
  if (!it) return key;
  if (subject === 'english') return it.en || key;
  return niqqud ? (it.niqqud || it.plain) : it.plain;
}

// בנק אותיות סגור (אלפבית + צורות סופיות + זוגות דומים) — משמש למשימות רמת-אות.
let _letters = null;
export function lettersBank() {
  if (!_letters) _letters = loadYaml(p('content_banks', 'letters_bank.yaml'));
  return _letters;
}

// האות הפותחת של פריט — נגזרת מהמילה המנוקדת בבנק (אות בסיס נטו, בלי ניקוד).
// מקור-אמת יחיד ל-render ול-validate; התשובה מחושבת ולא מוקלדת → אי-אפשר לטעות בה.
export function openingLetter(key) {
  const cs = splitClusters(itemWord(key, { niqqud: true }));
  return cs.length ? cs[0][0] : '';
}

// האות הפותחת באנגלית — האות הראשונה של items[key].en, ברישית (ball→B). נגזרת מהבנק → אפס טעות.
export function openingLetterEn(key) {
  const it = bank().items[key];
  const en = it && it.en ? String(it.en) : '';
  return en ? en[0].toUpperCase() : '';
}

// האות הפותחת לפי תחום (עברית/אנגלית) — עוטף את שתי הפונקציות.
export function openingLetterFor(subject, key) {
  return subject === 'english' ? openingLetterEn(key) : openingLetter(key);
}

export { fs, path };
