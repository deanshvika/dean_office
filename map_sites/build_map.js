'use strict';
/**
 * בונה את עמוד מפת המוקדים → map_sites/מפת_מוקדים.html
 *
 * שתי מפות SVG סטטיות שנבנות מגאומטריה אמיתית:
 *   מפה A — תל אביב–יפו: 71 מצולעי שכונות מעיריית ת"א, קו חוף, ירקון, איילון
 *   מפה B — מרכז הארץ:   קו חוף + כל המוקדים בפריסה ארצית
 *
 * הרצה:  node map_sites/build_map.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { makeProjection, lineToPath, ringsToLatLon, buildSeaPolygon, osmLines } = require('./geometry.js');
const { renderHtml } = require('./render_html.js');

const HERE = __dirname;
const OUT = path.join(HERE, 'מפת_מוקדים.html');
const DEADLINE = new Date('2026-08-23T00:00:00+03:00');

// ---------------------------------------------------------------- נתונים

function getJson(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'nika-site-map/1.0' } }, r => {
      let d = ''; r.setEncoding('utf8');
      r.on('data', c => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

async function loadNeighborhoods() {
  const cache = path.join(HERE, 'ta_neighborhoods.json');
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const data = await getJson('https://gisn.tel-aviv.gov.il/GisOpenData/service.asmx/GetLayer'
    + '?layerCode=511&layerWhere=&projection=&xmax=&xmin=&ymax=&ymin=');
  const out = (data.features || []).map(f => ({
    name: String(f.attributes.shem_shchuna || '').replace(/^'(.+)$/, "$1'"),
    rings: ringsToLatLon(f.geometry.rings || []),
  }));
  fs.writeFileSync(cache, JSON.stringify(out));
  return out;
}

const { statusOf } = require('./presentation.js');

// ---------------------------------------------------------------- שיבוץ תוויות

/**
 * מציב תווית ליד כל סיכה במקום הפנוי הראשון.
 * ב-13 סיכות בקנה מידה עירוני יש התנגשויות ודאיות (בית צורי ושמיר במרחק 1.6 ק"מ),
 * ולכן שיבוץ נאיבי מימין לסיכה לא מספיק.
 */
function placeLabels(pins, bounds, opts = {}) {
  const boxes = [];
  // רוחב תו ממוצע ב-IBM Plex Sans Hebrew semibold, מכויל מול הרינדור בפועל.
  // אומדן נמוך מדי מייצר תיבות צרות מהטקסט, ושתי תוויות "לא חופפות" נדפסות זו על זו.
  const CH = opts.charWidth || 7.0, H = opts.lineHeight || 16, PAD = opts.pad || 12;
  const overlaps = (a, b) => !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
  const ordered = [...pins].sort((a, b) => a.y - b.y);
  for (const pin of ordered) {
    // מרווח נדיב בתיבה: שתי תוויות שנוגעות זו בזו נקראות כרצף אחד
    // (גלים רחובות וויצמן רחובות במרחק 1.2 ק"מ), ולכן קרבה נחשבת התנגשות
    const w = pin.name.length * CH + (opts.gutter || 10);
    const options = [
      { dx: -PAD, dy: 4, anchor: 'end' },
      { dx: PAD, dy: 4, anchor: 'start' },
      { dx: 0, dy: -PAD, anchor: 'middle' },
      { dx: 0, dy: PAD + 8, anchor: 'middle' },
      { dx: -PAD, dy: -PAD, anchor: 'end' },
      { dx: PAD, dy: -PAD, anchor: 'start' },
      { dx: -PAD, dy: PAD + 6, anchor: 'end' },
      { dx: PAD, dy: PAD + 6, anchor: 'start' },
    ];
    let placed = null;
    for (const o of options) {
      const cx = pin.x + o.dx, cy = pin.y + o.dy;
      const x1 = o.anchor === 'end' ? cx - w : o.anchor === 'start' ? cx : cx - w / 2;
      const box = { x1, x2: x1 + w, y1: cy - H * 0.75, y2: cy + H * 0.25 };
      if (box.x1 < 2 || box.x2 > bounds.w - 2 || box.y1 < 2 || box.y2 > bounds.h - 2) continue;
      if (boxes.some(b => overlaps(box, b))) continue;
      placed = { ...o, box };
      break;
    }
    if (!placed) placed = { ...options[0], box: null };
    if (placed.box) {
      boxes.push(placed.box);
      // אזור הלחיצה נצמד לטקסט עצמו, לא למרווח ההתנגשות המנופח
      const textW = pin.name.length * CH + 6;
      const cx = pin.x + placed.dx, cy = pin.y + placed.dy;
      const hx = placed.anchor === 'end' ? cx - textW : placed.anchor === 'start' ? cx : cx - textW / 2;
      placed.hit = { x: hx, y: cy - 11, w: textW, h: 15 };
    }
    pin.label = placed;
  }
  return pins;
}

// ---------------------------------------------------------------- מפה A · תל אביב

function buildTaMap(sites, nbhds, osm) {
  const W = 660, PAD = 16;
  // תיבה צמודה לגוף העיר — רצועת ים צרה להתמצאות, בלי שטח ריק בצפון ובמערב
  const bbox = { latMin: 32.0255, latMax: 32.1330, lonMin: 34.7465, lonMax: 34.8500 };
  const project = makeProjection(bbox, W, PAD);
  const H = project.height;
  const tol = 0.35;

  const sea = buildSeaPolygon(osm, bbox);
  const seaPath = lineToPath(sea, project, tol, true);

  const hot = new Set(sites.map(s => s.neighborhood).filter(Boolean));
  const landParts = [], hotParts = [];
  for (const n of nbhds) {
    for (const ring of n.rings) {
      const d = lineToPath(ring, project, tol, true);
      if (!d) continue;
      (hot.has(n.name) ? hotParts : landParts).push(d);
    }
  }

  const yarkon = osmLines(osm, t => t.waterway === 'river')
    .map(l => lineToPath(l, project, tol, false)).filter(Boolean).join(' ');
  const ayalon = osmLines(osm, t => t.ref === '20')
    .map(l => lineToPath(l, project, tol, false)).filter(Boolean).join(' ');

  const pins = placeLabels(sites.map(s => {
    const [x, y] = project(s.lat, s.lon);
    return { ...s, x, y, name: s.shortName, st: statusOf(s) };
  }), { w: W, h: H });

  // תוויות התמצאות. צפון העיר צפוף בסיכות, ולכן אין שם תווית שכונה —
  // שמות השכונות ממילא מופיעים בכל שורה ברשימות.
  const notes = [
    { lat: 32.1015, lon: 34.7960, text: 'הירקון', cls: 'water' },
    { lat: 32.0375, lon: 34.7530, text: 'יפו', cls: 'area' },
    { lat: 32.0800, lon: 34.7500, text: 'הים התיכון', cls: 'water' },
    { lat: 32.0880, lon: 34.8390, text: 'רמת גן', cls: 'out' },
    { lat: 32.0300, lon: 34.7930, text: 'בת ים / חולון', cls: 'out' },
    { lat: 32.0420, lon: 34.7875, text: 'איילון', cls: 'road' }, // הכביש עובר ב-lon 34.783 בקו רוחב הזה
  ].map(n => { const [x, y] = project(n.lat, n.lon); return { ...n, x, y }; });

  return { W, H, bbox, seaPath, landParts, hotParts, yarkon, ayalon, pins, notes };
}

// ---------------------------------------------------------------- מפה B · מרכז הארץ

function buildMetroMap(sites, nbhds, osm, taBbox) {
  const W = 700, PAD = 18;
  const bbox = { latMin: 31.838, latMax: 32.228, lonMin: 34.695, lonMax: 35.225 };
  const project = makeProjection(bbox, W, PAD);
  const H = project.height;
  const tol = 0.5;

  const seaPath = lineToPath(buildSeaPolygon(osm, bbox), project, tol, true);

  // קו המתאר של ת"א מכל מצולעי השכונות — מסמן את תחום מפה A
  const taOutline = nbhds.flatMap(n => n.rings)
    .map(r => lineToPath(r, project, tol, true)).filter(Boolean).join(' ');

  const pins = sites.map(s => {
    const [x, y] = project(s.lat, s.lon);
    return { ...s, x, y, st: statusOf(s), outside: !s.isTa };
  });

  // רק המוקדים שמחוץ לעיר מקבלים תווית. מוקדי ת"א נדחסים בתוך המסגרת —
  // הם מסומנים בלי שם, כי המפה הגדולה היא זו שמזהה אותם.
  const outsidePins = pins.filter(p => p.outside);
  placeLabels(outsidePins.map(p => Object.assign(p, { name: p.shortName })), { w: W, h: H },
    { charWidth: 6.3, lineHeight: 17, pad: 9, gutter: 14 });

  const [tx1, ty1] = project(taBbox.latMax, taBbox.lonMin);
  const [tx2, ty2] = project(taBbox.latMin, taBbox.lonMax);
  const frame = { x: tx1, y: ty1, w: tx2 - tx1, h: ty2 - ty1 };

  // סרגל קנה מידה — נותן משמעות למרחקים, ובעיקר לפער עד אריאל
  const KM = 10;
  const [sx0] = project(bbox.latMin, bbox.lonMin);
  const [sx1] = project(bbox.latMin, bbox.lonMin + KM / (111.32 * Math.cos(32 * Math.PI / 180)));
  const scale = { len: sx1 - sx0, km: KM, x: W - PAD - (sx1 - sx0), y: H - PAD - 4 };

  return { W, H, seaPath, taOutline, pins, frame, scale };
}

// ---------------------------------------------------------------- ראשי

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(HERE, 'sites_geo.json'), 'utf8'));
  const osm = JSON.parse(fs.readFileSync(path.join(HERE, 'osm_base.json'), 'utf8'));
  const fonts = JSON.parse(fs.readFileSync(path.join(HERE, 'fonts_inline.json'), 'utf8'));
  const nbhds = await loadNeighborhoods();

  const all = data.sites.filter(s => s.lat);
  const taSites = all.filter(s => s.isTa);
  const active = all.filter(s => s.status !== 'עוזב');
  const taActive = taSites.filter(s => s.status !== 'עוזב');
  const gaps = active.filter(s => s.certainty !== 'ודאי');
  const taGaps = taActive.filter(s => s.certainty !== 'ודאי');
  const daysLeft = Math.ceil((DEADLINE - new Date()) / 86400000);

  const mapA = buildTaMap(taSites, nbhds, osm);
  const mapB = buildMetroMap(all, nbhds, osm, mapA.bbox);

  const clusterOrder = ['צפון — מצפון לירקון', 'הצפון הישן והחדש', 'מרכז העיר', 'מזרח', 'דרום-מזרח', 'דרום', 'יפו'];
  const taByCluster = clusterOrder
    .map(c => ({ cluster: c, list: taSites.filter(s => s.cluster === c).sort((a, b) => b.lat - a.lat) }))
    .filter(g => g.list.length);
  const outside = all.filter(s => !s.isTa).sort((a, b) => b.lat - a.lat);

  fs.writeFileSync(OUT, renderHtml({
    mapA, mapB, fonts, all, taSites, active, taActive, gaps, taGaps,
    daysLeft, taByCluster, outside, data,
  }), 'utf8');

  console.log(`נכתב → ${path.relative(path.join(HERE, '..'), OUT)}  (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  console.log(`מפה A: ${mapA.W}×${Math.round(mapA.H)} · ${mapA.pins.length} סיכות · ${mapA.landParts.length + mapA.hotParts.length} מצולעי שכונה`);
  console.log(`מפה B: ${mapB.W}×${Math.round(mapB.H)} · ${mapB.pins.length} סיכות`);
}

module.exports = { main };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
