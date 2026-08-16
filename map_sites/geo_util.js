'use strict';
/**
 * כלי עזר גאוגרפיים למפת המוקדים.
 *
 * ITM (Israel Transverse Mercator, EPSG:2039) → WGS84.
 * שכבת ה-GIS של עיריית ת"א מחזירה גאומטריה ב-wkid 2039 בלבד, בלי lat/lon,
 * ולכן צריך את ההיפוך המלא. הפרמטרים הם התקן הרשמי של EPSG:2039.
 */

const A = 6378137.0;                    // GRS80 semi-major
const F = 1 / 298.257222101;            // GRS80 flattening
const LAT0 = 31.734393611111 * Math.PI / 180;   // 31°44'03.8170"N
const LON0 = 35.204516944444 * Math.PI / 180;   // 35°12'16.2610"E
const K0 = 1.0000067;
const FE = 219529.584;                  // false easting
const FN = 626907.390;                  // false northing

const E2 = 2 * F - F * F;
const EP2 = E2 / (1 - E2);

/** אורך קשת מרידיאן מקו המשווה עד קו רוחב phi (רדיאנים). */
function meridionalArc(phi) {
  return A * (
    (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * phi
    - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi)
  );
}

const M0 = meridionalArc(LAT0);

/** ITM → WGS84. מחזיר { lat, lon } במעלות. */
function itmToWgs84(east, north) {
  const M = M0 + (north - FN) / K0;
  const mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));

  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const C1 = EP2 * cosPhi1 ** 2;
  const T1 = tanPhi1 ** 2;
  const denom = 1 - E2 * sinPhi1 ** 2;
  const N1 = A / Math.sqrt(denom);
  const R1 = A * (1 - E2) / denom ** 1.5;
  const D = (east - FE) / (N1 * K0);

  const phi = phi1 - (N1 * tanPhi1 / R1) * (
    D ** 2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6 / 720
  );

  const lam = LON0 + (
    D
    - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5 / 120
  ) / cosPhi1;

  return { lat: phi * 180 / Math.PI, lon: lam * 180 / Math.PI };
}

/** מרחק בקו אווירי בין שתי נקודות, במטרים (haversine). */
function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * נרמול שם מוסד לצורך התאמה.
 * מטפל בקידומות ("בית ספר"/"בי״ס"), בגרשיים בכל הווריאציות שלהם,
 * ובכתיב מלא/חסר (נווה↔נוה) שהוא מקור התקלה המוכח מול מאגר משרד החינוך.
 */
function normalizeName(raw) {
  return String(raw || '')
    .replace(/[֑-ׇ]/g, '')            // ניקוד וטעמים
    .replace(/["'`׳״]/g, '')                    // גרשיים בכל הצורות
    .replace(/[־–—-]/g, ' ')                    // מקפים
    .replace(/\bבית ה?ספר\b/g, '')
    .replace(/\bביה?["׳״]?ס\b/g, '')
    .replace(/\bבי["׳״]?ס\b/g, '')
    .replace(/\bחט["׳״]?ב\b/g, '')
    .replace(/\bחטב\b/g, '')
    .replace(/\bממלכתי\b|\bממ["׳״]?ד\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** צורת כתיב חסר — מכווץ וו→ו ו-יי→י, כדי לגשר על נווה/נוה. */
function ktivChaser(name) {
  return name.replace(/וו/g, 'ו').replace(/יי/g, 'י');
}

/** ציון דמיון גס בין שני שמות: יחס הטוקנים המשותפים. */
function nameSimilarity(a, b) {
  const ta = new Set(normalizeName(ktivChaser(a)).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(ktivChaser(b)).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

module.exports = { itmToWgs84, distanceMeters, normalizeName, ktivChaser, nameSimilarity };
