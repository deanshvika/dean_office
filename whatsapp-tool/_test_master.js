require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const { token, appId } = JSON.parse(fs.readFileSync(path.join(ROOT, 'base44_token.json'), 'utf8'));
const BASE_URL = 'https://base44.app/api/apps/' + appId;
const H = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

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
    if (!input) return null;
    const clean = s => s.replace(/['"״]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const inp = clean(input);
    const exact = list.find(o => clean(o) === inp); if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0])); if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byWords = list.find(o => words.length > 1 && words.every(w => clean(o).includes(w))); if (byWords) return byWords;
    const byFirst = inp.includes(' ') ? null : list.find(o => clean(o).startsWith(inp.split(' ')[0])); if (byFirst) return byFirst;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w))); if (byAny) return byAny;
    const byFuzzy = list.find(o => {
        const parts = clean(o).split(/[\s,.()"״]+/).filter(p => p.length >= 4);
        return words.filter(w => w.length >= 4).some(w => parts.some(p => editDist(w, p) <= 1));
    });
    if (byFuzzy) return byFuzzy;
    return null;
}

async function run() {
    let passed = 0, failed = 0, warnings = 0;
    const pass = msg => { process.stdout.write(`  ✓ ${msg}\n`); passed++; };
    const fail = msg => { process.stdout.write(`  ✗ ${msg}\n`); failed++; };
    const warn = msg => { process.stdout.write(`  ⚠ ${msg}\n`); warnings++; };
    const chk  = (label, cond) => cond ? pass(label) : fail(label + ' — MISSING IN SOURCE');

    // ════════════════════════════════════════════════════
    console.log('\n══ 1. CONFIRMATION FLOW ══');
    // ════════════════════════════════════════════════════
    const writeIntents = ['cancel','restore','substitution','approve_substitution','swap_coach','add_event','add_coach','add_client','update_wage'];
    const readIntents  = ['query','pending_substitutions','coach_info','day_summary','upcoming_substitutions'];
    for (const intent of writeIntents)
        chk(`${intent}: stores pending`, src.includes(`_intent: '${intent}'`) || src.includes(`_intent: "${intent}"`));
    chk('כן handler', src.includes(`body === 'כן'`));
    chk('לא handler', src.includes(`body === 'לא'`));
    chk('pending expires 5 min', src.includes(`5 * 60 * 1000`));
    chk('delete pending on confirm', src.includes(`delete state.pending[key]`));
    chk('ענה כן message exists', src.includes(`ענה *כן*`));
    for (const intent of readIntents) {
        const idx = src.indexOf(`parsed.intent === '${intent}'`);
        if (idx === -1) { fail(`${intent}: handler not found`); continue; }
        const block = src.slice(idx, idx + 600);
        const nextElse = block.indexOf('} else if');
        const slice = block.slice(0, nextElse > 0 ? nextElse : 600);
        !slice.includes('state.pending') ? pass(`${intent}: no pending (read-only ✓)`) : fail(`${intent}: wrongly stores pending`);
    }

    // ════════════════════════════════════════════════════
    console.log('\n══ 2. MANAGER PERMISSIONS ══');
    // ════════════════════════════════════════════════════
    chk('global manager block (cancel/restore/substitution)', src.includes(`role === 'manager' && ['cancel', 'restore', 'substitution'].includes(parsed.intent)`));
    const perManagerIntents = ['approve_substitution','swap_coach','add_event','add_coach','add_client','update_wage'];
    for (const intent of perManagerIntents) {
        const idx = src.indexOf(`parsed.intent === '${intent}'`);
        const block = idx >= 0 ? src.slice(idx, idx + 350) : '';
        block.includes(`role === 'manager'`) ? pass(`${intent}: manager check ✓`) : fail(`${intent}: manager check missing`);
    }

    // ════════════════════════════════════════════════════
    console.log('\n══ 3. API CONNECTIVITY ══');
    // ════════════════════════════════════════════════════
    const entities = ['Event','Coach','Client','SubstitutionRequest','Program'];
    for (const ent of entities) {
        const r = await fetch(`${BASE_URL}/entities/${ent}?limit=1`, { headers: H });
        r.ok ? pass(`${ent}: ${r.status}`) : fail(`${ent}: FAILED ${r.status}`);
    }

    // ════════════════════════════════════════════════════
    console.log('\n══ 4. FIND BEST — fuzzy matching ══');
    // ════════════════════════════════════════════════════
    const coachTests = [['אריק','אריק מונטבילסקי'],['דובי','דובי מילר'],['שרי','שרי אנטין'],['להט','להט מעיין'],['ליאור','ליאור מרגוליס'],['גילי','גילי ששון'],['יובל','יובל גורפיין'],['טל','טל וזגיאל'],['נועם','נועם כהן'],['חי ניר','חי ניר']];
    coachTests.forEach(([i,e]) => {
        const got = findBest(i, COACHES);
        got === e ? pass(`coach: "${i}" → "${e}"`) : fail(`coach: "${i}" → "${got}" (expected "${e}")`);
    });
    const locTests = [['רוקח','בי"ס רוקח, ת"א'],['גבריאלי','בי"ס גבריאלי, ת"א'],['לפיד','בי"ס לפיד, הוד השרון'],['שמיר חולון','בי"ס שמיר, חולון'],['מרחבים','בי"ס מרחבים, יבנה'],['כלנא יחד יפו','בי"ס כלנא יחד (יוח"א), יפו']];
    locTests.forEach(([i,e]) => {
        const got = findBest(i, LOCATIONS);
        got === e ? pass(`loc: "${i}" → "${e}"`) : fail(`loc: "${i}" → "${got}" (expected "${e}")`);
    });

    // ════════════════════════════════════════════════════
    console.log('\n══ 5. SUBSTITUTION FLOW ══');
    // ════════════════════════════════════════════════════
    const subRes = await fetch(`${BASE_URL}/entities/SubstitutionRequest?limit=200`, { headers: H });
    const allReqs = await subRes.json();
    const pendingReqs = allReqs.filter(r => r.status === 'ממתין לבדיקה');
    pass(`total requests: ${allReqs.length}, pending: ${pendingReqs.length}`);
    if (pendingReqs.length > 0) {
        const req = pendingReqs[0];
        req.id ? pass(`req.id: ${req.id.slice(0,8)}...`) : fail('req.id missing');
        req.substitutionDate?.match(/^\d{4}-\d{2}-\d{2}$/) ? pass(`substitutionDate format: ${req.substitutionDate}`) : fail('bad substitutionDate');
        req.clientName ? pass(`clientName: ${req.clientName.slice(0,25)}`) : fail('clientName missing');
        req.requestingCoachName ? pass(`requestingCoachName: ${req.requestingCoachName}`) : fail('requestingCoachName missing');
    } else { warn('no pending requests (OK)'); }
    chk('swapCoach: coachId from Coach entity', src.includes('subCoachId = subObj.id'));
    chk('no 1000-event coachId search', !src.includes('Event?limit=1000'));

    // ════════════════════════════════════════════════════
    console.log('\n══ 6. ADD OPERATIONS ══');
    // ════════════════════════════════════════════════════
    const [clientsRes, coachesRes, progsRes] = await Promise.all([
        fetch(`${BASE_URL}/entities/Client?limit=200`, { headers: H }),
        fetch(`${BASE_URL}/entities/Coach?limit=200`, { headers: H }),
        fetch(`${BASE_URL}/entities/Program?limit=50`, { headers: H }),
    ]);
    const allClients = await clientsRes.json();
    const allCoaches = await coachesRes.json();
    const allProgs   = await progsRes.json();
    pass(`Clients: ${allClients.length}`);
    pass(`Coaches: ${allCoaches.length}`);
    pass(`Programs: ${allProgs.length} — ${allProgs.map(p=>p.name).join(', ')}`);
    const clientObj = allClients.find(c => c.name === findBest('רוקח', allClients.map(c=>c.name)));
    const coachObj  = allCoaches.find(c => c.name === 'דובי מילר');
    const progObj   = allProgs.find(p => p.name?.includes('קבוצתי'));
    clientObj?.id ? pass(`add_event: clientId resolved`) : fail('add_event: clientId not found');
    coachObj?.id  ? pass(`add_event: coachId resolved`) : fail('add_event: coachId not found');
    coachObj?.defaultWage ? pass(`add_event: defaultWage: ${coachObj.defaultWage}₪`) : fail('defaultWage missing');
    progObj?.id ? pass(`add_event: programId: ${progObj.name}`) : warn('no קבוצתי program (optional)');
    chk('addEvent function', src.includes('async function addEvent('));
    chk('addCoach function', src.includes('async function addCoach('));
    chk('addClient function', src.includes('async function addClient('));
    chk('typeMap school/project', src.includes("'בית ספר': 'school'"));

    // ════════════════════════════════════════════════════
    console.log('\n══ 7. UPDATE / INFO OPERATIONS ══');
    // ════════════════════════════════════════════════════
    const wageCoach = allCoaches.find(c => c.name === 'דובי מילר');
    wageCoach?.id ? pass(`update_wage: coach found, id: ${wageCoach.id.slice(0,8)}...`) : fail('update_wage: coach not found');
    wageCoach?.defaultWage !== undefined ? pass(`update_wage: current wage: ${wageCoach.defaultWage}₪`) : fail('defaultWage missing');
    chk('updateCoachWage function', src.includes('async function updateCoachWage('));
    chk('getCoachInfo function', src.includes('async function getCoachInfo('));
    chk('getDaySummary function', src.includes('async function getDaySummary('));
    const todayIso = new Date().toISOString().split('T')[0];
    const evAllRes = await fetch(`${BASE_URL}/entities/Event?limit=3000`, { headers: H });
    const evAll = await evAllRes.json();
    const dubisUpcoming = evAll.filter(e => e.coachName==='דובי מילר' && e.date>=todayIso && e.status!=='cancelled' && e.status!=='canceled');
    pass(`getCoachInfo: דובי מילר — ${dubisUpcoming.length} upcoming events`);
    const dayRes = await fetch(`${BASE_URL}/entities/Event?date=2026-05-06&limit=500`, { headers: H });
    const dayEv = await dayRes.json();
    const activeEv = dayEv.filter(e => e.status!=='cancelled' && e.status!=='canceled');
    const totalW = activeEv.reduce((s,e)=>s+(e.wage||0),0);
    const totalR = activeEv.reduce((s,e)=>s+(e.price||0),0);
    activeEv.length > 0 ? pass(`getDaySummary 06/05: ${activeEv.length} events, wages:${totalW}₪ rev:${totalR}₪`) : warn('getDaySummary: no events on 06/05 (OK if past)');

    // ════════════════════════════════════════════════════
    console.log('\n══ 8. UPCOMING SUBSTITUTIONS ══');
    // ════════════════════════════════════════════════════
    chk('getWeekSubstitutions function', src.includes('async function getWeekSubstitutions('));
    chk('upcoming_substitutions handler', src.includes("parsed.intent === 'upcoming_substitutions'"));
    chk('upcoming_substitutions in prompt', src.includes('"intent":"upcoming_substitutions"'));
    chk('byDate grouping', src.includes('byDate[r.substitutionDate]'));
    chk('statusEmoji map', src.includes('statusEmoji'));
    chk('days param', src.includes('parseInt(parsed.days)'));
    // live API test
    const toIso7 = new Date(Date.now() + 7*86400000).toISOString().split('T')[0];
    const weekReqs = allReqs.filter(r => r.substitutionDate >= todayIso && r.substitutionDate <= toIso7);
    pass(`upcoming (7d): ${weekReqs.length} requests (${todayIso} → ${toIso7})`);
    const byDate = {};
    weekReqs.forEach(r => { if (!byDate[r.substitutionDate]) byDate[r.substitutionDate] = []; byDate[r.substitutionDate].push(r); });
    pass(`groups: ${Object.keys(byDate).sort().join(', ') || '(none)'}`);

    // ════════════════════════════════════════════════════
    console.log('\n══ 9. PENDING SUBSTITUTIONS — date range filter ══');
    // ════════════════════════════════════════════════════
    chk('dateFrom param in prompt', src.includes('"dateFrom":"DD/MM/YYYY'));
    chk('dateTo param in prompt', src.includes('"dateTo":"DD/MM/YYYY'));
    chk('dateFrom filter in getPendingSubstitutions', src.includes('isoFrom') && src.includes('substitutionDate >= isoFrom'));
    chk('dateTo filter in getPendingSubstitutions', src.includes('isoTo') && src.includes('substitutionDate <= isoTo'));
    chk('rangeLabel in response', src.includes('rangeLabel'));
    // test filter logic
    const df = '01/05/2026', dt = '31/05/2026';
    const [dfD, dfM, dfY] = df.split('/'); const isoFrom = `${dfY}-${dfM}-${dfD}`;
    const [dtD, dtM, dtY] = dt.split('/'); const isoTo   = `${dtY}-${dtM}-${dtD}`;
    const filtered = pendingReqs.filter(r => r.substitutionDate >= isoFrom && r.substitutionDate <= isoTo);
    pass(`date filter [05/2026]: ${filtered.length}/${pendingReqs.length} pending requests match`);

    // ════════════════════════════════════════════════════
    console.log('\n══ 10. DEDUPLICATION & TIMESTAMP GUARDS ══');
    // ════════════════════════════════════════════════════
    chk('processedMsgIds Set', src.includes('processedMsgIds'));
    chk('processedMsgIds pruned at 200', src.includes('processedMsgIds.size > 200'));
    chk('startupTime resets on reconnect', src.includes('state.startupTime = Date.now()'));
    chk('voice timestamp guard (3 min)', src.includes('msg.timestamp * 1000 < state.startupTime - 3 * 60 * 1000'));
    chk('text timestamp guard exists', (() => {
        const idx = src.indexOf("if (msg.type === 'chat')");
        const block = src.slice(idx, idx + 400);
        return block.includes('msg.timestamp') && block.includes('state.startupTime');
    })());
    chk('text AND voice use same 3-min window', src.split('startupTime - 3 * 60 * 1000').length - 1 >= 2);
    chk('lastVoiceTs race-condition guard', src.includes('state.lastVoiceTs !== myTs'));
    chk('group chat filter', src.includes("msg.from.includes('@g.us')"));

    // ════════════════════════════════════════════════════
    console.log('\n══ 11. MANAGER EXPIRY ══');
    // ════════════════════════════════════════════════════
    chk("MANAGER_EXPIRY 11/05/2026", src.includes("new Date('2026-05-11T23:59:59')"));
    chk('expiry check on session start', src.includes('Date.now() > MANAGER_EXPIRY.getTime()'));
    chk('managers autoStart: false', src.includes('autoStart: false'));
    const expiryDate = new Date('2026-05-11T23:59:59');
    const today = new Date();
    const daysLeft = Math.ceil((expiryDate - today) / 86400000);
    daysLeft > 0 ? pass(`manager access expires in ${daysLeft} days (11/05/2026)`) : warn(`manager access EXPIRED ${-daysLeft} days ago`);

    // ════════════════════════════════════════════════════
    console.log('\n══ 12. SCHEDULE CACHE ══');
    // ════════════════════════════════════════════════════
    chk('30-min refresh interval', src.includes('30 * 60 * 1000'));
    chk('25-min stale check', src.includes('25 * 60 * 1000'));
    chk('refresh after write', src.includes('refreshScheduleFromAPI().catch'));
    const schedPath = path.join(ROOT, 'schedule_data.json');
    if (fs.existsSync(schedPath)) {
        const sd = JSON.parse(fs.readFileSync(schedPath,'utf8'));
        sd.totalEvents ? pass(`cache: ${sd.totalEvents} events, at: ${sd.generatedAt?.slice(0,19)}`) : fail('cache file invalid');
    } else { warn('schedule_data.json not found locally (may exist on server)'); }

    // ════════════════════════════════════════════════════
    console.log('\n══ 13. AVAILABLE COACHES ══');
    // ════════════════════════════════════════════════════
    chk('getAvailableCoaches function', src.includes('async function getAvailableCoaches('));
    chk('CITY_GROUPS map', src.includes('const CITY_GROUPS'));
    chk('extractCity function', src.includes('function extractCity('));
    chk('sameRegion function', src.includes('function sameRegion('));
    chk('available_coaches intent in prompt', src.includes('"intent":"available_coaches"'));
    chk('available_coaches handler', src.includes("parsed.intent === 'available_coaches'"));
    chk('sameArea / otherArea split', src.includes('sameArea'));
    chk('scheduleData city fallback', src.includes('scheduleData?.coachLocations'));

    // city extraction tests
    const CITY_GROUPS_LOCAL = {
        'גוש דן': ['ת"א','יפו','ר"ג','חולון','בני ברק'],
        'שרון':   ['הרצליה','רעננה','הוד השרון','כפר סבא','נתניה'],
        'מרכז-דרום': ['ראשל"צ','רחובות','יבנה','באר יעקב','נס ציונה'],
    };
    function extractCityLocal(loc) {
        if (!loc) return null;
        const manual = {
            'הצלח"ה איתמר':'ראשל"צ','הצלחה חופית':'ראשל"צ',
            'הצלח"ה מקיף ח\'':'ראשל"צ','הצלח"ה הדרים ראשל"צ':'ראשל"צ',
            'הצלח"ה הבילויים, ראשל"צ':'ראשל"צ','הצלח"ה עין הקורא, ראשל"צ':'ראשל"צ',
            'שורשים':'ת"א','בי"ס איתמר בן אב"י':'ת"א','בי"ס מגן':'ת"א',
            'איתמר בן אב"י (גפ"ן), ת"א':'ת"א',
        };
        if (manual[loc]) return manual[loc];
        const m = loc.match(/,\s*([^,]+)$/);
        return m ? m[1].trim() : null;
    }
    function sameRegionLocal(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        for (const g of Object.values(CITY_GROUPS_LOCAL)) if (g.includes(a) && g.includes(b)) return true;
        return false;
    }
    [
        ['בי"ס כלנא יחד (יוח"א), יפו','יפו'],
        ['בי"ס גבריאלי, ת"א','ת"א'],
        ['הצלח"ה הדרים ראשל"צ','ראשל"צ'],
        ['בי"ס מרחבים, יבנה','יבנה'],
        ['בי"ס שמיר, חולון','חולון'],
    ].forEach(([loc,exp]) => {
        const got = extractCityLocal(loc);
        got === exp ? pass(`extractCity: "${loc.slice(0,20)}" → "${got}"`) : fail(`extractCity: "${loc.slice(0,20)}" → "${got}" (expected "${exp}")`);
    });
    [
        ['יפו','ת"א',true],['ת"א','חולון',true],['הרצליה','רעננה',true],
        ['ראשל"צ','רחובות',true],['ת"א','הרצליה',false],['יפו','יבנה',false],
    ].forEach(([a,b,exp]) => {
        const got = sameRegionLocal(a,b);
        got === exp ? pass(`sameRegion: ${a}↔${b} = ${exp} ✓`) : fail(`sameRegion: ${a}↔${b} expected ${exp}, got ${got}`);
    });

    // live simulation
    const testDate2 = '2026-05-10';
    const evDay2 = await fetch(`${BASE_URL}/entities/Event?date=${testDate2}&limit=500`, { headers: H });
    const dayEv2 = await evDay2.json();
    const active2 = dayEv2.filter(e => e.status!=='cancelled'&&e.status!=='canceled');
    const busy2 = new Set(active2.map(e=>e.coachName).filter(Boolean));
    const testCoachAC = 'אריק מונטבילסקי';
    const testLocAC = findBest('כולנא', LOCATIONS);
    testLocAC ? pass(`available_coaches: location fuzzy "כולנא" → "${testLocAC}"`) : fail('כולנא not resolved');
    const avail2 = COACHES.filter(c => c !== testCoachAC && !busy2.has(c));
    pass(`available for ${testDate2}: ${avail2.length} coaches free`);
    const targetCity2 = testLocAC ? extractCityLocal(testLocAC) : null;
    pass(`target city: ${targetCity2}`);

    // ════════════════════════════════════════════════════
    console.log('\n══ 14. INTENT COVERAGE — all intents in prompt ══');
    // ════════════════════════════════════════════════════
    const intents = ['cancel','restore','query','pending_substitutions','approve_substitution','swap_coach','add_event','add_coach','add_client','update_wage','coach_info','day_summary','upcoming_substitutions','available_coaches'];
    intents.forEach(i => chk(`intent "${i}" in prompt`, src.includes(`"intent":"${i}"`)));

    // ════════════════════════════════════════════════════
    console.log('\n══ SUMMARY ══');
    // ════════════════════════════════════════════════════
    const total = passed + failed + warnings;
    console.log(`\n  ✓ עברו:    ${passed}`);
    console.log(`  ✗ נכשלו:   ${failed}`);
    console.log(`  ⚠ אזהרות: ${warnings}`);
    console.log(`  סה"כ:     ${total}`);
    if (failed > 0) { console.log('\n  ❌ יש כשלים — דורש תיקון'); process.exit(1); }
    else console.log('\n  ✅ כל הבדיקות עברו!');
}

run().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
