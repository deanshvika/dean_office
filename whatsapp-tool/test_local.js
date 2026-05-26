const scheduleData = require('./schedule_data.json');
const COACHES = ['להט מעיין','קרן דבוש','יהונתן רום','טל וזגיאל','דוד אשורי','דין שויקה','שרי אנטין','עמית אלבז','נועם כהן','תום בריאולובסקי','ליאור מרגוליס','שמעון יצחק','גל ניקסון','רומי לני','שלו אהרוני','דניאל לנדאו','סיון טפירו','אריק מונטבילסקי','אופק סגל','אסף זוהר','ליז אפרגן','פיקאדו ינאו','תמיר חלף','חי ניר','דובי מילר','וליד אבו חמוד','סהר ליכטנפלד','גילי ששון','אייל רותם','יובל גורפיין','עידן אדלר'];
const LOCATIONS = Object.keys(scheduleData.locationDays || {});

function findBest(q, list) {
    if (!q || !list.length) return null;
    const clean = s => s.replace(/['"״]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const inp = clean(q);
    const exact = list.find(o => clean(o) === inp);
    if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0]));
    if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byWords = list.find(o => words.length > 1 && words.every(w => clean(o).includes(w)));
    if (byWords) return byWords;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w)));
    if (byAny) return byAny;
    // אם שם פרטי לבד מזהה רשומה יחידה — נצח על שם משפחה משובש
    const firstNameOnly = inp.split(' ')[0];
    if (firstNameOnly && firstNameOnly.length >= 2) {
        const byFirstUniq = list.filter(o => clean(o).split(' ')[0] === firstNameOnly);
        if (byFirstUniq.length === 1) return byFirstUniq[0];
    }
    return null;
}

const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const today = new Date('2026-05-05'); today.setHours(0,0,0,0);
const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
const nextWeekStart = new Date(weekEnd); nextWeekStart.setDate(weekEnd.getDate() + 1);
const nextWeekEnd = new Date(nextWeekStart); nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

function dateInRange(ds, from, to) {
    const [d,m,y] = ds.split('/');
    const dt = new Date(`${y}-${m}-${d}`);
    return dt >= from && dt <= to;
}
function dateToDisplay(ds) {
    const [d,m,y] = ds.split('/');
    const dt = new Date(`${y}-${m}-${d}`);
    return `${hebrewDays[dt.getDay()]} ${d}/${m}`;
}

const raw = scheduleData.rawSchedule;

const tests = [
    // --- שאלות שנבדקו בעבר ---
    { label: 'מי לא עובד מחר (06/05)',              q: { queryType:'absent',   date:'06/05/2026', range:'date' } },
    { label: 'איזה בתי ספר ביום רביעי (06/05)',     q: { queryType:'locations', date:'06/05/2026', range:'date' } },
    { label: 'איפה אריק ביום ראשון (10/05)',         q: { queryType:'status',   subject:'אריק', date:'10/05/2026', range:'date' } },
    { label: 'מתי אריק עובד השבוע',                 q: { queryType:'schedule', subject:'אריק', range:'week', date:'' } },
    { label: 'מי עובד בכלנא השבוע',                 q: { queryType:'schedule', subject:'כלנא', range:'week', date:'' } },
    { label: 'מתי אריק בכלנא שבוע הבא',             q: { queryType:'schedule', subject:'אריק', location:'כלנא', range:'next_week', date:'' } },
    // --- שאלות חדשות ---
    { label: 'מי עובד ביום חמישי (07/05)',           q: { queryType:'present',  date:'07/05/2026', range:'date' } },
    { label: 'מי לא עובד ביום ראשון (10/05)',        q: { queryType:'absent',   date:'10/05/2026', range:'date' } },
    { label: 'מתי גילי עובדת השבוע',                q: { queryType:'schedule', subject:'גילי', range:'week', date:'' } },
    { label: 'איפה דובי עובד ביום שני (11/05)',      q: { queryType:'status',   subject:'דובי', date:'11/05/2026', range:'date' } },
    { label: 'מי עובד בבית ספר מגן ביום שלישי (12/05)', q: { queryType:'schedule', subject:'מגן', range:'date', date:'12/05/2026' } },
    { label: 'מתי יש פעילות בהצלחה איתמר',         q: { queryType:'schedule', subject:'הצלחה איתמר', range:'week', date:'' } },
    { label: 'מי עובד בשבוע הבא ביום שני (11/05)',  q: { queryType:'present',  date:'11/05/2026', range:'date' } },
    { label: 'מתי יובל עובד שבוע הבא',              q: { queryType:'schedule', subject:'יובל', range:'next_week', date:'' } },
    { label: 'איזה בתי ספר עובדים שבוע הבא ראשון', q: { queryType:'locations', date:'10/05/2026', range:'date' } },
    { label: 'מתי סיון עובדת השבוע',                q: { queryType:'schedule', subject:'סיון', range:'week', date:'' } },
    { label: 'איפה נועם עובד ביום שני (11/05)',      q: { queryType:'status',   subject:'נועם', date:'11/05/2026', range:'date' } },
    { label: 'מי עובד בבית ספר שמיר שבוע הבא',     q: { queryType:'schedule', subject:'שמיר', range:'next_week', date:'' } },
];

for (const t of tests) {
    console.log('\n━━━', t.label);
    const p = t.q;
    const subject = p.subject || '';
    const range = p.range || 'week';

    let fromDate, toDate;
    if (range === 'next_week') { fromDate = nextWeekStart; toDate = nextWeekEnd; }
    else if (range === 'date' && p.date) {
        const [d,m,y] = p.date.split('/');
        fromDate = new Date(`${y}-${m}-${d}`); toDate = new Date(fromDate);
    } else { fromDate = weekStart; toDate = weekEnd; }

    if (p.queryType === 'present') {
        const dayData = raw[p.date];
        const working = new Set();
        if (dayData) for (const loc of dayData.locations) for (const a of (loc.activities||[])) if (a.status!=='בוטל'&&a.coach) working.add(a.coach);
        const list = COACHES.filter(c => working.has(c));
        console.log(`✅ עובדים — ${dateToDisplay(p.date)}:\n${list.join(', ') || 'אין'}`);
        continue;
    }

    if (p.queryType === 'absent') {
        const dayData = raw[p.date];
        const working = new Set();
        if (dayData) for (const loc of dayData.locations) for (const a of (loc.activities||[])) if (a.status!=='בוטל'&&a.coach) working.add(a.coach);
        const absent = COACHES.filter(c => !working.has(c));
        console.log(`😴 לא עובדים — ${dateToDisplay(p.date)}:\n${absent.join(', ')}`);
        continue;
    }

    if (p.queryType === 'locations') {
        const dayData = raw[p.date];
        if (!dayData) { console.log('אין נתונים'); continue; }
        const locMap = new Map();
        for (const l of dayData.locations) {
            const active = (l.activities||[]).filter(a => a.status!=='בוטל');
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
        const locs = [...locMap.values()].map(({ display, coaches }) =>
            `${display}${coaches.size ? ' — ' + [...coaches].join(', ') : ''}`
        );
        console.log(`📍 ${dateToDisplay(p.date)}:\n${locs.join('\n')}`);
        continue;
    }

    if (p.queryType === 'status') {
        const mc = findBest(subject, COACHES);
        if (!mc) { console.log('מאמן לא נמצא'); continue; }
        const entries = [];
        for (const [date, {locations}] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            for (const loc of locations) {
                const acts = (loc.activities||[]).filter(a=>a.coach===mc&&a.status!=='בוטל');
                if (!acts.length) continue;
                const times = acts.map(a=>a.time).filter(t=>/^\d+:\d{2}$/.test(t)).sort();
                entries.push(`${dateToDisplay(date)} — ${loc.location}${times.length?' '+times[0]:''}`);
            }
        }
        console.log(`📅 ${mc}:\n${entries.length ? entries.join('\n') : 'אין פעילויות'}`);
        continue;
    }

    if (p.queryType === 'schedule') {
        const mc = findBest(subject, COACHES);
        const ml = findBest(subject, LOCATIONS);
        const fl = p.location ? findBest(p.location, LOCATIONS) : null;
        const flBase = fl ? fl.replace(/\s*\(יוח"א\)\s*/g,'').trim() : null;

        if (mc) {
            const entries = [];
            for (const [date, {locations}] of Object.entries(raw)) {
                if (!dateInRange(date, fromDate, toDate)) continue;
                for (const loc of locations) {
                    if (flBase && loc.location.replace(/\s*\(יוח"א\)\s*/g,'').trim() !== flBase) continue;
                    const acts = (loc.activities||[]).filter(a=>a.coach===mc&&a.status!=='בוטל');
                    if (!acts.length) continue;
                    const times = acts.map(a=>a.time).filter(t=>/^\d+:\d{2}$/.test(t)).sort();
                    entries.push(`${dateToDisplay(date)} — ${loc.location}${times.length?' '+times[0]:''}`);
                }
            }
            const suf = fl ? ` ב${fl}` : '';
            console.log(`📅 ${mc}${suf}:\n${entries.length ? entries.join('\n') : 'אין פעילויות'}`);
        } else if (ml) {
            const mlBase = ml.replace(/\s*\(יוח"א\)\s*/g,'').trim();
            const entries = [];
            for (const [date, {locations}] of Object.entries(raw)) {
                if (!dateInRange(date, fromDate, toDate)) continue;
                const matching = locations.filter(l => l.location===ml || l.location.replace(/\s*\(יוח"א\)\s*/g,'').trim()===mlBase);
                const coaches = [...new Set(matching.flatMap(l => (l.activities||[]).filter(a=>a.status!=='בוטל'&&a.coach).map(a=>a.coach)))];
                if (coaches.length) entries.push(`${dateToDisplay(date)} — ${coaches.join(', ')}`);
            }
            if (!entries.length) {
                const nextEntries = [];
                for (const [date, {locations}] of Object.entries(raw)) {
                    if (!dateInRange(date, nextWeekStart, nextWeekEnd)) continue;
                    const matching = locations.filter(l => l.location===ml || l.location.replace(/\s*\(יוח"א\)\s*/g,'').trim()===mlBase);
                    const coaches = [...new Set(matching.flatMap(l => (l.activities||[]).filter(a=>a.status!=='בוטל'&&a.coach).map(a=>a.coach)))];
                    if (coaches.length) nextEntries.push(`${dateToDisplay(date)} — ${coaches.join(', ')}`);
                }
                if (nextEntries.length) console.log(`📭 אין השבוע\n📅 שבוע הבא:\n${nextEntries.join('\n')}`);
                else console.log('אין פעילויות בטווח');
            } else {
                console.log(`📅 ${ml}:\n${entries.join('\n')}`);
            }
        }
    }
}
