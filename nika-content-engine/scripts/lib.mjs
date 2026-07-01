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

export { fs, path };
