// אורקסטרטור: load spec → validate → render 4 עמודים → output + report.
// שימוש:
//   node scripts/run_batch.mjs --day grade_1_math_day_1
//   node scripts/run_batch.mjs --day <id> --force   (רינדור גם אם ולידציה נכשלה)
import { p, fs, path, loadDay } from './lib.mjs';
import { validateDay } from './validate_page.mjs';
import { renderAll } from '../templates/render.mjs';
import { createRenderer } from './render_pdf.mjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');   // מ-node_modules של תיקיית האב

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (!v || v.startsWith('--')) ? true : v;
}

async function main() {
  const dayId = arg('day');
  const force = !!arg('force', false);
  if (!dayId) { console.error('שימוש: node scripts/run_batch.mjs --day <day_id>'); process.exit(2); }

  const spec = loadDay(dayId);
  const outDir = p('output', spec.audience, dayId);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n▶ ${dayId}  (${spec.subject} · ${spec.audience})`);

  // 1) ולידציה
  const v = validateDay(spec);
  const reportLines = [`# דוח הפקה — ${dayId}`, '', `תאריך הרצה: ${arg('stamp', '(ראה שם הקובץ)')}`, '',
    `## ולידציה: ${v.pass ? 'PASS ✔' : 'FAIL ✗'}`, ''];
  if (v.errors.length) { reportLines.push('### שגיאות'); v.errors.forEach((e) => reportLines.push(`- [${e.page}] ${e.msg}`)); reportLines.push(''); }
  if (v.warn.length) { reportLines.push('### אזהרות'); v.warn.forEach((w) => reportLines.push(`- [${w.page}] ${w.msg}`)); reportLines.push(''); }
  console.log(`  ולידציה: ${v.pass ? 'PASS ✔' : `FAIL ✗ (${v.errors.length} שגיאות)`}`);
  v.errors.forEach((e) => console.log(`     [${e.page}] ${e.msg}`));

  if (!v.pass && !force) {
    reportLines.push('**רינדור דולג — ולידציה נכשלה.** (הרץ עם --force לעקיפה)');
    fs.writeFileSync(path.join(outDir, 'validation_report.md'), reportLines.join('\n'), 'utf8');
    console.log('  ✗ רינדור דולג (ולידציה נכשלה). דוח נכתב.');
    process.exit(1);
  }

  // 2) רינדור
  const pages = renderAll(spec);
  const renderer = await createRenderer();
  const produced = [];
  reportLines.push('## קבצים שהופקו', '');
  for (const [key, html] of Object.entries(pages)) {
    const htmlPath = path.join(outDir, `${key}.html`);
    const pdfPath = path.join(outDir, `${key}.pdf`);
    const pngPath = path.join(outDir, `${key}.png`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    await renderer.toPdf(html, pdfPath);
    await renderer.toPng(html, pngPath);
    produced.push(pdfPath);
    reportLines.push(`- ${key}: html + pdf + png ✔`);
    console.log(`  ✔ ${key} → html/pdf/png`);
  }
  await renderer.close();

  // 3) מיזוג ל-PDF יומי מלא
  const merged = await PDFDocument.create();
  for (const pdfPath of produced) {
    const src = await PDFDocument.load(fs.readFileSync(pdfPath));
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((pg) => merged.addPage(pg));
  }
  const fullPath = path.join(outDir, `${dayId}_full.pdf`);
  fs.writeFileSync(fullPath, await merged.save());
  reportLines.push('', `**PDF מאוחד:** ${dayId}_full.pdf (${produced.length} עמודים)`);
  console.log(`  ✔ PDF מאוחד: ${dayId}_full.pdf`);

  fs.writeFileSync(path.join(outDir, 'validation_report.md'), reportLines.join('\n'), 'utf8');
  console.log(`  📁 ${outDir}\n`);
}

main().catch((e) => { console.error('שגיאה:', e); process.exit(1); });
