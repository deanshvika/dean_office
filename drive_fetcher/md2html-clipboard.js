// md2html-clipboard.js — Convert the MD to clean HTML, write to a file
// that PowerShell will then load into the Windows clipboard with HTML format.

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const MD_PATH = 'c:\\Users\\דין\\Desktop\\ANTIGRAVITY\\המוח השני\\תחנות_ימי_שיא_סיכום_מהיר.md';
const OUT_PATH = path.join(__dirname, '_clip.html');

const md = fs.readFileSync(MD_PATH, 'utf8');
const body = marked.parse(md);

// Google Docs respects basic inline styling on paste, but most layout CSS is
// stripped. Keep things simple: structural HTML + a small amount of inline
// style for headings.
const html = `<html dir="rtl"><body style="font-family:Arial,'Segoe UI',sans-serif;direction:rtl;text-align:right">
${body}
</body></html>`;

fs.writeFileSync(OUT_PATH, html, 'utf8');
console.log('Wrote:', OUT_PATH);
