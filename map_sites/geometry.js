'use strict';
/** הכנת גאומטריה למפות: היטל, פישוט, ובניית מצולע הים מקו החוף. */

const { itmToWgs84 } = require('./geo_util.js');

/**
 * היטל שווה־מרחקים עם תיקון cos(lat).
 * בקנה מידה של גוש דן העיוות זניח, והפשטות שווה את זה.
 */
function makeProjection(bbox, width, padding) {
  const latMid = (bbox.latMin + bbox.latMax) / 2;
  const kx = Math.cos(latMid * Math.PI / 180);
  const spanX = (bbox.lonMax - bbox.lonMin) * kx;
  const spanY = bbox.latMax - bbox.latMin;
  const inner = width - padding * 2;
  const scale = inner / spanX;
  const height = spanY * scale + padding * 2;
  const project = (lat, lon) => [
    padding + (lon - bbox.lonMin) * kx * scale,
    padding + (bbox.latMax - lat) * scale,
  ];
  project.width = width;
  project.height = height;
  project.scale = scale;
  /** כמה מעלות רוחב שוות פיקסל אחד — לכיול סף הפישוט. */
  project.degPerPx = 1 / scale;
  return project;
}

/** Douglas–Peucker על מערך [x,y] בפיקסלים. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const sqTol = tolerance * tolerance;
  const sqSegDist = (p, a, b) => {
    let [x, y] = a;
    let dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = 0, index = -1;
    for (let i = first + 1; i < last; i++) {
      const sq = sqSegDist(points[i], points[first], points[last]);
      if (sq > maxSq) { maxSq = sq; index = i; }
    }
    if (maxSq > sqTol && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** מסלול SVG ממערך נקודות מוטלות. */
function toPath(points, close, decimals = 1) {
  if (!points.length) return '';
  const f = n => Number(n.toFixed(decimals));
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 1; i < points.length; i++) d += `L${f(points[i][0])} ${f(points[i][1])}`;
  return close ? d + 'Z' : d;
}

/** מטיל, מפשט ומחזיר מסלול — הצינור המלא לקו יחיד. */
function lineToPath(coords, project, tolerance, close) {
  const pts = coords.map(([lat, lon]) => project(lat, lon));
  return toPath(simplify(pts, tolerance), close);
}

/** ממיר טבעות מצולע ITM (שכבת השכונות של ת"א) לזוגות [lat,lon]. */
function ringsToLatLon(rings) {
  return rings.map(ring => ring.map(([x, y]) => {
    const g = itmToWgs84(x, y);
    return [g.lat, g.lon];
  }));
}

/**
 * מצולע הים: נקודות קו החוף בתוך התיבה, ממוינות מצפון לדרום,
 * נסגרות לאורך הקצה המערבי של הבד. בקטע חוף מונוטוני כמו גוש דן זה מדויק דיו,
 * ונמנע מתפירת דרכי OSM שמגיעות בסדר שרירותי.
 */
function buildSeaPolygon(osm, bbox, margin = 0.04) {
  const pts = [];
  for (const el of osm.elements || []) {
    if (el.tags?.natural !== 'coastline' || !el.geometry) continue;
    for (const g of el.geometry) {
      if (g.lat >= bbox.latMin - margin && g.lat <= bbox.latMax + margin
        && g.lon >= bbox.lonMin - margin && g.lon <= bbox.lonMax + margin) {
        pts.push([g.lat, g.lon]);
      }
    }
  }
  pts.sort((a, b) => b[0] - a[0]); // מצפון לדרום
  if (!pts.length) return [];
  const west = bbox.lonMin - margin;
  return [
    [bbox.latMax + margin, west],
    [pts[0][0], west],
    ...pts,
    [pts[pts.length - 1][0], west],
    [bbox.latMin - margin, west],
  ];
}

/** מוציא קווים לפי מסנן תגיות מתוך תוצאת Overpass. */
function osmLines(osm, predicate) {
  return (osm.elements || [])
    .filter(el => el.geometry && predicate(el.tags || {}))
    .map(el => el.geometry.map(g => [g.lat, g.lon]));
}

module.exports = {
  makeProjection, simplify, toPath, lineToPath, ringsToLatLon, buildSeaPolygon, osmLines,
};
