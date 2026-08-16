'use strict';
/** מוסכמות תצוגה משותפות לבונה המפה ולתבנית ה-HTML. */

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** ודאות השיבוץ — הצבע הסמנטי שהמפה מקודדת. */
const STATUS = {
  'ודאי':       { key: 'sure',  label: 'ודאי' },
  'משוער':      { key: 'maybe', label: 'משוער' },
  'בקשת ביה״ס': { key: 'asked', label: 'בקשת בית הספר' },
  'חסר':        { key: 'gap',   label: 'חסר מאמן' },
};
const LEAVING = { key: 'leaving', label: 'עוזב' };

/** סדר תצוגה — הדחוף קודם. */
const STATUS_ORDER = ['gap', 'maybe', 'asked', 'sure', 'leaving'];

function statusOf(site) {
  if (site.status === 'עוזב') return LEAVING;
  return STATUS[site.certainty] || STATUS['חסר'];
}

/** כיתות באותיות עבריות. "1–6" בטקסט דו-כיווני מתהפך ל-"6–1" ונקרא כטעות. */
const GRADE_LETTERS = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב'];
function gradeRange(from, to) {
  const a = GRADE_LETTERS[from], b = GRADE_LETTERS[to];
  if (!a && !b) return '';
  if (a && b) return a === b ? a : `${a}–${b}`;
  return a || b;
}

/** מספר טלפון ישראלי עם מקף אחרי הקידומת. במאגר העירוני הפורמט לא אחיד. */
function phoneFmt(raw) {
  const s = String(raw || '').trim();
  if (!s || s.includes('-')) return s;
  const m = s.match(/^(0(?:7\d|[2-9]))(\d.*)$/);
  return m ? `${m[1]}-${m[2]}` : s;
}

const wazeUrl = s => `https://waze.com/ul?ll=${s.lat.toFixed(6)},${s.lon.toFixed(6)}&navigate=yes`;
const gmapsUrl = s => `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(6)},${s.lon.toFixed(6)}`;

module.exports = { esc, STATUS, LEAVING, STATUS_ORDER, statusOf, wazeUrl, gmapsUrl, gradeRange, phoneFmt };
