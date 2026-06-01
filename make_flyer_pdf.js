const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName, PDFString } = require('pdf-lib');

const DESKTOP = 'C:\\Users\\דין\\Desktop';
const URL = 'https://h5z.info-cloud.co.il/?p=zIEhPO1oCtz80ZodOivFSFz6S6JEHvJuxTqd5MCliGm1PUpS5uB%2FnlRNQ5qycaom';
const OUT_PDF = path.join(DESKTOP, 'מחנה_קיץ_כדוריד_2026.pdf');

function findFlyer() {
  const candidates = [];
  function walk(dir, depth) {
    if (depth > 2) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name.toLowerCase().includes('extension') || e.name === 'recording' || e.name === 'Claude-Workspace' || e.name === 'ANTIGRAVITY') continue;
        walk(full, depth + 1);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (['.png', '.jpg', '.jpeg'].includes(ext)) {
          try {
            const st = fs.statSync(full);
            candidates.push({ full, mtime: st.mtimeMs, size: st.size });
          } catch {}
        }
      }
    }
  }
  walk(DESKTOP, 0);
  const filtered = candidates.filter(c => c.size > 30000);
  filtered.sort((a, b) => b.mtime - a.mtime);
  return filtered;
}

async function main() {
  const list = findFlyer();
  console.log('Candidates:');
  list.slice(0, 10).forEach(c => console.log(' -', new Date(c.mtime).toISOString(), Math.round(c.size/1024)+'KB', c.full));

  let chosen = list.find(c => /WhatsApp Image 2026-06-01 at 19\.52\.35/.test(c.full));
  if (!chosen) chosen = list[0];
  if (!chosen) throw new Error('No image found on Desktop');
  console.log('\nUsing:', chosen.full);

  const imgBytes = fs.readFileSync(chosen.full);
  const ext = path.extname(chosen.full).toLowerCase();

  const pdfDoc = await PDFDocument.create();
  const img = (ext === '.png')
    ? await pdfDoc.embedPng(imgBytes)
    : await pdfDoc.embedJpg(imgBytes);

  const W = img.width, H = img.height;
  console.log('Image size:', W, 'x', H);

  const page = pdfDoc.addPage([W, H]);
  page.drawImage(img, { x: 0, y: 0, width: W, height: H });

  // Blue "קישור הרשמה למחנה קיץ" button — calibrated for the 768x1024 flyer
  const btnW = W * 0.60;
  const btnH = H * 0.055;
  const btnCx = W * 0.50;
  const btnCy_topDown = H * 0.815;
  const x1 = btnCx - btnW / 2;
  const x2 = btnCx + btnW / 2;
  const y1 = H - (btnCy_topDown + btnH / 2);
  const y2 = H - (btnCy_topDown - btnH / 2);
  console.log('Link rect:', { x1, y1, x2, y2 });

  const linkAnnotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x1, y1, x2, y2],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(URL) },
  });
  const linkRef = pdfDoc.context.register(linkAnnotation);
  page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkRef]));

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(OUT_PDF, pdfBytes);
  console.log('\nWrote PDF:', OUT_PDF, '(' + Math.round(pdfBytes.length/1024) + ' KB)');
}

main().catch(err => { console.error(err); process.exit(1); });
