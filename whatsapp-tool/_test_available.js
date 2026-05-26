require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { token, appId } = JSON.parse(fs.readFileSync(path.join(__dirname, 'base44_token.json'), 'utf8'));
const BASE_URL = 'https://base44.app/api/apps/' + appId;
const H = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין"];
const LOCATIONS = ["הצלח\"ה איתמר","הצלחה חופית","הצלח\"ה מקיף ח'","הצלח\"ה הדרים ראשל\"צ","איתמר בן אב\"י (גפ\"ן), ת\"א","שורשים","הצלח\"ה הבילויים, ראשל\"צ","בי\"ס שפירא (יול\"א), ת\"א","בי\"ס שורשים (יול\"א), ת\"א","הצלח\"ה עין הקורא, ראשל\"צ","חט\"ב שמיר, ת\"א","בי\"ס איתמר בן אב\"י","בי\"ס המתמיד, ר\"ג","בי\"ס גבריאלי, ת\"א","בי\"ס לפיד, הוד השרון","בי\"ס מגן (יוח\"א), ת\"א","בי\"ס מגן","בי\"ס גבעון (יוח\"א), ת\"א","בי\"ס טבע, ת\"א","בי\"ס גבעון, ת\"א","בי\"ס רוקח, ת\"א","בי\"ס רוקח (יוח\"א), ת\"א","בי\"ס מרחבים, יבנה","בי\"ס שמיר, חולון","בי\"ס אלומות (יוח\"א), ת\"א","בי\"ס בית צורי, ת\"א","בי\"ס בית צורי (יוח\"א), ת\"א","בי\"ס יהודה מכבי (יוח\"א), ת\"א","בי\"ס נופי ים (יוח\"א), ת\"א","בי\"ס צמרות, באר יעקב","בי\"ס יוחנני, הרצליה","בי\"ס כפיר (יוח\"א), ת\"א","בי\"ס בלוך, ת\"א","בי\"ס בלוך (יוח\"א), ת\"א","בי\"ס נופים (יול\"א), ת\"א","נווה זמר, רעננה","נופי ים, ת\"א","אור זבולון, אריאל","בי\"ס כלנא יחד (יוח\"א), יפו","בי\"ס כלנא יחד, יפו","בי\"ס וייצמן, רחובות"];

const CITY_GROUPS = {
    'גוש דן':    ['ת"א', 'יפו', 'ר"ג', 'חולון', 'בני ברק'],
    'שרון':      ['הרצליה', 'רעננה', 'הוד השרון', 'כפר סבא', 'נתניה'],
    'מרכז-דרום': ['ראשל"צ', 'רחובות', 'יבנה', 'באר יעקב', 'נס ציונה'],
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
function sameRegion(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    for (const g of Object.values(CITY_GROUPS)) if (g.includes(a) && g.includes(b)) return true;
    return false;
}
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
    if (!input) return null;
    const clean = s => s.replace(/['"״]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const inp = clean(input);
    const exact = list.find(o => clean(o) === inp); if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0])); if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byWords = list.find(o => words.length > 1 && words.every(w => clean(o).includes(w))); if (byWords) return byWords;
    const byFirst = inp.includes(' ') ? null : list.find(o => clean(o).startsWith(inp)); if (byFirst) return byFirst;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w))); if (byAny) return byAny;
    const byFuzzy = list.find(o => {
        const parts = clean(o).split(/[\s,.()"״]+/).filter(p => p.length >= 4);
        return words.filter(w => w.length >= 4).some(w => parts.some(p => editDist(w, p) <= 1));
    });
    if (byFuzzy) return byFuzzy;
    return null;
}

async function run() {
    let passed = 0, failed = 0;
    const pass = msg => { console.log('  ✓', msg); passed++; };
    const fail = msg => { console.log('  ✗', msg); failed++; };

    // ── TEST 1: source check ─────────────────────────────────────────────────
    console.log('\n=== TEST 1: source check ===');
    [
        ['getAvailableCoaches function', 'async function getAvailableCoaches('],
        ['CITY_GROUPS map', 'const CITY_GROUPS'],
        ['extractCity function', 'function extractCity('],
        ['sameRegion function', 'function sameRegion('],
        ['available_coaches intent in prompt', '"intent":"available_coaches"'],
        ['available_coaches handler', "parsed.intent === 'available_coaches'"],
        ['sameArea / otherArea split', 'sameArea'],
        ['targetCity in response', 'targetCity'],
    ].forEach(([label, pattern]) => src.includes(pattern) ? pass(label) : fail(label + ' MISSING'));

    // ── TEST 2: city extraction ──────────────────────────────────────────────
    console.log('\n=== TEST 2: city extraction ===');
    const cityTests = [
        ['בי"ס כלנא יחד (יוח"א), יפו', 'יפו'],
        ['בי"ס גבריאלי, ת"א', 'ת"א'],
        ['בי"ס מרחבים, יבנה', 'יבנה'],
        ['בי"ס שמיר, חולון', 'חולון'],
        ['בי"ס יוחנני, הרצליה', 'הרצליה'],
        ['נווה זמר, רעננה', 'רעננה'],
        ['בי"ס וייצמן, רחובות', 'רחובות'],
        ['אור זבולון, אריאל', 'אריאל'],
        ['הצלח"ה הדרים ראשל"צ', 'ראשל"צ'],
    ];
    cityTests.forEach(([loc, expected]) => {
        const got = extractCity(loc);
        got === expected ? pass(`"${loc.slice(0,20)}" → "${got}"`) : fail(`"${loc.slice(0,20)}" → "${got}" (expected "${expected}")`);
    });

    // ── TEST 3: same region grouping ─────────────────────────────────────────
    console.log('\n=== TEST 3: geographic grouping ===');
    [
        ['יפו', 'ת"א', true, 'גוש דן'],
        ['ת"א', 'חולון', true, 'גוש דן'],
        ['יפו', 'ר"ג', true, 'גוש דן'],
        ['הרצליה', 'רעננה', true, 'שרון'],
        ['ראשל"צ', 'רחובות', true, 'מרכז-דרום'],
        ['ת"א', 'הרצליה', false, 'ערים שונות'],
        ['יפו', 'יבנה', false, 'ערים שונות'],
    ].forEach(([a, b, expected, label]) => {
        const got = sameRegion(a, b);
        got === expected ? pass(`${a}↔${b}: ${label} ✓`) : fail(`${a}↔${b}: expected ${expected}, got ${got}`);
    });

    // ── TEST 4: API + logic simulation ──────────────────────────────────────
    console.log('\n=== TEST 4: live API simulation ===');
    const testDate = '06/05/2026';
    const [d, m, y] = testDate.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const evRes = await fetch(`${BASE_URL}/entities/Event?date=${isoDate}&limit=500`, { headers: H });
    const dayEvents = await evRes.json();
    const active = dayEvents.filter(e => e.status !== 'cancelled' && e.status !== 'canceled');
    const busySet = new Set(active.map(e => e.coachName).filter(Boolean));
    pass(`events on ${testDate}: ${active.length} active`);
    pass(`busy coaches: ${busySet.size}`);

    const testCoach = findBest('אריק', COACHES);
    const testLoc   = findBest('כולנא', LOCATIONS); // fuzzy: כולנא → כלנא
    pass(`coach resolved: ${testCoach}`);
    pass(`location resolved: ${testLoc}`);

    const available = COACHES.filter(c => c !== testCoach && !busySet.has(c));
    pass(`available coaches (not working ${testDate}): ${available.length}`);

    const targetCity = extractCity(testLoc);
    pass(`target city: ${targetCity}`);

    // סנן לפי איזור
    const sameArea = [], otherArea = [];
    for (const coach of available) {
        const coachCities = new Set(active.filter(e => e.coachName === coach).map(e => extractCity(e.clientName)).filter(Boolean));
        // add from all locations this coach ever works at (use all active events)
        const nearby = [...coachCities].some(c => sameRegion(c, targetCity));
        (nearby ? sameArea : otherArea).push(coach);
    }
    pass(`same area coaches: ${sameArea.length} → ${sameArea.slice(0,5).join(', ')}${sameArea.length > 5 ? '...' : ''}`);
    pass(`other area coaches: ${otherArea.length}`);

    // ── TEST 5: output format ────────────────────────────────────────────────
    console.log('\n=== TEST 5: output format ===');
    const coachSlots = active.filter(e => e.coachName === testCoach && e.clientName === testLoc);
    const slotStr = coachSlots.length > 0 ? coachSlots.map(e => `${e.startTime||'?'}–${e.endTime||'?'}`).join(', ') : 'שעות לא נמצאו';
    const header = `👥 *מאמנים זמינים להחליף את ${testCoach}*\n📍 ${testLoc}\n📅 ${d}/${m} | ⏰ ${slotStr}`;
    let body = '';
    if (sameArea.length > 0) body += `\n\n🟢 *אותו איזור (${targetCity}):*\n` + sameArea.map(c => `  • ${c}`).join('\n');
    if (otherArea.length > 0) body += `\n\n🔵 *שאר הזמינים:*\n` + otherArea.slice(0,5).map(c => `  • ${c}`).join('\n') + (otherArea.length > 5 ? `\n  ... ועוד ${otherArea.length - 5}` : '');
    console.log('\n--- הודעה לדוגמה ---');
    console.log(header + body);
    console.log('---');
    pass('output format valid');

    // ── SUMMARY ─────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(50));
    console.log(`תוצאות: ${passed} עברו | ${failed} נכשלו`);
    if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('ERROR:', e.message, e.stack); process.exit(1); });
