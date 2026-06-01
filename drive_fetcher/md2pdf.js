// md2pdf.js — Convert the Yemey Shia stations summary MD to a Hebrew/RTL PDF
// on the user's Desktop, using puppeteer-core + the local Chrome.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { marked } = require('marked');
const puppeteer = require('puppeteer-core');

const MD_PATH = 'c:\\Users\\דין\\Desktop\\ANTIGRAVITY\\המוח השני\\תחנות_ימי_שיא_סיכום_מהיר.md';
const PDF_PATH = path.join(os.homedir(), 'Desktop', 'תחנות_ימי_שיא_סיכום_מהיר_v2.pdf');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const md = fs.readFileSync(MD_PATH, 'utf8');
const htmlBody = marked.parse(md);

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>תחנות ימי שיא</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body {
    font-family: "Segoe UI", "Arial", "David", sans-serif;
    direction: rtl;
    color: #1a1a1a;
    line-height: 1.55;
    font-size: 11pt;
  }
  h1 {
    font-size: 20pt;
    color: #0b3d91;
    border-bottom: 2px solid #0b3d91;
    padding-bottom: 6px;
    margin-top: 0;
  }
  h2 {
    font-size: 14pt;
    color: #0b3d91;
    margin-top: 18px;
    margin-bottom: 6px;
    border-right: 4px solid #0b3d91;
    padding-right: 8px;
    background: #f0f4fb;
    padding: 6px 10px;
    page-break-after: avoid;
  }
  h3 { font-size: 12pt; color: #333; margin-top: 12px; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0; padding-right: 22px; }
  li { margin: 3px 0; }
  hr {
    border: none;
    border-top: 1px dashed #bbb;
    margin: 14px 0;
  }
  strong { color: #0b3d91; }
  code, kbd {
    background: #f4f4f4;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: Consolas, monospace;
    font-size: 10pt;
  }
  /* Keep each station together when possible */
  h2 + p, h2 + ul { page-break-before: avoid; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;

const HTML_TMP = path.join(__dirname, '_tmp.html');
fs.writeFileSync(HTML_TMP, html, 'utf8');

(async () => {
  console.log('Launching Chrome (headless) to render PDF...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('file:///' + HTML_TMP.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    margin: { top: '18mm', right: '16mm', bottom: '18mm', left: '16mm' },
    printBackground: true,
  });
  await browser.close();
  try { fs.unlinkSync(HTML_TMP); } catch {}
  console.log('Saved:', PDF_PATH);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
