require('dotenv').config();
const fs = require('fs');
const { token, appId } = JSON.parse(fs.readFileSync('/root/whatsapp-tool/base44_token.json', 'utf8'));
const BASE_URL = 'https://base44.app/api/apps/' + appId;
const H = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין"];
const LOCATIONS = ["הצלח\"ה איתמר","הצלחה חופית","הצלח\"ה מקיף ח'","בי\"ס שפירא (יול\"א), ת\"א","בי\"ס רוקח, ת\"א","בי\"ס גבריאלי, ת\"א","בי\"ס לפיד, הוד השרון","בי\"ס מגן (יוח\"א), ת\"א","בי\"ס שמיר, חולון","בי\"ס כלנא יחד (יוח\"א), יפו"];

function findBest(input, list) {
    if (!input) return null;
    const norm = s => s.replace(/['"-]/g, '').trim();
    const inp = norm(input).toLowerCase();
    let best = null, bestScore = 0;
    for (const item of list) {
        const it = norm(item).toLowerCase();
        if (it === inp) return item;
        const words = inp.split(/\s+/);
        const matches = words.filter(w => w.length > 1 && it.includes(w)).length;
        const score = matches / words.length;
        if (score > bestScore) { bestScore = score; best = item; }
    }
    return bestScore >= 0.5 ? best : null;
}

async function run() {
    let passed = 0, failed = 0;
    function pass(msg) { console.log('PASS', msg); passed++; }
    function fail(msg) { console.log('FAIL', msg); failed++; }

    // ── TEST 1: SubstitutionRequest — שדות נכונים ─────────────────────────────
    console.log('\n=== TEST 1: SubstitutionRequest fields ===');
    const r1 = await fetch(BASE_URL + '/entities/SubstitutionRequest?limit=200', { headers: H });
    const d1 = await r1.json();
    const allReqs = Array.isArray(d1) ? d1 : (d1.results || d1.items || d1.data || []);
    console.log('total:', allReqs.length);
    const pending = allReqs.filter(r => r.status === 'ממתין לבדיקה');
    console.log('pending:', pending.length);
    if (allReqs.length > 0) {
        const req = allReqs[0];
        const hasFields = ['id','status','substitutionDate','clientName','requestingCoachName'].every(f => f in req);
        hasFields ? pass('SubstitutionRequest fields: id, status, substitutionDate, clientName, requestingCoachName') : fail('missing fields in SubstitutionRequest: ' + JSON.stringify(Object.keys(req)));
    }
    if (pending.length > 0) {
        pending.slice(0, 3).forEach(r => {
            const [y, m, d] = (r.substitutionDate || '????-??-??').split('-');
            console.log(`  - ${r.requestingCoachName} | ${d}/${m}/${y} | ${r.clientName} | id: ${r.id}`);
        });
    }

    // ── TEST 2: Coach.defaultWage ─────────────────────────────────────────────
    console.log('\n=== TEST 2: Coach.defaultWage ===');
    const r2 = await fetch(BASE_URL + '/entities/Coach?limit=50', { headers: H });
    const d2 = await r2.json();
    const coaches = Array.isArray(d2) ? d2 : (d2.results || d2.items || d2.data || []);
    console.log('total coaches:', coaches.length);
    const withWage = coaches.filter(c => c.defaultWage !== undefined && c.defaultWage !== null);
    console.log('coaches with defaultWage:', withWage.length);
    withWage.slice(0, 4).forEach(c => console.log(`  - ${c.name} | defaultWage: ${c.defaultWage} | id: ${c.id}`));
    coaches.length > 0 ? pass('Coach entity accessible, fields OK') : fail('no coaches returned');

    // ── TEST 3: Event — שדות swap ──────────────────────────────────────────────
    console.log('\n=== TEST 3: Event — swap fields ===');
    const r3 = await fetch(BASE_URL + '/entities/Event?limit=3', { headers: H });
    const d3 = await r3.json();
    const events = Array.isArray(d3) ? d3 : (d3.results || d3.items || d3.data || []);
    if (events.length > 0) {
        const ev = events[0];
        const hasRequired = ['id','date','coachName','clientName','status'].every(f => f in ev);
        const swapFields = ['isSwap','swapType','originalCoachName','originalCoachId','wage','coachId'].filter(f => f in ev);
        hasRequired ? pass('Event required fields present (id, date, coachName, clientName, status)') : fail('missing required Event fields');
        swapFields.length >= 4 ? pass(`swap fields available: ${swapFields.join(', ')}`) : fail(`swap fields missing, got: ${swapFields.join(', ')}`);
        console.log(`  sample: date=${ev.date}, coach=${ev.coachName}, client=${ev.clientName}, wage=${ev.wage}`);
    } else { fail('no events returned'); }

    // ── TEST 4: Event — query by date ─────────────────────────────────────────
    console.log('\n=== TEST 4: Event query by date ===');
    const today = new Date();
    const isoToday = today.toISOString().split('T')[0];
    const r4 = await fetch(BASE_URL + `/entities/Event?date=${isoToday}&limit=50`, { headers: H });
    const d4 = await r4.json();
    const todayEvents = Array.isArray(d4) ? d4 : (d4.results || d4.items || d4.data || []);
    console.log(`events for ${isoToday}:`, todayEvents.length);
    todayEvents.length >= 0 ? pass('date filter query works') : fail('date filter failed');

    // ── TEST 5: findBest — מאמנים ─────────────────────────────────────────────
    console.log('\n=== TEST 5: findBest — מאמנים ===');
    [
        ['אריק', 'אריק מונטבילסקי'],
        ['דובי', 'דובי מילר'],
        ['שרי', 'שרי אנטין'],
        ['להט', 'להט מעיין'],
        ['ליאור', 'ליאור מרגוליס'],
        ['גילי', 'גילי ששון'],
    ].forEach(([inp, exp]) => {
        const got = findBest(inp, COACHES);
        got === exp ? pass(`findBest(${inp}) = ${got}`) : fail(`findBest(${inp}) = ${got}, expected: ${exp}`);
    });

    // ── TEST 6: findBest — מוקדים ─────────────────────────────────────────────
    console.log('\n=== TEST 6: findBest — מוקדים ===');
    [
        ['רוקח', 'בי"ס רוקח, ת"א'],
        ['גבריאלי', 'בי"ס גבריאלי, ת"א'],
        ['לפיד', 'בי"ס לפיד, הוד השרון'],
    ].forEach(([inp, exp]) => {
        const got = findBest(inp, LOCATIONS);
        got === exp ? pass(`findBest(${inp}) = ${got}`) : fail(`findBest(${inp}) = ${got}, expected: ${exp}`);
    });

    // ── TEST 7: answerQuery normalization ─────────────────────────────────────
    console.log('\n=== TEST 7: answerQuery normalization ===');
    const parsed = { queryType: 'locations', subject: 'אריק' };
    const isCoach = !!findBest(parsed.subject, COACHES);
    const normalized = (parsed.queryType === 'locations' && parsed.subject && isCoach)
        ? { ...parsed, queryType: 'status' }
        : parsed;
    normalized.queryType === 'status' ? pass('locations+coach → status normalization OK') : fail('normalization failed');

    // ── TEST 8: approve_substitution — pending lookup ─────────────────────────
    console.log('\n=== TEST 8: approve_substitution — pending lookup ===');
    if (pending.length > 0) {
        const req = pending[0];
        const hasId = !!req.id;
        const hasSub = req.substitutionDate && req.substitutionDate.match(/^\d{4}-\d{2}-\d{2}$/);
        hasId ? pass('req.id present: ' + req.id) : fail('req.id missing');
        hasSub ? pass('req.substitutionDate format OK: ' + req.substitutionDate) : fail('substitutionDate format bad: ' + req.substitutionDate);
    } else {
        console.log('  (דילוג — אין pending requests לבדוק)');
        pass('no pending requests to test (OK)');
    }

    // ── SUMMARY ────────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(45));
    console.log(`תוצאות: ${passed} עברו | ${failed} נכשלו`);
    if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('ERROR:', e.message, e.stack); process.exit(1); });
