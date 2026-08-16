'use strict';
/**
 * איסוף וגיאוקודינג של מוקדי ניקה ספורט → map_sites/sites_geo.json
 *
 * מקורות:
 *  1. שני גיבויי ה-CSV של הגיליונות (רוסטר, סטטוס, ימים, שעות, מאמנים)
 *  2. GIS עיריית ת"א שכבה 769 "בתי ספר תשפ"ז" — כתובת + ITM למוקדי ת"א/יפו
 *  3. data.gov.il "קואורדינטות מוסדות חינוך" — lat/lon ארצי למוקדים מחוץ לת"א
 *
 * הרצה:  node map_sites/build_sites_geo.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { itmToWgs84, normalizeName, ktivChaser, nameSimilarity, distanceMeters } = require('./geo_util.js');

const ROOT = path.join(__dirname, '..');
const BACKUP_ROOT = path.join(ROOT, 'גיבויי_גיליונות');
const OUT = path.join(__dirname, 'sites_geo.json');

/**
 * מאתר את הגיבוי העדכני ביותר של לשונית לפי שמה.
 *
 * לא נועלים תיקיית גיבוי אחת: קידומת שם הקובץ היא מזהה הגיליון, והוא משתנה
 * (גיליון השיבוץ הומר מ-XLSX לגיליון גוגל וקיבל מזהה חדש). חוץ מזה לא כל
 * ריצת גיבוי מכסה את שני הגיליונות, אז מחפשים כל לשונית בנפרד.
 */
function newestBackup(tabName) {
  if (!fs.existsSync(BACKUP_ROOT)) throw new Error(`אין תיקיית גיבויים: ${BACKUP_ROOT}`);
  const dirs = fs.readdirSync(BACKUP_ROOT)
    .filter(d => fs.statSync(path.join(BACKUP_ROOT, d)).isDirectory())
    .sort().reverse(); // חותמת הזמן בשם התיקייה ממיינת לקסיקוגרפית
  for (const d of dirs) {
    const hit = fs.readdirSync(path.join(BACKUP_ROOT, d))
      .find(f => f.endsWith(`__${tabName}.csv`));
    if (hit) return { file: path.join(BACKUP_ROOT, d, hit), stamp: d };
  }
  throw new Error(`לא נמצא גיבוי ללשונית "${tabName}" באף תיקייה תחת ${BACKUP_ROOT}`);
}

const GIS_LAYER = 769; // בתי ספר תשפ"ז
const MOE_RESOURCE = '5c5d6bb0-755d-470d-84b6-d7dd3135ba9c';

// ---------------------------------------------------------------- HTTP

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'nika-site-map/1.0', ...headers } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(getJson(res.headers.location, headers));
      }
      let d = '';
      res.setEncoding('utf8');
      res.on('data', c => (d += c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} · ${url}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(`JSON parse · ${url} · ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- CSV

/** מפרסר CSV עם שדות מצוטטים וגרשיים כפולים מוברחים (הפורמט שגוגל מייצא). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.some(v => v.trim()))
    .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

// ---------------------------------------------------------------- רוסטר

/**
 * מיפוי מפורש בין שני הגיליונות ואל מקורות הגאוגרפיה.
 * מפורש ולא fuzzy — 26 מוקדים, וטעות התאמה כאן שמה סיכה בעיר הלא נכונה.
 *
 *  gis        — תבנית LIKE לשכבת עיריית ת"א (מוקדי ת"א/יפו בלבד)
 *  moeQueries — וריאנטים לחיפוש במאגר משרד החינוך (מוקדים מחוץ לת"א)
 *  cityKey    — מפתח ל-CITY_BBOX, לפילוח מועמדים ארציים
 */
const ROSTER = [
  // ── תל אביב–יפו ──
  { id: 'beit_tzuri',  sites: 'בית ספר בית צורי',          assign: 'בית צורי',   gis: 'בית צורי' },
  { id: 'magen',       sites: 'בית ספר מגן',                assign: 'מגן',        gis: 'מגן' },
  { id: 'bloch',       sites: 'בית ספר בלוך',               assign: 'בלוך',       gis: 'בלוך' },
  { id: 'shamir',      sites: 'חט"ב שמיר',                  assign: 'חט"ב שמיר',  gis: 'יצחק שמיר חט' },
  { id: 'nofei_yam',   sites: 'בית ספר נופי ים',            assign: 'נופי ים',    gis: 'נופי ים' },
  { id: 'teva',        sites: 'בית הספר טבע',               assign: 'טבע',        gis: 'טבע' },
  { id: 'yehuda_mac',  sites: 'בית ספר יהודה מכבי',         assign: 'יהודה מכבי', gis: 'יהודה המכבי' },
  { id: 'alumot',      sites: 'בית ספר אלומות',             assign: 'אלומות',     gis: 'אלומות' },
  { id: 'kfir',        sites: 'בית ספר כפיר',               assign: 'כפיר',       gis: 'כפיר' },
  { id: 'rokach',      sites: 'בית ספר רוקח',               assign: 'רוקח',       gis: 'רוקח' },
  { id: 'gavrieli',    sites: 'בית ספר גבריאלי',            assign: 'גבריאלי',    gis: 'גבריאלי' },
  { id: 'givon',       sites: 'בית ספר גבעון',              assign: 'גבעון',      gis: 'גבעון' },
  { id: 'kulana',      sites: 'בית ספר כלנא',               assign: 'כלנא יחד',   gis: 'כולנא יחד' },

  // ── מחוץ לת"א ──
  { id: 'merhavim',    sites: 'בית ספר מרחבים יבנה',        assign: 'מרחבים',
    cityKey: 'יבנה',      moeQueries: ['מרחבים'] },
  { id: 'zeev_zvulun', sites: 'בית ספר זאב זבולון אוריאל',  assign: 'זאב זבולון',
    cityKey: 'אריאל',     moeQueries: ['אור זבולון', 'זבולון', 'זאב זבולון'] },
  { id: 'yohanani',    sites: 'בית ספר יוחנני',             assign: 'יוחנני',
    cityKey: 'הרצליה',    moeQueries: ['יוחנני'] },
  { id: 'hamatmid',    sites: 'בית ספר המתמיד',             assign: 'המתמיד',
    cityKey: 'רמת גן',    moeQueries: ['המתמיד', 'מתמיד'] },
  { id: 'neve_zemer',  sites: 'בית ספר נווה זמר',           assign: 'נווה זמר',
    cityKey: 'רעננה',     moeQueries: ['נוה זמר', 'נווה זמר', 'זמר'], semelOverride: 482539,
    verifiedBy: 'המאגר מאייית "נוה זמר" בכתיב חסר; שאר המועמד ברעננה ("זמר") הוא מוסד אחר' },
  { id: 'hadar_raan',  sites: 'הדר רעננה',                  assign: null,
    cityKey: 'רעננה',     moeQueries: ['הדר'], semelOverride: 413914,
    knownAddress: 'הגדוד העברי 9, רעננה',
    verifiedBy: 'שלושה מוסדות בשם "הדר" ברעננה; סמל 413914 נמצא 72 מ׳ מהגדוד העברי 9 (כתובת בי"ס הדר), האחרים 1.6 ו-2.8 ק"מ' },
  { id: 'galim_rehov', sites: 'גלים רחובות',                assign: null,
    cityKey: 'רחובות',    moeQueries: ['גלים'], semelOverride: 482802,
    knownAddress: 'יעקב תמרי 11, רחובות',
    verifiedBy: 'סמל 482802 = בי"ס יסודי גלים רחובות (נוסד 2020, א׳-ו׳); 577536 הוא מוסד אחר בעיר' },
  { id: 'ein_hakore',  sites: 'עין הקורא',                  assign: null,
    cityKey: 'ראשון לציון', moeQueries: ['עין הקורא', 'עין הקורה'], cityOverride: 'ראשל"צ',
    semelOverride: 413294,
    verifiedBy: 'התאמה יחידה בראשל"צ; תואם ל-«הצלח"ה עין הקורא, ראשל"צ» ב-base44_options' },
  { id: 'biluyim',     sites: 'בילויים',                    assign: null,
    cityKey: 'ראשון לציון', cityOverride: 'ראשל"צ',
    // אינו קיים במאגר משרד החינוך תחת שם זה — נקבע ידנית מאובייקט school ב-OSM
    manualGeo: { lat: 31.970829, lon: 34.791504,
      address: 'הבריגדה 12, ראשון לציון',
      officialName: 'מקיף ג׳ — חט"ב אחרון הבילויים',
      source: 'OpenStreetMap · אובייקט school "מקיף ג׳ (חט"ב אחרון הבילוים)"' },
    verifiedBy: 'base44_options רושם «הצלח"ה הבילויים, ראשל"צ»; המוסד היחיד בעיר בשם זה הוא חט"ב אחרון הבילויים בקריית חינוך העמית' },

  // ── עוזבים מחוץ לת"א (מוצגים אפורים במפת מרכז הארץ) ──
  { id: 'lapid',       sites: 'בית ספר לפיד הוד השרון',     assign: 'לפיד',
    cityKey: 'הוד השרון', moeQueries: ['לפיד'] },
  { id: 'shamir_holon',sites: 'בית ספר שמיר חולון',         assign: null,
    cityKey: 'חולון',     moeQueries: ['יצחק שמיר', 'שמיר'] },
  { id: 'tzmarot',     sites: 'בית ספר צמרות באר יעקב',     assign: null,
    cityKey: 'באר יעקב',  moeQueries: ['צמרות'] },
  { id: 'weizmann',    sites: 'בית ספר ויצמן רחובות',       assign: null,
    cityKey: 'רחובות',    moeQueries: ['ויצמן', 'וייצמן'], semelOverride: 412023,
    verifiedBy: 'סמל 412023 = בי"ס ויצמן; שאר ההתאמות בעיר הן מכון ויצמן למדע' },
];

/** תיבות תוחמות עירוניות — לפילוח מועמדים בחיפוש הארצי. */
const CITY_BBOX = {
  'יבנה':        { latMin: 31.850, latMax: 31.910, lonMin: 34.700, lonMax: 34.780 },
  'אריאל':       { latMin: 32.085, latMax: 32.125, lonMin: 35.150, lonMax: 35.220 },
  'הרצליה':      { latMin: 32.140, latMax: 32.205, lonMin: 34.780, lonMax: 34.880 },
  'רמת גן':      { latMin: 32.045, latMax: 32.115, lonMin: 34.790, lonMax: 34.860 },
  'רעננה':       { latMin: 32.155, latMax: 32.215, lonMin: 34.825, lonMax: 34.900 },
  'רחובות':      { latMin: 31.865, latMax: 31.930, lonMin: 34.770, lonMax: 34.850 },
  'ראשון לציון': { latMin: 31.935, latMax: 32.020, lonMin: 34.720, lonMax: 34.840 },
  'הוד השרון':   { latMin: 32.135, latMax: 32.185, lonMin: 34.865, lonMax: 34.930 },
  'חולון':       { latMin: 31.990, latMax: 32.040, lonMin: 34.740, lonMax: 34.810 },
  'באר יעקב':    { latMin: 31.925, latMax: 31.965, lonMin: 34.810, lonMax: 34.870 },
};

const inBbox = (p, b) => p.lat >= b.latMin && p.lat <= b.latMax && p.lon >= b.lonMin && p.lon <= b.lonMax;

// ---------------------------------------------------------------- מקורות גאוגרפיה

/** שכבת בתי הספר של עיריית ת"א — מחזירה כתובת + ITM. */
async function fetchTaGis(likePattern) {
  const where = encodeURIComponent(`shem_mosad like '%${likePattern}%'`);
  const url = `https://gisn.tel-aviv.gov.il/GisOpenData/service.asmx/GetLayer`
    + `?layerCode=${GIS_LAYER}&layerWhere=${where}&projection=&xmax=&xmin=&ymax=&ymin=`;
  const data = await getJson(url);
  return (data.features || []).map(f => {
    const a = f.attributes || {};
    const g = f.geometry || {};
    const street = [a.shem_rechov, a.ms_bait].filter(v => v !== null && v !== '' && v !== undefined).join(' ').trim();
    return {
      semel: a.k_mosad,
      name: (a.shem_mosad || '').trim(),
      address: street,
      stage: a.t_shlav_chinuch || '',
      gradeFrom: a.me_kita ?? null,
      gradeTo: a.ad_kita ?? null,
      // שדות המנהל/ת במאגר העירוני מחזיקים שני שמות מודבקים בכל בית ספר
      // ("רז ג'יני רחלי קרפלד") — לא ניתן להפריד אותם באמינות, ולכן לא מוצגים
      phone: a.telefon_mosad || '',
      itm: { x: g.x, y: g.y },
      ...itmToWgs84(g.x, g.y),
    };
  });
}

/** מאגר הקואורדינטות הארצי של משרד החינוך. UTM_X=lon, UTM_Y=lat (השמות מטעים). */
async function fetchMoe(query) {
  const url = `https://data.gov.il/api/3/action/datastore_search`
    + `?resource_id=${MOE_RESOURCE}&q=${encodeURIComponent(query)}&limit=100`;
  const data = await getJson(url);
  return (data.result?.records || []).map(r => ({
    semel: r.SEMEL_MOSAD,
    name: (r.SHEM_MOSAD || '').trim(),
    lat: Number(r.UTM_Y),
    lon: Number(r.UTM_X),
    itm: { x: Number(r.ITM_X), y: Number(r.ITM_Y) },
    accuracy: r.RAMAT_DIYUK_MIKUM || '',
  })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

/** גיאוקודינג נפילה־אחורה מול OSM. */
async function fetchNominatim(name, city) {
  const q = encodeURIComponent(`${name} ${city} Israel`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&addressdetails=1`;
  const rows = await getJson(url, { 'User-Agent': 'nika-site-map/1.0 (deanshvika@gmail.com)' });
  return (rows || []).map(r => ({
    name: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    osmType: r.type,
  }));
}

/** גיאוקודינג הפוך — משלים כתובת רחוב למוקדים שהמאגר הארצי לא נותן להם. */
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=he`;
  const r = await getJson(url, { 'User-Agent': 'nika-site-map/1.0 (deanshvika@gmail.com)' });
  const a = r?.address;
  if (!a) return null;
  const street = a.road || a.pedestrian || a.neighbourhood || '';
  const num = a.house_number || '';
  const city = a.city || a.town || a.village || '';
  return [[street, num].filter(Boolean).join(' '), city].filter(Boolean).join(', ') || null;
}

// ---------------------------------------------------------------- שכונות ואשכולות ת"א

const NBHD_LAYER = 511; // שכונות — מצולעים ב-ITM

/** טוען פעם אחת את מצולעי השכונות של עיריית ת"א. */
let nbhdCache = null;
async function loadNeighborhoods() {
  if (nbhdCache) return nbhdCache;
  const url = `https://gisn.tel-aviv.gov.il/GisOpenData/service.asmx/GetLayer`
    + `?layerCode=${NBHD_LAYER}&layerWhere=&projection=&xmax=&xmin=&ymax=&ymin=`;
  const data = await getJson(url);
  nbhdCache = (data.features || []).map(f => ({
    // שמות במאגר העירייה נשמרים כשהגרש בתחילת המחרוזת (ארטיפקט RTL): "'רמת אביב ג"
    name: String(f.attributes.shem_shchuna || '').replace(/^'(.+)$/, "$1'"),
    rings: f.geometry.rings || [],
  }));
  return nbhdCache;
}

/** ray casting על טבעת מצולע ב-ITM. */
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
    const [xi, yi] = ring[i], [xk, yk] = ring[k];
    if (((yi > y) !== (yk > y)) && (x < (xk - xi) * (y - yi) / (yk - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** שם השכונה הרשמי לנקודת ITM, או null. */
async function neighborhoodOf(itmX, itmY) {
  for (const n of await loadNeighborhoods()) {
    let inside = false;
    for (const ring of n.rings) if (pointInRing(itmX, itmY, ring)) inside = !inside;
    if (inside) return n.name;
  }
  return null;
}

/**
 * אשכול נסיעה בת"א, נגזר מהשכונה הרשמית ולא מספי קואורדינטות.
 * ספים גסים טעו קודם: אלומות (רמת-אביב) סווגה כ"צפון הישן" וגבעון (גני שרונה) כ"דרום".
 */
const CLUSTER_BY_NBHD = [
  [/רמת.?אביב|מעוז אביב|תל ברוך|נופי ים|אפקה|הדר.?יוסף|כוכב הצפון|נוה אביבים|קרית שאול|צהלה|נוה שרת|רמת החייל|גלילות|צוקי אביב|המשתלה|רביבים|נוה דן|עתידים|ניר אביב|נוה חן/, 'צפון — מצפון לירקון'],
  [/הצפון (הישן|החדש)|בבלי|ככר המדינה|צמרות איילון|נמל תל.?אביב|שדה דב|פארק הירקון/, 'הצפון הישן והחדש'],
  [/לב תל.?אביב|כרם התימנים|נוה צדק|מונטיפיורי|גני שרונה/, 'מרכז העיר'],
  [/ביצרון|רמת ישראל|יד אליהו|נחלת יצחק|רמת הטייסים|תל.?חיים|אורות/, 'מזרח'],
  [/התקוה|כפיר|עזרא והארגזים|נוה אליעזר|כפר שלם|נוה ברבור|לבנה|פארק דרום/, 'דרום-מזרח'],
  [/פלורנטין|נוה שאנן|שפירא|קרית שלום|נוה עופר|פארק החורשות|תכנית ל|צומת חולון/, 'דרום'],
  [/יפו|עג.?מי|גבעת עליה|צהלון|שיכוני חסכון|נוה גולן|גבעת התמרים|גבעת הרצל|דקר/, 'יפו'],
];

function clusterFromNeighborhood(nbhd) {
  if (!nbhd) return null;
  for (const [re, cluster] of CLUSTER_BY_NBHD) if (re.test(nbhd)) return cluster;
  return null;
}

// ---------------------------------------------------------------- ראשי

async function main() {
  const srcSites = newestBackup('מוקדים 26-27');
  const srcAssign = newestBackup('שיבוץ 26-27');
  console.error(`מוקדים   ← ${srcSites.stamp}`);
  console.error(`שיבוץ    ← ${srcAssign.stamp}\n`);
  const sitesRows = parseCsv(fs.readFileSync(srcSites.file, 'utf8'));
  const assignRows = parseCsv(fs.readFileSync(srcAssign.file, 'utf8'));

  const byName = (rows, key) => new Map(rows.map(r => [r[key], r]));
  const sitesByName = byName(sitesRows, 'מוקד');
  const assignByName = byName(assignRows, 'בית ספר');

  const results = [];
  const review = [];

  for (const entry of ROSTER) {
    const s = sitesByName.get(entry.sites);
    if (!s) { review.push({ id: entry.id, issue: `לא נמצא בגיליון המוקדים: "${entry.sites}"` }); continue; }
    const a = entry.assign ? assignByName.get(entry.assign) : null;
    if (entry.assign && !a) review.push({ id: entry.id, issue: `לא נמצא בגיליון השיבוץ: "${entry.assign}"` });

    const isTa = Boolean(entry.gis);
    const site = {
      id: entry.id,
      name: s['מוקד'],
      shortName: (entry.assign || s['מוקד']).replace(/^בית ה?ספר\s+/, ''),
      city: entry.cityOverride || s['עיר'] || (a && a['עיר']) || '',
      kind: s['סוג'],
      status: s['סטטוס 26/27'],
      program: s['תוכנית'] || (a && a['תוכנית']) || '',
      scope: s['היקף'] || '',
      // ימים ושעות: גיליון השיבוץ קובע, המוקדים משלים כשחסר
      days: (a && a['ימי פעילות']) || s['ימים'] || '',
      hours: (a && a['שעות']) || s['שעות'] || '',
      coachLastYear: (a && a['מאמן ינו׳–פבר׳ 26']) || '',
      coach2627: (a && a['מאמן משובץ 26/27']) || s['מאמן 26/27'] || '',
      coachHint: s['רמז מאמן (חן)'] || '',
      certainty: s['ודאות'] || '',
      assignStatus: s['סטטוס שיבוץ'] || '',
      nextStep: s['השלב הבא'] || '',
      note: [s['הערה'], a && a['הערות']].filter(Boolean).join(' · '),
      conflicts: [],
      isTa,
    };

    // ── אי-התאמות בין הגיליונות ──
    const assignCoach = (a && a['מאמן משובץ 26/27']) || '';
    const sitesCoach = s['מאמן 26/27'] || '';

    if (assignCoach && sitesCoach && assignCoach !== sitesCoach) {
      site.conflicts.push(`שני הגיליונות נוקבים במאמן שונה — שיבוץ: "${assignCoach}" · מוקדים: "${sitesCoach}"`);
    }

    // הסנכרון מילא שמות מאמנים בגיליון המוקדים אך לא נגע בעמודת הוודאות,
    // ולכן יש שורות שמציגות מאמן וצבועות "חסר". זו עבודה שנשארה פתוחה בגיליון.
    // רק במוקדים פעילים: במוקד עוזב שם מאמן מאשתקד עם ודאות "חסר" הוא מצב תקין, לא משימה
    const anyCoach = sitesCoach || assignCoach;
    if (anyCoach && s['ודאות'] === 'חסר' && s['סטטוס 26/27'] !== 'עוזב') {
      site.staleCertainty = true;
      site.conflicts.push(`רשום מאמן "${anyCoach}", אך עמודת הוודאות עדיין "חסר" — כנראה לא עודכנה אחרי הסנכרון`);
    }

    // ── גאוגרפיה ──
    if (isTa) {
      const cands = await fetchTaGis(entry.gis);
      const scored = cands
        .map(c => ({ ...c, score: nameSimilarity(c.name, entry.gis) }))
        .sort((x, y) => y.score - x.score);
      if (!scored.length) {
        site.confidence = 'none';
        review.push({ id: entry.id, issue: `GIS ת"א: אפס תוצאות עבור LIKE '%${entry.gis}%'` });
      } else {
        const best = scored[0];
        site.address = best.address;
        site.itm = best.itm;
        site.lat = best.lat;
        site.lon = best.lon;
        site.semel = best.semel;
        site.gisName = best.name;
        site.stage = best.stage;
        site.gradeFrom = best.gradeFrom;
        site.gradeTo = best.gradeTo;
        site.phone = best.phone;
        site.source = 'GIS עיריית תל אביב–יפו · שכבה 769 (בתי ספר תשפ"ז)';
        site.confidence = scored.length === 1 ? 'high' : (best.score >= 0.5 ? 'high' : 'medium');
        if (scored.length > 1) {
          review.push({
            id: entry.id,
            issue: `GIS ת"א: ${scored.length} תוצאות ל-LIKE '%${entry.gis}%' — נבחר "${best.name}"`,
            candidates: scored.map(c => `${c.name} · ${c.address} · score ${c.score.toFixed(2)}`),
          });
        }
      }
      await sleep(250);
    } else if (entry.manualGeo) {
      // נקבע ידנית אחרי בירור — אינו קיים במאגר הארצי תחת שם זה
      site.lat = entry.manualGeo.lat;
      site.lon = entry.manualGeo.lon;
      site.address = entry.manualGeo.address;
      site.gisName = entry.manualGeo.officialName;
      site.source = entry.manualGeo.source;
      site.confidence = 'high';
    } else {
      const bbox = CITY_BBOX[entry.cityKey];
      const seen = new Map();
      for (const q of entry.moeQueries) {
        for (const v of new Set([q, ktivChaser(q), normalizeName(q)])) {
          if (!v) continue;
          try {
            for (const r of await fetchMoe(v)) if (!seen.has(r.semel)) seen.set(r.semel, r);
          } catch (e) {
            review.push({ id: entry.id, issue: `שגיאת שאילתה למשרד החינוך "${v}": ${e.message}` });
          }
          await sleep(200);
        }
      }
      const all = [...seen.values()];
      const inCity = all.filter(r => inBbox(r, bbox));
      const scored = inCity
        .map(r => ({ ...r, score: Math.max(...entry.moeQueries.map(q => nameSimilarity(r.name, q))) }))
        .sort((x, y) => y.score - x.score);

      // סמל שהוכרע ידנית גובר על הניקוד האוטומטי
      const forced = entry.semelOverride ? scored.find(r => Number(r.semel) === entry.semelOverride) : null;
      if (entry.semelOverride && !forced) {
        review.push({ id: entry.id, issue: `סמל ${entry.semelOverride} שנקבע ידנית לא הוחזר מהמאגר — נופלים לבחירה אוטומטית` });
      }

      if (forced) {
        Object.assign(site, pickMoe(forced));
        site.confidence = 'high';
      } else if (scored.length === 1) {
        Object.assign(site, pickMoe(scored[0]));
        site.confidence = 'high';
      } else if (scored.length > 1) {
        Object.assign(site, pickMoe(scored[0]));
        site.confidence = scored[0].score > (scored[1].score + 0.2) ? 'high' : 'medium';
        review.push({
          id: entry.id,
          issue: `משרד החינוך: ${scored.length} מועמדים בתוך ${entry.cityKey} — נבחר "${scored[0].name}"`,
          candidates: scored.map(c => `${c.name} (סמל ${c.semel}) · ${c.lat.toFixed(5)},${c.lon.toFixed(5)} · score ${c.score.toFixed(2)}`),
        });
      } else {
        // נפילה־אחורה ל-OSM
        let osm = [];
        try { osm = await fetchNominatim(site.shortName, entry.cityKey); } catch (e) { /* מטופל למטה */ }
        const hit = osm.find(r => inBbox(r, bbox));
        if (hit) {
          site.lat = hit.lat; site.lon = hit.lon;
          site.source = 'OpenStreetMap / Nominatim';
          site.confidence = 'medium';
          review.push({
            id: entry.id,
            issue: `לא נמצא במשרד החינוך; נפתר דרך OSM → ${hit.lat.toFixed(5)},${hit.lon.toFixed(5)}`,
            candidates: [hit.name],
          });
        } else {
          site.confidence = 'none';
          review.push({
            id: entry.id,
            issue: `לא נפתר. ${all.length} תוצאות ארציות, אף אחת לא בתוך ${entry.cityKey}`,
            candidates: all.slice(0, 12).map(c => `${c.name} (סמל ${c.semel}) · ${c.lat.toFixed(4)},${c.lon.toFixed(4)}`),
          });
        }
        await sleep(1100); // מדיניות השימוש של Nominatim
      }
    }

    if (entry.verifiedBy) site.verifiedBy = entry.verifiedBy;
    if (entry.knownAddress) site.address = entry.knownAddress;

    // מוקדים מחוץ לת"א: למאגר הארצי אין עמודת כתובת — משלימים בגיאוקודינג הפוך
    if (!isTa && site.lat && !site.address) {
      try {
        const a = await reverseGeocode(site.lat, site.lon);
        if (a) { site.address = a; site.addressSource = 'גיאוקודינג הפוך · OpenStreetMap'; }
      } catch { /* כתובת היא נתון משלים, לא חוסם */ }
      await sleep(1100);
    }

    if (isTa && site.itm) {
      site.neighborhood = await neighborhoodOf(site.itm.x, site.itm.y);
      site.cluster = clusterFromNeighborhood(site.neighborhood);
      if (!site.cluster) {
        site.cluster = 'ת"א — לא סווג';
        review.push({ id: entry.id, issue: `שכונה "${site.neighborhood || 'לא נמצאה'}" לא ממופה לאשכול נסיעה` });
      }
    } else if (site.lat) {
      site.cluster = site.city;
    }
    results.push(site);
    process.stderr.write(`  ${site.confidence === 'high' ? '✓' : site.confidence === 'medium' ? '~' : '✗'} ${site.shortName}\n`);
  }

  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    dataAsOf: srcSites.stamp > srcAssign.stamp ? srcAssign.stamp : srcSites.stamp,
    generatedFrom: {
      sitesSheet: path.relative(ROOT, srcSites.file),
      assignSheet: path.relative(ROOT, srcAssign.file),
      taGisLayer: `${GIS_LAYER} — בתי ספר תשפ"ז, gisn.tel-aviv.gov.il`,
      moeResource: `data.gov.il/${MOE_RESOURCE} — קואורדינטות מוסדות חינוך`,
    },
    sites: results,
    review,
  }, null, 2), 'utf8');

  // ── דוח שער בקרה ──
  console.log(`\nנכתבו ${results.length} מוקדים → ${path.relative(ROOT, OUT)}`);
  const counts = results.reduce((m, s) => ((m[s.confidence] = (m[s.confidence] || 0) + 1), m), {});
  console.log(`ודאות מיקום: high=${counts.high || 0} · medium=${counts.medium || 0} · none=${counts.none || 0}`);
  if (review.length) {
    console.log('\n──────── שער בקרה — דורש עין אנושית ────────');
    for (const r of review) {
      console.log(`\n[${r.id}] ${r.issue}`);
      for (const c of r.candidates || []) console.log(`      · ${c}`);
    }
  }
}

function pickMoe(r) {
  return {
    lat: r.lat, lon: r.lon, itm: r.itm, semel: r.semel, gisName: r.name,
    source: `משרד החינוך · קואורדינטות מוסדות חינוך (דיוק: ${r.accuracy || 'לא צוין'})`,
  };
}

main().catch(e => { console.error(e); process.exit(1); });
