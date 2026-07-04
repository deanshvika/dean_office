// אורקסטרטור דפי-אות אנגלית — validate → render (PDF+PNG) → A4 check → מיזוג A–Z.
// שימוש:
//   node scripts/run_letters.mjs --letter B      (אות אחת)
//   node scripts/run_letters.mjs --all           (כל A–Z + PDF מאוחד)
import { p, fs, path, loadYaml } from './lib.mjs';
import { validateLetter } from './validate_letters.mjs';
import { renderLetterPage } from '../templates/letter_render.mjs';
import { createRenderer } from './render_pdf.mjs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); if (i === -1) return null; const v = process.argv[i + 1]; return (!v || v.startsWith('--')) ? true : v; };

async function main() {
  const one = arg('letter');
  const all = !!arg('all');
  if (!one && !all) { console.error('שימוש: node scripts/run_letters.mjs --letter B | --all'); process.exit(2); }

  const bank = loadYaml(p('content_banks', 'letters_words.yaml')).letters;
  const letters = all ? Object.keys(bank) : [String(one).toUpperCase()];

  const outDir = p('output', 'letters');
  fs.mkdirSync(outDir, { recursive: true });

  const A4_H = 1122.5;
  const overflows = [];
  const producedPdfs = [];
  const renderer = await createRenderer();

  for (const L of letters) {
    const v = validateLetter(L);
    if (!v.pass) { console.log(`  ✗ ${L} — ולידציה נכשלה:`); v.errors.forEach((e) => console.log(`     ${e}`)); continue; }
    const html = renderLetterPage(L);
    const htmlPath = path.join(outDir, `letter_${L}.html`);
    const pdfPath = path.join(outDir, `letter_${L}.pdf`);
    const pngPath = path.join(outDir, `letter_${L}.png`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    await renderer.toPdf(html, pdfPath);
    const h = await renderer.toPng(html, pngPath);
    const over = h > A4_H + 8;
    if (over) overflows.push(`${L} (${Math.round(h)}px)`);
    producedPdfs.push(pdfPath);
    console.log(`  ${over ? '⚠' : '✔'} ${L} → pdf/png${over ? `  ⚠⚠ גלישת A4: ${Math.round(h)}px!` : ''}`);
  }
  await renderer.close();

  // מיזוג ל-PDF מאוחד (רק ב---all)
  if (all && producedPdfs.length) {
    const merged = await PDFDocument.create();
    for (const pdfPath of producedPdfs) {
      const src = await PDFDocument.load(fs.readFileSync(pdfPath));
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach((pg) => merged.addPage(pg));
    }
    const fullPath = path.join(outDir, 'NIKA_english_letters_A-Z.pdf');
    fs.writeFileSync(fullPath, await merged.save());
    console.log(`\n  ✔ PDF מאוחד: NIKA_english_letters_A-Z.pdf (${producedPdfs.length} עמודים)`);
  }

  if (overflows.length) console.log(`\n  ⚠⚠⚠ גלישת A4: ${overflows.join(' · ')} — צמצם תוכן!`);
  else console.log(`\n  ✔ A4 תקין בכל הדפים.`);
  console.log(`  📁 ${outDir}`);
}

main().catch((e) => { console.error('שגיאה:', e); process.exit(1); });
