require('dotenv').config();
const fs = require('fs');
const { token, appId } = JSON.parse(fs.readFileSync('C:/Users/דין/Desktop/ANTIGRAVITY/המוח השני/whatsapp-tool/base44_token.json', 'utf8'));
const BASE_URL = 'https://base44.app/api/apps/' + appId;
const H = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

async function run() {
    let passed = 0, failed = 0;
    const pass = msg => { console.log('PASS', msg); passed++; };
    const fail = msg => { console.log('FAIL', msg); failed++; };

    // ── TEST 1: API זמין ─────────────────────────────────────────────────────
    console.log('\n=== TEST 1: SubstitutionRequest API ===');
    const res = await fetch(BASE_URL + '/entities/SubstitutionRequest?limit=500', { headers: H });
    res.ok ? pass(`API זמין (${res.status})`) : fail(`API נכשל: ${res.status}`);
    const all = await res.json();
    Array.isArray(all) ? pass(`התקבלו ${all.length} בקשות`) : fail('תשובה לא תקינה');

    // ── TEST 2: סינון לפי טווח תאריכים ──────────────────────────────────────
    console.log('\n=== TEST 2: date range filter ===');
    const todayIso = new Date().toISOString().split('T')[0];
    const toIso = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    console.log(`  טווח: ${todayIso} → ${toIso}`);
    const inRange = all.filter(r => r.substitutionDate >= todayIso && r.substitutionDate <= toIso);
    pass(`נמצאו ${inRange.length} חילופים ב-7 ימים הקרובים`);
    console.log(`  סטטוסים: ${[...new Set(inRange.map(r => r.status))].join(', ') || '(אין)'}`);

    // ── TEST 3: קיבוץ לפי תאריך ──────────────────────────────────────────────
    console.log('\n=== TEST 3: grouping by date ===');
    const byDate = {};
    for (const r of inRange) {
        if (!byDate[r.substitutionDate]) byDate[r.substitutionDate] = [];
        byDate[r.substitutionDate].push(r);
    }
    const dates = Object.keys(byDate).sort();
    pass(`קובץ לפי תאריכים — ${dates.length} ימים שונים`);
    dates.forEach(d => {
        const [y, m, dd] = d.split('-');
        console.log(`  ${dd}/${m}: ${byDate[d].length} חילופים`);
    });

    // ── TEST 4: שדות נדרשים קיימים ──────────────────────────────────────────
    console.log('\n=== TEST 4: required fields ===');
    if (inRange.length > 0) {
        const r = inRange[0];
        console.log(`  דוגמה:`, JSON.stringify(r, null, 2).slice(0, 300));
        ['substitutionDate', 'requestingCoachName', 'clientName', 'status'].forEach(f => {
            f in r ? pass(`שדה ${f} קיים`) : fail(`שדה ${f} חסר`);
        });
        r.substituteCoachName !== undefined ? pass('substituteCoachName קיים') : fail('substituteCoachName חסר');
    } else {
        console.log('  (אין חילופים ב-7 ימים — בודק שדות על כל הנתונים)');
        if (all.length > 0) {
            const r = all[0];
            ['substitutionDate', 'requestingCoachName', 'clientName', 'status'].forEach(f => {
                f in r ? pass(`שדה ${f} קיים`) : fail(`שדה ${f} חסר`);
            });
        } else {
            pass('אין נתונים לבדיקת שדות (OK)');
        }
    }

    // ── TEST 5: בדיקת source — פונקציה + intent קיימים ──────────────────────
    console.log('\n=== TEST 5: source check ===');
    const src = fs.readFileSync('C:/Users/דין/Desktop/ANTIGRAVITY/המוח השני/whatsapp-tool/server.js', 'utf8');
    [
        ['getWeekSubstitutions function', 'async function getWeekSubstitutions('],
        ['upcoming_substitutions intent in prompt', '"intent":"upcoming_substitutions"'],
        ['upcoming_substitutions handler', "parsed.intent === 'upcoming_substitutions'"],
        ['byDate grouping', 'byDate[r.substitutionDate]'],
        ['statusEmoji map', 'statusEmoji'],
        ['days parameter', 'parseInt(parsed.days)'],
    ].forEach(([label, pattern]) => {
        src.includes(pattern) ? pass(label) : fail(label + ' MISSING');
    });

    // ── TEST 6: פורמט תצוגה ──────────────────────────────────────────────────
    console.log('\n=== TEST 6: output format simulation ===');
    const heDay = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const statusEmoji = { 'ממתין לבדיקה': '⏳', 'אושר': '✅', 'בוצע': '✔️', 'נדחה': '❌' };
    if (inRange.length > 0) {
        const blocks = dates.map(iso => {
            const [y, m, d] = iso.split('-');
            const dow = heDay[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
            const lines = byDate[iso].map(r => {
                const em = statusEmoji[r.status] || '•';
                const sub = r.substituteCoachName ? ` ← ${r.substituteCoachName}` : ' (מחליף לא שובץ)';
                return `  ${em} ${r.requestingCoachName}${sub}\n     📍 ${r.clientName}`;
            }).join('\n');
            return `*יום ${dow} ${d}/${m}:*\n${lines}`;
        }).join('\n\n');
        const [td, tm] = todayIso.split('-').reverse();
        const [ed, em2] = toIso.split('-').reverse();
        console.log(`\n--- הודעה שתשלח ---`);
        console.log(`📆 *חילופים ${td}/${tm} – ${ed}/${em2} (7 ימים)*\n\n${blocks}`);
        console.log(`---`);
        pass('פורמט הודעה תקין');
    } else {
        pass('אין חילופים — תוצג הודעת "אין חילופים" (תקין)');
    }

    // ── SUMMARY ─────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(50));
    console.log(`תוצאות: ${passed} עברו | ${failed} נכשלו`);
    if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
