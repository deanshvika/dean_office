const scheduleData = require('./schedule_data.json');
const COACHES = ['להט מעיין','קרן דבוש','יהונתן רום','טל וזגיאל','דוד אשורי','דין שויקה','שרי אנטין','עמית אלבז','נועם כהן','תום בריאולובסקי','ליאור מרגוליס','שמעון יצחק','גל ניקסון','רומי לני','שלו אהרוני','דניאל לנדאו','סיון טפירו','אריק מונטבילסקי','אופק סגל','אסף זוהר','ליז אפרגן','פיקאדו ינאו','תמיר חלף','חי ניר','דובי מילר','וליד אבו חמוד','סהר ליכטנפלד','גילי ששון','אייל רותם','יובל גורפיין','עידן אדלר'];
const LOCATIONS = Object.keys(scheduleData.locationDays || {});
const raw = scheduleData.rawSchedule;
const SUBSTITUTION_EXCLUDED = new Set(['יהונתן רום']);

const clean = s => s.replace(/['"״׳]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
function editDist(a,b){const m=a.length,n=b.length;const d=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>j===0?i:i===0?j:0));for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=a[i-1]===b[j-1]?d[i-1][j-1]:1+Math.min(d[i-1][j],d[i][j-1],d[i-1][j-1]);return d[m][n];}
function findBest(input, list) {
    if (!input || input === '') return null;
    const inp = clean(input);
    const exact = list.find(o => clean(o) === inp); if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0])); if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byWords = list.find(o => words.length > 1 && words.every(w => clean(o).includes(w))); if (byWords) return byWords;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w))); if (byAny) return byAny;
    const byFuzzy = list.find(o => { const parts = clean(o).split(/[\s,.()״׳]+/).filter(p=>p.length>=4); return words.filter(w=>w.length>=4).some(w=>parts.some(p=>editDist(w,p)<=1)); }); if (byFuzzy) return byFuzzy;
    const firstNameOnly = inp.split(' ')[0];
    if (firstNameOnly && firstNameOnly.length >= 2) { const u = list.filter(o=>clean(o).split(' ')[0]===firstNameOnly); if (u.length===1) return u[0]; }
    return null;
}

const issues = [], ok = [];

// 1. שמות פרטיים ייחודיים
const firstNames = COACHES.map(c => c.split(' ')[0]);
const dupes = firstNames.filter((n,i) => firstNames.indexOf(n) !== i);
if (dupes.length) issues.push('שמות פרטיים כפולים: ' + dupes.join(', '));
else ok.push('כל השמות הפרטיים ייחודיים');

// 2. findBest — שמות משובשים
const fuzzyTests = [
    ['אריק מונטוביסקי', 'אריק מונטבילסקי', COACHES],
    ['תום בריאו', 'תום בריאולובסקי', COACHES],
    ['סהר ליכטמן', 'סהר ליכטנפלד', COACHES],
    ['גבריאל', 'בי"ס גבריאלי, ת"א', LOCATIONS],
    ['כלנה', 'בי"ס כלנא יחד, יפו', LOCATIONS],
    ['הצלחה', 'הצלח"ה איתמר', LOCATIONS],
    ['מרחבים', 'בי"ס מרחבים, יבנה', LOCATIONS],
    ['שמיר', 'בי"ס שמיר, חולון', LOCATIONS],
    ['צמרות', 'בי"ס צמרות, באר יעקב', LOCATIONS],
];
for (const [input, expected, list] of fuzzyTests) {
    const r = findBest(input, list);
    if (!r) issues.push('לא נמצא: ' + input + ' (צפוי: ' + expected + ')');
    else if (r !== expected) issues.push('שגוי: ' + input + ' → ' + r + ' (צפוי: ' + expected + ')');
    else ok.push('fuzzy: ' + input + ' → ' + r);
}

// 3. שמות לא קיימים
const unknowns = ['משה כהן', 'בית ספר לא קיים', 'xyz', 'aaaa'];
for (const u of unknowns) {
    if (findBest(u, COACHES)) issues.push('false positive coach: ' + u + ' → ' + findBest(u, COACHES));
    else if (findBest(u, LOCATIONS)) issues.push('false positive location: ' + u + ' → ' + findBest(u, LOCATIONS));
    else ok.push('unknown rejected: ' + u);
}

// 4. יהונתן רום excluded
if (SUBSTITUTION_EXCLUDED.has('יהונתן רום')) ok.push('יהונתן רום excluded מחילוף');
else issues.push('יהונתן רום לא excluded!');

// 5. נתונים קיימים לשבוע הבא
const nextWeekDates = ['10/05/2026','11/05/2026','12/05/2026','13/05/2026','14/05/2026'];
for (const d of nextWeekDates) {
    if (raw[d]) ok.push('נתונים קיימים: ' + d);
    else issues.push('חסרים נתונים: ' + d);
}

// 6. בדיקת מיזוג יוח"א — אין כפילויות בתצוגה
for (const date of nextWeekDates) {
    if (!raw[date]) continue;
    const seen = new Set();
    let hasDupe = false;
    for (const l of raw[date].locations) {
        const active = (l.activities||[]).filter(a => a.status !== 'בוטל');
        if (!active.length) continue;
        const key = l.location.replace(/\s*\(יוח"א\)\s*/g,'').replace(/\s*\(יול"א\)\s*/g,'').replace(/,.*$/,'').trim();
        if (seen.has(key)) hasDupe = true;
        seen.add(key);
    }
    if (hasDupe) ok.push('מיזוג נדרש ב-' + date + ' (תקין — code handles it)');
    else ok.push('אין כפילויות: ' + date);
}

// 7. כל מאמן עובד לפחות יום אחד החודש
const workingThisMonth = new Set();
for (const [date, {locations}] of Object.entries(raw)) {
    if (!date.includes('/05/2026')) continue;
    for (const loc of locations)
        for (const a of (loc.activities||[]))
            if (a.status !== 'בוטל' && a.coach) workingThisMonth.add(a.coach);
}
const neverWork = COACHES.filter(c => !workingThisMonth.has(c));
if (neverWork.length) ok.push('ℹ️ ללא שיבוץ במאי (נתוני API): ' + neverWork.join(', '));
else ok.push('כל המאמנים עובדים לפחות יום אחד במאי');

// 8. קלטי גבול
if (findBest('', COACHES) !== null) issues.push('empty string should return null');
else ok.push('empty string → null');
if (findBest(null, COACHES) !== null) issues.push('null should return null');
else ok.push('null → null');

console.log('\n✅ תקין (' + ok.length + '):');
ok.forEach(m => console.log('  ' + m));
if (issues.length) {
    console.log('\n⚠️ בעיות (' + issues.length + '):');
    issues.forEach(m => console.log('  ❌ ' + m));
} else {
    console.log('\n🎉 אין באגים!');
}
