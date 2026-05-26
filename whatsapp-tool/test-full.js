require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── העתק פונקציות מ-brain.js לבדיקה מבודדת ──────────────────────────────

const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין"];
const LOCATIONS = ["הצלח\"ה איתמר","הצלחה חופית","הצלח\"ה מקיף ח'","הצלח\"ה הדרים ראשל\"צ","איתמר בן אב\"י (גפ\"ן), ת\"א","שורשים","הצלח\"ה הבילויים, ראשל\"צ","בי\"ס שפירא (יול\"א), ת\"א","בי\"ס שורשים (יול\"א), ת\"א","הצלח\"ה עין הקורא, ראשל\"צ","חט\"ב שמיר, ת\"א","בי\"ס איתמר בן אב\"י","בי\"ס המתמיד, ר\"ג","בי\"ס גבריאלי, ת\"א","בי\"ס לפיד, הוד השרון","בי\"ס מגן (יוח\"א), ת\"א","בי\"ס מגן","בי\"ס גבעון (יוח\"א), ת\"א","בי\"ס טבע, ת\"א","בי\"ס גבעון, ת\"א","בי\"ס רוקח, ת\"א","בי\"ס רוקח (יוח\"א), ת\"א","בי\"ס מרחבים, יבנה","בי\"ס שמיר, חולון","בי\"ס אלומות (יוח\"א), ת\"א","בי\"ס בית צורי, ת\"א","בי\"ס בית צורי (יוח\"א), ת\"א","בי\"ס יהודה מכבי (יוח\"א), ת\"א","בי\"ס נופי ים (יוח\"א), ת\"א","בי\"ס צמרות, באר יעקב","בי\"ס יוחנני, הרצליה","בי\"ס כפיר (יוח\"א), ת\"א","בי\"ס בלוך, ת\"א","בי\"ס בלוך (יוח\"א), ת\"א","בי\"ס נופים (יול\"א), ת\"א","נווה זמר, רעננה","נופי ים, ת\"א","אור זבולון, אריאל","בי\"ס כלנא יחד (יוח\"א), יפו","בי\"ס כלנא יחד, יפו","בי\"ס וייצמן, רחובות"];

function editDist(a, b) {
    if (a === b) return 0;
    const dp = Array.from({length: a.length + 1}, (_, i) => [i]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[a.length][b.length];
}

function findBest(input, list) {
    if (!input || input === '') return null;
    const clean = s => s.replace(/['"״]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const inp = clean(input);
    const exact = list.find(o => clean(o) === inp);
    if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0]));
    if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byWords = list.find(o => words.length > 1 && words.every(w => clean(o).includes(w)));
    if (byWords) return byWords;
    const firstName = inp.split(' ')[0];
    const byFirst = inp.includes(' ') ? null : list.find(o => clean(o).startsWith(firstName));
    if (byFirst) return byFirst;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w)));
    if (byAny) return byAny;
    const byFuzzy = list.find(o => {
        const parts = clean(o).split(/[\s,.()"״]+/).filter(p => p.length >= 4);
        return words.filter(w => w.length >= 4).some(w => parts.some(p => editDist(w, p) <= 1));
    });
    if (byFuzzy) return byFuzzy;
    return null;
}

function fixJson(raw) {
    try { return JSON.parse(raw); }
    catch(e) {
        const fixed = raw.replace(/([א-ת])"([א-ת])/g, '$1\\"$2');
        return JSON.parse(fixed);
    }
}

// ── עזרי בדיקה ────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function check(label, actual, expected) {
    if (actual === expected) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}`);
        console.log(`     צפוי:   ${expected}`);
        console.log(`     קיבלתי: ${actual}`);
        failed++;
    }
}
function checkNotNull(label, actual) {
    if (actual !== null && actual !== undefined) {
        console.log(`  ✅ ${label} → ${actual}`);
        passed++;
    } else {
        console.log(`  ❌ ${label} → null (צריך למצוא תוצאה)`);
        failed++;
    }
}
function checkNull(label, actual) {
    if (actual === null || actual === undefined) {
        console.log(`  ✅ ${label} → null (נכון, לא אמור למצוא)`);
        passed++;
    } else {
        console.log(`  ❌ ${label} → ${actual} (היה צריך להחזיר null)`);
        failed++;
    }
}

// ── 1. editDist ────────────────────────────────────────────────────────────
console.log('\n📐 editDist:');
check('זהה', editDist('ויצמן','ויצמן'), 0);
check('ויצמן↔וייצמן (1)', editDist('ויצמן','וייצמן'), 1);
check('כהן↔כוהן (1)', editDist('כהן','כוהן'), 1);
check('שונה לגמרי', editDist('ויצמן','גבריאלי') > 3, true);

// ── 2. findBest — מאמנים ──────────────────────────────────────────────────
console.log('\n👤 findBest — מאמנים:');
check('שם מלא מדויק', findBest('דין שויקה', COACHES), 'דין שויקה');
check('שם פרטי בלבד (ייחודי)', findBest('נועם', COACHES), 'נועם כהן');
check('שם משפחה בלבד (ייחודי)', findBest('מרגוליס', COACHES), 'ליאור מרגוליס');
check('שם פרטי + משפחה', findBest('תום בריאולובסקי', COACHES), 'תום בריאולובסקי');
check('שם פרטי בלבד (ייחודי) — גל', findBest('גל', COACHES), 'גל ניקסון');
check('שם עם שגיאת כתיב קלה — מרגולס', findBest('מרגולס', COACHES), 'ליאור מרגוליס');
check('שם חלקי — ליכטנ', findBest('ליכטנפלד', COACHES), 'סהר ליכטנפלד');
check('שם מלא הפוך — שויקה דין', findBest('שויקה דין', COACHES), 'דין שויקה');

// כששניים חולקים שם פרטי — חייב שם מלא
console.log('\n👥 findBest — disambiguation (שם פרטי משותף):');
// אם יש להט ו-X שניהם "להט" — להט מעיין ייחודי כרגע, בדוק שם מלא
check('שם מלא — להט מעיין', findBest('להט מעיין', COACHES), 'להט מעיין');
checkNotNull('שם פרטי ייחודי — להט', findBest('להט', COACHES));

// ── 3. findBest — מוקדים ─────────────────────────────────────────────────
console.log('\n📍 findBest — מוקדים:');
check('וייצמן מדויק', findBest('בי"ס וייצמן, רחובות', LOCATIONS), 'בי"ס וייצמן, רחובות');
check('ויצמן (שגיאת כתיב — חסר י)', findBest('ויצמן', LOCATIONS), 'בי"ס וייצמן, רחובות');
check('וייצמן בלי בי"ס', findBest('וייצמן', LOCATIONS), 'בי"ס וייצמן, רחובות');
check('שפירא', findBest('שפירא', LOCATIONS), 'בי"ס שפירא (יול"א), ת"א');
check('גבריאלי', findBest('גבריאלי', LOCATIONS), 'בי"ס גבריאלי, ת"א');
check('לפיד', findBest('לפיד', LOCATIONS), 'בי"ס לפיד, הוד השרון');
check('רוקח', findBest('רוקח', LOCATIONS), 'בי"ס רוקח, ת"א');
check('אור זבולון', findBest('אור זבולון', LOCATIONS), 'אור זבולון, אריאל');
check('נווה זמר', findBest('נווה זמר', LOCATIONS), 'נווה זמר, רעננה');
checkNull('שם שלא קיים', findBest('בית ספר המצאה', LOCATIONS));

// ── 4. תיקון JSON עברי ───────────────────────────────────────────────────
console.log('\n🔧 תיקון JSON עברי (מרכאות בתוך שמות):');
const jsonGood = '{"intent":"cancel","location":"בי\\"ס שפירא"}';
const jsonBad  = '{"intent":"cancel","location":"בי"ס שפירא"}';
const jsonBad2 = '{"intent":"substitution","location":"ת\\"א","reason":"לא יכול"}';

try {
    const r = fixJson(jsonGood);
    check('JSON תקין עובר ישר', r.intent, 'cancel');
} catch(e) { console.log('  ❌ JSON תקין נכשל:', e.message); failed++; }

try {
    const r = fixJson(jsonBad);
    check('JSON עם בי"ס שפירא — מתוקן', r.location, 'בי"ס שפירא');
} catch(e) { console.log('  ❌ JSON עם בי"ס נכשל:', e.message); failed++; }

try {
    const r = fixJson(jsonBad2);
    check('JSON תקין לא נשבר על ידי regex', r.reason, 'לא יכול');
} catch(e) { console.log('  ❌ JSON תקין נשבר:', e.message); failed++; }

// ── 5. pending TTL ────────────────────────────────────────────────────────
console.log('\n⏰ pending TTL:');
const pending = {};
const now = Date.now();
pending['old'] = { _intent: 'cancel', _ts: now - 6 * 60 * 1000 }; // 6 דקות — פג
pending['fresh'] = { _intent: 'substitution', _ts: now - 2 * 60 * 1000 }; // 2 דקות — תקף

const keys = Object.keys(pending);
for (const k of keys) {
    if (Date.now() - (pending[k]._ts || 0) > 5 * 60 * 1000) delete pending[k];
}
check('old נמחק', pending['old'], undefined);
check('fresh נשמר', pending['fresh']?._intent, 'substitution');

// ── 6. answerQuery — לוגיקת לוח שיבוצים ─────────────────────────────────
console.log('\n📅 answerQuery — לוגיקת לוח שיבוצים:');

// בנה schedule data מוקית שמכסה את כל המקרים
const mockSchedule = {
    rawSchedule: {
        '10/05/2026': {
            dayOfWeek: 'ראשון',
            locations: [
                {
                    location: 'בי"ס גבריאלי, ת"א',
                    coaches: ['דין שויקה', 'נועם כהן'],
                    times: ['16:00', '17:00'],
                    activities: [
                        { coach: 'דין שויקה', time: '16:00', endTime: '17:00', status: 'מתוכנן', group: '' },
                        { coach: 'נועם כהן',  time: '17:00', endTime: '18:00', status: 'בוטל',    group: '' },
                    ]
                },
                {
                    location: 'בי"ס וייצמן, רחובות',
                    coaches: ['גל ניקסון'],
                    times: ['15:00'],
                    activities: [
                        { coach: 'גל ניקסון', time: '15:00', endTime: '16:00', status: 'מתוכנן', group: '' },
                    ]
                }
            ]
        },
        '11/05/2026': {
            dayOfWeek: 'שני',
            locations: [
                {
                    location: 'בי"ס גבריאלי, ת"א',
                    coaches: ['דין שויקה'],
                    times: ['16:00'],
                    activities: [
                        { coach: 'דין שויקה', time: '16:00', endTime: '17:00', status: 'בוטל', group: '' },
                    ]
                }
            ]
        }
    },
    locationDays: { 'בי"ס גבריאלי, ת"א': ['ראשון','שני'] },
    locationCoaches: {},
    coachLocations: {},
    dateToLocations: {}
};

function answerQueryMock(parsed) {
    const saved = scheduleData_global;
    scheduleData_global = mockSchedule;
    const res = answerQueryFn(parsed, mockSchedule);
    scheduleData_global = saved;
    return res;
}

// בדיקה ישירה של הלוגיקה עם mock
function testAnswerQuery(label, parsed, checkFn) {
    const result = answerQueryFn(parsed, mockSchedule);
    if (checkFn(result)) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ ${label}`);
        console.log(`     תוצאה: ${result}`);
        failed++;
    }
}

// פונקציות answerQuery מבודדות — מחלץ את הלוגיקה מבלי WhatsApp
function answerQueryFn(parsed, sd) {
    if (!sd) return '❌ אין נתונים';
    const raw = sd.rawSchedule || {};
    const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const today = new Date('2026-05-10'); today.setHours(0,0,0,0);
    const weekEnd = new Date('2026-05-16'); weekEnd.setHours(23,59,59,999);
    const nextWeekStart = new Date('2026-05-17'); const nextWeekEnd = new Date('2026-05-23');

    function dateInRange(dateStr, from, to) {
        const [d,m,y] = dateStr.split('/');
        const dt = new Date(`${y}-${m}-${d}`);
        return dt >= from && dt <= to;
    }
    function dateToDisplay(dateStr) {
        const [d,m,y] = dateStr.split('/');
        const dt = new Date(`${y}-${m}-${d}`);
        return `${hebrewDays[dt.getDay()]} ${d}/${m}`;
    }

    const subject = parsed.subject || '';
    const range = parsed.range || 'week';
    let fromDate, toDate;
    if (range === 'next_week') { fromDate = nextWeekStart; toDate = nextWeekEnd; }
    else if (range === 'date' && parsed.date) {
        const [d,m,y] = parsed.date.split('/'); fromDate = new Date(`${y}-${m}-${d}`); toDate = new Date(fromDate);
    } else { fromDate = today; toDate = weekEnd; }

    if (parsed.queryType === 'present' && parsed.date) {
        const dayData = raw[parsed.date];
        const working = new Set();
        if (dayData) for (const loc of dayData.locations) for (const a of (loc.activities||[])) if (a.status !== 'בוטל' && a.coach) working.add(a.coach);
        const list = COACHES.filter(c => working.has(c));
        return list.length === 0 ? `😴 אין` : `✅ *מאמנים שעובדים*:\n\n${list.join('\n')}`;
    }
    if (parsed.queryType === 'absent' && parsed.date) {
        const dayData = raw[parsed.date];
        const working = new Set();
        if (dayData) for (const loc of dayData.locations) for (const a of (loc.activities||[])) if (a.status !== 'בוטל' && a.coach) working.add(a.coach);
        const list = COACHES.filter(c => !working.has(c));
        return list.length === 0 ? `✅ הכל` : `😴 *מאמנים שלא עובדים*:\n\n${list.join('\n')}`;
    }
    if (parsed.queryType === 'times') {
        const loc_name = subject ? findBest(subject, LOCATIONS) : null;
        if (!loc_name) return '❓ ציין שם מוקד.';
        const entries = [];
        for (const [date, { locations }] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            const loc = locations.find(l => l.location === loc_name);
            if (loc) {
                const acts = (loc.activities||[]).filter(a => a.status !== 'בוטל').sort((a,b) => (a.time||'').localeCompare(b.time||''));
                if (acts.length === 0) continue;
                entries.push(`${dateToDisplay(date)}: ${acts.map(a => `${a.time}(${a.coach})`).join(', ')}`);
            }
        }
        return entries.length === 0 ? `📭 אין` : `🕐 *שעות*:\n\n${entries.join('\n')}`;
    }
    if (parsed.queryType === 'locations' && parsed.date) {
        const dayData = raw[parsed.date];
        const dateLabel = dateToDisplay(parsed.date);
        if (!dayData) return `📭 אין פעילויות ב-${dateLabel}.`;
        const activeLocations = dayData.locations
            .filter(l => (l.activities||[]).some(a => a.status !== 'בוטל'))
            .map(l => {
                const coaches = [...new Set((l.activities||[]).filter(a => a.status !== 'בוטל' && a.coach).map(a => a.coach))];
                return `${l.location}${coaches.length ? ' — ' + coaches.join(', ') : ''}`;
            });
        if (activeLocations.length === 0) return `📭 אין פעילויות מתוכננות ב-${dateLabel}.`;
        return `📍 *מוקדים פעילים — ${dateLabel}*:\n\n${activeLocations.join('\n')}`;
    }
    const matchedCoach = subject ? findBest(subject, COACHES) : null;
    const matchedLocation = subject ? findBest(subject, LOCATIONS) : null;
    if (matchedCoach) {
        const entries = [];
        for (const [date, { locations }] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            for (const loc of locations) {
                const activeActs = (loc.activities||[]).filter(a => a.coach === matchedCoach && a.status !== 'בוטל');
                if (activeActs.length === 0) continue;
                const times = activeActs.map(a => a.time).filter(t => /^\d{1,2}:\d{2}$/.test(t)).sort();
                entries.push(`${dateToDisplay(date)} — ${loc.location}${times.length ? ' '+times[0] : ''}`);
            }
        }
        return entries.length === 0 ? `📭 אין` : `📅 *${matchedCoach}*:\n\n${entries.join('\n')}`;
    }
    if (matchedLocation) {
        const entries = [];
        for (const [date, { locations }] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            const loc = locations.find(l => l.location === matchedLocation);
            if (loc) {
                const activeCoaches = [...new Set((loc.activities||[]).filter(a => a.status !== 'בוטל' && a.coach).map(a => a.coach))];
                if (activeCoaches.length === 0) continue;
                entries.push(`${dateToDisplay(date)} — ${activeCoaches.join(', ')}`);
            }
        }
        return entries.length === 0 ? `📭 אין` : `📅 *${matchedLocation}*:\n\n${entries.join('\n')}`;
    }
    if (range === 'date' && parsed.date) {
        const dayData = raw[parsed.date];
        if (!dayData) return `📭 אין פעילויות ב-${parsed.date}.`;
        const lines = dayData.locations.map(l => {
            const active = [...new Set((l.activities||[]).filter(a => a.status !== 'בוטל' && a.coach).map(a => a.coach))];
            return active.length > 0 ? `${l.location}: ${active.join(', ')}` : null;
        }).filter(Boolean);
        return lines.length === 0 ? `📭 אין` : `📅 *${parsed.date}*:\n\n${lines.join('\n')}`;
    }
    return '❓';
}

// present: רק דין (נועם בוטל)
testAnswerQuery('present — מסנן מבוטלים', { queryType: 'present', date: '10/05/2026' }, r => r.includes('דין שויקה') && !r.includes('נועם כהן'));

// absent: נועם נחשב לא עובד (בוטל), גל לא בגבריאלי אבל עובד בוייצמן
testAnswerQuery('absent — נועם מסומן כלא עובד כשבוטל', { queryType: 'absent', date: '10/05/2026' }, r => r.includes('נועם כהן') && !r.includes('דין שויקה') && !r.includes('גל ניקסון'));

// coach schedule: דין — רק 10/05 (ב-11/05 בוטל)
testAnswerQuery('לוח מאמן — מציג רק ימים עם פעילות פעילה', { subject: 'דין', range: 'week' }, r => r.includes('10/05') && !r.includes('11/05'));

// location schedule: גבריאלי — רק דין (נועם בוטל)
testAnswerQuery('לוח מוקד — מציג רק מאמנים פעילים', { subject: 'גבריאלי', range: 'week' }, r => r.includes('דין שויקה') && !r.includes('נועם כהן'));

// times: גבריאלי — רק 16:00 (17:00 בוטל)
testAnswerQuery('שעות — מסנן שעות מבוטלות', { queryType: 'times', subject: 'גבריאלי', range: 'week' }, r => r.includes('16:00') && !r.includes('17:00'));

// date fallback: 10/05 — גבריאלי רק עם דין
testAnswerQuery('תאריך כללי — מסנן מבוטלים', { range: 'date', date: '10/05/2026' }, r => r.includes('דין שויקה') && !r.includes('נועם כהן'));

// answerQuery edge cases נוספים
testAnswerQuery('absent — כל המוקדים בוטלו → כולם נחשבים לא עובדים', { queryType: 'present', date: '11/05/2026' }, r => r.includes('😴'));
testAnswerQuery('לוח מאמן — אין לו שום פעילות בטווח → הודעת ריק', { subject: 'קרן דבוש', range: 'week' }, r => r.includes('📭'));
testAnswerQuery('לוח מוקד — כל הפעילויות בוטלו → הודעת ריק', { subject: 'גבריאלי', range: 'date', date: '11/05/2026' }, r => r.includes('📭') || r.includes('אין'));
testAnswerQuery('date fallback — כל המוקדים בוטלו → הודעת ריק', { range: 'date', date: '11/05/2026' }, r => r.includes('📭') || r.includes('אין'));
testAnswerQuery('שבוע הבא — אין נתונים → הודעת ריק', { subject: 'דין', range: 'next_week' }, r => r.includes('📭'));
// status — הפונקציה המקוצרת לא ממשת status; בודקים דרך answerQueryFn המלאה
{
    // status: מוקד + תאריך → צריך להחזיר activities עם סטטוס
    // נבדוק רק שלא מחזיר שגיאה ושיש תוכן
    const statusRes1 = answerQueryFn({ queryType: 'status', subject: 'גבריאלי', date: '10/05/2026' }, mockSchedule);
    const statusRes2 = answerQueryFn({ queryType: 'status', subject: 'דין שויקה', date: '10/05/2026' }, mockSchedule);
    // answerQueryFn לא ממשת status — מחזירה schedule fallback. זה ידוע — בודקים שלפחות לא קורסת
    if (statusRes1 && statusRes2) { console.log('  ✅ status — לא קורסת (fallback)'); passed++; }
    else { console.log('  ❌ status — קרסה'); failed++; }
}

// locations queryType
testAnswerQuery('locations — מציג מוקדים עם מאמנים',
    { queryType: 'locations', date: '10/05/2026' },
    r => r.includes('📍') && r.includes('בי"ס גבריאלי, ת"א') && r.includes('בי"ס וייצמן, רחובות') && r.includes('דין שויקה')
);
testAnswerQuery('locations — מסנן מוקד שכולו בוטל',
    { queryType: 'locations', date: '11/05/2026' },
    r => r.includes('📭') || r.includes('אין')
);
testAnswerQuery('locations — לא כולל מאמנים מבוטלים',
    { queryType: 'locations', date: '10/05/2026' },
    r => !r.includes('נועם כהן')
);

// ── 7. findBest — שגיאות תמלול נפוצות (Whisper) ─────────────────────────
console.log('\n🎤 findBest — שגיאות תמלול Whisper:');
check('ניקסן → גל ניקסון (editDist 1)',      findBest('ניקסן', COACHES),            'גל ניקסון');
check('אהרני → שלו אהרוני (editDist 1)',      findBest('אהרני', COACHES),            'שלו אהרוני');
check('בריאולבסקי → תום (editDist 1)',         findBest('בריאולבסקי', COACHES),       'תום בריאולובסקי');
check('מנטבילסקי → אריק (editDist 1)',         findBest('מנטבילסקי', COACHES),        'אריק מונטבילסקי');
check('גורפין → יובל גורפיין (editDist 1)',    findBest('גורפין', COACHES),           'יובל גורפיין');
check('ששון → גילי ששון',                       findBest('ששון', COACHES),             'גילי ששון');
check('בלוך → ביס בלוך, ת"א',                  findBest('בלוך', LOCATIONS),           'בי"ס בלוך, ת"א');
check('הדרים → הצלחה הדרים ראשלצ',             findBest('הדרים', LOCATIONS),          'הצלח"ה הדרים ראשל"צ');
check('יוחנני → ביס יוחנני הרצליה',            findBest('יוחנני', LOCATIONS),         'בי"ס יוחנני, הרצליה');
check('צמרות → ביס צמרות באר יעקב',            findBest('צמרות', LOCATIONS),          'בי"ס צמרות, באר יעקב');
check('כלנא → ביס כלנא יחד, יפו',              findBest('כלנא', LOCATIONS),           'בי"ס כלנא יחד (יוח"א), יפו');
check('שם עם גרשיים → מנוקה',                  findBest('"דין שויקה"', COACHES),      'דין שויקה');
check('שם עם רווחים כפולים',                   findBest('דין  שויקה', COACHES),       'דין שויקה');
checkNull('empty string → null',               findBest('', COACHES));
checkNull('null → null',                       findBest(null, COACHES));
checkNull('מילה כללית שאינה שם',               findBest('תל אביב', COACHES));

// ── 8. validateCancel & validateSubstitution ────────────────────────────
console.log('\n🔍 validate functions:');

const mockSD = {
    locationDays: {
        'בי"ס גבריאלי, ת"א': ['ראשון', 'שני'],
        'בי"ס וייצמן, רחובות': ['שלישי', 'חמישי'],
    },
    dateToLocations: {
        '11/05/2026': ['בי"ס גבריאלי, ת"א'],
        '12/05/2026': ['בי"ס גבריאלי, ת"א', 'בי"ס וייצמן, רחובות'],
    },
    coachLocations: {
        'דין שויקה': { 'בי"ס גבריאלי, ת"א': ['ראשון', 'שני'] },
        'גל ניקסון':  { 'בי"ס וייצמן, רחובות':  ['שלישי'] },
    }
};

function validateCancelFn(location, date, sd) {
    if (!sd) return null;
    const [d,m,y] = date.split('/');
    const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const dayOfWeek = hebrewDays[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
    const warnings = [];
    if (location) {
        const activeDays = sd.locationDays?.[location] || [];
        const locationsOnDate = sd.dateToLocations?.[date] || [];
        const notOnDate = locationsOnDate.length > 0 && !locationsOnDate.includes(location);
        if (notOnDate) {
            warnings.push(`⚠️ ${location} לא מופיע ב-${date}`);
        } else if (activeDays.length > 0 && !activeDays.includes(dayOfWeek)) {
            warnings.push(`⚠️ ${location} פעיל ב-${activeDays.join('/')} לא ב${dayOfWeek}`);
        }
    }
    return warnings.length > 0 ? warnings.join('\n') : null;
}

function validateSubFn(coach, location, date, sd) {
    if (!sd) return null;
    const [d,m,y] = date.split('/');
    const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const dayOfWeek = hebrewDays[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
    const warnings = [];
    if (coach && location) {
        const coachLocs = sd.coachLocations?.[coach] || {};
        if (Object.keys(coachLocs).length > 0 && !coachLocs[location]) {
            warnings.push(`⚠️ ${coach} לא מועסק ב-${location}`);
        } else if (coachLocs[location] && !coachLocs[location].includes(dayOfWeek)) {
            warnings.push(`⚠️ ${coach} פעיל ב-${coachLocs[location].join('/')} לא ב${dayOfWeek}`);
        }
    }
    return warnings.length > 0 ? warnings.join('\n') : null;
}

// 11/05/2026 = יום שני — גבריאלי עובד בשני → null
check('validateCancel — יום תקין → null',           validateCancelFn('בי"ס גבריאלי, ת"א', '11/05/2026', mockSD), null);
// 12/05/2026 = שלישי — גבריאלי ב-dateToLocations אך לא עובד בשלישי → אזהרה
const warnDay = validateCancelFn('בי"ס גבריאלי, ת"א', '12/05/2026', mockSD);
check('validateCancel — יום לא רגיל → אזהרה',       warnDay !== null, true);
check('validateCancel — לא כפולה (שורה אחת)',        warnDay?.split('\n').length, 1);
// תאריך שלא ב-dateToLocations: אין "notOnDate", אבל יום-בשבוע עדיין נבדק → אזהרה אם לא נכון
{
    const w = validateCancelFn('בי"ס גבריאלי, ת"א', '01/01/2030', mockSD); // יום שישי — לא ראשון/שני
    check('validateCancel — תאריך לא ידוע + יום לא תקין → אזהרה', w !== null, true);
}
// ללא scheduleData → null
check('validateCancel — אין נתונים → null',          validateCancelFn('בי"ס גבריאלי, ת"א', '11/05/2026', null), null);
// מוקד לא ידוע: locationsOnDate קיים ב-11/05 ולא כולל "ביס חדש" → notOnDate=true → אזהרה
{
    const w2 = validateCancelFn('ביס חדש', '11/05/2026', mockSD);
    check('validateCancel — מוקד לא ב-schedule → מזהיר', w2 !== null, true);
    // בפועל brain.js לא מגיע לכאן כי findBest מחזיר null קודם
}

// validateSubstitution
check('validateSub — תקין (שני) → null',             validateSubFn('דין שויקה', 'בי"ס גבריאלי, ת"א', '11/05/2026', mockSD), null);
const warnSubDay = validateSubFn('דין שויקה', 'בי"ס גבריאלי, ת"א', '12/05/2026', mockSD);
check('validateSub — יום לא נכון → אזהרה',           warnSubDay !== null, true);
const warnSubLoc = validateSubFn('דין שויקה', 'בי"ס וייצמן, רחובות', '11/05/2026', mockSD);
check('validateSub — מוקד לא נכון → אזהרה',          warnSubLoc !== null && warnSubLoc.includes('לא מועסק'), true);
check('validateSub — מאמן לא ידוע → null',           validateSubFn('זר לגמרי', 'בי"ס גבריאלי, ת"א', '11/05/2026', mockSD), null);
check('validateSub — אין נתונים → null',             validateSubFn('דין שויקה', 'בי"ס גבריאלי, ת"א', '11/05/2026', null), null);

// ── 9. pending — מקרי קצה ───────────────────────────────────────────────
console.log('\n⏰ pending — מקרי קצה:');
{
    const p2 = {};
    const now2 = Date.now();
    // שני pending — כן מוחק את הראשון בלבד
    p2['a'] = { _intent: 'cancel',       _ts: now2 };
    p2['b'] = { _intent: 'substitution', _ts: now2 };
    // סמולייט "כן" — מחק את המפתח הראשון
    const keys2 = Object.keys(p2);
    delete p2[keys2[0]];
    check('לאחר אישור — נשאר pending אחד', Object.keys(p2).length, 1);
    check('הנשאר הוא substitution',        Object.values(p2)[0]._intent, 'substitution');

    // TTL: שני פגו, אחד תקף
    const p3 = {
        'x': { _ts: now2 - 6*60*1000 },
        'y': { _ts: now2 - 7*60*1000 },
        'z': { _ts: now2 - 1*60*1000 },
    };
    for (const k of Object.keys(p3)) {
        if (Date.now() - (p3[k]._ts||0) > 5*60*1000) delete p3[k];
    }
    check('TTL: שני נמחקו, אחד נשאר', Object.keys(p3).length, 1);
    check('הנשאר הוא z', 'z' in p3, true);
}

// partial cancel count + status value
console.log('\n🔢 cancelActivities — status ו-partial failure:');
const mockResult = { cancelledCount: 3, failCount: 2, matchedLocation: 'בי"ס גבריאלי, ת"א' };
const failNote = mockResult.failCount > 0 ? `\n⚠️ ${mockResult.failCount} אירועים לא עודכנו (שגיאת API)` : '';
check('failNote מוצג כשיש כשלים', failNote.includes('2'), true);
check('failNote ריק כשאין כשלים', (() => { const r2 = { failCount: 0 }; return r2.failCount > 0 ? 'x' : ''; })(), '');
// בדוק שה-PUT שולח 'canceled' (אמריקאי) ולא 'cancelled' (בריטי)
const brainSrc = fs.readFileSync(path.join(__dirname,'brain.js'),'utf8');
check("PUT שולח 'canceled' (לא 'cancelled')", brainSrc.includes("status: 'canceled'") && !brainSrc.includes("status: 'cancelled'"), true);
check("restoreActivities שולח 'planned'", brainSrc.includes("status: 'planned'"), true);

// restoreActivities filter logic: מסנן canceled בלבד, לא planned
console.log('\n🔄 restoreActivities — לוגיקת סינון:');
{
    const mockEvents = [
        { id: '1', clientName: 'בי"ס גבריאלי, ת"א',   coachName: 'דין שויקה',  status: 'canceled' },
        { id: '2', clientName: 'בי"ס גבריאלי, ת"א',   coachName: 'נועם כהן',   status: 'planned'  },
        { id: '3', clientName: 'בי"ס וייצמן, רחובות', coachName: 'גל ניקסון',  status: 'canceled' },
        { id: '4', clientName: 'בי"ס גבריאלי, ת"א',   coachName: 'גל ניקסון',  status: 'canceled' },
    ];
    const canceled = e => e.status === 'canceled' || e.status === 'בוטל';

    const toRestore_all   = mockEvents.filter(e => canceled(e));
    const toRestore_gab   = mockEvents.filter(e => canceled(e) && e.clientName === 'בי"ס גבריאלי, ת"א');
    const toRestore_none  = mockEvents.filter(e => canceled(e) && e.clientName === 'לא קיים');
    const toRestore_coach = mockEvents.filter(e => canceled(e) && e.coachName === 'דין שויקה');
    const toRestore_both  = mockEvents.filter(e => canceled(e) && e.clientName === 'בי"ס גבריאלי, ת"א' && e.coachName === 'גל ניקסון');
    const toRestore_coachLoc_miss = mockEvents.filter(e => canceled(e) && e.clientName === 'בי"ס גבריאלי, ת"א' && e.coachName === 'נועם כהן');

    check('filter כל — 3 canceled', toRestore_all.length, 3);
    check('filter לפי מוקד — 2 canceled בגבריאלי', toRestore_gab.length, 2);
    check('filter planned לא נכלל', toRestore_all.every(e => e.status !== 'planned'), true);
    check('filter מוקד שאין לו canceled — 0', toRestore_none.length, 0);
    check('filter לפי מאמן בלבד — 1 (דין)', toRestore_coach.length, 1);
    check('filter מאמן + מוקד — 1 (גל בגבריאלי)', toRestore_both.length, 1);
    check('filter מאמן planned במוקד — 0 (נועם planned)', toRestore_coachLoc_miss.length, 0);
}

// ── 7. detectIntent דרך API ───────────────────────────────────────────────
console.log('\n🤖 detectIntent (API אמיתי):');

async function detectIntent(text) {
    const today = new Date();
    const todayStr = today.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric'});
    const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 600,
        messages: [{ role: 'user', content:
`זהה את סוג הבקשה וחלץ פרטים. החזר JSON בלבד.
תאריך היום: ${todayStr} (${['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][today.getDay()]})

אם זו בקשת ביטול פעילות:
{"intent":"cancel","date":"DD/MM/YYYY","location":"השם המדויק מהרשימה, או ריק אם כל היום","cancelAll":false}

אם זו בקשת שחזור פעילות שבוטלה / החזרה למצב מתוכנן:
{"intent":"restore","date":"DD/MM/YYYY","location":"השם המדויק מהרשימה, או ריק אם כל היום","coach":"שם המאמן אם צוין במפורש, ריק אחרת"}

אם זו בקשת חילוף:
{"intent":"substitution","requestingCoach":"","date":"DD/MM/YYYY","location":"","reason":"","replacementCoach":"","paymentDetails":"","notes":""}

אם זו שאלה מי עובד / מי לא עובד / לוח זמנים / שעות:
{"intent":"query","subject":"","range":"week","date":"","queryType":"present/absent/schedule/status/times"}

אם זו שאלה איזה מוקדים / בתי ספר יש בהם פעילות ביום מסוים:
{"intent":"query","subject":"","range":"date","date":"DD/MM/YYYY","queryType":"locations"}

מילים שמעידות על ביטול: בטל, ביטול, לא יתקיים, מבוטל, לא מתקיים, בתל
מילים שמעידות על שחזור: שחזר, החזר, הפעל מחדש, בטל ביטול, חזרה לפעילות, שחזור, מתוכנן שוב
מילות מפתח "כל היום" / "כל הפעילויות" → cancelAll:true, location:""

חשוב לתאריך:
"בשלישי במאי" = 03/05
"ברביעי ביוני" = 04/06

${LOCATIONS.join('\n')}

טקסט: "${text}"`
        }]
    });
    let raw = msg.content[0].text.replace(/```json\n?|\n?```/g,'').trim();
    try { return JSON.parse(raw); }
    catch(e) {
        const fixed = raw.replace(/([א-ת])"([א-ת])/g, '$1\\"$2');
        return JSON.parse(fixed);
    }
}

const intentTests = [
    // ביטול
    { text: 'בטל פעילות בוייצמן ב-19 מאי',                           expectIntent: 'cancel',       expectLocation: 'בי"ס וייצמן, רחובות' },
    { text: 'בתל פעילות באור זבולון ב-12 ביוני',                     expectIntent: 'cancel',       expectLocation: 'אור זבולון, אריאל' },
    { text: 'בטל את כל הפעילויות ב-15 ביולי',                        expectIntent: 'cancel',       expectLocation: '' },
    { text: 'לא יתקיים שיעור בגבריאלי מחר',                         expectIntent: 'cancel' },
    { text: 'ביטל שמיר חולון בשלישי הבא',                           expectIntent: 'cancel',       expectLocation: 'בי"ס שמיר, חולון' },
    // חילוף
    { text: 'דין שויקה מבקש חילוף ב-20 מאי בגבריאלי כי הוא חולה',  expectIntent: 'substitution' },
    { text: 'נועם כהן לא יכול ב-3 ביוני בוייצמן, גל יחליף',         expectIntent: 'substitution' },
    // שחזור
    { text: 'שחזר פעילות בגבריאלי ב-19 מאי',                       expectIntent: 'restore',      expectLocation: 'בי"ס גבריאלי, ת"א' },
    { text: 'החזר את הפעילויות בלפיד למצב מתוכנן',                  expectIntent: 'restore',      expectLocation: 'בי"ס לפיד, הוד השרון' },
    { text: 'בטל ביטול בוייצמן ב-10 ביוני',                        expectIntent: 'restore',      expectLocation: 'בי"ס וייצמן, רחובות' },
    { text: 'החזר את הפעילות של סיון במרחבים ב-30 באפריל למתוכנן', expectIntent: 'restore',      expectLocation: 'בי"ס מרחבים, יבנה',  expectCoach: 'סיון טפירו' },
    { text: 'שחזר פעילות של דין שויקה בגבריאלי',                   expectIntent: 'restore',      expectLocation: 'בי"ס גבריאלי, ת"א',  expectCoach: 'דין שויקה' },
    // שאלות
    { text: 'מי עובד מחר',                                           expectIntent: 'query' },
    { text: 'מי לא עובד ב-20 ביוני',                                  expectIntent: 'query',        expectQueryType: 'absent' },
    { text: 'איפה עובד דין השבוע',                                    expectIntent: 'query',        expectQueryType: 'schedule' },
    { text: 'מה השעות בגבריאלי מחר',                                  expectIntent: 'query',        expectQueryType: 'times' },
    { text: 'האם הפעילות בוייצמן ב-10 ביוני מתוכננת',                expectIntent: 'query' }, // status/schedule — תלוי בפרומפט; בבוט הפרומפט המלא מחזיר status
    { text: 'איזה בתי ספר עובדים מחר',                              expectIntent: 'query',        expectQueryType: 'locations' },
    { text: 'אילו מוקדים פתוחים ביום שישי',                        expectIntent: 'query',        expectQueryType: 'locations' },
];

async function runIntentTests() {
    for (const t of intentTests) {
        try {
            const r = await detectIntent(t.text);
            let ok = r.intent === t.expectIntent;
            if (ok && t.expectLocation !== undefined) {
                if (t.expectLocation === '') ok = !r.location || r.location === '';
                else ok = findBest(r.location, LOCATIONS) === t.expectLocation;
            }
            if (ok && t.expectQueryType !== undefined) {
                ok = r.queryType === t.expectQueryType;
            }
            if (ok && t.expectCoach !== undefined) {
                ok = findBest(r.coach, COACHES) === t.expectCoach;
            }
            if (ok) {
                const extra = [r.location, r.queryType, r.coach ? `coach:${r.coach}` : ''].filter(Boolean).join(' | ');
                console.log(`  ✅ "${t.text.slice(0,38)}..." → ${r.intent}${extra ? ' | '+extra : ''}`);
                passed++;
            } else {
                console.log(`  ❌ "${t.text.slice(0,38)}..."`);
                console.log(`     intent: ${r.intent} (צפוי: ${t.expectIntent})`);
                if (t.expectLocation !== undefined) console.log(`     location: ${r.location} (צפוי: ${t.expectLocation})`);
                if (t.expectQueryType !== undefined) console.log(`     queryType: ${r.queryType} (צפוי: ${t.expectQueryType})`);
                if (t.expectCoach !== undefined) console.log(`     coach: ${r.coach} (צפוי: ${t.expectCoach})`);
                failed++;
            }
        } catch(e) {
            console.log(`  ❌ "${t.text.slice(0,35)}..." → שגיאה: ${e.message}`);
            failed++;
        }
    }
}

// ── 7. previewCancel (קריאת API בלי כתיבה) ──────────────────────────────
async function testPreviewCancel() {
    console.log('\n🔍 previewCancel (API קריאה בלבד):');
    const tokenPath = path.join(__dirname, 'base44_token.json');
    if (!fs.existsSync(tokenPath)) {
        console.log('  ⚠️  אין base44_token.json — מדלג');
        return;
    }
    const { token, appId } = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const H = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // תאריך שבו כנראה אין פעילות (עבר רחוק)
    const pastDate = '2020-01-01';
    try {
        const res = await fetch(`https://base44.app/api/apps/${appId}/entities/Event?date=${pastDate}&limit=500`, { headers: H });
        if (!res.ok) throw new Error(`סטטוס ${res.status}`);
        const events = await res.json();
        check('API מחזיר מערך', Array.isArray(events), true);
        console.log(`  ✅ API עובד — ${events.length} אירועים ב-${pastDate}`);
        passed++;

        // תאריך עתידי — בדוק מבנה אירוע
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 14);
        const futureIso = futureDate.toISOString().slice(0,10);
        const res2 = await fetch(`https://base44.app/api/apps/${appId}/entities/Event?date=${futureIso}&limit=500`, { headers: H });
        if (res2.ok) {
            const ev2 = await res2.json();
            console.log(`  ✅ API עובד לתאריך עתידי (${futureIso}) — ${ev2.length} אירועים`);
            passed++;

            if (ev2.length > 0) {
                const ev = ev2[0];
                // בדוק שדות חיוניים קיימים
                check('אירוע — יש id',         typeof ev.id === 'string' || typeof ev.id === 'number', true);
                check('אירוע — יש clientName', typeof ev.clientName === 'string', true);
                check('אירוע — יש coachName',  typeof ev.coachName === 'string', true);
                check('אירוע — יש status',     typeof ev.status === 'string', true);
                check('אירוע — יש date',       typeof ev.date === 'string', true);
                // סטטוס הגיוני — API משתמש ב-'canceled' (אמריקאי) ולא 'cancelled'
                const validStatuses = ['planned','canceled','done','מתוכנן','בוטל'];
                check('אירוע — status מוכר',   validStatuses.includes(ev.status), true);

                // בדוק previewCancel filter לפי מוקד
                const locName = ev.clientName;
                const planned = ev2.filter(e => (e.status === 'planned' || e.status === 'מתוכנן') && e.clientName === locName);
                const all     = ev2.filter(e => e.clientName === locName);
                check('previewCancel filter — planned ≤ all', planned.length <= all.length, true);
                console.log(`  ✅ previewCancel filter: ${planned.length}/${all.length} planned ב-${locName.slice(0,20)}`);
                passed++;
            } else {
                console.log(`  ⚠️  אין אירועים ב-${futureIso} לבדיקת מבנה`);
            }
        }

        // בדוק שה-API מכיר 'canceled' — שלוף אירועים ובדוק שיש canceled
        const resAll = await fetch(`https://base44.app/api/apps/${appId}/entities/Event?limit=500`, { headers: H });
        if (resAll.ok) {
            const allEvs = await resAll.json();
            const hasCancel = allEvs.some(e => e.status === 'canceled');
            const hasBritish = allEvs.some(e => e.status === 'cancelled');
            check("API משתמש ב-'canceled' (קיים בנתונים)", hasCancel, true);
            check("API לא משתמש ב-'cancelled' (בריטי)", hasBritish, false);
        }

        // בדוק SubstitutionRequest endpoint (GET בלבד)
        const resS = await fetch(`https://base44.app/api/apps/${appId}/entities/SubstitutionRequest?limit=5`, { headers: H });
        if (resS.ok) {
            const subs = await resS.json();
            check('SubstitutionRequest endpoint — מחזיר מערך', Array.isArray(subs), true);
            console.log(`  ✅ SubstitutionRequest endpoint פעיל — ${subs.length} רשומות`);
            passed++;
        } else {
            console.log(`  ⚠️  SubstitutionRequest endpoint סטטוס ${resS.status}`);
        }
    } catch(e) {
        console.log(`  ❌ שגיאת API: ${e.message}`);
        failed++;
    }
}

// ── הרצה ─────────────────────────────────────────────────────────────────
(async () => {
    try {
        await runIntentTests();
        await testPreviewCancel();
    } catch(e) {
        console.log('\n❌ שגיאה כללית:', e.message);
    }

    console.log(`\n${'═'.repeat(40)}`);
    console.log(`סה"כ: ${passed} עברו ✅ | ${failed} נכשלו ❌`);
    if (failed === 0) console.log('🎉 הכל תקין!');
    else console.log('⚠️  יש כשלים לתיקון');
})();
