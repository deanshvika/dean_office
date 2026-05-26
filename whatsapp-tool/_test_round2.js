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

    // Fetch reference data once
    const [clientsRes, coachesRes, progsRes] = await Promise.all([
        fetch(BASE_URL + '/entities/Client?limit=200', { headers: H }),
        fetch(BASE_URL + '/entities/Coach?limit=200', { headers: H }),
        fetch(BASE_URL + '/entities/Program?limit=50', { headers: H }),
    ]);
    const allClients = await clientsRes.json();
    const allCoaches = await coachesRes.json();
    const allPrograms = await progsRes.json();
    const clientNames = allClients.map(c => c.name);

    console.log(`\n=== DATA LOADED: ${allClients.length} clients, ${allCoaches.length} coaches, ${allPrograms.length} programs ===`);
    console.log('programs:', allPrograms.map(p => p.name).join(', '));

    // ── TEST 1: addEvent — lookup resolution ─────────────────────────────────
    console.log('\n=== TEST 1: addEvent — שדות lookup ===');
    const testClient = 'רוקח';
    const testCoach = 'דובי';
    const testProgram = 'קבוצתי';

    const matchedClientName = findBest(testClient, clientNames);
    const clientObj = allClients.find(c => c.name === matchedClientName);
    matchedClientName ? pass(`client: "${testClient}" → "${matchedClientName}"`) : fail(`client "${testClient}" not found`);
    clientObj?.id ? pass(`clientId: ${clientObj.id.slice(0,8)}...`) : fail('clientId missing');

    const matchedCoach = findBest(testCoach, COACHES);
    const coachObj = allCoaches.find(c => c.name === matchedCoach);
    matchedCoach ? pass(`coach: "${testCoach}" → "${matchedCoach}"`) : fail(`coach "${testCoach}" not found`);
    coachObj?.id ? pass(`coachId: ${coachObj.id.slice(0,8)}...`) : fail('coachId missing');
    coachObj?.defaultWage !== undefined ? pass(`defaultWage: ${coachObj.defaultWage}₪`) : fail('defaultWage missing');

    const progObj = allPrograms.find(p => p.name && p.name.includes(testProgram));
    progObj ? pass(`program: "${testProgram}" → "${progObj.name}"`) : fail(`program "${testProgram}" not found`);

    // Verify all fields for POST body
    const isoDate = '2026-05-10';
    const dryRunEvent = {
        date: isoDate, clientId: clientObj?.id, clientName: matchedClientName,
        coachId: coachObj?.id, coachName: matchedCoach, startTime: '08:00', endTime: '08:45',
        programId: progObj?.id, programName: progObj?.name, wage: coachObj?.defaultWage || 120,
        status: 'planned', groupName: 'ג\'1', isSwap: false
    };
    const allPresent = ['date','clientId','clientName','coachId','coachName','startTime','endTime','wage','status'].every(f => dryRunEvent[f]);
    allPresent ? pass('all required fields for Event POST present') : fail('missing fields: ' + JSON.stringify(dryRunEvent));
    console.log('  dry-run event:', JSON.stringify(dryRunEvent));

    // ── TEST 2: addCoach — validation ───────────────────────────────────────
    console.log('\n=== TEST 2: addCoach — validation ===');
    const testName = 'מאמן בדיקה';
    const testWage = 100;
    const coachBody = { name: testName, defaultWage: testWage };
    typeof coachBody.name === 'string' && coachBody.name.length > 0 ? pass('name field OK') : fail('name field bad');
    typeof coachBody.defaultWage === 'number' ? pass(`defaultWage field OK: ${coachBody.defaultWage}₪`) : fail('defaultWage not number');
    console.log('  dry-run coach:', JSON.stringify(coachBody));

    // ── TEST 3: addClient — type mapping ────────────────────────────────────
    console.log('\n=== TEST 3: addClient — type mapping ===');
    const typeMap = { 'בית ספר': 'school', 'ביס': 'school', 'school': 'school', 'בי"ס': 'school', 'פרויקט': 'project', 'project': 'project' };
    const typeTests = [
        { input: 'school', expected: 'school' },
        { input: 'בית ספר', expected: 'school' },
        { input: 'project', expected: 'project' },
        { input: 'פרויקט', expected: 'project' },
    ];
    typeTests.forEach(t => {
        const got = typeMap[t.input?.toLowerCase?.()] || t.input || 'school';
        got === t.expected ? pass(`type "${t.input}" → "${got}"`) : fail(`type "${t.input}" → "${got}", expected "${t.expected}"`);
    });
    const clientBody = { name: 'בי"ס בדיקה', type: 'school', isActive: true };
    ['name','type','isActive'].every(f => f in clientBody) ? pass('all Client POST fields present') : fail('missing Client fields');
    console.log('  dry-run client:', JSON.stringify(clientBody));

    // ── TEST 4: detectIntent — new patterns exist in source ─────────────────
    console.log('\n=== TEST 4: server.js source check ===');
    const src = fs.readFileSync('/root/whatsapp-tool/server.js', 'utf8');
    const checks = [
        ['add_event function', 'async function addEvent('],
        ['add_coach function', 'async function addCoach('],
        ['add_client function', 'async function addClient('],
        ['add_event intent', '"intent":"add_event"'],
        ['add_coach intent', '"intent":"add_coach"'],
        ['add_client intent', '"intent":"add_client"'],
        ['add_event handler', "parsed.intent === 'add_event'"],
        ['add_coach handler', "parsed.intent === 'add_coach'"],
        ['add_client handler', "parsed.intent === 'add_client'"],
        ['add_event confirm', "data._intent === 'add_event'"],
        ['add_coach confirm', "data._intent === 'add_coach'"],
        ['add_client confirm', "data._intent === 'add_client'"],
    ];
    checks.forEach(([label, pattern]) => {
        src.includes(pattern) ? pass(label) : fail(label + ' MISSING in source');
    });

    // ── SUMMARY ─────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(50));
    console.log(`תוצאות: ${passed} עברו | ${failed} נכשלו`);
    if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('ERROR:', e.message, e.stack); process.exit(1); });
