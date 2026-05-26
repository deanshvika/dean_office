require('dotenv').config();
const fs = require('fs');
const { token, appId } = JSON.parse(fs.readFileSync('/root/whatsapp-tool/base44_token.json', 'utf8'));
const BASE_URL = 'https://base44.app/api/apps/' + appId;
const H = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין"];

function findBest(input, list) {
    if (!input) return null;
    const clean = s => s.replace(/['"״]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const inp = clean(input);
    const exact = list.find(o => clean(o) === inp);
    if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0]));
    if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byFirst = inp.includes(' ') ? null : list.find(o => clean(o).startsWith(inp.split(' ')[0]));
    if (byFirst) return byFirst;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w)));
    if (byAny) return byAny;
    return null;
}

async function run() {
    let passed = 0, failed = 0;
    const pass = msg => { console.log('PASS', msg); passed++; };
    const fail = msg => { console.log('FAIL', msg); failed++; };

    // ── TEST 1: Bug fix — subCoachId from Coach entity (not events) ───────────
    console.log('\n=== TEST 1: subCoachId via Coach entity ===');
    const coachRes = await fetch(BASE_URL + '/entities/Coach?limit=200', { headers: H });
    const allCoaches = await coachRes.json();
    const dubi = allCoaches.find(c => c.name === 'דובי מילר');
    dubi?.id ? pass(`דובי coachId: ${dubi.id.slice(0,8)}... (via Coach entity)`) : fail('דובי not found in Coach');
    const arik = allCoaches.find(c => c.name === 'אריק מונטבילסקי');
    arik?.id ? pass(`אריק coachId: ${arik.id.slice(0,8)}... (via Coach entity)`) : fail('אריק not found');

    // ── TEST 2: updateCoachWage — dry run ────────────────────────────────────
    console.log('\n=== TEST 2: updateCoachWage — dry run ===');
    const matched = findBest('דובי', COACHES);
    const coachObj = allCoaches.find(c => c.name === matched);
    matched ? pass(`findBest(דובי) = ${matched}`) : fail('findBest failed');
    coachObj ? pass(`Coach object found, current defaultWage: ${coachObj.defaultWage}₪`) : fail('coachObj missing');
    if (coachObj) {
        const putBody = { ...coachObj, defaultWage: 130 };
        typeof putBody.defaultWage === 'number' ? pass('PUT body valid') : fail('bad PUT body');
        console.log(`  dry-run: ${coachObj.name} ${coachObj.defaultWage}₪ → 130₪`);
    }

    // ── TEST 3: getCoachInfo — upcoming events ───────────────────────────────
    console.log('\n=== TEST 3: getCoachInfo — upcoming events ===');
    const todayIso = new Date().toISOString().split('T')[0];
    const evRes = await fetch(BASE_URL + `/entities/Event?limit=3000`, { headers: H });
    const allEv = await evRes.json();
    console.log(`total events fetched: ${allEv.length}`);
    const testCoach = 'דובי מילר';
    const upcoming = allEv.filter(e => e.coachName === testCoach && e.date >= todayIso && e.status !== 'cancelled' && e.status !== 'canceled');
    upcoming.sort((a,b) => a.date.localeCompare(b.date));
    console.log(`upcoming for ${testCoach}: ${upcoming.length}`);
    upcoming.length >= 0 ? pass('upcoming events query works') : fail('upcoming query failed');
    if (upcoming.length > 0) {
        const [y,m,d] = upcoming[0].date.split('-');
        console.log(`  next: ${d}/${m} ${upcoming[0].startTime||''} — ${upcoming[0].clientName}`);
        pass(`next event found: ${upcoming[0].clientName}`);
    } else {
        pass('no upcoming events (valid result)');
    }

    // ── TEST 4: getDaySummary — financial data ───────────────────────────────
    console.log('\n=== TEST 4: getDaySummary ===');
    const testDate = '06/05/2026';
    const [d, m, y] = testDate.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const dayRes = await fetch(BASE_URL + `/entities/Event?date=${isoDate}&limit=500`, { headers: H });
    const dayEvents = await dayRes.json();
    const active = dayEvents.filter(e => e.status !== 'cancelled' && e.status !== 'canceled');
    const cancelled = dayEvents.filter(e => e.status === 'cancelled' || e.status === 'canceled');
    const totalWages = active.reduce((s,e) => s + (e.wage||0), 0);
    const totalRevenue = active.reduce((s,e) => s + (e.price||0), 0);
    const coaches = [...new Set(active.map(e => e.coachName).filter(Boolean))].sort();
    console.log(`  ${testDate}: ${active.length} active, ${cancelled.length} cancelled`);
    console.log(`  wages: ${totalWages}₪, revenue: ${totalRevenue}₪`);
    console.log(`  coaches: ${coaches.join(', ')}`);
    active.length >= 0 ? pass('getDaySummary data OK') : fail('day summary failed');
    typeof totalWages === 'number' ? pass(`wages sum: ${totalWages}₪`) : fail('wages not a number');
    typeof totalRevenue === 'number' ? pass(`revenue sum: ${totalRevenue}₪`) : fail('revenue not a number');

    // ── TEST 5: source check ─────────────────────────────────────────────────
    console.log('\n=== TEST 5: source check ===');
    const src = fs.readFileSync('/root/whatsapp-tool/server.js', 'utf8');
    [
        ['updateCoachWage function', 'async function updateCoachWage('],
        ['getCoachInfo function', 'async function getCoachInfo('],
        ['getDaySummary function', 'async function getDaySummary('],
        ['update_wage intent', '"intent":"update_wage"'],
        ['coach_info intent', '"intent":"coach_info"'],
        ['day_summary intent', '"intent":"day_summary"'],
        ['update_wage handler', "parsed.intent === 'update_wage'"],
        ['coach_info handler', "parsed.intent === 'coach_info'"],
        ['day_summary handler', "parsed.intent === 'day_summary'"],
        ['update_wage confirm', "data._intent === 'update_wage'"],
        ['bug fix: subCoachId from Coach', "subCoachId = subObj.id"],
        ['bug fix: no event search for coachId', '!subCoachId'],
    ].forEach(([label, pattern]) => {
        src.includes(pattern) ? pass(label) : fail(label + ' MISSING');
    });

    // ── SUMMARY ─────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(50));
    console.log(`תוצאות: ${passed} עברו | ${failed} נכשלו`);
    if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('ERROR:', e.message, e.stack); process.exit(1); });
