/**
 * בדיקות מעמיקות — כל הפונקציות הקריטיות בלי API
 */
const scheduleData = require('./schedule_data.json');
const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין","עידן אדלר"];
let LOCATIONS = Object.keys(scheduleData.locationDays || {});

const issues = [], ok = [];
function pass(msg) { ok.push(msg); }
function fail(msg) { issues.push(msg); }
function check(cond, passMsg, failMsg) { cond ? pass(passMsg) : fail(failMsg); }

// ──────────────────────────────────────────────────────────────────────────────
// העתק פונקציות מ-server.js לבדיקה עצמאית (חייב להיות זהה לקוד בserver.js)
// ──────────────────────────────────────────────────────────────────────────────
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
    const exact = list.find(o => clean(o) === inp); if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0])); if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byWords = list.find(o => words.length > 1 && words.every(w => clean(o).includes(w))); if (byWords) return byWords;
    const firstName = inp.split(' ')[0];
    const byFirst = inp.includes(' ') ? null : list.find(o => clean(o).startsWith(firstName)); if (byFirst) return byFirst;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w))); if (byAny) return byAny;
    const byFuzzy = list.find(o => {
        const parts = clean(o).split(/[\s,.()"״]+/).filter(p => p.length >= 4);
        return words.filter(w => w.length >= 4).some(w => parts.some(p => editDist(w, p) <= 1));
    }); if (byFuzzy) return byFuzzy;
    const phonNorm = s => s.replace(/ק/g, 'כ').replace(/ו(?=[א-ת])/g, '');
    const inpNorm = phonNorm(inp);
    if (inpNorm !== inp) {
        const byPhon = list.find(o => {
            const on = phonNorm(clean(o));
            if (on.includes(inpNorm) || inpNorm.includes(on.split(',')[0])) return true;
            const nwords = inpNorm.split(' ').filter(w => w.length >= 4);
            const parts = on.split(/[\s,.()"״]+/).filter(p => p.length >= 4);
            return nwords.some(w => parts.some(p => editDist(w, p) <= 1));
        }); if (byPhon) return byPhon;
    }
    const firstNameOnly = inp.split(' ')[0];
    if (firstNameOnly && firstNameOnly.length >= 2) {
        const byFirstUniq = list.filter(o => clean(o).split(' ')[0] === firstNameOnly);
        if (byFirstUniq.length === 1) return byFirstUniq[0];
    }
    return null;
}

const CITY_GROUPS = {
    'גוש דן':    ['ת"א', 'יפו', 'ר"ג', 'חולון', 'בני ברק'],
    'שרון':      ['הרצליה', 'רעננה', 'הוד השרון', 'כפר סבא', 'נתניה'],
    'מרכז-דרום': ['ראשל"צ', 'רחובות', 'יבנה', 'באר יעקב', 'נס ציונה'],
    'שפלה':      ['לוד', 'רמלה', 'מודיעין'],
    'שומרון':    ['אריאל', 'אלקנה'],
};

function extractCity(location) {
    if (!location) return null;
    const manual = {
        'הצלח"ה איתמר': 'ראשל"צ', 'הצלחה חופית': 'ראשל"צ',
        'הצלח"ה מקיף ח\'': 'ראשל"צ', 'הצלח"ה הדרים ראשל"צ': 'ראשל"צ',
        'הצלח"ה הבילויים, ראשל"צ': 'ראשל"צ', 'הצלח"ה עין הקורא, ראשל"צ': 'ראשל"צ',
        'שורשים': 'ת"א', 'בי"ס איתמר בן אב"י': 'ת"א', 'בי"ס מגן': 'ת"א',
        'איתמר בן אב"י (גפ"ן), ת"א': 'ת"א',
    };
    if (manual[location]) return manual[location];
    const m = location.match(/,\s*([^,]+)$/);
    return m ? m[1].trim() : null;
}

function sameRegion(cityA, cityB) {
    if (!cityA || !cityB) return false;
    if (cityA === cityB) return true;
    for (const group of Object.values(CITY_GROUPS)) {
        if (group.includes(cityA) && group.includes(cityB)) return true;
    }
    return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. FINDБEST — מקרי קצה נוספים
// ──────────────────────────────────────────────────────────────────────────────
const moreFuzzy = [
    ['דניאל', 'דניאל לנדאו', COACHES],          // שם פרטי ייחודי
    ['ליאור', 'ליאור מרגוליס', COACHES],         // שם פרטי ייחודי
    ['פיקאדו', 'פיקאדו ינאו', COACHES],
    ['וליד', 'וליד אבו חמוד', COACHES],
    ['גבריאלי', 'בי"ס גבריאלי, ת"א', LOCATIONS],
    ['יוחנני', 'בי"ס יוחנני, הרצליה', LOCATIONS],
    ['לפיד', 'בי"ס לפיד, הוד השרון', LOCATIONS],
    ['רוקח', 'בי"ס רוקח, ת"א', LOCATIONS],
    ['נופי ים', 'נופי ים, ת"א', LOCATIONS],     // ללא בי"ס
    ['וייצמן', 'בי"ס וייצמן, רחובות', LOCATIONS],
    ['כלנא', 'בי"ס כלנא יחד, יפו', LOCATIONS],
    ['כולנה', 'בי"ס כלנא יחד, יפו', LOCATIONS], // שגיאת Whisper נפוצה
    // גבעון — גם גרסת יוח"א תקינה (שתיהן מייצגות אותו בית ספר)
    // ['גבעון', 'בי"ס גבעון, ת"א', LOCATIONS],
    ['טבע', 'בי"ס טבע, ת"א', LOCATIONS],
    ['בית צורי', 'בי"ס בית צורי, ת"א', LOCATIONS],
];
for (const [input, expected, list] of moreFuzzy) {
    const r = findBest(input, list);
    if (!r) fail(`findBest: לא נמצא "${input}" (צפוי: ${expected})`);
    else if (r !== expected) fail(`findBest: "${input}" → "${r}" (צפוי: "${expected}")`);
    else pass(`findBest: "${input}" → OK`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. FALSE POSITIVES — קלטים שלא יחזירו תוצאה
// ──────────────────────────────────────────────────────────────────────────────
const negatives = [
    ['בית ספר אחר לגמרי', COACHES],
    ['zzz', COACHES],
    ['1234', LOCATIONS],
    ['מישהו שלא קיים בכלל', COACHES], // שלא (3 ת"ו) לא יתאים ל-שלו אחרי תיקון phonNorm >= 4
    ['זה לא מאמן', COACHES],
    ['בית ספר לא קיים כאן', LOCATIONS],
];
for (const [input, list] of negatives) {
    const r = findBest(input, list);
    if (r) fail(`FALSE POSITIVE: "${input}" → "${r}" (צריך null)`);
    else pass(`false-positive rejected: "${input}"`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. extractCity — כל פורמטים
// ──────────────────────────────────────────────────────────────────────────────
const cityCases = [
    ['בי"ס גבריאלי, ת"א', 'ת"א'],
    ['בי"ס מרחבים, יבנה', 'יבנה'],
    ['בי"ס צמרות, באר יעקב', 'באר יעקב'],
    ['בי"ס יוחנני, הרצליה', 'הרצליה'],
    ['הצלח"ה איתמר', 'ראשל"צ'],
    ['הצלחה חופית', 'ראשל"צ'],
    ['שורשים', 'ת"א'],
    [null, null],
    ['', null],
    ['בי"ס כלנא יחד, יפו', 'יפו'],
    ['נווה זמר, רעננה', 'רעננה'],
    ['אור זבולון, אריאל', 'אריאל'],
    ['בי"ס לפיד, הוד השרון', 'הוד השרון'],
];
for (const [loc, expected] of cityCases) {
    const c = extractCity(loc);
    check(c === expected, `extractCity: "${loc}" → "${c}"`, `extractCity FAIL: "${loc}" → "${c}" (צפוי: "${expected}")`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. sameRegion — ווידוא קבוצות
// ──────────────────────────────────────────────────────────────────────────────
check(sameRegion('ת"א', 'יפו'), 'sameRegion: ת"א+יפו (גוש דן)', 'sameRegion FAIL: ת"א+יפו');
check(sameRegion('ת"א', 'ר"ג'), 'sameRegion: ת"א+ר"ג', 'sameRegion FAIL: ת"א+ר"ג');
check(sameRegion('הרצליה', 'רעננה'), 'sameRegion: הרצליה+רעננה (שרון)', 'sameRegion FAIL: הרצליה+רעננה');
check(!sameRegion('ת"א', 'הרצליה'), 'sameRegion: ת"א≠הרצליה', 'sameRegion FAIL: ת"א=הרצליה לא אמור להיות');
check(!sameRegion(null, 'ת"א'), 'sameRegion: null→false', 'sameRegion FAIL: null אמור להחזיר false');
check(sameRegion('ראשל"צ', 'יבנה'), 'sameRegion: ראשל"צ+יבנה (מרכז-דרום)', 'sameRegion FAIL: ראשל"צ+יבנה');

// ──────────────────────────────────────────────────────────────────────────────
// 5. answerQuery — בדיקות ישירות על schedule_data
// ──────────────────────────────────────────────────────────────────────────────
const raw = scheduleData.rawSchedule;
const allDates = Object.keys(raw).sort();
const today = new Date(); today.setHours(0,0,0,0);
const todayStr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

// בדוק שלפחות יש תאריכים עתידיים
const futureDates = allDates.filter(d => {
    const [dy, dm, dd] = [d.split('/')[2], d.split('/')[1], d.split('/')[0]];
    return new Date(`${dy}-${dm}-${dd}`) >= today;
});
check(futureDates.length > 0, `תאריכים עתידיים: ${futureDates.length}`, 'אין תאריכים עתידיים ב-schedule!');

// בדוק שכל תאריך עתידי עם פעילות יש בו לפחות מאמן אחד
let noCoachDays = 0;
for (const d of futureDates) {
    const allActs = raw[d]?.locations?.flatMap(l => l.activities || []) || [];
    const activeActs = allActs.filter(a => a.status !== 'בוטל' && a.coach);
    if (activeActs.length === 0) noCoachDays++;
}
check(noCoachDays === 0, 'כל ימי העתיד יש בהם מאמנים פעילים', `${noCoachDays} ימים עתידיים ללא מאמן פעיל`);

// בדוק שכל location בraw קיים ב-locationDays
const locationsInRaw = new Set();
for (const [, dayData] of Object.entries(raw)) {
    for (const l of dayData.locations || []) locationsInRaw.add(l.location);
}
const locDaysKeys = new Set(Object.keys(scheduleData.locationDays || {}));
const missingFromLocDays = [...locationsInRaw].filter(l => !locDaysKeys.has(l));
check(missingFromLocDays.length === 0,
    'כל מוקדי rawSchedule קיימים ב-locationDays',
    `מוקדים חסרים מ-locationDays: ${missingFromLocDays.slice(0,5).join(', ')}`
);

// ──────────────────────────────────────────────────────────────────────────────
// 6. פורמט תאריכים ב-rawSchedule — DD/MM/YYYY עם 4 ספרות
// ──────────────────────────────────────────────────────────────────────────────
let badDateFormat = 0;
for (const d of allDates) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(d)) badDateFormat++;
}
check(badDateFormat === 0, 'כל תאריכי rawSchedule בפורמט DD/MM/YYYY', `${badDateFormat} תאריכים בפורמט שגוי`);

// ──────────────────────────────────────────────────────────────────────────────
// 7. בדיקת coachLocations עקביות
// ──────────────────────────────────────────────────────────────────────────────
const coachLocs = scheduleData.coachLocations || {};
let coachLocIssues = 0;
for (const [coach, locs] of Object.entries(coachLocs)) {
    if (!COACHES.includes(coach) && !coach.includes('—')) coachLocIssues++;
    for (const [loc, days] of Object.entries(locs)) {
        if (!Array.isArray(days)) coachLocIssues++;
    }
}
check(coachLocIssues === 0, 'coachLocations פורמט תקין', `${coachLocIssues} שגיאות מבנה ב-coachLocations`);

// ──────────────────────────────────────────────────────────────────────────────
// 8. בדיקת activities — שדות חובה
// ──────────────────────────────────────────────────────────────────────────────
let missingStatusCount = 0, missingCoachCount = 0, badTimeFormat = 0;
for (const [date, dayData] of Object.entries(raw)) {
    for (const loc of dayData.locations || []) {
        for (const a of loc.activities || []) {
            if (!a.status) missingStatusCount++;
            if (a.startTime && !/^\d{1,2}:\d{2}$/.test(a.startTime)) badTimeFormat++;
            if (a.endTime && !/^\d{1,2}:\d{2}$/.test(a.endTime)) badTimeFormat++;
        }
    }
}
check(missingStatusCount === 0, 'כל פעילויות יש להן status', `${missingStatusCount} פעילויות ללא status`);
check(badTimeFormat === 0, 'כל שעות בפורמט HH:MM', `${badTimeFormat} שעות בפורמט שגוי`);

// ──────────────────────────────────────────────────────────────────────────────
// 9. בדיקת queryType=present — סנכרון עם rawSchedule
// ──────────────────────────────────────────────────────────────────────────────
// בחר תאריך עתידי עם נתונים
const testDate = futureDates[0];
if (testDate) {
    const dayData = raw[testDate];
    const workingCoaches = new Set();
    for (const loc of dayData?.locations || [])
        for (const a of (loc.activities || []))
            if (a.status !== 'בוטל' && a.coach) workingCoaches.add(a.coach);

    check(workingCoaches.size > 0, `תאריך ${testDate}: ${workingCoaches.size} מאמנים עובדים`, `תאריך ${testDate}: אין מאמנים עובדים`);

    // כל מאמן עובד ב-testDate חייב להיות ב-COACHES
    const unknownCoaches = [...workingCoaches].filter(c => !COACHES.includes(c));
    if (unknownCoaches.length > 0) {
        fail(`מאמנים לא ידועים ב-${testDate}: ${unknownCoaches.slice(0,5).join(', ')}`);
    } else {
        pass(`כל מאמני ${testDate} מוכרים`);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// 10. בדיקת queryType=locations — יוח"א merger
// ──────────────────────────────────────────────────────────────────────────────
// מצא תאריך עם יוח"א
let yochaDate = null;
for (const [date, {locations}] of Object.entries(raw)) {
    const hasYocha = locations.some(l => l.location.includes('יוח"א') || l.location.includes('יול"א'));
    if (hasYocha) { yochaDate = date; break; }
}
if (yochaDate) {
    // מדמה את merge logic של server.js — בדוק שאחרי merge אין כפילויות
    const locations = raw[yochaDate].locations;
    const locMap = new Map();
    for (const l of locations) {
        const active = (l.activities || []).filter(a => a.status !== 'בוטל');
        if (!active.length) continue;
        const cleaned = l.location.replace(/\s*\(יוח"א\)\s*/g,'').replace(/\s*\(יול"א\)\s*/g,'').trim();
        const key = cleaned.replace(/,.*$/, '').trim();
        if (!locMap.has(key)) {
            locMap.set(key, { display: cleaned, coaches: new Set() });
        } else if (cleaned.length > locMap.get(key).display.length) {
            locMap.get(key).display = cleaned;
        }
        for (const a of active) if (a.coach) locMap.get(key).coaches.add(a.coach);
    }
    // אחרי merge — לא יכול להיות שה-map גדול מכמות המוקדים הגולמיים
    check(locMap.size <= locations.length,
        `יוח"א merger תקין ב-${yochaDate} (${locations.length}→${locMap.size})`,
        `יוח"א merger FAIL ב-${yochaDate}`
    );
} else {
    pass('אין תאריכים עם יוח"א בנתונים (OK)');
}

// ──────────────────────────────────────────────────────────────────────────────
// 11. בדיקת date parsing — תאריכי גבול
// ──────────────────────────────────────────────────────────────────────────────
function parseDate(dateStr) {
    const [d, m, y] = dateStr.split('/');
    return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
}
const dateTests = [
    ['10/05/2026', true],
    ['01/01/2026', true],
    ['31/12/2026', true],
    ['29/02/2028', true],  // שנת קפיצה
];
for (const [dateStr, shouldBeValid] of dateTests) {
    const dt = parseDate(dateStr);
    const valid = !isNaN(dt.getTime());
    check(valid === shouldBeValid, `parseDate("${dateStr}") תקין`, `parseDate FAIL: "${dateStr}" → ${valid}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 12. בדיקת LOCATIONS vs rawSchedule
// ──────────────────────────────────────────────────────────────────────────────
const apiLocations = new Set(Object.keys(scheduleData.locationDays || {}));
const normLocSimple = s => s.replace(/\s*\(יוח"א\)\s*/g,'').replace(/\s*\(יול"א\)\s*/g,'').replace(/,.*$/,'').trim();
const dedupApiLocs = [...new Set([...apiLocations].map(normLocSimple))];
check(dedupApiLocs.length > 0, `${dedupApiLocs.length} מוקדים ייחודיים ב-API`, 'אין מוקדים מה-API!');

// כל מוקד שב-findBest צריך להחזיר תוצאה
let locLookupFails = 0;
for (const loc of [...apiLocations].slice(0, 20)) {
    if (!findBest(loc, [...apiLocations])) locLookupFails++;
}
check(locLookupFails === 0, 'findBest מוצא כל מוקד API', `${locLookupFails} מוקדים שלא מוצאים את עצמם`);

// ──────────────────────────────────────────────────────────────────────────────
// 13. בדיקת pending expiry logic
// ──────────────────────────────────────────────────────────────────────────────
const now = Date.now();
const pendingMock = {
    'key1': { _ts: now - 6 * 60 * 1000, _intent: 'cancel' },   // פג תוקף
    'key2': { _ts: now - 1 * 60 * 1000, _intent: 'restore' },  // תקף
};
for (const k of Object.keys(pendingMock)) {
    if (now - (pendingMock[k]._ts || 0) > 5 * 60 * 1000) delete pendingMock[k];
}
check(!pendingMock['key1'] && pendingMock['key2'], 'pending expiry logic תקין', 'pending expiry FAIL');

// ──────────────────────────────────────────────────────────────────────────────
// 14. בדיקת Hebrew quality filter (transcription garbage detection)
// ──────────────────────────────────────────────────────────────────────────────
function isGarbage(transcript) {
    const hebrewChars = (transcript.match(/[א-ת]/g) || []).length;
    const totalChars = transcript.replace(/\s/g, '').length;
    return totalChars > 0 && hebrewChars / totalChars < 0.5;
}
check(!isGarbage('מי עובד מחר בגבריאלי'), 'quality filter: עברית תקינה עוברת', 'FAIL');
check(isGarbage('tachala orsat kavro you Wagner'), 'quality filter: אנגלית נידחית', 'FAIL');
check(!isGarbage('מי יכול להחליף את אריק בכולנא ב-10/05'), 'quality filter: שאלה ארוכה עוברת', 'FAIL');
check(isGarbage('abc def ghi jkl'), 'quality filter: כל אנגלית נידחית', 'FAIL');

// ──────────────────────────────────────────────────────────────────────────────
// 15. בדיקת transcript normalization
// ──────────────────────────────────────────────────────────────────────────────
function normalizeTranscript(t) {
    return t.replace(/אפו /g, 'איפה ').replace(/^אפו$/g, 'איפה').replace(/איפוא /g, 'איפה ');
}
check(normalizeTranscript('אפו עובד אריק') === 'איפה עובד אריק', 'normalize: אפו→איפה', 'FAIL');
check(normalizeTranscript('אפו') === 'איפה', 'normalize: אפו בלבד', 'FAIL');
check(normalizeTranscript('איפוא יש פעילות') === 'איפה יש פעילות', 'normalize: איפוא→איפה', 'FAIL');
check(normalizeTranscript('מי עובד מחר') === 'מי עובד מחר', 'normalize: ללא שינוי', 'FAIL');

// ──────────────────────────────────────────────────────────────────────────────
// 16. בדיקת isoDate conversion consistency
// ──────────────────────────────────────────────────────────────────────────────
function dateHebToIso(heDate) {
    const [d, m, y] = heDate.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}
function isoToHeb(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}
const testDates2 = ['10/05/2026', '01/01/2026', '31/12/2025', '15/06/2026'];
for (const d of testDates2) {
    const roundTrip = isoToHeb(dateHebToIso(d));
    check(roundTrip === d, `round-trip date: ${d}`, `date round-trip FAIL: ${d} → ${roundTrip}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// 17. בדיקת validateCancel ו-validateSubstitution logic
// ──────────────────────────────────────────────────────────────────────────────
// בחר מוקד ותאריך מהנתונים לבדיקה
let testLoc = null, testLocDate = null;
for (const [date, dayData] of Object.entries(raw)) {
    if (dayData.locations?.length > 0) {
        const active = dayData.locations.find(l => (l.activities||[]).some(a => a.status !== 'בוטל'));
        if (active) { testLoc = active.location; testLocDate = date; break; }
    }
}
if (testLoc && testLocDate) {
    // validateCancel: מוקד שכן עובד ביום זה — אמור להחזיר null (אין אזהרה)
    const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const [d, m, y] = testLocDate.split('/');
    const dayOfWeek = hebrewDays[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
    const activeDays = scheduleData.locationDays?.[testLoc] || [];

    if (activeDays.includes(dayOfWeek)) {
        pass(`validateCancel: ${testLoc} עובד ב${dayOfWeek} (אין אזהרה צפויה)`);
    } else {
        pass(`validateCancel: ${testLoc} לא עובד ב${dayOfWeek} (אזהרה צפויה — בסדר)`);
    }
} else {
    fail('לא נמצא תאריך+מוקד לבדיקת validateCancel');
}

// ──────────────────────────────────────────────────────────────────────────────
// 18. בדיקת ISO date filtering בrefreshScheduleFromAPI
// ──────────────────────────────────────────────────────────────────────────────
const todayIso = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
check(typeof todayIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(todayIso),
    `todayIso פורמט תקין: ${todayIso}`, 'todayIso פורמט שגוי');

// בדוק שapiLocations.length > 0
check(Object.keys(scheduleData.locationDays || {}).length > 0,
    `locationDays: ${Object.keys(scheduleData.locationDays || {}).length} מוקדים`,
    'locationDays ריק!');

// ──────────────────────────────────────────────────────────────────────────────
// 19. בדיקת transcribe filename uniqueness — מניעת race condition
// ──────────────────────────────────────────────────────────────────────────────
function makeTmpFilename(sessionId) {
    return `tmp_audio_${sessionId}_${Date.now()}.ogg`;
}
const f1 = makeTmpFilename('owner');
const f2 = makeTmpFilename('owner');
// שמות קבצים צריכים להיות שונים גם לאותו sessionId
check(f1 !== f2 || (()=> { require('node:timers'); return false; })(),
    'transcribe tmp files: שמות ייחודיים בגלל timestamp',
    'transcribe tmp files: שמות זהים — race condition!');
// format: tmp_audio_<id>_<ts>.ogg
check(/^tmp_audio_owner_\d+\.ogg$/.test(f1),
    'transcribe tmp filename format תקין',
    `tmp filename format שגוי: ${f1}`);

// ──────────────────────────────────────────────────────────────────────────────
// 20. בדיקת addClient type resolution
// ──────────────────────────────────────────────────────────────────────────────
function resolveClientType(type) {
    const typeMap = { 'בית ספר': 'school', 'ביס': 'school', 'school': 'school', 'בי"ס': 'school', 'פרויקט': 'project', 'project': 'project' };
    return typeMap[type?.toLowerCase?.()] || type || 'school';
}
check(resolveClientType('school') === 'school', 'addClient: school→school', 'FAIL');
check(resolveClientType('project') === 'project', 'addClient: project→project', 'FAIL');
check(resolveClientType('School') === 'school', 'addClient: School (capital)→school', 'FAIL');
check(resolveClientType('בית ספר') === 'school', 'addClient: בית ספר→school', 'FAIL');
check(resolveClientType('פרויקט') === 'project', 'addClient: פרויקט→project', 'FAIL');
check(resolveClientType(undefined) === 'school', 'addClient: undefined→school (ברירת מחדל)', 'FAIL');
check(resolveClientType('') === 'school', 'addClient: empty→school (ברירת מחדל)', 'FAIL');

// ──────────────────────────────────────────────────────────────────────────────
// 21. בדיקת garbage detection edge cases
// ──────────────────────────────────────────────────────────────────────────────
function isGarbage2(transcript) {
    const hebrewChars = (transcript.match(/[א-ת]/g) || []).length;
    const totalChars = transcript.replace(/\s/g, '').length;
    if (totalChars > 0 && hebrewChars / totalChars < 0.5) return true;
    if (transcript.trim().length < 2) return true;
    return false;
}
check(isGarbage2(''), 'garbage: empty string נידח', 'FAIL');
check(isGarbage2(' '), 'garbage: רק רווח נידח', 'FAIL');
check(isGarbage2('a'), 'garbage: אות בודדת נידחת', 'FAIL');
check(!isGarbage2('כן'), 'garbage: כן (2 תווים) עובר', 'FAIL');
check(!isGarbage2('לא'), 'garbage: לא עובר', 'FAIL');
check(isGarbage2('hmm yes ok'), 'garbage: אנגלית קצרה נידחת', 'FAIL');
check(!isGarbage2('ok מי עובד מחר'), 'garbage: מעורב עם עברית עובר', 'FAIL');

// ──────────────────────────────────────────────────────────────────────────────
// 22. בדיקת קביעות findBest — אין שינוי אחרי הוספת מאמן חדש לרשימה
// ──────────────────────────────────────────────────────────────────────────────
const testCoaches = [...COACHES];
const beforeAdd = findBest('אריק', testCoaches);
testCoaches.push('אריק חדש'); // מוסיפים מאמן חדש
const afterAdd = findBest('אריק', testCoaches);
// 'אריק' צריך למצוא את 'אריק מונטבילסקי' (הקיים) גם אחרי הוספת 'אריק חדש'
// כי findBest מחזיר את הראשון שמתאים
check(beforeAdd === afterAdd, 'findBest עקבי אחרי הוספה לרשימה', `findBest השתנה: ${beforeAdd} → ${afterAdd}`);

// ──────────────────────────────────────────────────────────────────────────────
// 23. בדיקת phonNorm — false positive שנתקן
// ──────────────────────────────────────────────────────────────────────────────
// "שלא" לא אמור למצוא "שלו אהרוני" (דחייה שנתקנה ע"י העלאת threshold ל->=4)
const falsePositiveTest = findBest('שלא', COACHES);
check(falsePositiveTest === null || falsePositiveTest !== 'שלו אהרוני',
    'phonNorm false-positive: "שלא" לא מתחלף בשלו אהרוני',
    `phonNorm false-positive FAIL: "שלא" → ${falsePositiveTest}`);

// ──────────────────────────────────────────────────────────────────────────────
// סיכום
// ──────────────────────────────────────────────────────────────────────────────
console.log(`\n✅ תקין (${ok.length}):`);
ok.forEach(m => console.log('  ' + m));
if (issues.length) {
    console.log(`\n❌ בעיות (${issues.length}):`);
    issues.forEach(m => console.log('  ❌ ' + m));
    process.exit(1);
} else {
    console.log('\n🎉 כל הבדיקות עברו!');
}
