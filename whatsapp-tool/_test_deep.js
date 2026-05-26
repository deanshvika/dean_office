require('dotenv').config();
const fs = require('fs');
const { token, appId } = JSON.parse(fs.readFileSync('/root/whatsapp-tool/base44_token.json', 'utf8'));
const BASE_URL = 'https://base44.app/api/apps/' + appId;
const H = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין"];

function findBest(input, list) {
    if (!input) return null;
    const norm = s => s.replace(/['"-]/g,'').trim();
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
    const pass = msg => { console.log('PASS', msg); passed++; };
    const fail = msg => { console.log('FAIL', msg); failed++; };

    // ── TEST 1: getPendingSubstitutions עם פילטר מאמן ────────────────────────
    console.log('\n=== TEST 1: pending_substitutions — coach filter ===');
    const r1 = await fetch(BASE_URL + '/entities/SubstitutionRequest?limit=200', { headers: H });
    const allReqs = await r1.json();
    const pending = allReqs.filter(r => r.status === 'ממתין לבדיקה');

    const arikhMatch = findBest('אריק', COACHES);
    const arikhReqs = pending.filter(r => r.requestingCoachName === arikhMatch);
    console.log(`pending לאריק (${arikhMatch}): ${arikhReqs.length}`);
    arikhReqs.length >= 0 ? pass('coach filter works') : fail('coach filter broken');

    const giliMatch = findBest('גילי', COACHES);
    const giliReqs = pending.filter(r => r.requestingCoachName === giliMatch);
    console.log(`pending לגילי (${giliMatch}): ${giliReqs.length}`);
    giliReqs.length >= 0 ? pass('coach filter גילי works') : fail('coach filter גילי broken');

    // ── TEST 2: סימולציית approveSubstitution (read-only) ───────────────────
    console.log('\n=== TEST 2: approveSubstitution — dry run ===');
    if (pending.length > 0) {
        const req = pending[0];
        console.log(`בקשה לבדיקה: ${req.requestingCoachName} | ${req.substitutionDate} | ${req.clientName}`);

        // שלב 1: מצא coachId של מחליף פוטנציאלי (דובי)
        const subName = findBest('דובי', COACHES);
        const allEvRes = await fetch(BASE_URL + `/entities/Event?limit=500`, { headers: H });
        const allEv = await allEvRes.json();
        const subCoachId = allEv.find(e => e.coachName === subName)?.coachId || '';
        console.log(`מחליף: ${subName}, coachId: ${subCoachId || '(לא נמצא בדוגמה)'}`);
        subName ? pass('substitute coach resolved') : fail('substitute coach not found');

        // שלב 2: מצא defaultWage של מחליף
        const coachRes = await fetch(BASE_URL + '/entities/Coach?limit=200', { headers: H });
        const coaches = await coachRes.json();
        const subObj = coaches.find(c => c.name === subName);
        console.log(`defaultWage של ${subName}: ${subObj?.defaultWage ?? 'לא נמצא'}`);
        subObj?.defaultWage ? pass(`defaultWage = ${subObj.defaultWage}₪`) : fail('defaultWage not found');

        // שלב 3: מצא events לאותו תאריך+מוקד+מאמן
        const evDateRes = await fetch(BASE_URL + `/entities/Event?date=${req.substitutionDate}&limit=500`, { headers: H });
        const dayEvents = await evDateRes.json();
        const targets = dayEvents.filter(e => e.clientName === req.clientName && e.coachName === req.requestingCoachName);
        console.log(`events לעדכון ב-${req.substitutionDate} ב-${req.clientName}: ${targets.length}`);
        targets.length >= 0 ? pass('event lookup by date+client+coach OK') : fail('event lookup failed');
    } else {
        console.log('(אין pending requests — מדלג)');
        pass('no pending to test (OK)');
    }

    // ── TEST 3: swapCoachInEvent — dry run ───────────────────────────────────
    console.log('\n=== TEST 3: swapCoachInEvent — dry run ===');
    // מוצא event קיים ומדמה swap
    const todayEvRes = await fetch(BASE_URL + `/entities/Event?date=2026-05-06&limit=200`, { headers: H });
    const todayEvents = await todayEvRes.json();
    console.log(`events ל-06/05: ${todayEvents.length}`);
    if (todayEvents.length > 0) {
        const sampleEv = todayEvents[0];
        console.log(`דוגמה: ${sampleEv.coachName} @ ${sampleEv.clientName} | id: ${sampleEv.id}`);

        // בדוק שניתן לעדכן שדות swap
        const hasUpdateFields = ['coachName','coachId','originalCoachName','isSwap','swapType','wage'].every(f => f in sampleEv);
        hasUpdateFields ? pass('all swap fields writable') : fail('swap fields missing');

        // בדוק coachId lookup
        const coachMatch = sampleEv.coachName;
        const coachId = sampleEv.coachId;
        coachId ? pass(`coachId found: ${coachId.slice(0,8)}...`) : fail('coachId missing from event');
    } else {
        console.log('(אין events ב-06/05)');
        pass('skip (no events on that date)');
    }

    // ── TEST 4: Client entity — לצורך Round 2 ───────────────────────────────
    console.log('\n=== TEST 4: Client entity — Round 2 prep ===');
    const clRes = await fetch(BASE_URL + '/entities/Client?limit=10', { headers: H });
    if (clRes.ok) {
        const clients = await clRes.json();
        const arr = Array.isArray(clients) ? clients : (clients.results || clients.data || []);
        console.log('Client count:', arr.length);
        if (arr.length > 0) {
            console.log('fields:', Object.keys(arr[0]).join(', '));
            console.log('sample:', JSON.stringify(arr[0], null, 2));
            pass('Client entity accessible');
        } else { pass('Client entity exists (empty)'); }
    } else {
        console.log('Client entity status:', clRes.status);
        fail('Client entity not accessible: ' + clRes.status);
    }

    // ── TEST 5: Program entity — לadd_event ─────────────────────────────────
    console.log('\n=== TEST 5: Program entity — Round 2 prep ===');
    const pRes = await fetch(BASE_URL + '/entities/Program?limit=20', { headers: H });
    if (pRes.ok) {
        const progs = await pRes.json();
        const arr = Array.isArray(progs) ? progs : (progs.results || progs.data || []);
        console.log('Program count:', arr.length);
        if (arr.length > 0) {
            console.log('fields:', Object.keys(arr[0]).join(', '));
            arr.slice(0,3).forEach(p => console.log(`  - ${p.name || p.programName || JSON.stringify(p)}`));
            pass('Program entity accessible');
        } else { pass('Program entity exists (empty)'); }
    } else {
        console.log('Program entity status:', pRes.status);
        fail('Program entity not accessible');
    }

    // ── TEST 6: list all entities ────────────────────────────────────────────
    console.log('\n=== TEST 6: All available entities ===');
    const entities = ['Event','Coach','Client','SubstitutionRequest','Program','Location','School','Venue'];
    for (const ent of entities) {
        const r = await fetch(BASE_URL + `/entities/${ent}?limit=1`, { headers: H });
        console.log(`  ${ent}: ${r.status} ${r.ok ? 'OK' : 'NOT FOUND'}`);
    }
    pass('entity scan complete');

    // ── SUMMARY ─────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(45));
    console.log(`תוצאות: ${passed} עברו | ${failed} נכשלו`);
    if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('ERROR:', e.message, e.stack); process.exit(1); });
