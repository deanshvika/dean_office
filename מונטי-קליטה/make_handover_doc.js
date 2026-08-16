/*
 * make_handover_doc.js — סיכום פגישת חפיפה (JSON) → Google Doc.
 *
 * קלט:  מונטי-קליטה/סיכומים/פגישה_NN.json
 * מסלול: JSON → HTML RTL → DOCX (Word COM) → העלאה ל-Drive → Google Doc
 *
 * למה כך: הדבקת HTML ישירות ל-Docs לא עובדת. ההמרה נעשית בשלב convert של
 * .claude/skills/text-to-gdocs/html_to_gdoc.ps1 (Word COM, בלי קליקים עיוורים),
 * וההעלאה ב-upload_to_drive.js — שלב ה-upload של הסקיל לא אמין כש-VS Code
 * חוטף פוקוס. נתיבים עבריים מועברים כפרמטרים מה-CLI, כי PowerShell 5.1
 * לא קורא עברית מגוף קובץ .ps1 בלי BOM.
 *
 * הרצה:  node מונטי-קליטה/make_handover_doc.js פגישה_01
 *        node מונטי-קליטה/make_handover_doc.js פגישה_01 --no-upload
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SUM_DIR = path.join(__dirname, 'סיכומים');
const BUILD = path.join(__dirname, '_build');
const PS1 = path.join(ROOT, '.claude', 'skills', 'text-to-gdocs', 'html_to_gdoc.ps1');

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// רשימה, או "אין" מפורש — כדי שברור שנבדק ולא נשכח
const list = items => (items && items.length)
  ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
  : '<p class="none">אין.</p>';

function html(d) {
  // רוחב עמודות מפורש — בלעדיו Word מצר את "בעלים" ושובר אותו לשתי שורות
  const tasks = (d.tasks && d.tasks.length)
    ? `<table><colgroup><col style="width:64%"><col style="width:16%"><col style="width:20%"></colgroup>
       <tr><th>משימה</th><th>בעלים</th><th>מועד</th></tr>${
        d.tasks.map(t => `<tr><td>${esc(t.task)}</td><td>${esc(t.owner)}</td><td>${esc(t.due)}</td></tr>`).join('')
      }</table>`
    : '<p class="none">אין.</p>';

  const a = d.audit || {};
  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${esc(d.meeting)}</title>
<style>
 body{font-family:'David','Times New Roman',serif;font-size:12pt;line-height:1.5;direction:rtl;text-align:right;margin:2cm}
 h1{font-size:19pt;color:#1C3D6B;border-bottom:2px solid #1C3D6B;padding-bottom:6px;margin-bottom:4px}
 h2{font-size:14pt;color:#1C3D6B;margin-top:20px;margin-bottom:6px}
 h3{font-size:12pt;color:#444;margin-top:12px;margin-bottom:4px}
 .meta{color:#666;font-size:10.5pt;margin-bottom:16px}
 table{border-collapse:collapse;width:100%;margin-top:6px}
 th,td{border:1px solid #bbb;padding:6px 8px;text-align:right;vertical-align:top}
 th{background:#1C3D6B;color:#fff;font-weight:bold}
 ul{margin:4px 0;padding-right:20px} li{margin-bottom:5px}
 .none{color:#888;font-style:italic;margin:4px 0}
 .audit{background:#F7F7FA;border-right:4px solid #1C3D6B;padding:8px 14px;margin-top:8px}
</style></head><body>

<h1>חפיפת מונטי — ${esc(d.meeting)}</h1>
<p class="meta"><b>תאריך:</b> ${esc(d.date)} &nbsp;·&nbsp; <b>משתתפים:</b> ${esc(d.participants)}</p>

<h2>סיכום</h2>
<p>${esc(d.summary)}</p>

<h2>החלטות</h2>
${list(d.decisions)}

<h2>משימות</h2>
${tasks}

<h2>מה מונטי מחזיק מהיום</h2>
${list(d.monti_owns)}

<h2>בקרה מול התהליך</h2>
<div class="audit">
<h3>פיגור מול הלוח</h3>
${list(a.behind)}
<h3>משימות שנגררו</h3>
${list(a.carried)}
<h3>הצפה ושחיקה</h3>
${list(a.overload)}
</div>

</body></html>`;
}

// ── גרסת אריק ─────────────────────────────────────────────────────────────
// סיכום לנמען, לא דוח ניהולי. שלושה הבדלים מהגרסה הפנימית:
//   1. בלי סעיף הבקרה — הוא כלי של דין בלבד.
//   2. בלי משימות ובלי "מה באחריותך" כל עוד לא הוטלו בפועל. בפגישות
//      ההיכרות התפקיד מתואר בלשון עתיד, לא כהטלת אחריות.
//   3. הטקסט נכתב ידנית בבלוק `coach` שב-JSON — כדי שאפשר יהיה לכוונן
//      טון לכל פגישה בלי לגעת בגרסה הפנימית.
function htmlCoach(d) {
  const c = d.coach || {};
  const n = (d.meeting.match(/\d+/) || [''])[0];
  const sections = (c.sections || []).map(s => `
<h2>${esc(s.title)}</h2>
${list(s.items)}`).join('\n');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>סיכום פגישה ${esc(n)}</title>
<style>
 body{font-family:'David','Times New Roman',serif;font-size:12pt;line-height:1.6;direction:rtl;text-align:right;margin:2.2cm}
 h1{font-size:20pt;color:#1C3D6B;margin-bottom:2px}
 h2{font-size:13.5pt;color:#1C3D6B;margin-top:20px;margin-bottom:5px}
 .meta{color:#666;font-size:10.5pt;margin-bottom:20px}
 ul{margin:4px 0;padding-right:20px} li{margin-bottom:6px}
 .none{color:#888;font-style:italic;margin:4px 0}
 .closing{margin-top:20px}
 .next{background:#EEF3FA;border-right:4px solid #1C3D6B;padding:10px 14px;margin-top:22px;font-size:12.5pt}
</style></head><body>

<h1>סיכום פגישה ${esc(n)} — חפיפה</h1>
<p class="meta">${esc(d.date)} &nbsp;·&nbsp; ${esc(d.participants)}</p>

<p>${esc(c.intro || d.summary)}</p>
${sections}
${c.closing ? `<p class="closing">${esc(c.closing)}</p>` : ''}
${d.next_meeting ? `<p class="next"><b>הפגישה הבאה:</b> ${esc(d.next_meeting)}</p>` : ''}

</body></html>`;
}

function main() {
  const name = process.argv[2];
  if (!name) throw new Error('שימוש: node מונטי-קליטה/make_handover_doc.js <שם הסיכום, למשל פגישה_01> [--erik]');

  const jsonPath = path.join(SUM_DIR, name.replace(/\.json$/, '') + '.json');
  if (!fs.existsSync(jsonPath)) throw new Error('סיכום לא נמצא: ' + jsonPath);
  const d = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const forCoach = process.argv.includes('--erik');
  fs.mkdirSync(BUILD, { recursive: true });
  const base = forCoach
    ? `סיכום פגישה ${(d.meeting.match(/\d+/) || [''])[0]} - אריק`
    : `חפיפת מונטי - ${d.meeting}`;
  const htmlPath = path.join(BUILD, base + '.html');
  const docxPath = path.join(process.env.USERPROFILE, 'Desktop', 'חפיפת מונטי', base + '.docx');

  fs.writeFileSync(htmlPath, '﻿' + (forCoach ? htmlCoach(d) : html(d)), 'utf8');
  console.log('✓ HTML:', htmlPath);

  const conv = spawnSync('powershell', ['-File', PS1, '-Step', 'convert', '-Html', htmlPath, '-Docx', docxPath],
    { encoding: 'utf8' });
  const out = (conv.stdout || '') + (conv.stderr || '');
  if (!/CONVERT_OK/.test(out)) throw new Error('המרת Word נכשלה:\n' + out.trim());
  console.log('✓ DOCX:', docxPath);

  if (process.argv.includes('--no-upload')) {
    console.log('\nדילוג על העלאה (--no-upload).');
    return;
  }
  // ההצלחה נקבעת לפי הכתובת שהודפסה ולא לפי קוד היציאה: כשחלון Chrome
  // נסגר מיד בתום ההעלאה, puppeteer מחזיר קוד שגיאה למרות שהקובץ עלה.
  const up = spawnSync(process.execPath, [path.join(ROOT, 'upload_to_drive.js'), docxPath, '--open'],
    { encoding: 'utf8' });
  const log = (up.stdout || '') + (up.stderr || '');
  process.stdout.write(log);
  const url = (log.match(/https:\/\/docs\.google\.com\/\S+/) || [])[0];
  if (!url) throw new Error('ההעלאה נכשלה — לא הוחזרה כתובת מסמך.');
  if (up.status !== 0) console.log(`\n⚠️ העלאה הצליחה אך הסתיימה בקוד ${up.status} (ככל הנראה חלון Chrome נסגר).`);
  console.log('\n🔗 ' + url);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('❌', e.message); process.exit(1); }
}
module.exports = { html };
