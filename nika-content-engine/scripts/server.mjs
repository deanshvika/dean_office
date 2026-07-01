// לוח בקרה מקומי — שרת http דק שעוטף את המנוע.
// שימוש: node scripts/server.mjs  → http://localhost:5178
import http from 'http';
import os from 'os';
import { p, fs, path, loadDay, bank, iconSvg } from './lib.mjs';
import { validateDay } from './validate_page.mjs';
import { renderAll } from '../templates/render.mjs';
import { createRenderer } from './render_pdf.mjs';
import { createRequire } from 'module';
import yaml from 'js-yaml';

const require = createRequire(import.meta.url);
const { PDFDocument } = require('pdf-lib');

const PORT = process.env.PORT || 5178;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const send = (res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5e6) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}

function config() {
  const b = bank();
  const items = Object.entries(b.items).map(([key, v]) => ({ key, he: v.plain, en: v.en, hasIcon: !!iconSvg(key) }));
  const listLabels = (g) => Object.fromEntries(Object.entries(b[g]).map(([k, v]) => [k, v.plain]));
  const days = fs.existsSync(p('curriculum', 'days'))
    ? fs.readdirSync(p('curriculum', 'days')).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, ''))
    : [];
  return {
    items,
    subjects: listLabels('subjects'),
    grades: listLabels('grades'),
    levels: listLabels('levels'),
    reflections: listLabels('success_reflection'),
    days,
  };
}

async function buildPdf(spec) {
  const pages = renderAll(spec);
  const tmp = path.join(os.tmpdir(), `nika_${spec.day_id || 'day'}_${process.pid}`);
  fs.mkdirSync(tmp, { recursive: true });
  const renderer = await createRenderer();
  const pdfPaths = [];
  try {
    for (const [key, html] of Object.entries(pages)) {
      const f = path.join(tmp, `${key}.pdf`);
      await renderer.toPdf(html, f);
      pdfPaths.push(f);
    }
  } finally { await renderer.close(); }
  const merged = await PDFDocument.create();
  for (const f of pdfPaths) {
    const src = await PDFDocument.load(fs.readFileSync(f));
    (await merged.copyPages(src, src.getPageIndices())).forEach((pg) => merged.addPage(pg));
  }
  const bytes = Buffer.from(await merged.save());
  fs.rmSync(tmp, { recursive: true, force: true });
  return bytes;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = url.pathname;

    // ── static ──
    if (req.method === 'GET' && (route === '/' || route === '/index.html'))
      return send(res, 200, fs.readFileSync(p('app', 'index.html')), { 'Content-Type': MIME['.html'] });
    if (req.method === 'GET' && route.startsWith('/app/')) {
      const f = p(route.replace(/^\//, ''));
      if (fs.existsSync(f)) return send(res, 200, fs.readFileSync(f), { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      return send(res, 404, 'not found');
    }

    // ── API ──
    if (req.method === 'GET' && route === '/api/config') return json(res, 200, config());

    if (req.method === 'GET' && route.startsWith('/api/day/')) {
      const id = decodeURIComponent(route.slice('/api/day/'.length));
      const f = p('curriculum', 'days', `${id}.yaml`);
      if (!fs.existsSync(f)) return json(res, 404, { error: 'day not found' });
      return json(res, 200, loadDay(id));
    }

    if (req.method === 'POST' && route === '/api/render') {
      const spec = await readBody(req);
      let validation, html = {};
      try { validation = validateDay(spec); } catch (e) { validation = { pass: false, errors: [{ page: 'root', msg: e.message }], warn: [] }; }
      try { html = renderAll(spec); } catch (e) { html = { error: `<div style="padding:2rem;color:#E91E63;font-family:sans-serif">שגיאת רינדור: ${e.message}</div>` }; }
      return json(res, 200, { validation, html });
    }

    if (req.method === 'POST' && route === '/api/pdf') {
      const spec = await readBody(req);
      const v = validateDay(spec);
      if (!v.pass) return json(res, 400, { error: 'validation failed', validation: v });
      const bytes = await buildPdf(spec);
      return send(res, 200, bytes, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${spec.day_id || 'nika_day'}.pdf"`,
      });
    }

    if (req.method === 'POST' && route === '/api/save') {
      const spec = await readBody(req);
      if (!spec.day_id) return json(res, 400, { error: 'day_id חסר' });
      const v = validateDay(spec);
      const f = p('curriculum', 'days', `${spec.day_id}.yaml`);
      fs.writeFileSync(f, yaml.dump(spec, { lineWidth: -1, noRefs: true }), 'utf8');
      return json(res, 200, { saved: `curriculum/days/${spec.day_id}.yaml`, validation: v });
    }

    return send(res, 404, 'not found');
  } catch (e) {
    return json(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`\n  🎨 לוח הבקרה של NIKA רץ על:  http://localhost:${PORT}\n  (Ctrl+C לעצירה)\n`);
});
