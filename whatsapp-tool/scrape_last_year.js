/*
 * scrape_last_year.js
 * ---------------------------------------------------------------------------
 * מושך מ-Base44 את שיבוצי שנה"ל 25/26 ומייצר אינדיקציה: איזה מאמן היה קבוע
 * בכל בית ספר, באילו ימים ובאילו שעות.
 *
 * ⚠️ קריאה בלבד. GET אחד על entities/Event. אפס POST/PATCH/DELETE.
 * ⚠️ לא נוגע ב-schedule_data.json (הבוט בייצור תלוי בו) — כותב לקובץ נפרד.
 *
 * חלון הייחוס: ינואר–פברואר 2026 — אמצע שנה"ל, כל התוכניות רצות במקביל.
 * חודשי הסיום (מאי–יוני) נותנים תמונה חלקית כי חלק מהתוכניות כבר הסתיימו.
 * חלון גיבוי (כל השנה) משמש רק לבתי ספר בלי ולו אירוע אחד בחלון הייחוס.
 *
 * הרצה:  node whatsapp-tool/scrape_last_year.js
 */
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, 'base44_token.json');
const OUT_FILE = path.join(__dirname, 'schedule_last_year.json');
const SCHOOLS_FILE = path.join(__dirname, '..', 'schools_26_27.json');

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// סף לזיהוי "מאמן קבוע" מול מחליף מזדמן.
// בחלון של חודשיים מאמן שבועי קבוע צובר ~8-9 אירועים; מחליף צובר 1-2.
const MIN_EVENTS = 3;       // מתחת לזה — מחליף, לא קבוע
const REL_THRESHOLD = 0.3;  // ומעל 30% מהמאמן המוביל, כדי לתפוס שיתוף אמיתי של מוקד

// ---------- שליפה מ-Base44 (GET בלבד) ----------
function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error(`לא נמצא ${TOKEN_FILE}. הרץ קודם: node whatsapp-tool/scrape-schedule.js (מרענן טוקן)`);
  }
  const { token, appId } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  if (!token || !appId) throw new Error('base44_token.json חסר token או appId');
  return { token, appId };
}

async function fetchEvents() {
  const { token, appId } = readToken();
  const url = `https://base44.app/api/apps/${appId}/entities/Event?limit=15000`;
  console.log('קורא אירועים מ-Base44 (GET בלבד)...');

  const res = await Promise.race([
    fetch(url, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('API timeout אחרי 60 שניות')), 60000))
  ]);

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `הטוקן פג (${res.status}). לחידוש הרץ:  node whatsapp-tool/scrape-schedule.js\n` +
      '   (הוא פותח את הפרופיל השמור, מרענן את base44_token.json, ואז הרץ שוב את הסקריפט הזה)'
    );
  }
  if (!res.ok) throw new Error(`Base44 API החזיר ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('התגובה מ-Base44 אינה מערך');
  console.log(`נטענו ${list.length} אירועים.`);
  return list;
}

// ---------- צבירה לחלון תאריכים ----------
// מחזיר: { [location]: { coaches:{name:count}, days:{day:count}, times:{"HH:MM-HH:MM":count}, months:Set, total } }
function aggregate(events, from, to) {
  const byLocation = {};

  for (const ev of events) {
    if (!ev.date || ev.date < from || ev.date > to) continue;
    // אירועים שבוטלו לא מעידים על שיבוץ קבוע
    if (ev.status === 'cancelled' || ev.status === 'canceled') continue;

    const location = ev.clientName || '';
    if (!location) continue;

    const [y, m, d] = ev.date.split('-');
    const day = HEBREW_DAYS[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];

    const entry = byLocation[location] ||
      (byLocation[location] = { coaches: {}, days: {}, times: {}, months: new Set(), total: 0 });

    entry.total++;
    entry.months.add(`${m}/${y}`);
    entry.days[day] = (entry.days[day] || 0) + 1;

    const coach = ev.coachName || '';
    if (coach) entry.coaches[coach] = (entry.coaches[coach] || 0) + 1;

    if (ev.startTime) {
      const slot = ev.endTime ? `${ev.startTime}-${ev.endTime}` : ev.startTime;
      entry.times[slot] = (entry.times[slot] || 0) + 1;
    }
  }

  return byLocation;
}

// מסנן מפת {ערך: ספירה} לערכים המשמעותיים בלבד, ממוין לפי שכיחות יורדת
function significant(counts, minAbs) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return [];
  const top = sorted[0][1];
  const keep = sorted.filter(([, c]) => c >= Math.max(minAbs, top * REL_THRESHOLD));
  return keep.length ? keep : [sorted[0]]; // תמיד להחזיר לפחות את המוביל
}

// ---------- התאמת בית ספר → נתוני מוקד ----------
// בי"ס אחד יכול להופיע ב-Base44 בכמה וריאציות שם — מאחדים את הספירות של כולן.
function resolveSchool(school, agg) {
  const matched = school.base44Aliases.filter(a => agg[a]);
  if (!matched.length) return null;

  const merged = { coaches: {}, days: {}, times: {}, months: new Set(), total: 0, aliases: matched };
  for (const alias of matched) {
    const e = agg[alias];
    merged.total += e.total;
    e.months.forEach(mo => merged.months.add(mo));
    for (const [k, v] of Object.entries(e.coaches)) merged.coaches[k] = (merged.coaches[k] || 0) + v;
    for (const [k, v] of Object.entries(e.days)) merged.days[k] = (merged.days[k] || 0) + v;
    for (const [k, v] of Object.entries(e.times)) merged.times[k] = (merged.times[k] || 0) + v;
  }
  return merged;
}

// טווח שעות קומפקטי לתא בטבלה: "08:00-13:30 (7 קבוצות)" קריא הרבה יותר
// מרשימה של שבעה סלוטים נפרדים.
function timeRange(times) {
  const slots = significant(times, 2).map(([t]) => t);
  if (!slots.length) return '';
  const starts = slots.map(s => s.split('-')[0]).filter(Boolean).sort();
  const ends = slots.map(s => s.split('-')[1]).filter(Boolean).sort();
  const first = starts[0];
  const last = ends.length ? ends[ends.length - 1] : starts[starts.length - 1];
  const range = first === last ? first : `${first}-${last}`;
  return slots.length > 1 ? `${range} (${slots.length} קבוצות)` : range;
}

function summarize(merged) {
  const coaches = significant(merged.coaches, MIN_EVENTS);
  // ימים לפי סדר השבוע, לא לפי שכיחות — "ראשון, שלישי" ולא "שלישי, ראשון"
  const days = significant(merged.days, 2)
    .sort((a, b) => HEBREW_DAYS.indexOf(a[0]) - HEBREW_DAYS.indexOf(b[0]));
  const times = significant(merged.times, 2);
  return {
    coaches: coaches.map(([name, count]) => ({ name, count })),
    coachText: coaches.map(([n]) => n).join(' | '),
    daysText: days.map(([d]) => d).join(', '),
    timesText: timeRange(merged.times),
    timeSlots: times.map(([t, c]) => ({ slot: t, count: c })),
    months: [...merged.months].sort(),
    totalEvents: merged.total,
    aliases: merged.aliases
  };
}

// ---------- main ----------
async function main() {
  const cfg = JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf8'));
  const { from: pFrom, to: pTo } = cfg.referenceWindow;
  const { from: fFrom, to: fTo } = cfg.fallbackWindow;

  const events = await fetchEvents();

  const primary = aggregate(events, pFrom, pTo);
  const fallback = aggregate(events, fFrom, fTo);

  console.log(`\nחלון ייחוס ${pFrom} .. ${pTo}: ${Object.keys(primary).length} מוקדים`);
  console.log(`חלון גיבוי  ${fFrom} .. ${fTo}: ${Object.keys(fallback).length} מוקדים`);

  const results = [];
  const unmatched = [];
  let fromPrimary = 0, fromFallback = 0;

  for (const school of cfg.schools) {
    let merged = resolveSchool(school, primary);
    let source = 'primary';
    if (!merged) {
      merged = resolveSchool(school, fallback);
      source = merged ? 'fallback' : 'none';
    }

    if (!merged) {
      unmatched.push(school);
      results.push({ school: school.school, city: school.city, program: school.program, source: 'none' });
      continue;
    }

    if (source === 'primary') fromPrimary++; else fromFallback++;
    results.push({
      school: school.school, city: school.city, program: school.program,
      source, ...summarize(merged)
    });
  }

  // --- שמירה ---
  const out = {
    generatedAt: new Date().toISOString(),
    totalEventsInBase44: events.length,
    referenceWindow: cfg.referenceWindow,
    fallbackWindow: cfg.fallbackWindow,
    thresholds: { minEvents: MIN_EVENTS, relativeThreshold: REL_THRESHOLD },
    schools: results,
    // המפה המלאה של חלון הייחוס — שימושי לבדיקות ולשאלות עתידיות
    allLocationsPrimary: Object.fromEntries(
      Object.entries(primary).map(([loc, e]) => [loc, {
        total: e.total,
        coaches: Object.fromEntries(Object.entries(e.coaches).sort((a, b) => b[1] - a[1])),
        days: Object.fromEntries(Object.entries(e.days).sort((a, b) => b[1] - a[1])),
        times: Object.fromEntries(Object.entries(e.times).sort((a, b) => b[1] - a[1]))
      }])
    )
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');

  // --- דוח לקונסול ---
  console.log('\n' + '='.repeat(90));
  console.log('מוקד → מאמן קבוע (ספירת אירועים) → ימים → שעות');
  console.log('='.repeat(90));
  for (const r of results) {
    if (r.source === 'none') continue;
    const flag = r.source === 'fallback' ? ' ⚠️גיבוי' : '';
    const coachStr = (r.coaches || []).map(c => `${c.name}(${c.count})`).join(' | ') || '—';
    console.log(`${r.school} (${r.city})${flag}`);
    console.log(`   מאמן: ${coachStr}`);
    console.log(`   ימים: ${r.daysText || '—'}   |   שעות: ${r.timesText || '—'}   |   סה"כ ${r.totalEvents} אירועים`);
  }

  const fbList = results.filter(r => r.source === 'fallback');
  if (fbList.length) {
    console.log('\n⚠️ נפלו לחלון הגיבוי (לא היו פעילים בינו׳–פבר׳):');
    fbList.forEach(r => console.log(`   • ${r.school} (${r.city}) — פעיל בחודשים: ${r.months.join(', ')}`));
  }

  if (unmatched.length) {
    console.log('\n❌ לא נמצאה התאמה ב-Base44 (בדוק את ה-aliases ב-schools_26_27.json):');
    unmatched.forEach(s => console.log(`   • ${s.school} (${s.city}) — ניסיתי: ${s.base44Aliases.join(' / ')}`));
  }

  console.log('\n=== סיכום ===');
  console.log(`בתי ספר: ${cfg.schools.length} | מחלון ינו׳–פבר׳: ${fromPrimary} | מחלון גיבוי: ${fromFallback} | ללא נתונים: ${unmatched.length}`);
  console.log(`נשמר: ${OUT_FILE}`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}

module.exports = { aggregate, resolveSchool, summarize };
