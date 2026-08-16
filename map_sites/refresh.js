'use strict';
/**
 * refresh.js — רענון מלא של מפת המוקדים, מקצה לקצה.
 *
 *   1. קורא את הגיליונות החיים דרך פרופיל האוטומציה → גיבוי CSV מתוארך
 *   2. בונה מחדש את sites_geo.json (גיאוגרפיה נשלפת רק למוקדים חדשים/שהשתנו)
 *   3. מרנדר מחדש את מפת_מוקדים.html
 *   4. מדפיס דיף מול הריצה הקודמת — מה השתנה בשיבוצים
 *
 * הרצה:  node map_sites/refresh.js
 *        node map_sites/refresh.js --no-fetch    ← דלג על קריאת הגיליונות
 *
 * אחרי הריצה צריך לפרסם מחדש את הארטיפקט לאותו קישור. זה שלב ידני
 * (Claude מפרסם), כי אין ל-Node גישה ל-API של הארטיפקטים.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const GEO = path.join(HERE, 'sites_geo.json');
const skipFetch = process.argv.includes('--no-fetch');

const run = (script, cwd) => execFileSync(process.execPath, [script], { cwd, stdio: 'inherit' });

/** תמונת מצב של השיבוצים, להשוואה לפני/אחרי. */
function snapshot() {
  if (!fs.existsSync(GEO)) return null;
  const d = JSON.parse(fs.readFileSync(GEO, 'utf8'));
  return Object.fromEntries(d.sites.map(s => [s.id, {
    name: s.shortName,
    coach: s.coach2627 || '',
    certainty: s.certainty || '',
    status: s.status || '',
  }]));
}

function diff(before, after) {
  if (!before) return ['(אין ריצה קודמת להשוואה)'];
  const out = [];
  for (const [id, b] of Object.entries(before)) {
    const a = after[id];
    if (!a) { out.push(`− ${b.name} — ירד מהרשימה`); continue; }
    if (a.coach !== b.coach) out.push(`  ${a.name}: מאמן "${b.coach || '—'}" ← "${a.coach || '—'}"`);
    if (a.certainty !== b.certainty) out.push(`  ${a.name}: ודאות "${b.certainty}" ← "${a.certainty}"`);
    if (a.status !== b.status) out.push(`  ${a.name}: סטטוס "${b.status}" ← "${a.status}"`);
  }
  for (const [id, a] of Object.entries(after)) if (!before[id]) out.push(`+ ${a.name} — מוקד חדש`);
  return out;
}

(async () => {
  const before = snapshot();

  if (skipFetch) {
    console.log('— דילוג על קריאת הגיליונות (--no-fetch)\n');
  } else {
    console.log('■ שלב 1/3 — קריאת הגיליונות החיים\n');
    run(path.join(HERE, '..', 'backup_sheets.js'), path.join(HERE, '..'));
    console.log('');
  }

  console.log('■ שלב 2/3 — רוסטר וגיאוגרפיה\n');
  run(path.join(HERE, 'build_sites_geo.js'), path.join(HERE, '..'));

  console.log('\n■ שלב 3/3 — רינדור המפה\n');
  run(path.join(HERE, 'build_map.js'), path.join(HERE, '..'));

  const changes = diff(before, snapshot());
  console.log('\n──────── מה השתנה מהריצה הקודמת ────────');
  console.log(changes.length ? changes.join('\n') : '  אין שינוי בשיבוצים.');
  console.log('\nהמפה נבנתה. נותר לפרסם מחדש לאותו קישור (בקש מ-Claude "תעדכן את המפה").');
})().catch(e => { console.error('\n❌', e.message); process.exit(1); });
