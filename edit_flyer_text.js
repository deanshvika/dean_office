// Build PDF: original flyer + 3 text replacements (name + 2 titles) + clickable link.
// Approach: use sharp+SVG to overlay text (librsvg/Pango handles Hebrew BiDi naturally),
// then re-embed the patched JPG into a PDF with the link annotation.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument, PDFName, PDFString } = require('pdf-lib');

const DESKTOP = 'C:\\Users\\דין\\Desktop';
const INPUT_JPG = path.join(DESKTOP, 'WhatsApp Image 2026-06-01 at 19.52.35.jpeg');
const PATCHED_JPG = path.join(DESKTOP, 'flyer_patched.jpg');
const OUT_PDF = path.join(DESKTOP, 'מחנה_קיץ_כדוריד_2026_v2.pdf');
const URL = 'https://h5z.info-cloud.co.il/?p=zIEhPO1oCtz80ZodOivFSFz6S6JEHvJuxTqd5MCliGm1PUpS5uB%2FnlRNQ5qycaom';

async function main() {
  const meta = await sharp(INPUT_JPG).metadata();
  const W = meta.width, H = meta.height;
  console.log('Input:', W + 'x' + H);

  const samp = await sharp(INPUT_JPG)
    .extract({ left: Math.round(W * 0.78), top: Math.round(H * 0.86), width: 1, height: 1 })
    .raw().toBuffer();
  const bg = `rgb(${samp[0]},${samp[1]},${samp[2]})`;

  // REDESIGN: rebuild both contact columns from scratch for visual consistency.
  // Cover both columns' text areas (but NOT the icons, separators, or phone number).
  //   Right column icon  ≈ x=700-740  → patch right column text up to x=695
  //   Middle column icon ≈ x=465-505  → patch middle column on both sides of icon
  //   Phone (left col)   ends at x≈205, phone icon x=215-255 — do not touch
  //   Vertical separators sit around x=265-275 and x=500-510 — keep them
  const patches = [
    { x: 513, y: 877, w: 182, h: 73 }, // right column (אמיתי) — name + title rows
    { x: 280, y: 877, w: 180, h: 73 }, // middle column (בני בן זקן) — name + title rows
  ];

  // One font family for both columns → visual unity. Calibri renders Hebrew cleanly
  // and is closer to the flyer's font than Arial.
  const fontFamily = `Calibri, 'Segoe UI', Tahoma, Arial, sans-serif`;
  const fontSizeName  = Math.round(H * 0.0215); // 22 — names (bold)
  const fontSizeTitle = Math.round(H * 0.0165); // 17 — titles (regular)
  const colorName  = '#0e0e10';
  const colorTitle = '#2b2b2e';

  // Vertical rhythm: name baseline y=898, title baseline y=926 — same for both columns
  const yName  = 898;
  const yTitle = 926;

  const texts = [
    // Right column (אמיתי דיין) — right-anchored at x=693 (just left of the icon)
    { content: 'אמיתי דיין.',                       x: 693, y: yName,  size: fontSizeName,  weight: 'bold',   color: colorName  },
    { content: 'מנהל מקצועי בית הספר לכדור-יד.',     x: 693, y: yTitle, size: fontSizeTitle, weight: 'normal', color: colorTitle },
    // Middle column (בני בן זקן) — right-anchored at x=458 (just left of the icon)
    { content: 'בני בן זקן.',                       x: 458, y: yName,  size: fontSizeName,  weight: 'bold',   color: colorName  },
    { content: 'מנהל מחלקת ספורט.',                  x: 458, y: yTitle, size: fontSizeTitle, weight: 'normal', color: colorTitle },
  ];

  const rectsSvg = patches.map(p =>
    `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${bg}" />`
  ).join('');

  // text-anchor="end" + no `direction` attribute: Pango will shape Hebrew RTL automatically
  // and "end" anchors the visual end (which for Hebrew/RTL is the LEFT side)... so we'd need
  // start. To be safe and avoid relying on librsvg's BiDi nuances, use unicode-bidi="plaintext"
  // which lets the paragraph direction follow the first strong character — Hebrew = RTL paragraph,
  // with text-anchor="end" meaning the visual end = the LEFT (last char rendered). Hmm.
  //
  // Cleanest: use direction="rtl" + text-anchor="start" — in RTL the "start" is the RIGHT edge,
  // which is exactly where I want to anchor.
  const textsSvg = texts.map(t =>
    `<text x="${t.x}" y="${t.y}"
           font-family="${fontFamily}"
           font-size="${t.size}"
           font-weight="${t.weight}"
           fill="${t.color}"
           direction="rtl"
           text-anchor="start"
           xml:lang="he"
           unicode-bidi="embed">${t.content}</text>`
  ).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${rectsSvg}
    ${textsSvg}
  </svg>`;

  await sharp(INPUT_JPG)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toFile(PATCHED_JPG);
  console.log('Wrote patched JPG:', PATCHED_JPG);

  // Rebuild PDF with patched image + clickable link
  const pdfDoc = await PDFDocument.create();
  const img = await pdfDoc.embedJpg(fs.readFileSync(PATCHED_JPG));
  const page = pdfDoc.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

  const btnW = img.width * 0.60;
  const btnH = img.height * 0.055;
  const btnCx = img.width * 0.50;
  const btnCy_topDown = img.height * 0.815;
  const x1 = btnCx - btnW / 2;
  const x2 = btnCx + btnW / 2;
  const y1 = img.height - (btnCy_topDown + btnH / 2);
  const y2 = img.height - (btnCy_topDown - btnH / 2);

  const linkAnnotation = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x1, y1, x2, y2],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(URL) },
  });
  const linkRef = pdfDoc.context.register(linkAnnotation);
  page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkRef]));

  // Write PDF (try v2 first; if locked, escalate to v3, v4, ...)
  let outPath = OUT_PDF, n = 2;
  const pdfBytes = await pdfDoc.save();
  while (true) {
    try {
      fs.writeFileSync(outPath, pdfBytes);
      break;
    } catch (e) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        n++;
        outPath = path.join(DESKTOP, `מחנה_קיץ_כדוריד_2026_v${n}.pdf`);
        continue;
      }
      throw e;
    }
  }
  console.log('Wrote PDF:', outPath, '(' + Math.round(pdfBytes.length / 1024) + ' KB)');

  // Crop verification region
  await sharp(PATCHED_JPG)
    .extract({ left: 180, top: 855, width: 588, height: 110 })
    .toFile('verify_contact.png');
  console.log('Wrote verify_contact.png');
}

main().catch(err => { console.error(err); process.exit(1); });
