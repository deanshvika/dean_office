/*
 * make_interview_doc.js — סיכום ראיון מועמד (JSON) → Google Doc.
 *
 * קלט:  ריאיונות/סיכומים/<שם>.json
 * מסלול: JSON → HTML RTL → DOCX (Word COM) → העלאה ל-Drive → Google Doc
 *
 * המסמך בנוי לפי מסמך העבודה של דין וחי ("מבנה מומלץ לראיון של 35–40 דקות"):
 * אותם שישה מדדים ומשקלים בטופס הניקוד, אותם שלושה תנאי סף, ואותה רשימת
 * סימנים חיוביים/דגלים אדומים. נוסף עליהם סעיף "מה לא נבדק בראיון" — כי בשתי
 * השיחות חלק מהמסמך לא כוסה, וזה בדיוק מה שקובע את הצעד הבא.
 *
 * למה HTML→DOCX ולא הדבקה ל-Docs: הדבקת HTML ישירות לא עובדת. ההמרה נעשית
 * בשלב convert של .claude/skills/text-to-gdocs/html_to_gdoc.ps1 (Word COM),
 * וההעלאה ב-upload_to_drive.js — שלב ה-upload של הסקיל לא אמין כש-VS Code
 * חוטף פוקוס. נתיבים עבריים מועברים כפרמטרים מה-CLI, כי PowerShell 5.1 לא
 * קורא עברית מגוף קובץ .ps1.
 *
 * הרצה:  node ריאיונות/make_interview_doc.js אלכס
 *        node ריאיונות/make_interview_doc.js אלכס --no-upload
 *        node ריאיונות/make_interview_doc.js --all
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUM_DIR = path.join(__dirname, 'סיכומים');
const BUILD = path.join(__dirname, '_build');
const OUT_DIR = path.join(process.env.USERPROFILE, 'Desktop', 'ריאיונות');
const PS1 = path.join(ROOT, '.claude', 'skills', 'text-to-gdocs', 'html_to_gdoc.ps1');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const list = (items, cls = '') => (items && items.length)
  ? `<ul${cls ? ` class="${cls}"` : ''}>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
  : '<p class="none">אין.</p>';

const THRESHOLD_MARK = { ok: '✔', warn: '⚠', unknown: '?' };
const REC_LABEL = { go: 'להתקדם', hold: 'להמתין / מותנה', no: 'לא להתקדם' };

function html(d) {
  // המשקל יושב בתוך תא המדד ולא בעמודה משלו: Word עושה autofit לפי תוכן ומצר
  // עמודה צרה עד שהכותרת "משקל" נשברת לשתי שורות, בלי קשר ל-colgroup או ל-nowrap.
  const rows = d.scores.map(s => `<tr>
      <td class="m">${esc(s.metric)}<br><span class="w">${esc(s.weight)}</span></td>
      <td class="c sc"><b>${s.score}</b> / 5</td>
      <td>${esc(s.basis)}</td>
    </tr>`).join('');

  const thresholds = d.thresholds.map(t => `<tr>
      <td class="c mark ${esc(t.status)}">${THRESHOLD_MARK[t.status] || '?'}</td>
      <td class="m">${esc(t.name)}</td>
      <td>${esc(t.note)}</td>
    </tr>`).join('');

  const ops = d.ops.map(o => `<tr><td class="m">${esc(o.k)}</td><td>${esc(o.v)}</td></tr>`).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>סיכום ראיון — ${esc(d.candidate)}</title>
<style>
 body{font-family:'David','Times New Roman',serif;font-size:11.5pt;line-height:1.45;direction:rtl;text-align:right;margin:1.8cm}
 h1{font-size:19pt;color:#1C3D6B;border-bottom:2px solid #1C3D6B;padding-bottom:5px;margin-bottom:4px}
 h2{font-size:13.5pt;color:#1C3D6B;margin-top:18px;margin-bottom:5px}
 .meta{color:#666;font-size:10pt;margin-bottom:14px}
 table{border-collapse:collapse;width:100%;margin-top:6px}
 th,td{border:1px solid #bbb;padding:5px 7px;text-align:right;vertical-align:top}
 th{background:#1C3D6B;color:#fff;font-weight:bold;white-space:nowrap;padding:5px 4px}
 td.c{text-align:center}
 td.m{font-weight:bold}
 td.sc{color:#1C3D6B;font-size:12.5pt}
 span.w{font-weight:normal;color:#666;font-size:10pt}
 td.mark{font-size:14pt;font-weight:bold}
 td.mark.ok{color:#1B7A3E} td.mark.warn{color:#B26A00} td.mark.unknown{color:#8A8A8A}
 ul{margin:4px 0;padding-right:20px} li{margin-bottom:4px}
 .none{color:#888;font-style:italic;margin:4px 0}
 .box{background:#EEF3FA;border-right:4px solid #1C3D6B;padding:9px 14px;margin:8px 0}
 .rec{font-size:12.5pt;font-weight:bold;color:#1C3D6B;margin:0 0 4px}
 .total{background:#1C3D6B;color:#fff;padding:6px 12px;display:inline-block;font-weight:bold;margin-top:6px}
 .warnbox{background:#FDF6EC;border-right:4px solid #B26A00;padding:9px 14px;margin:8px 0}
 .foot{color:#888;font-size:9pt;margin-top:22px;border-top:1px solid #ddd;padding-top:6px}
</style></head><body>

<h1>סיכום ראיון — ${esc(d.candidate)}</h1>
<p class="meta">${esc(d.role)} &nbsp;·&nbsp; <b>מראיין:</b> ${esc(d.interviewer)} &nbsp;·&nbsp; <b>משך ההקלטה:</b> ${esc(d.duration)}</p>

<h2>שורה תחתונה</h2>
<div class="box">
<p class="rec">${esc(REC_LABEL[d.recommendation_class] || '')} — ${esc(d.recommendation)}</p>
<p>${esc(d.bottom_line)}</p>
</div>

<h2>טופס ניקוד</h2>
<table><colgroup><col style="width:26%"><col style="width:14%"><col style="width:60%"></colgroup>
<tr><th>מדד ומשקל</th><th>דירוג</th><th>על מה זה מתבסס</th></tr>
${rows}
</table>
<p><span class="total">ציון משוקלל: ${esc(d.total)}</span></p>

<h2>תנאי סף</h2>
<table><colgroup><col style="width:6%"><col style="width:26%"><col style="width:68%"></colgroup>
<tr><th></th><th>תנאי</th><th>ממצא</th></tr>
${thresholds}
</table>

<h2>סימנים חיוביים</h2>
${list(d.green)}

<h2>דגלים אדומים ונקודות לבדיקה</h2>
${list(d.red)}

<h2>מה לא נבדק בראיון</h2>
<div class="warnbox">
${list(d.not_tested)}
</div>

<h2>התאמה תפעולית</h2>
<table><colgroup><col style="width:24%"><col style="width:76%"></colgroup>
${ops}
</table>

<h2>הצעד הבא</h2>
${list(d.next)}

<p class="foot">הסיכום נכתב מתוך תמלול אוטומטי של ההקלטה (Whisper, עברית) ומול מסמך מבנה הראיון של דין וחי — אותם שישה מדדים, משקלים ותנאי סף. בתמלול אוטומטי יש שיבושים; ציטוטים נבדקו והובאו רק כשהיו ברורים. הדירוג כאן הוא קריאה של מה שנאמר בפועל בהקלטה, ולפי המסמך הוא נועד להיות מושווה לדירוג העצמאי שלכם ולא להחליף אותו.</p>

</body></html>`;
}

function build(name) {
  const jsonPath = path.join(SUM_DIR, name.replace(/\.json$/, '') + '.json');
  if (!fs.existsSync(jsonPath)) throw new Error('סיכום לא נמצא: ' + jsonPath);
  const d = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = `סיכום ראיון - ${d.candidate}`;
  const htmlPath = path.join(BUILD, base + '.html');
  const docxPath = path.join(OUT_DIR, base + '.docx');

  fs.writeFileSync(htmlPath, '﻿' + html(d), 'utf8');
  console.log('✓ HTML:', htmlPath);

  const conv = spawnSync('powershell', ['-File', PS1, '-Step', 'convert', '-Html', htmlPath, '-Docx', docxPath],
    { encoding: 'utf8' });
  const out = (conv.stdout || '') + (conv.stderr || '');
  if (!/CONVERT_OK/.test(out)) throw new Error('המרת Word נכשלה:\n' + out.trim());
  console.log('✓ DOCX:', docxPath);

  if (process.argv.includes('--no-upload')) return null;

  // ההצלחה נקבעת לפי הכתובת שהודפסה ולא לפי קוד היציאה: כשחלון Chrome נסגר
  // מיד בתום ההעלאה, puppeteer מחזיר קוד שגיאה למרות שהקובץ עלה.
  const up = spawnSync(process.execPath, [path.join(ROOT, 'upload_to_drive.js'), docxPath, '--open'],
    { encoding: 'utf8' });
  const log = (up.stdout || '') + (up.stderr || '');
  process.stdout.write(log);
  const url = (log.match(/https:\/\/docs\.google\.com\/\S+/) || [])[0];
  if (!url) throw new Error('ההעלאה נכשלה — לא הוחזרה כתובת מסמך.');
  console.log('\n🔗 ' + d.candidate + ': ' + url);
  return url;
}

function main() {
  const names = process.argv.includes('--all')
    ? fs.readdirSync(SUM_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
    : process.argv.slice(2).filter(a => !a.startsWith('--'));

  if (!names.length) throw new Error('שימוש: node ריאיונות/make_interview_doc.js <שם המועמד> | --all');

  const urls = [];
  for (const n of names) {
    const u = build(n);
    if (u) urls.push([n, u]);
  }
  if (urls.length > 1) {
    console.log('\n── כל המסמכים ──');
    urls.forEach(([n, u]) => console.log(n + ': ' + u));
  }
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('❌', e.message); process.exit(1); }
}
module.exports = { html };
