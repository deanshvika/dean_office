// Visual preview of the text patch — bypasses RTL issues by drawing each Hebrew char
// individually at computed positions, identical to how pdf-lib would lay it out.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const DESKTOP = 'C:\\Users\\דין\\Desktop';
const INPUT_JPG = path.join(DESKTOP, 'WhatsApp Image 2026-06-01 at 19.52.35.jpeg');
const HEBREW_FONT = 'C:\\Windows\\Fonts\\arialbd.ttf';

async function main() {
  const meta = await sharp(INPUT_JPG).metadata();
  const W = meta.width, H = meta.height;

  const samp = await sharp(INPUT_JPG)
    .extract({ left: Math.round(W * 0.78), top: Math.round(H * 0.86), width: 1, height: 1 })
    .raw().toBuffer();
  const bg = `rgb(${samp[0]},${samp[1]},${samp[2]})`;

  const boxLeft = Math.round(W * 0.690);
  const boxTopImg = Math.round(H * 0.857);
  const boxWidth = Math.round(W * 0.215);
  const boxHeight = Math.round(H * 0.032);
  const fontSize = Math.round(H * 0.020);

  // Use pdf-lib's font measurements to know each char's advance width
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fs.readFileSync(HEBREW_FONT), { subset: false });

  const newText = 'אמיתי דיין.';
  const visualText = Array.from(newText).reverse().join('');
  const textWidth = font.widthOfTextAtSize(visualText, fontSize);
  const textRightX = boxLeft + boxWidth - 4;
  const textX = textRightX - textWidth;
  const baselineImgY = boxTopImg + Math.round(boxHeight * 0.78);

  // Build SVG that draws the white box + each char individually at its computed x position
  let chars = '';
  let xCursor = textX;
  for (const ch of visualText) {
    const w = font.widthOfTextAtSize(ch, fontSize);
    chars += `<text x="${xCursor}" y="${baselineImgY}" font-family="Arial" font-weight="bold" font-size="${fontSize}" fill="#111">${ch}</text>`;
    xCursor += w;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect x="${boxLeft}" y="${boxTopImg}" width="${boxWidth}" height="${boxHeight}" fill="${bg}" />
    ${chars}
  </svg>`;

  await sharp(INPUT_JPG)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toFile('preview_full.jpg');

  await sharp('preview_full.jpg')
    .extract({ left: 380, top: boxTopImg - 35, width: 388, height: boxHeight + 70 })
    .toFile('preview_zoom.png');

  console.log('Done. preview_zoom.png and preview_full.jpg written.');
}

main().catch(e => { console.error(e); process.exit(1); });
