/*
 * make_transcript_doc.js — הופך transcript_speakers.json ל-HTML בעברית RTL,
 * מוכן להמרה ל-DOCX (Word COM) ולהעלאה ל-Google Drive.
 *
 * הרצה:
 *   node make_transcript_doc.js --in <transcript_speakers.json> --out <doc.html> \
 *        [--title "..."] [--date "..."] [--gap 2.5]
 *
 * --gap: פער שתיקה (בשניות) שמעליו מתחילים תור דיבור חדש גם לאותו דובר.
 *
 * עיצוב בסגנונות inline ולא ב-class: מנוע הייבוא של Word מתעלם מחלק
 * מכללי ה-CSS בגיליון, אבל מכבד סגנון על האלמנט עצמו.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
if (!opts.in || !opts.out) { console.error('שימוש: node make_transcript_doc.js --in <json> --out <html>'); process.exit(1); }

const GAP = Number(opts.gap || 2.5);
const data = JSON.parse(fs.readFileSync(opts.in, 'utf8'));

// Whisper מדליף לפעמים טוקן פנימי (<|lt|>, <|no|>) כשהפענוח נכשל באמצע מילה.
// מחליפים ב-… במקום למחוק בשקט — הקורא צריך לדעת שכאן חסר טקסט.
let dropped = 0;
for (const s of data.segments) {
  if (/<\|[^|]*\|>/.test(s.text)) { s.text = s.text.replace(/<\|[^|]*\|>/g, '…'); dropped++; }
}
const segs = data.segments.filter(s => (s.text || '').trim());

const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// איחוד סגמנטים רצופים של אותו דובר לתור דיבור אחד
const turns = [];
for (const s of segs) {
  const last = turns[turns.length - 1];
  if (last && last.speaker === s.speaker && s.start - last.end <= GAP) {
    last.end = s.end;
    last.parts.push(s);
  } else {
    turns.push({ speaker: s.speaker, start: s.start, end: s.end, parts: [s] });
  }
}

const total = data.duration || (segs.length ? segs[segs.length - 1].end : 0);
const spoken = {};
for (const t of turns) spoken[t.speaker] = (spoken[t.speaker] || 0) + (t.end - t.start);
const speakers = Object.keys(spoken).sort((a, b) => spoken[b] - spoken[a]);

// תורים שבהם השיוך פחות ודאי — מעבר דובר נפל בתוך סגמנט, או שלא היה
// כיסוי בוידאו והדובר הועתק מהתור הקודם. מדווחים במפורש במקום להסתיר.
const uncertain = turns.filter(t => t.parts.some(p => p.confidence < 0.7 || p.inherited));

const S = {
  body: 'font-family:Arial,sans-serif; font-size:11pt; line-height:1.5; direction:rtl; text-align:right;',
  h1:   'font-family:Arial,sans-serif; font-size:20pt; direction:rtl; text-align:right; margin:0 0 4pt 0;',
  sub:  'font-family:Arial,sans-serif; font-size:10pt; color:#666666; direction:rtl; text-align:right; margin:0 0 14pt 0;',
  h2:   'font-family:Arial,sans-serif; font-size:13pt; direction:rtl; text-align:right; margin:18pt 0 6pt 0;',
  td:   'border:1px solid #cccccc; padding:5pt 8pt; direction:rtl; text-align:right; font-size:10.5pt;',
  th:   'border:1px solid #cccccc; padding:5pt 8pt; direction:rtl; text-align:right; font-size:10.5pt; background:#f0f0f0; font-weight:bold;',
  spk:  'font-family:Arial,sans-serif; font-size:11pt; font-weight:bold; direction:rtl; text-align:right; margin:12pt 0 1pt 0;',
  ts:   'font-weight:normal; color:#888888; font-size:9.5pt;',
  txt:  'font-family:Arial,sans-serif; font-size:11pt; line-height:1.5; direction:rtl; text-align:right; margin:0 0 0 0;',
  note: 'font-family:Arial,sans-serif; font-size:9.5pt; color:#666666; direction:rtl; text-align:right; line-height:1.45;',
};

const rows = speakers.map(n =>
  `<tr><td style="${S.td}">${esc(n)}</td><td style="${S.td}">${fmt(spoken[n])}</td>` +
  `<td style="${S.td}">${(100 * spoken[n] / total).toFixed(1)}%</td>` +
  `<td style="${S.td}">${turns.filter(t => t.speaker === n).length}</td></tr>`).join('\n');

const body = turns.map(t =>
  `<p style="${S.spk}">${esc(t.speaker)} <span style="${S.ts}">${fmt(t.start)}</span></p>\n` +
  `<p style="${S.txt}">${esc(t.parts.map(p => p.text.trim()).join(' '))}</p>`).join('\n');

const html = `<meta charset="utf-8">
<body dir="rtl" style="${S.body}">
<h1 style="${S.h1}">${esc(opts.title || 'תמליל שיחה')}</h1>
<p style="${S.sub}">${esc(opts.date || '')}${opts.date ? ' · ' : ''}משך ${fmt(total)} · ${speakers.length} משתתפות · ${turns.length} תורי דיבור</p>

<h2 style="${S.h2}">משתתפות</h2>
<table border="1" cellspacing="0" cellpadding="0" dir="rtl" style="border-collapse:collapse; direction:rtl;">
<tr><th style="${S.th}">שם</th><th style="${S.th}">זמן דיבור</th><th style="${S.th}">חלק מהשיחה</th><th style="${S.th}">תורים</th></tr>
${rows}
</table>

<h2 style="${S.h2}">תמליל</h2>
${body}

<h2 style="${S.h2}">הערות על התמליל</h2>
<p style="${S.note}">
<b>שיוך הדוברות</b> — נגזר מתצוגת הדובר הפעיל של Zoom: בכל רגע Zoom מציג את מי שמדבר, עם שמו צרוב על המסך. השם נקרא מהוידאו ושויך לפי חותמות הזמן, ולכן זהו נתון מדוד ולא פרשנות של התוכן.<br>
<b>${uncertain.length} תורים בשיוך פחות ודאי</b>${uncertain.length ? ' — מעבר דובר נפל בתוך סגמנט של התמלול: ' + uncertain.slice(0, 40).map(t => fmt(t.start)).join(', ') + (uncertain.length > 40 ? ' ועוד' : '') : ''}.<br>
<b>דיוק המילים</b> — התמלול אוטומטי (Whisper large-v3, עברית). הוא נאמן לתוכן ולניסוח, אך חלק ממילות המילוי והגמגומים מוחלקים, ושמות פרטיים ומונחים לועזיים עלולים להיכתב בשגיאה. תמליל ברמת ציטוט משפטי מחייב מעבר אנושי על האודיו.${dropped ? `<br>\n<b>הסימן …</b> מציין ${dropped} מקומות שבהם הפענוח נכשל באמצע מילה.` : ''}
</p>
</body>`;

fs.mkdirSync(path.dirname(opts.out), { recursive: true });
fs.writeFileSync(opts.out, html, 'utf8');
console.log(`✓ ${opts.out}`);
console.log(`  ${turns.length} תורי דיבור, ${segs.length} סגמנטים, ${uncertain.length} בשיוך פחות ודאי`);
for (const n of speakers) console.log(`  ${n}: ${fmt(spoken[n])}`);
