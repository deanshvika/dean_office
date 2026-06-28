// Generate "End of Season" handball flyer from scratch (blue sporty style).
// sharp renders SVG via librsvg+Pango, which handles Hebrew RTL/BiDi correctly.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

const W = 900, H = 1190;
const DESKTOP = 'C:\\Users\\דין\\Desktop';
const OUT_PNG = path.join(__dirname, 'flyer_siyum.png');
const OUT_PDF = path.join(DESKTOP, 'פלייר_סיום_עונה_כדוריד_2026.pdf');

const FONT = `'Arial', 'Segoe UI', sans-serif`;

// ---- helpers -----------------------------------------------------------
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Right-aligned Hebrew: anchor="end" puts x at the visual LEFT; for RTL we want
// the text's right edge fixed, so use anchor="start" (start = right in rtl).
function txt(content, x, y, { size = 30, weight = 'normal', fill = '#fff', anchor = 'middle', spacing = 0, opacity = 1 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}"
    fill="${fill}" fill-opacity="${opacity}" text-anchor="${anchor}" direction="rtl"
    letter-spacing="${spacing}" xml:lang="he">${esc(content)}</text>`;
}
function card(x, y, w, h, r = 22) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}"
    fill="#0a1f47" fill-opacity="0.55" stroke="#5b86c9" stroke-opacity="0.5" stroke-width="1.5"/>`;
}

// ---- background --------------------------------------------------------
const defs = `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0%"  stop-color="#1b4fa0"/>
    <stop offset="45%" stop-color="#123c7e"/>
    <stop offset="100%" stop-color="#0a224d"/>
  </linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#caa24a"/>
    <stop offset="50%" stop-color="#f4dd8e"/>
    <stop offset="100%" stop-color="#b8862f"/>
  </linearGradient>
  <radialGradient id="vig" cx="0.5" cy="0.35" r="0.9">
    <stop offset="60%" stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000" stop-opacity="0.35"/>
  </radialGradient>
</defs>`;

// faint handball-court line art
const ST = 'stroke="#9db9e6" stroke-opacity="0.12" fill="none"';
const court = `
  <circle cx="${W/2}" cy="${H*0.42}" r="150" ${ST} stroke-width="2"/>
  <circle cx="${W/2}" cy="${H*0.42}" r="95"  ${ST} stroke-width="2"/>
  <line x1="0" y1="${H*0.42}" x2="${W}" y2="${H*0.42}" ${ST} stroke-width="2"/>
  <path d="M ${W} ${H*0.18} A 230 230 0 0 0 ${W} ${H*0.66}" ${ST} stroke-width="2"/>
  <path d="M 0 ${H*0.20} A 200 200 0 0 1 0 ${H*0.64}" ${ST} stroke-width="2"/>
  <circle cx="${W*0.16}" cy="${H*0.30}" r="60" ${ST} stroke-width="2"/>
`;

// decorative whistle-ish gold ball motif lower-left
const ball = `
  <circle cx="${W*0.17}" cy="${H*0.50}" r="78" stroke="#e9c463" stroke-opacity="0.30" stroke-width="3" fill="none"/>
  <path d="M ${W*0.10} ${H*0.46} L ${W*0.24} ${H*0.54} M ${W*0.10} ${H*0.54} L ${W*0.24} ${H*0.46}"
    stroke="#e9c463" stroke-opacity="0.25" stroke-width="3"/>
`;

// ---- logo (top-left, approximate the colorful municipal fan) -----------
const logo = `
  <rect x="28" y="26" width="232" height="104" rx="14" fill="#ffffff"/>
  <g transform="translate(70,58)">
    <path d="M0 28 Q-4 6 8 0  Q14 14 6 28 Z" fill="#e94b8a"/>
    <path d="M10 30 Q8 4 22 2  Q26 18 18 30 Z" fill="#f29c1f"/>
    <path d="M22 30 Q22 2 36 4  Q38 20 30 30 Z" fill="#27ae60"/>
    <path d="M34 30 Q36 4 50 8  Q50 22 42 30 Z" fill="#2e86de"/>
  </g>
  <text x="244" y="92"  font-family="${FONT}" font-size="20" font-weight="bold" fill="#16407f" text-anchor="end" direction="rtl">החברה העירונית רחובות</text>
  <text x="244" y="116" font-family="${FONT}" font-size="15" fill="#33557f" text-anchor="end" direction="rtl">לתרבות, ספורט וחופש</text>
`;

// ---- title (top-right) -------------------------------------------------
const TX = 858; // right edge for title
const title = `
  ${txt('סיום עונה', TX, 120, { size: 58, weight: 'bold', anchor: 'start' })}
  ${txt('בית הספר לכדור יד', TX, 184, { size: 52, weight: 'bold', anchor: 'start' })}
  ${txt('ומחלקת הנוער', TX, 246, { size: 52, weight: 'bold', anchor: 'start' })}
  ${txt('עירוני רחובות', TX, 312, { size: 46, weight: 'bold', fill: '#f4dd8e', anchor: 'start' })}
`;

// ---- info cards --------------------------------------------------------
let y = 380;
const cards = `
  ${card(300, y, 558, 84)}
  ${txt('📅', 826, y + 54, { size: 34, anchor: 'middle' })}
  ${txt('יום שלישי  |  23.6.2026', 786, y + 53, { size: 34, weight: 'bold', anchor: 'start' })}

  ${card(300, y + 104, 558, 116)}
  ${txt('📍', 826, y + 162, { size: 34 })}
  ${txt("אולם 'קציר' רחובות", 786, y + 150, { size: 31, weight: 'bold', anchor: 'start' })}
  ${txt('מיכאל כהן 2 פינת חנה אברך', 786, y + 192, { size: 26, anchor: 'start' })}

  ${card(300, y + 240, 558, 84)}
  ${txt('🕐', 826, y + 294, { size: 34 })}
  ${txt('17:00 - 18:30', 786, y + 294, { size: 36, weight: 'bold', anchor: 'start' })}
`;

// ---- highlight white box ----------------------------------------------
let hy = 780;
const highlight = `
  <rect x="120" y="${hy}" width="660" height="118" rx="20" fill="#ffffff"/>
  ${txt('משחקים משולבים', 450, hy + 48, { size: 34, weight: 'bold', fill: '#16407f' })}
  ${txt('של ילדי בית הספר ושחקני מחלקת הנוער', 450, hy + 92, { size: 26, fill: '#1c2a40' })}
`;

// ---- ceremony line (gold) ---------------------------------------------
const ceremony = `
  ${txt('🏆  18:30 — טקס חלוקת תשורות', 450, 952, { size: 34, weight: 'bold', fill: '#f4dd8e' })}
  ${txt('מוזמנים בני משפחה, חברים ומורים — לחגוג יחד!', 450, 1000, { size: 25, fill: '#dce6f7' })}
`;

// ---- footer contacts ---------------------------------------------------
const fy = 1060;
const footer = `
  <rect x="0" y="${fy}" width="${W}" height="${H - fy}" fill="#08193a"/>
  <line x1="60" y1="${fy + 18}" x2="${W - 60}" y2="${fy + 18}" stroke="#2d4a86" stroke-width="1.5"/>
  ${txt('לפרטים:', 450, fy + 56, { size: 24, fill: '#9db9e6' })}
  ${txt('📞 אמיתי דיין  0544667652', 660, fy + 100, { size: 26, weight: 'bold', anchor: 'start' })}
  ${txt('📞 דין שויקה  0525320400', 360, fy + 100, { size: 26, weight: 'bold', anchor: 'start' })}
`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${defs}
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${court}
  ${ball}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  ${logo}
  ${title}
  ${cards}
  ${highlight}
  ${ceremony}
  ${footer}
</svg>`;

async function main() {
  await sharp(Buffer.from(svg)).png().toFile(OUT_PNG);
  console.log('Wrote', OUT_PNG);

  const png = fs.readFileSync(OUT_PNG);
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(png);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const bytes = await pdf.save();
  let out = OUT_PDF, n = 1;
  while (true) {
    try { fs.writeFileSync(out, bytes); break; }
    catch (e) { if (e.code === 'EBUSY' || e.code === 'EPERM') { out = OUT_PDF.replace('.pdf', `_v${++n}.pdf`); continue; } throw e; }
  }
  console.log('Wrote', out, Math.round(bytes.length / 1024) + ' KB');
}
main().catch(e => { console.error(e); process.exit(1); });