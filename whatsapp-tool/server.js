require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── קבועים ───────────────────────────────────────────────────────────────────
const SUBSTITUTION_EXCLUDED = new Set(['יהונתן רום']); // מאמנים שלא יופיעו ברשימת מחליפים
const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין","עידן אדלר"];
let LOCATIONS = ["הצלח\"ה איתמר","הצלחה חופית","הצלח\"ה מקיף ח'","הצלח\"ה הדרים ראשל\"צ","איתמר בן אב\"י (גפ\"ן), ת\"א","שורשים","הצלח\"ה הבילויים, ראשל\"צ","בי\"ס שפירא (יול\"א), ת\"א","בי\"ס שורשים (יול\"א), ת\"א","הצלח\"ה עין הקורא, ראשל\"צ","חט\"ב שמיר, ת\"א","בי\"ס איתמר בן אב\"י","בי\"ס המתמיד, ר\"ג","בי\"ס גבריאלי, ת\"א","בי\"ס לפיד, הוד השרון","בי\"ס מגן (יוח\"א), ת\"א","בי\"ס מגן","בי\"ס גבעון (יוח\"א), ת\"א","בי\"ס טבע, ת\"א","בי\"ס גבעון, ת\"א","בי\"ס רוקח, ת\"א","בי\"ס רוקח (יוח\"א), ת\"א","בי\"ס מרחבים, יבנה","בי\"ס שמיר, חולון","בי\"ס אלומות (יוח\"א), ת\"א","בי\"ס בית צורי, ת\"א","בי\"ס בית צורי (יוח\"א), ת\"א","בי\"ס יהודה מכבי (יוח\"א), ת\"א","בי\"ס נופי ים (יוח\"א), ת\"א","בי\"ס צמרות, באר יעקב","בי\"ס יוחנני, הרצליה","בי\"ס כפיר (יוח\"א), ת\"א","בי\"ס בלוך, ת\"א","בי\"ס בלוך (יוח\"א), ת\"א","בי\"ס נופים (יול\"א), ת\"א","נווה זמר, רעננה","נופי ים, ת\"א","אור זבולון, אריאל","בי\"ס כלנא יחד (יוח\"א), יפו","בי\"ס כלנא יחד, יפו","בי\"ס וייצמן, רחובות"];

// ─── תפוגת גישת מנהלים (הרצה) ────────────────────────────────────────────────
const MANAGER_EXPIRY = new Date('2026-05-11T23:59:59');

// ─── הגדרת סשנים ──────────────────────────────────────────────────────────────
const SESSIONS = [
    { id: 'owner',    label: 'דין (בעלים)',    role: 'owner',   autoStart: true  },
    { id: 'manager1', label: 'חי סיני',        role: 'manager', autoStart: false },
    { id: 'manager2', label: 'חן צור',          role: 'manager', autoStart: false },
    { id: 'manager3', label: 'מיכל בן אשר',    role: 'manager', autoStart: false },
    { id: 'manager4', label: 'חי ניר',          role: 'manager', autoStart: false },
];

const sessionStates = {}; // { [id]: { connected, qrBase64, pending, lastVoiceTs, ... } }

// ─── נתוני לו"ז משותפים ────────────────────────────────────────────────────────
let scheduleData = null;

function loadScheduleData() {
    try {
        const p = path.join(__dirname, 'schedule_data.json');
        if (fs.existsSync(p)) scheduleData = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch(e) { console.log('לא ניתן לטעון schedule_data.json:', e.message); }
}

async function refreshScheduleFromAPI() {
    const tokenPath = path.join(__dirname, 'base44_token.json');
    if (!fs.existsSync(tokenPath)) { console.log('[schedule] אין טוקן — מדלג'); return; }
    const { token, appId } = getB44();

    console.log('[schedule] מרענן נתוני לו"ז מ-API...');
    try {
        const res = await _apiFetch(`https://base44.app/api/apps/${appId}/entities/Event?limit=15000`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        }, 45000);
        if (!res.ok) { console.log('[schedule] API נכשל:', res.status); return; }
        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) { console.log('[schedule] אין נתונים'); return; }

        const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
        const locationDays = {}, locationCoaches = {}, coachLocations = {}, dateToLocations = {}, rawSchedule = {};
        const todayStr = new Date().toLocaleDateString('en-CA');

        for (const ev of list) {
            if (!ev.date) continue;
            if (ev.date < todayStr) continue;
            const [y, m, d] = ev.date.split('-');
            const dateStr = `${d}/${m}/${y}`;
            const dayOfWeek = hebrewDays[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
            const location = ev.clientName || '';
            const coach = ev.coachName || '';
            if (!location) continue;

            if (!locationDays[location]) locationDays[location] = new Set();
            locationDays[location].add(dayOfWeek);
            if (coach) {
                if (!locationCoaches[location]) locationCoaches[location] = new Set();
                locationCoaches[location].add(coach);
                if (!coachLocations[coach]) coachLocations[coach] = {};
                if (!coachLocations[coach][location]) coachLocations[coach][location] = new Set();
                coachLocations[coach][location].add(dayOfWeek);
            }
            if (!dateToLocations[dateStr]) dateToLocations[dateStr] = new Set();
            dateToLocations[dateStr].add(location);

            if (!rawSchedule[dateStr]) rawSchedule[dateStr] = { dayOfWeek, locations: [] };
            let locEntry = rawSchedule[dateStr].locations.find(l => l.location === location);
            if (!locEntry) { locEntry = { location, coaches: [], times: [], activities: [] }; rawSchedule[dateStr].locations.push(locEntry); }
            if (coach && !locEntry.coaches.includes(coach)) locEntry.coaches.push(coach);
            if (ev.startTime && !locEntry.times.includes(ev.startTime)) locEntry.times.push(ev.startTime);
            const statusHe = { planned: 'מתוכנן', cancelled: 'בוטל', canceled: 'בוטל' };
            locEntry.activities.push({
                coach,
                time: ev.startTime || '',
                endTime: ev.endTime || '',
                status: statusHe[ev.status] || ev.status || 'מתוכנן',
                group: ev.groupName || ''
            });
        }

        const s = v => v instanceof Set ? [...v].sort() : v;
        const sd = obj => Object.fromEntries(Object.entries(obj).map(([k,v]) => [k, s(v)]));
        const sdd = obj => Object.fromEntries(Object.entries(obj).map(([k,v]) => [k, sd(v)]));

        const summary = {
            generatedAt: new Date().toISOString(),
            totalEvents: list.length,
            locationDays: sd(locationDays),
            locationCoaches: sd(locationCoaches),
            coachLocations: sdd(coachLocations),
            dateToLocations: Object.fromEntries(Object.entries(dateToLocations).map(([k,v]) => [[...v].sort(), k]).map(([v,k]) => [k, v])),
            rawSchedule
        };

        fs.writeFileSync(path.join(__dirname, 'schedule_data.json'), JSON.stringify(summary, null, 2), 'utf8');
        scheduleData = summary;
        // עדכן רשימת מוקדים אוטומטית מה-API — כדי שמוקדים חדשים יהיו ניתנים לחיפוש
        const apiLocations = Object.keys(summary.locationDays || {});
        if (apiLocations.length > 0) {
            LOCATIONS.length = 0;
            apiLocations.forEach(l => LOCATIONS.push(l));
        }
        console.log(`[schedule] ✓ עודכן — ${list.length} אירועים`);
    } catch(e) {
        console.log('[schedule] שגיאת רענון:', e.message);
    }
}

async function refreshIfStale() {
    const p = path.join(__dirname, 'schedule_data.json');
    if (fs.existsSync(p)) {
        const age = Date.now() - fs.statSync(p).mtimeMs;
        if (age < 25 * 60 * 1000) { console.log(`[schedule] נתונים עדכניים, מדלג`); return; }
    }
    await refreshScheduleFromAPI();
}

loadScheduleData();
// דחיית refreshIfStale לאחר סיום טעינת המודול — מבטיח ש-_apiFetch מוגדר לפני שימוש
setTimeout(() => refreshIfStale().catch(() => {}), 0);
setInterval(() => refreshScheduleFromAPI().catch(() => {}), 30 * 60 * 1000);

// ─── פונקציות עזר ─────────────────────────────────────────────────────────────
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
    const clean = s => s.replace(/['"״]/g,'').replace(/\s+/g,' ').trim().toLowerCase()
        .replace(/בית ספר /g,'ביס ').replace(/חטיבת ביניים/g,'חטב').replace(/חטיבה/g,'חטב');
    const inp = clean(input);
    const exact = list.find(o => clean(o) === inp);
    if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0]));
    if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    const byWords = list.find(o => words.length > 1 && words.every(w => clean(o).includes(w)));
    if (byWords) return byWords;
    const firstName = inp.split(' ')[0];
    const byFirst = inp.includes(' ') ? null : list.find(o => clean(o).startsWith(firstName));
    if (byFirst) return byFirst;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w)));
    if (byAny) return byAny;
    const byFuzzy = list.find(o => {
        const parts = clean(o).split(/[\s,.()"״]+/).filter(p => p.length >= 4);
        return words.filter(w => w.length >= 4).some(w => parts.some(p => editDist(w, p) <= 1));
    });
    if (byFuzzy) return byFuzzy;
    // נרמול פונטי: ק→כ (אותו צליל), הסרת ו אמצעי (שגיאות Whisper נפוצות)
    const phonNorm = s => s.replace(/ק/g, 'כ').replace(/ו(?=[א-ת])/g, '');
    const inpNorm = phonNorm(inp);
    if (inpNorm !== inp) {
        const byPhon = list.find(o => {
            const on = phonNorm(clean(o));
            if (on.includes(inpNorm) || inpNorm.includes(on.split(',')[0])) return true;
            const nwords = inpNorm.split(' ').filter(w => w.length >= 4);
            const parts = on.split(/[\s,.()"״]+/).filter(p => p.length >= 4);
            return nwords.some(w => parts.some(p => editDist(w, p) <= 1));
        });
        if (byPhon) return byPhon;
    }
    // אם שם פרטי לבד מזהה רשומה יחידה — נצח על שם משפחה משובש
    const firstNameOnly = inp.split(' ')[0];
    if (firstNameOnly && firstNameOnly.length >= 2) {
        const byFirstUniq = list.filter(o => clean(o).split(' ')[0] === firstNameOnly);
        if (byFirstUniq.length === 1) return byFirstUniq[0];
    }
    return null;
}

function validateCancel(location, date) {
    if (!scheduleData) return null;
    const warnings = [];
    const [d, m, y] = date.split('/');
    const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const dayOfWeek = hebrewDays[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
    if (location) {
        const activeDays = scheduleData.locationDays?.[location] || [];
        const locationsOnDate = scheduleData.dateToLocations?.[date] || [];
        const notOnDate = locationsOnDate.length > 0 && !locationsOnDate.includes(location);
        if (notOnDate) {
            warnings.push(`⚠️ לפי הלו"ז, ${location} לא מופיע ב-${date}. ימי הפעילות הרגילים: ${activeDays.join(', ') || 'לא ידוע'}`);
        } else if (activeDays.length > 0 && !activeDays.includes(dayOfWeek)) {
            warnings.push(`⚠️ ${location} בדרך כלל פעיל ב-${activeDays.join('/')} — לא ב${dayOfWeek}`);
        }
    }
    return warnings.length > 0 ? warnings.join('\n') : null;
}

function validateSubstitution(coach, location, date) {
    if (!scheduleData) return null;
    const warnings = [];
    const [d, m, y] = date.split('/');
    const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const dayOfWeek = hebrewDays[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
    if (coach && location) {
        const coachLocs = scheduleData.coachLocations?.[coach] || {};
        if (Object.keys(coachLocs).length > 0 && !coachLocs[location]) {
            warnings.push(`⚠️ לפי הלו"ז, ${coach} לא מועסק ב-${location}. המוקדים שלו: ${Object.keys(coachLocs).join(', ')}`);
        } else if (coachLocs[location]) {
            const coachDays = coachLocs[location];
            if (!coachDays.includes(dayOfWeek)) {
                warnings.push(`⚠️ ${coach} ב-${location} פעיל ב-${coachDays.join('/')} — לא ב${dayOfWeek}`);
            }
        }
    }
    return warnings.length > 0 ? warnings.join('\n') : null;
}

function answerQuery(parsed) {
    if (!scheduleData) return '❌ אין נתוני לו"ז זמינים.';

    // תיקון: אם AI החזיר locations אבל subject הוא שם מאמן → status
    if (parsed.queryType === 'locations' && parsed.subject && findBest(parsed.subject, COACHES)) {
        parsed = { ...parsed, queryType: 'status' };
    }
    // תיקון: אם AI החזיר present אבל subject הוא שם מוקד → schedule
    if (parsed.queryType === 'present' && parsed.subject && findBest(parsed.subject, LOCATIONS) && !findBest(parsed.subject, COACHES)) {
        parsed = { ...parsed, queryType: 'schedule' };
    }

    const raw = scheduleData.rawSchedule || {};
    const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

    const today = new Date(); today.setHours(0,0,0,0);
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const nextWeekStart = new Date(weekEnd); nextWeekStart.setDate(weekEnd.getDate() + 1);
    const nextWeekEnd = new Date(nextWeekStart); nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

    function dateInRange(dateStr, from, to) {
        const [d, m, y] = dateStr.split('/');
        const dt = new Date(`${y}-${m}-${d}`);
        return dt >= from && dt <= to;
    }
    function dateToDisplay(dateStr) {
        const [d, m, y] = dateStr.split('/');
        const dt = new Date(`${y}-${m}-${d}`);
        return `${hebrewDays[dt.getDay()]} ${d}/${m}`;
    }

    const subject = parsed.subject || '';
    const range = parsed.range || 'week';

    let fromDate, toDate;
    if (range === 'next_week') { fromDate = nextWeekStart; toDate = nextWeekEnd; }
    else if (range === 'date' && parsed.date) {
        const _dp = parsed.date.split('/');
        const [d, m, y] = [_dp[0], _dp[1], _dp[2] || String(new Date().getFullYear())];
        fromDate = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`); toDate = new Date(fromDate);
    } else { fromDate = weekStart; toDate = weekEnd; }

    if (parsed.queryType === 'status') {
        const matchedCoachS = subject ? findBest(subject, COACHES) : null;
        const matchedLocationS = subject ? findBest(subject, LOCATIONS) : null;
        const dateLabel = parsed.date ? dateToDisplay(parsed.date) : '—';

        if (matchedLocationS && parsed.date) {
            const loc = raw[parsed.date]?.locations.find(l => l.location === matchedLocationS);
            if (!loc) return `📭 אין פעילויות ב${matchedLocationS} ב-${dateLabel}.`;
            const acts = (loc.activities || []).sort((a,b) => (a.time||'').localeCompare(b.time||''));
            const lines = acts.map(a => {
                const st = a.status === 'מתוכנן' ? '✅ מתוכנן' : (a.status === 'בוטל' ? '❌ בוטל' : a.status);
                return `${a.time || '—'}${a.endTime ? '-'+a.endTime : ''} | ${a.coach || '—'}${a.group ? ' | '+a.group : ''} — ${st}`;
            });
            return `📊 *${matchedLocationS}* — ${dateLabel}:\n\n${lines.join('\n')}`;
        }
        if (matchedCoachS && parsed.date) {
            const dayData = raw[parsed.date];
            if (!dayData) return `📭 אין פעילויות ב-${dateLabel}.`;
            const lines = [];
            for (const loc of dayData.locations) {
                for (const a of (loc.activities || [])) {
                    if (a.coach === matchedCoachS) {
                        const st = a.status === 'מתוכנן' ? '✅ מתוכנן' : (a.status === 'בוטל' ? '❌ בוטל' : a.status);
                        const timeStr = `${a.time || '—'}${a.endTime ? '-'+a.endTime : ''}`;
                        lines.push(`${loc.location} ${timeStr} — ${st}`);
                    }
                }
            }
            if (lines.length === 0) return `📭 ${matchedCoachS} לא מופיע ב-${dateLabel}.`;
            return `📊 *${matchedCoachS}* — ${dateLabel}:\n\n${lines.join('\n')}`;
        }
        return `❓ ציין מוקד או מאמן ותאריך לבדיקת סטטוס.`;
    }

    if (parsed.queryType === 'times') {
        const matchedLocationT = subject ? findBest(subject, LOCATIONS) : null;
        if (!matchedLocationT) return `❓ ציין שם מוקד לבדיקת שעות.`;
        const entries = [];
        for (const [date, { locations }] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            const loc = locations.find(l => l.location === matchedLocationT);
            if (loc) {
                const acts = (loc.activities || []).filter(a => a.status !== 'בוטל').sort((a,b) => (a.time||'').localeCompare(b.time||''));
                if (acts.length === 0) continue;
                const timesStr = acts.map(a => `${a.time || '—'}${a.endTime ? '-'+a.endTime : ''} (${a.coach || '—'})`).join(', ');
                entries.push(`${dateToDisplay(date)}: ${timesStr}`);
            }
        }
        if (entries.length === 0) return `📭 אין פעילויות ב${matchedLocationT} בטווח שנבדק.`;
        const rangeLabel = range === 'next_week' ? 'שבוע הבא' : (range === 'date' && parsed.date ? parsed.date : 'השבוע');
        return `🕐 *שעות — ${matchedLocationT}* — ${rangeLabel}:\n\n${entries.join('\n')}`;
    }

    if (parsed.queryType === 'locations' && !parsed.date) return '❓ ציין תאריך. לדוגמה: "איזה מוקדים עובדים ב-10/05"';
    if (parsed.queryType === 'locations' && parsed.date) {
        const dayData = raw[parsed.date];
        const dateLabel = dateToDisplay(parsed.date);
        if (!dayData) return `📭 אין פעילויות ב-${dateLabel}.`;
        const locMap = new Map(); // key: normalized, value: { display, coaches }
        for (const l of dayData.locations) {
            const active = (l.activities || []).filter(a => a.status !== 'בוטל');
            if (!active.length) continue;
            const cleaned = l.location.replace(/\s*\(יוח"א\)\s*/g,'').replace(/\s*\(יול"א\)\s*/g,'').trim();
            const key = cleaned.replace(/,.*$/, '').trim();
            if (!locMap.has(key)) {
                locMap.set(key, { display: cleaned, coaches: new Set() });
            } else if (cleaned.length > locMap.get(key).display.length) {
                locMap.get(key).display = cleaned; // prefer version with city
            }
            for (const a of active) if (a.coach) locMap.get(key).coaches.add(a.coach);
        }
        const activeLocations = [...locMap.values()].map(({ display, coaches }) =>
            `${display}${coaches.size ? ' — ' + [...coaches].join(', ') : ''}`
        );
        if (activeLocations.length === 0) return `📭 אין פעילויות מתוכננות ב-${dateLabel}.`;
        return `📍 *מוקדים פעילים — ${dateLabel}*:\n\n${activeLocations.join('\n')}`;
    }

    if (parsed.queryType === 'present' && !parsed.date) return '❓ ציין תאריך. לדוגמה: "מי עובד ב-10/05"';
    if (parsed.queryType === 'present' && parsed.date) {
        const dayData = raw[parsed.date];
        const workingCoaches = new Set();
        if (dayData) {
            for (const loc of dayData.locations)
                for (const a of (loc.activities || []))
                    if (a.status !== 'בוטל' && a.coach) workingCoaches.add(a.coach);
        }
        const working = COACHES.filter(c => workingCoaches.has(c));
        const dateLabel = dateToDisplay(parsed.date);
        if (working.length === 0) return `😴 אין מאמנים עובדים ב-${dateLabel}.`;
        return `✅ *מאמנים שעובדים — ${dateLabel}*:\n\n${working.join('\n')}`;
    }

    if (parsed.queryType === 'absent' && !parsed.date) return '❓ ציין תאריך. לדוגמה: "מי לא עובד ב-10/05"';
    if (parsed.queryType === 'absent' && parsed.date) {
        const dayData = raw[parsed.date];
        const workingCoaches = new Set();
        if (dayData) {
            for (const loc of dayData.locations)
                for (const a of (loc.activities || []))
                    if (a.status !== 'בוטל' && a.coach) workingCoaches.add(a.coach);
        }
        const absent = COACHES.filter(c => !workingCoaches.has(c));
        const dateLabel = dateToDisplay(parsed.date);
        if (absent.length === 0) return `✅ כל המאמנים עובדים ב-${dateLabel}.`;
        return `😴 *מאמנים שלא עובדים — ${dateLabel}*:\n\n${absent.join('\n')}`;
    }

    const matchedCoach = subject ? findBest(subject, COACHES) : null;
    const matchedLocation = subject ? findBest(subject, LOCATIONS) : null;
    const filterLocation = parsed.location ? findBest(parsed.location, LOCATIONS) : null;
    const normLocKey = s => (s||'').replace(/\s*\(יוח"א\)\s*/g,'').replace(/\s*\(יול"א\)\s*/g,'').replace(/,.*$/,'').trim();
    const filterLocBase = filterLocation ? normLocKey(filterLocation) : null;

    if (matchedCoach) {
        const entries = [];
        for (const [date, { locations }] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            for (const loc of locations) {
                if (filterLocBase && normLocKey(loc.location) !== filterLocBase) continue;
                const activeActs = (loc.activities || []).filter(a => a.coach === matchedCoach && a.status !== 'בוטל');
                if (activeActs.length === 0) continue;
                const times = activeActs.map(a => a.time).filter(t => /^\d{1,2}:\d{2}$/.test(t)).sort();
                entries.push(`${dateToDisplay(date)} — ${loc.location}${times.length ? ' ' + times[0] : ''}`);
            }
        }
        const locationSuffix = filterLocation ? ` ב${filterLocation}` : '';
        if (entries.length === 0) return `📭 אין פעילויות ל${matchedCoach}${locationSuffix} בטווח שנבדק.`;
        const rangeLabel = range === 'next_week' ? 'שבוע הבא' : (range === 'date' ? parsed.date : 'השבוע');
        return `📅 *${matchedCoach}*${locationSuffix} — ${rangeLabel}:\n\n${entries.join('\n')}`;
    }

    if (matchedLocation) {
        const entries = [];
        const baseLocName = normLocKey(matchedLocation);
        for (const [date, { locations }] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            const matchingLocs = locations.filter(l => l.location === matchedLocation || normLocKey(l.location) === baseLocName);
            const activeCoaches = [...new Set(matchingLocs.flatMap(l => (l.activities || []).filter(a => a.status !== 'בוטל' && a.coach).map(a => a.coach)))];
            if (activeCoaches.length === 0) continue;
            entries.push(`${dateToDisplay(date)} — ${activeCoaches.join(', ')}`);
        }
        if (entries.length === 0 && range === 'week') {
            const nextEntries = [];
            for (const [date, { locations }] of Object.entries(raw)) {
                if (!dateInRange(date, nextWeekStart, nextWeekEnd)) continue;
                const matchingLocs = locations.filter(l => l.location === matchedLocation || normLocKey(l.location) === baseLocName);
                const activeCoaches = [...new Set(matchingLocs.flatMap(l => (l.activities || []).filter(a => a.status !== 'בוטל' && a.coach).map(a => a.coach)))];
                if (activeCoaches.length === 0) continue;
                nextEntries.push(`${dateToDisplay(date)} — ${activeCoaches.join(', ')}`);
            }
            if (nextEntries.length > 0) return `📭 אין פעילויות ב${matchedLocation} השבוע.\n\n📅 *שבוע הבא:*\n${nextEntries.join('\n')}`;
            return `📭 אין פעילויות ב${matchedLocation} בטווח שנבדק.`;
        }
        const rangeLabel = range === 'next_week' ? 'שבוע הבא' : (range === 'date' ? parsed.date : 'השבוע');
        return `📅 *${matchedLocation}* — ${rangeLabel}:\n\n${entries.join('\n')}`;
    }

    if (range === 'date' && parsed.date) {
        const dayData = raw[parsed.date];
        if (!dayData) return `📭 אין פעילויות ב-${parsed.date}.`;
        const lines = dayData.locations
            .map(l => {
                const active = [...new Set((l.activities || []).filter(a => a.status !== 'בוטל' && a.coach).map(a => a.coach))];
                return active.length > 0 ? `${l.location}: ${active.join(', ')}` : null;
            })
            .filter(Boolean);
        if (lines.length === 0) return `📭 אין פעילויות מתוכננות ב-${parsed.date}.`;
        return `📅 *${parsed.date}*:\n\n${lines.join('\n')}`;
    }

    return '❓ לא הצלחתי להבין את השאלה. נסה: "איפה עובד [שם מאמן] השבוע" או "מתי יש פעילות ב[מוקד]"';
}

async function transcribe(audioBuffer, sessionId) {
    // timestamp בשם הקובץ מונע race condition כשמגיעות שתי הקלטות במקביל מאותו סשן
    const tmpFile = path.join(__dirname, `tmp_audio_${sessionId}_${Date.now()}.ogg`);
    fs.writeFileSync(tmpFile, audioBuffer);
    const _mkTrCall = () => groq.audio.transcriptions.create({
        file: fs.createReadStream(tmpFile),
        model: 'whisper-large-v3-turbo',
        language: 'he',
        response_format: 'text'
    });
    try {
        const _trTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('transcribe timeout')), 30000));
        try {
            return await Promise.race([_mkTrCall(), _trTimeout]);
        } catch(e) {
            if (e.message !== 'transcribe timeout') throw e;
            // timeout — נסה שוב פעם אחת
            await new Promise(r => setTimeout(r, 1500));
            const _trTimeout2 = new Promise((_, reject) => setTimeout(() => reject(new Error('transcribe timeout')), 30000));
            return await Promise.race([_mkTrCall(), _trTimeout2]);
        }
    } finally {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch(_) {}
    }
}

const _intentCache = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _intentCache) if (now - v.ts > 5 * 60 * 1000) _intentCache.delete(k);
}, 60 * 1000);

async function detectIntent(text, context = {}) {
    const today = new Date(); const dateStamp = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;
    const ctxHash = (context.coach||'') + '|' + (context.location||'') + '|' + (context.date||'');
    const cacheKey = dateStamp + '|' + text.trim().toLowerCase() + '|' + ctxHash;
    const cached = _intentCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.result;
    const dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const todayDate = new Date(); todayDate.setHours(0,0,0,0);
    const todayDay = todayDate.getDay();
    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    const nextOccurrence = (targetDay) => {
        const diff = ((targetDay - todayDay + 7) % 7) || 7;
        const d = new Date(todayDate); d.setDate(todayDate.getDate() + diff); return fmt(d);
    };
    const nextDaysStr = dayNames.map((n, i) => `${n}:${nextOccurrence(i)}`).join(' | ');

    // בנה מחרוזת הקשר מהשיחה — מוגבל ל-2 פריטים עם חיתוך כדי לא לחרוג מ-6000 טוקן
    const ctxParts = [];
    if (context.history?.length > 0)
        ctxParts.push(`הודעות קודמות בשיחה:\n${context.history.slice(-2).map(h => `• "${h.slice(0,80)}"`).join('\n')}`);
    const known = [];
    if (context.coach) known.push(`מאמן: ${context.coach}`);
    if (context.location) known.push(`מוקד: ${context.location}`);
    if (context.date) known.push(`תאריך: ${context.date}`);
    if (known.length) ctxParts.push(`הקשר נוכחי: ${known.join(', ')}`);
    const contextStr = ctxParts.length > 0
        ? `\n${ctxParts.join('\n')}\nכאשר הבקשה מכילה "אותו"/"אותה"/"שם"/"שלו"/"שלה"/"הוא"/"היא"/"שם" — השתמש בהקשר הנוכחי.\n`
        : '';

    const _promptContent = `זהה בקשה. החזר JSON בלבד.${contextStr}
היום: ${fmt(todayDate)} (${dayNames[todayDay]}) | מחר: ${fmt(new Date(todayDate.getTime()+86400000))} | מחרתיים: ${fmt(new Date(todayDate.getTime()+2*86400000))}
"ביום X" לבד = תאריך מהטבלה: ${nextDaysStr}

ביטול פעילות: {"intent":"cancel","date":"DD/MM/YYYY","location":"מוקד או ריק","cancelAll":false}
  "כל היום"/"כל הפעילויות" → cancelAll:true. "בתל"=בטל.
  דוגמה: "בטל פעילות בכלנא ב-15/05" → {"intent":"cancel","date":"15/05/2026","location":"כלנא יחד","cancelAll":false}

שחזור/שחזר/החזר פעילות שבוטלה (הפוך ביטול): {"intent":"restore","date":"DD/MM/YYYY","location":"מוקד או ריק","coach":"מאמן אם צוין"}
  דוגמה: "שחזר פעילות בכלנא ב-13/05" → {"intent":"restore","date":"13/05/2026","location":"כלנא יחד","coach":""}

רישום בלוח חילופים ("עדכן בלוח חילופים ש..."): {"intent":"substitution","requestingCoach":"","date":"DD/MM/YYYY","location":"","reason":"","replacementCoach":"","paymentDetails":"","notes":""}
  דוגמה: "עדכן בלוח חילופים שאריק מבקש חילוף ב-12/05 בכלנא, יחליף ליאור" → {"intent":"substitution","requestingCoach":"אריק","date":"12/05/2026","location":"כלנא יחד","replacementCoach":"ליאור"}

שאלה מי זמין/יכול להחליף/לכסות: {"intent":"available_coaches","coach":"מאמן שצריך חילוף","location":"מוקד","date":"DD/MM/YYYY"}
  דוגמה: "מי יכול להחליף את אריק בכלנא ב-10/05" → {"intent":"available_coaches","coach":"אריק","location":"כלנא","date":"10/05/2026"}

שיבוץ ישיר בלוח שיבוצים ("שבץ את X במקום Y ב..."): {"intent":"swap_coach","date":"DD/MM/YYYY","client":"מוקד","originalCoach":"","substituteCoach":"","wage":"ריק=ברירת מחדל"}

אישור חילוף קיים: {"intent":"approve_substitution","coach":"מבקש","date":"DD/MM/YYYY","substituteCoach":"","wage":"ריק=ברירת מחדל"}

בקשות ממתינות לאישור: {"intent":"pending_substitutions","coach":"ריק=כולם","dateFrom":"DD/MM/YYYY","dateTo":"DD/MM/YYYY"}

חילופים קרובים/השבוע: {"intent":"upcoming_substitutions","days":7}

מי עובד/איזה מאמנים עובדים ביום X: {"intent":"query","subject":"","range":"date","date":"DD/MM/YYYY","queryType":"present"}

מי לא עובד/פנוי ביום X: {"intent":"query","subject":"","range":"date","date":"DD/MM/YYYY","queryType":"absent"}

איפה/מה עושה [מאמן] ביום X | סטטוס מוקד ביום X: {"intent":"query","subject":"שם","range":"date","date":"DD/MM/YYYY","queryType":"status"}
  דוגמה: "סטטוס בית ספר שורשים" → {"intent":"query","subject":"בית ספר שורשים","queryType":"status","date":"..."}

לוח מאמן/מוקד (שבוע/שבוע הבא/כל) | "מי עובד ב[מוקד] השבוע": {"intent":"query","subject":"שם","location":"מוקד אם גם מאמן גם מוקד","range":"week/next_week/date/all","date":"DD/MM/YYYY","queryType":"schedule"}

שעות פעילות: {"intent":"query","subject":"מוקד","range":"date/week","date":"DD/MM/YYYY","queryType":"times"}

אילו מוקדים פעילים ביום X (ללא מאמן): {"intent":"query","subject":"","range":"date","date":"DD/MM/YYYY","queryType":"locations"}

תוסיף/הוסף פעילות חדשה: {"intent":"add_event","date":"DD/MM/YYYY","client":"","coach":"","startTime":"HH:MM","endTime":"HH:MM","program":"","wage":"","groupName":""}

הוסף מאמן: {"intent":"add_coach","name":"שם מלא","wage":"שכר"}

הוסף מוקד/בית ספר: {"intent":"add_client","name":"שם מלא","type":"school/project"}

עדכן/שנה שכר מאמן (ללא תאריך): {"intent":"update_wage","coach":"שם","wage":"שכר חדש"}
  "עדכן שכר ל-ליאור ל-200" / "שנה שכר ליאור 200" / "הפוך שכר שלו ל-150" → update_wage

פרטי מאמן/שכר/אירועים קרובים: {"intent":"coach_info","coach":"שם"}

סיכום/כמה פעילויות/כמה שכר ביום X: {"intent":"day_summary","date":"DD/MM/YYYY"}

שיחה/לא קשור ללוח זמנים: {"intent":"other"}

תאריכים: "בראשון במאי"=01/05, "בשישי במאי"=06/05 (יום 6 בחודש!), "בעשירי"=10, "בחמישה עשר"=15
location: כתוב כפי שנאמר (ללא עיר/סוגריים)

טקסט: "${text}"`;
    const makeGroqCall = () => groq.chat.completions.create({
        model: 'llama-3.1-8b-instant', max_tokens: 400, temperature: 0,
        messages: [{ role: 'user', content: _promptContent }]
    });
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('detectIntent timeout')), ms))]);
    let msg;
    try {
        msg = await withTimeout(makeGroqCall(), 25000);
    } catch(e) {
        // 413 = פרומפט גדול מדי → נסה שוב ללא היסטוריה/הקשר (regex מתוקן: ללא רווח אחרי \n)
        if (e.message?.includes('413') || e.message?.includes('tokens')) {
            await new Promise(r => setTimeout(r, 1000));
            const minimalPrompt = _promptContent.replace(/(ללא טקסט נוסף\.)[\s\S]*?(\nתאריך היום:)/, '$1$2');
            msg = await withTimeout(groq.chat.completions.create({
                model: 'llama-3.1-8b-instant', max_tokens: 400, temperature: 0,
                messages: [{ role: 'user', content: minimalPrompt }]
            }), 20000);
        } else if (e.message?.includes('timeout')) {
            // timeout — נסה שוב פעם אחת אחרי 1.5 שניות
            await new Promise(r => setTimeout(r, 1500));
            msg = await withTimeout(makeGroqCall(), 20000);
        } else {
            throw e;
        }
    }
    let raw = (msg.choices?.[0]?.message?.content || msg.content?.[0]?.text || '').replace(/```json\n?|\n?```/g,'').trim();
    // חלץ רק את ה-JSON object (מ-{ עד })
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];
    let result;
    try {
        result = JSON.parse(raw);
    } catch(e) {
        const fixed = raw.replace(/([א-ת\w])"([א-ת\w])/g, '$1\\"$2');
        try { result = JSON.parse(fixed); }
        catch(e2) { result = { intent: 'unknown', reason: 'JSON parse failed: ' + raw.slice(0, 80) }; }
    }
    if (result.intent !== 'unknown') _intentCache.set(cacheKey, { result, ts: Date.now() });
    return result;
}

// ─── Base44 API ────────────────────────────────────────────────────────────────
const _apiFetch = (url, opts, ms = 20000) => Promise.race([
    fetch(url, opts),
    new Promise((_, rej) => setTimeout(() => rej(new Error('API timeout')), ms))
]);

let _b44Cache = null, _b44CacheTs = 0;
function getB44() {
    if (!_b44Cache || Date.now() - _b44CacheTs > 60 * 60 * 1000) {
        _b44Cache = JSON.parse(fs.readFileSync(path.join(__dirname, 'base44_token.json'), 'utf8'));
        _b44CacheTs = Date.now();
    }
    return _b44Cache;
}
function base44Headers() {
    return { 'Authorization': `Bearer ${getB44().token}`, 'Content-Type': 'application/json' };
}
function base44Url(appId, entity, id) {
    return `https://base44.app/api/apps/${appId}/entities/${entity}${id ? '/'+id : ''}`;
}

async function fillBase44(data) {
    const matchedCoach = findBest(data.requestingCoach, COACHES);
    const matchedLocation = findBest(data.location, LOCATIONS);
    const matchedReplacement = findBest(data.replacementCoach, COACHES);
    if (!matchedCoach) throw new Error(`מאמן מבקש לא זוהה: "${data.requestingCoach}"`);
    if (!matchedLocation) throw new Error(`מוקד לא זוהה: "${data.location}"`);

    const { appId } = getB44();
    const H = base44Headers();
    const [d, m, y] = data.date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

    let clientId = '', requestingCoachId = '', substituteCoachId = '';
    async function scanEventsForIds(events) {
        for (const ev of events) {
            if (!clientId && ev.clientName === matchedLocation && ev.clientId) clientId = ev.clientId;
            if (!requestingCoachId && ev.coachName === matchedCoach && ev.coachId) requestingCoachId = ev.coachId;
            if (matchedReplacement && !substituteCoachId && ev.coachName === matchedReplacement && ev.coachId) substituteCoachId = ev.coachId;
            if (clientId && requestingCoachId && (!matchedReplacement || substituteCoachId)) break;
        }
    }
    const evDateRes = await _apiFetch(`${base44Url(appId, 'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (evDateRes.ok) await scanEventsForIds(await evDateRes.json());
    if (!clientId || !requestingCoachId || (matchedReplacement && !substituteCoachId)) {
        const evAllRes = await _apiFetch(`${base44Url(appId, 'Event')}?limit=2000`, { headers: H }, 30000);
        if (!evAllRes.ok) throw new Error(`API שגיאה: ${evAllRes.status}`);
        await scanEventsForIds(await evAllRes.json());
    }

    const body = {
        substitutionDate: isoDate, requestingCoachName: matchedCoach, requestingCoachId,
        clientName: matchedLocation, clientId, substituteCoachName: matchedReplacement || '',
        substituteCoachId, reason: data.reason || '', notes: data.notes || '',
        temporarySubstituteName: '', summaryDetails: '', status: 'ממתין לבדיקה'
    };
    const r = await _apiFetch(base44Url(appId, 'SubstitutionRequest'), {
        method: 'POST', headers: H, body: JSON.stringify(body)
    });
    if (!r.ok) { const err = await r.text(); throw new Error(`API שגיאה ${r.status}: ${err.slice(0,150)}`); }
    console.log(`[API] ✓ בקשת חילוף נוצרה`);
    return { success: true, matchedCoach, matchedLocation };
}

async function cancelActivities(date, location) {
    const matchedLocation = location ? findBest(location, LOCATIONS) : null;
    if (location && !matchedLocation) throw new Error(`המוקד "${location}" לא נמצא`);
    const { appId } = getB44();
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const res = await _apiFetch(`${base44Url(appId,'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    const events = await res.json();
    const toCancel = events.filter(e =>
        (e.status === 'planned' || e.status === 'מתוכנן') &&
        (!matchedLocation || e.clientName === matchedLocation)
    );
    if (toCancel.length === 0) {
        const found = events.filter(e => !matchedLocation || e.clientName === matchedLocation);
        if (found.length === 0) throw new Error(`לא נמצאו אירועים ב-${date}${matchedLocation ? ' ב-' + matchedLocation : ''}`);
        throw new Error(`כל האירועים ב-${date}${matchedLocation ? ' ב-' + matchedLocation : ''} כבר בוטלו`);
    }
    const results = await Promise.all(toCancel.map(ev =>
        _apiFetch(base44Url(appId, 'Event', ev.id), { method: 'PUT', headers: H, body: JSON.stringify({ ...ev, status: 'canceled' }) })
            .then(r => r.ok ? 1 : 0).catch(() => 0)
    ));
    const count = results.reduce((s, x) => s + x, 0);
    const failCount = results.length - count;
    return { success: true, cancelledCount: count, failCount, matchedLocation };
}

async function previewCancel(date, location) {
    const { appId } = getB44();
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const res = await _apiFetch(`${base44Url(appId,'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    const events = await res.json();
    return events.filter(e =>
        (e.status === 'planned' || e.status === 'מתוכנן') &&
        (!location || e.clientName === location)
    );
}

async function previewRestore(date, location, coach) {
    const { appId } = getB44();
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const res = await _apiFetch(`${base44Url(appId,'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    const events = await res.json();
    return events.filter(e =>
        (e.status === 'canceled' || e.status === 'בוטל') &&
        (!location || e.clientName === location) &&
        (!coach || e.coachName === coach)
    );
}

async function restoreActivities(date, location, coach) {
    const matchedLocation = location ? findBest(location, LOCATIONS) : null;
    if (location && !matchedLocation) throw new Error(`המוקד "${location}" לא נמצא`);
    const matchedCoach = coach ? findBest(coach, COACHES) : null;
    if (coach && !matchedCoach) throw new Error(`המאמן "${coach}" לא נמצא`);
    const { appId } = getB44();
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const res = await _apiFetch(`${base44Url(appId,'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    const events = await res.json();
    const toRestore = events.filter(e =>
        (e.status === 'canceled' || e.status === 'בוטל') &&
        (!matchedLocation || e.clientName === matchedLocation) &&
        (!matchedCoach || e.coachName === matchedCoach)
    );
    if (toRestore.length === 0) {
        const coachSuffix = matchedCoach ? ` של ${matchedCoach}` : '';
        const locSuffix = matchedLocation ? ` ב-${matchedLocation}` : '';
        const found = events.filter(e =>
            (!matchedLocation || e.clientName === matchedLocation) &&
            (!matchedCoach || e.coachName === matchedCoach)
        );
        if (found.length === 0) throw new Error(`לא נמצאו אירועים${coachSuffix}${locSuffix} ב-${date}`);
        throw new Error(`אין פעילויות מבוטלות${coachSuffix}${locSuffix} ב-${date}`);
    }
    const results = await Promise.all(toRestore.map(ev =>
        _apiFetch(base44Url(appId, 'Event', ev.id), { method: 'PUT', headers: H, body: JSON.stringify({ ...ev, status: 'planned' }) })
            .then(r => r.ok ? 1 : 0).catch(() => 0)
    ));
    const count = results.reduce((s, x) => s + x, 0);
    const failCount = results.length - count;
    return { success: true, restoredCount: count, failCount, matchedLocation, matchedCoach };
}

// ─── פונקציות API — ניהול מתקדם ───────────────────────────────────────────────

async function getPendingSubstitutions(coachFilter, dateFrom, dateTo) {
    const { appId } = getB44();
    const H = base44Headers();
    const res = await _apiFetch(`${base44Url(appId, 'SubstitutionRequest')}?limit=200`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    let list = await res.json();
    list = list.filter(r => r.status === 'ממתין לבדיקה');
    if (coachFilter) {
        const matched = findBest(coachFilter, COACHES);
        if (matched) list = list.filter(r => r.requestingCoachName === matched);
    }
    if (dateFrom) {
        const [df, mf, yf] = dateFrom.split('/');
        const isoFrom = `${yf}-${mf.padStart(2,'0')}-${df.padStart(2,'0')}`;
        list = list.filter(r => r.substitutionDate >= isoFrom);
    }
    if (dateTo) {
        const [dt, mt, yt] = dateTo.split('/');
        const isoTo = `${yt}-${mt.padStart(2,'0')}-${dt.padStart(2,'0')}`;
        list = list.filter(r => r.substitutionDate <= isoTo);
    }
    return list.sort((a, b) => a.substitutionDate.localeCompare(b.substitutionDate));
}

async function getWeekSubstitutions(days = 7) {
    const { appId } = getB44();
    const H = base44Headers();
    const res = await _apiFetch(`${base44Url(appId, 'SubstitutionRequest')}?limit=500`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    const all = await res.json();

    const todayIso = new Date().toISOString().split('T')[0];
    const toIso = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
    const inRange = all.filter(r => r.substitutionDate >= todayIso && r.substitutionDate <= toIso);
    inRange.sort((a, b) => a.substitutionDate.localeCompare(b.substitutionDate));

    // קבץ לפי תאריך
    const byDate = {};
    for (const r of inRange) {
        if (!byDate[r.substitutionDate]) byDate[r.substitutionDate] = [];
        byDate[r.substitutionDate].push(r);
    }
    return { byDate, total: inRange.length, todayIso, toIso };
}

async function approveSubstitution(requestId, substituteCoachName, wageOverride) {
    const { appId } = getB44();
    const H = base44Headers();

    const listRes = await _apiFetch(`${base44Url(appId, 'SubstitutionRequest')}?limit=200`, { headers: H });
    if (!listRes.ok) throw new Error(`API שגיאה: ${listRes.status}`);
    const req = (await listRes.json()).find(r => r.id === requestId);
    if (!req) throw new Error('הבקשה לא נמצאה');

    let subCoachId = req.substituteCoachId || '';
    let finalWage = wageOverride ? parseInt(wageOverride) : 0;
    if (substituteCoachName) {
        const coachRes = await _apiFetch(`${base44Url(appId, 'Coach')}?limit=200`, { headers: H });
        if (coachRes.ok) {
            const subObj = (await coachRes.json()).find(c => c.name === substituteCoachName);
            if (subObj) {
                if (!subCoachId) subCoachId = subObj.id || '';
                if (!wageOverride) finalWage = subObj.defaultWage || 0;
            }
        }
    }

    const updatedReq = { ...req, status: 'אושר', substituteCoachName: substituteCoachName || req.substituteCoachName || '', substituteCoachId: subCoachId };
    const rReq = await _apiFetch(base44Url(appId, 'SubstitutionRequest', requestId), { method: 'PUT', headers: H, body: JSON.stringify(updatedReq) });
    if (!rReq.ok) throw new Error(`שגיאת עדכון בקשה: ${rReq.status}`);

    let eventsUpdated = 0;
    if (substituteCoachName) {
        const evRes = await _apiFetch(`${base44Url(appId, 'Event')}?date=${req.substitutionDate}&limit=500`, { headers: H });
        if (evRes.ok) {
            const targets = (await evRes.json()).filter(e => e.clientName === req.clientName && e.coachName === req.requestingCoachName);
            const evResults = await Promise.all(targets.map(ev => {
                const updated = { ...ev, coachName: substituteCoachName, coachId: subCoachId, originalCoachName: ev.coachName, originalCoachId: ev.coachId, isSwap: true, swapType: 'temporary', wage: finalWage || ev.wage };
                return _apiFetch(base44Url(appId, 'Event', ev.id), { method: 'PUT', headers: H, body: JSON.stringify(updated) })
                    .then(r => r.ok ? 1 : 0).catch(() => 0);
            }));
            eventsUpdated = evResults.reduce((s, x) => s + x, 0);
        }
    }

    refreshScheduleFromAPI().catch(() => {});
    return { req: updatedReq, substituteCoachName, eventsUpdated, finalWage, wasOverride: !!wageOverride };
}

async function swapCoachInEvent(date, client, originalCoach, substituteCoach, wageOverride) {
    const matchedClient = findBest(client, LOCATIONS);
    if (!matchedClient) throw new Error(`מוקד "${client}" לא נמצא`);
    const matchedOriginal = findBest(originalCoach, COACHES);
    if (!matchedOriginal) throw new Error(`מאמן מקורי "${originalCoach}" לא נמצא`);
    const matchedSub = findBest(substituteCoach, COACHES);
    if (!matchedSub) throw new Error(`מחליף "${substituteCoach}" לא נמצא`);

    const { appId } = getB44();
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

    const res = await _apiFetch(`${base44Url(appId, 'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    const events = await res.json();
    const targets = events.filter(e => e.clientName === matchedClient && e.coachName === matchedOriginal);
    if (targets.length === 0) throw new Error(`לא נמצאו אירועים של ${matchedOriginal} ב-${matchedClient} ב-${date}`);

    let subCoachId = '', defaultSubWage = 0;
    const coachRes = await _apiFetch(`${base44Url(appId, 'Coach')}?limit=200`, { headers: H });
    if (coachRes.ok) {
        const subObj = (await coachRes.json()).find(c => c.name === matchedSub);
        if (subObj) { subCoachId = subObj.id || ''; defaultSubWage = subObj.defaultWage || 0; }
    }

    const finalWage = wageOverride ? parseInt(wageOverride) : defaultSubWage;
    const swapResults = await Promise.all(targets.map(ev => {
        const updated = { ...ev, coachName: matchedSub, coachId: subCoachId, originalCoachName: matchedOriginal, originalCoachId: ev.coachId, isSwap: true, swapType: 'temporary', wage: finalWage };
        return _apiFetch(base44Url(appId, 'Event', ev.id), { method: 'PUT', headers: H, body: JSON.stringify(updated) })
            .then(r => r.ok ? 1 : 0).catch(() => 0);
    }));
    const count = swapResults.reduce((s, x) => s + x, 0);

    refreshScheduleFromAPI().catch(() => {});
    return { count, matchedClient, matchedOriginal, matchedSub, finalWage, defaultSubWage, wasOverride: !!wageOverride };
}

async function addEvent(date, clientName, coachName, startTime, endTime, programName, wageOverride, groupName) {
    const { appId } = getB44();
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

    const clientRes = await _apiFetch(`${base44Url(appId, 'Client')}?limit=200`, { headers: H });
    if (!clientRes.ok) throw new Error(`API שגיאה בטעינת מוקדים: ${clientRes.status}`);
    const allClients = await clientRes.json();
    const clientNames = allClients.map(c => c.name);
    const matchedClientName = findBest(clientName, clientNames);
    if (!matchedClientName) throw new Error(`מוקד "${clientName}" לא נמצא`);
    const clientObj = allClients.find(c => c.name === matchedClientName);

    const matchedCoach = findBest(coachName, COACHES);
    if (!matchedCoach) throw new Error(`מאמן "${coachName}" לא נמצא`);

    const coachRes = await _apiFetch(`${base44Url(appId, 'Coach')}?limit=200`, { headers: H });
    const allCoaches = coachRes.ok ? await coachRes.json() : [];
    const coachObj = allCoaches.find(c => c.name === matchedCoach);
    const coachId = coachObj?.id || '';
    const defaultWage = coachObj?.defaultWage || 0;
    const finalWage = wageOverride ? parseInt(wageOverride) : defaultWage;

    let programId = '', programNameFinal = '';
    if (programName) {
        const progRes = await _apiFetch(`${base44Url(appId, 'Program')}?limit=50`, { headers: H });
        const progs = progRes.ok ? await progRes.json() : [];
        const progObj = progs.find(p => p.name && p.name.includes(programName));
        if (progObj) { programId = progObj.id; programNameFinal = progObj.name; }
        else programNameFinal = programName;
    }

    const newEvent = {
        date: isoDate, clientId: clientObj.id, clientName: matchedClientName,
        coachId, coachName: matchedCoach, startTime: startTime || '', endTime: endTime || '',
        programId, programName: programNameFinal, wage: finalWage, status: 'planned',
        groupName: groupName || '', isSwap: false
    };
    const res = await _apiFetch(base44Url(appId, 'Event'), { method: 'POST', headers: H, body: JSON.stringify(newEvent) });
    if (!res.ok) throw new Error(`שגיאת יצירה: ${res.status}`);
    const created = await res.json();
    refreshScheduleFromAPI().catch(() => {});
    return { created, matchedClientName, matchedCoach, finalWage, defaultWage, wasOverride: !!wageOverride, programNameFinal };
}

async function addCoach(name, defaultWage) {
    const { appId } = getB44();
    const H = base44Headers();
    const res = await _apiFetch(base44Url(appId, 'Coach'), {
        method: 'POST', headers: H,
        body: JSON.stringify({ name, defaultWage: parseInt(defaultWage) || 0 })
    });
    if (!res.ok) throw new Error(`שגיאת יצירה: ${res.status}`);
    return await res.json();
}

async function addClient(name, type) {
    const { appId } = getB44();
    const H = base44Headers();
    const typeMap = { 'בית ספר': 'school', 'ביס': 'school', 'school': 'school', 'בי"ס': 'school', 'פרויקט': 'project', 'project': 'project' };
    const resolvedType = typeMap[type?.toLowerCase?.()] || type || 'school';
    const res = await _apiFetch(base44Url(appId, 'Client'), {
        method: 'POST', headers: H,
        body: JSON.stringify({ name, type: resolvedType, isActive: true })
    });
    if (!res.ok) throw new Error(`שגיאת יצירה: ${res.status}`);
    return await res.json();
}

async function updateCoachWage(coachName, newWage) {
    const { appId } = getB44();
    const H = base44Headers();
    const matchedCoach = findBest(coachName, COACHES);
    if (!matchedCoach) throw new Error(`מאמן "${coachName}" לא נמצא`);

    const coachRes = await _apiFetch(`${base44Url(appId, 'Coach')}?limit=200`, { headers: H });
    if (!coachRes.ok) throw new Error(`API שגיאה: ${coachRes.status}`);
    const coaches = await coachRes.json();
    const coachObj = coaches.find(c => c.name === matchedCoach);
    if (!coachObj) throw new Error(`מאמן "${matchedCoach}" לא נמצא ב-Base44`);

    const oldWage = coachObj.defaultWage || 0;
    const res = await _apiFetch(base44Url(appId, 'Coach', coachObj.id), {
        method: 'PUT', headers: H,
        body: JSON.stringify({ ...coachObj, defaultWage: parseInt(newWage) })
    });
    if (!res.ok) throw new Error(`שגיאת עדכון: ${res.status}`);
    return { matchedCoach, oldWage, newWage: parseInt(newWage) };
}

async function getCoachInfo(coachName) {
    const { appId } = getB44();
    const H = base44Headers();
    const matchedCoach = findBest(coachName, COACHES);
    if (!matchedCoach) throw new Error(`מאמן "${coachName}" לא נמצא`);

    const [coachRes, evRes] = await Promise.all([
        _apiFetch(`${base44Url(appId, 'Coach')}?limit=200`, { headers: H }),
        _apiFetch(`${base44Url(appId, 'Event')}?limit=3000`, { headers: H }, 30000)
    ]);
    const coaches = coachRes.ok ? await coachRes.json() : [];
    const coachObj = coaches.find(c => c.name === matchedCoach);

    const todayIso = new Date().toISOString().split('T')[0];
    const allEvents = evRes.ok ? await evRes.json() : [];
    const upcoming = allEvents.filter(e => e.coachName === matchedCoach && e.date >= todayIso && e.status !== 'cancelled' && e.status !== 'canceled');
    upcoming.sort((a, b) => a.date.localeCompare(b.date));

    const next5 = upcoming.slice(0, 5).map(e => {
        const [y, m, d] = e.date.split('-');
        return `• ${d}/${m} ${e.startTime || ''} — ${e.clientName}`;
    });

    return {
        matchedCoach,
        defaultWage: coachObj?.defaultWage ?? '—',
        upcomingCount: upcoming.length,
        next5
    };
}

async function getDaySummary(date) {
    const { appId } = getB44();
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

    const res = await _apiFetch(`${base44Url(appId, 'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    const events = await res.json();
    const active = events.filter(e => e.status !== 'cancelled' && e.status !== 'canceled');
    const cancelled = events.filter(e => e.status === 'cancelled' || e.status === 'canceled');

    const totalWages = active.reduce((s, e) => s + (e.wage || 0), 0);
    const totalRevenue = active.reduce((s, e) => s + (e.price || 0), 0);
    const coaches = [...new Set(active.map(e => e.coachName).filter(Boolean))].sort();

    return { date, isoDate, active: active.length, cancelled: cancelled.length, totalWages, totalRevenue, coaches };
}

// ─── מיפוי גיאוגרפי ───────────────────────────────────────────────────────────
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

async function getAvailableCoaches(coachName, location, date) {
    const matchedCoach = findBest(coachName, COACHES);
    if (!matchedCoach) throw new Error(`לא זיהיתי מאמן בשם "${coachName}"`);
    const matchedLocation = findBest(location, LOCATIONS);
    if (!matchedLocation) throw new Error(`לא זיהיתי מוקד בשם "${location}"`);

    const parts = date.split('/');
    const d = parts[0], m = parts[1], y = parts[2] || String(new Date().getFullYear());
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

    const { appId } = getB44();
    const H = base44Headers();
    const evRes = await _apiFetch(`${base44Url(appId, 'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (!evRes.ok) throw new Error(`API שגיאה: ${evRes.status}`);
    const dayEvents = await evRes.json();
    const active = dayEvents.filter(e => e.status !== 'cancelled' && e.status !== 'canceled');

    // שעות המאמן המבוקש באותו מוקד (כולל גרסת יוח"א/יול"א וללא עיר)
    const normLoc = s => (s||'').replace(/\s*\([^)]*\)/g,'').replace(/,.*$/,'').trim();
    const locBase = normLoc(matchedLocation);
    const coachSlots = active.filter(e =>
        e.coachName === matchedCoach &&
        (e.clientName === matchedLocation || normLoc(e.clientName) === locBase)
    );

    // המר שעה "HH:MM" לדקות
    const toMin = t => { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m; };

    // טווחי הזמן של המאמן המבוקש
    const reqRanges = coachSlots
        .map(e => ({ s: toMin(e.startTime), e: toMin(e.endTime) }))
        .filter(r => r.s !== null && r.e !== null);

    // טווח כולל של המאמן המבוקש (מהתחלה הראשונה עד הסוף האחרון)
    const overallStart = reqRanges.length ? reqRanges.reduce((min, r) => r.s < min ? r.s : min, reqRanges[0].s) : null;
    const overallEnd   = reqRanges.length ? reqRanges.reduce((max, r) => r.e > max ? r.e : max, reqRanges[0].e) : null;
    // חפיפה עם גבולות כוללניים: מי שמתחיל בדיוק כשאריק מסיים (או מסיים בדיוק כשאריק מתחיל)
    // נחסם — אי אפשר להיות בשני מקומות באותה שעה
    const overlaps = (evStart, evEnd) => {
        if (overallStart === null) return false;
        return evStart <= overallEnd && evEnd >= overallStart;
    };

    // מאמן "תפוס" = יש לו אירוע שחופף בזמן לשעות של אריק
    const available = [], partialFree = [], fullyBusy = [];
    for (const c of COACHES) {
        if (c === matchedCoach) continue;
        if (SUBSTITUTION_EXCLUDED.has(c)) continue;
        const cEvents = active.filter(e => e.coachName === c);
        if (cEvents.length === 0) { available.push(c); continue; }
        // אם אין שעות ידועות לאריק — כל מי שעובד חשוב עסוק
        if (reqRanges.length === 0) { fullyBusy.push(c); continue; }
        const hasConflict = cEvents.some(e => {
            const s = toMin(e.startTime), en = toMin(e.endTime);
            return s !== null && en !== null && overlaps(s, en);
        });
        (hasConflict ? fullyBusy : partialFree).push(c);
    }
    // partialFree = עובדים ביום אבל לא בשעות החופפות — גם הם זמינים
    const allAvailable = [...available, ...partialFree];

    // עיר המוקד המבוקש
    const targetCity = extractCity(matchedLocation);

    // מאמנים משובצים בחודש הרלוונטי (לפי rawSchedule)
    const monthlyCoaches = new Set();
    for (const [dateKey, dayData] of Object.entries(scheduleData?.rawSchedule || {})) {
        const parts = dateKey.split('/'); // DD/MM/YYYY
        if (parts[1] === m.padStart(2,'0') && parts[2] === y) {
            for (const loc of dayData.locations || [])
                for (const c of loc.coaches || []) monthlyCoaches.add(c);
        }
    }

    // חלק לפי איזור
    const sameArea = [], otherArea = [], unknownArea = [], surprises = [];
    for (const coach of allAvailable) {
        // מאמן שלא משובץ בכלל החודש → הפתעות
        if (!monthlyCoaches.has(coach)) { surprises.push(coach); continue; }

        const coachCities = new Set(
            active.filter(e => e.coachName === coach && e.clientName)
                  .map(e => extractCity(e.clientName)).filter(Boolean)
        );
        if (scheduleData?.coachLocations?.[coach]) {
            for (const loc of Object.keys(scheduleData.coachLocations[coach])) {
                const c = extractCity(loc); if (c) coachCities.add(c);
            }
        }
        if (!coachCities.size) { unknownArea.push(coach); continue; }
        const isNearby = [...coachCities].some(c => sameRegion(c, targetCity));
        (isNearby ? sameArea : otherArea).push(coach);
    }

    return { matchedCoach, matchedLocation, date, isoDate, coachSlots, available: allAvailable.length, sameArea, otherArea, unknownArea, surprises, targetCity, partialFree };
}

// ─── יצירת instance של בוט ────────────────────────────────────────────────────
function createBotInstance({ id, label, role }) {
    if (role === 'manager' && Date.now() > MANAGER_EXPIRY.getTime()) {
        console.log(`[${id}] גישה פגה (תפוגה: ${MANAGER_EXPIRY.toLocaleDateString('he-IL')})`);
        return null;
    }
    const _processedPath = path.join(__dirname, `.processed_${id}.json`);
    let _savedIds = [];
    try { _savedIds = JSON.parse(fs.readFileSync(_processedPath, 'utf8')); } catch(_) {}
    const state = {
        connected: false,
        qrBase64: null,
        pending: {},
        lastVoiceTs: 0,
        knownChatIds: new Set(),
        processedMsgIds: new Set(_savedIds),
        startupTime: Date.now(),
        context: { coach: null, location: null, date: null, history: [] },
        _processedPath,
        chromePid: null
    };
    sessionStates[id] = state;

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: id }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-gpu', '--no-first-run', '--no-zygote', '--disable-accelerated-2d-canvas',
                '--disable-background-networking', '--disable-default-apps', '--disable-extensions',
                '--disable-sync', '--mute-audio', '--no-default-browser-check',
                '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'
            ],
            protocolTimeout: 120000
        }
    });

    client.on('qr', async (qr) => {
        try { state.qrBase64 = await QRCode.toDataURL(qr); } catch(e) { state.qrBase64 = null; }
        state.connected = false;
        console.log(`[${id}] QR מוכן — http://164.92.142.75`);
    });

    client.on('ready', () => {
        state.qrBase64 = null;
        state.connected = true;
        state.pending = {};
        try { state.chromePid = client.pupBrowser?.process()?.pid || null; } catch(_) { state.chromePid = null; }
        const info = client.info;
        state.selfId = info.wid._serialized;
        // טעינת selfLid מקובץ (אם זוהה בסשן קודם)
        const _selfLidPath = path.join(__dirname, `.selflid_${id}`);
        try {
            const saved = fs.readFileSync(_selfLidPath, 'utf8').trim();
            if (saved) { state.selfLid = saved; console.log(`[${id}] selfLid מקובץ: ${state.selfLid}`); }
        } catch(_) {}
        console.log(`[${id}] ✓ מחובר כ-${info.pushname} (${info.wid.user})`);
    });

    client.on('auth_failure', () => {
        console.error(`[${id}] שגיאת אימות — מאתחל מחדש`);
        state.connected = false;
        // אימות נכשל → process.exit מאפשר ל-PM2 להפעיל מחדש נקי
        setTimeout(() => process.exit(1), 2000);
    });

    // ניסיון חוזר עם ניקוי Chrome — מקסימום 3 ניסיונות לפני process.exit
    async function _reinitSession(attempt = 1) {
        if (!sessionStates[id]) { console.log(`[${id}] סשן נמחק — מדלג על re-init`); return; }
        const _pid = state.chromePid; state.chromePid = null;
        try { await client.destroy(); } catch(_) {}
        if (_pid) {
            try { require('child_process').execSync(`kill -9 ${_pid} 2>/dev/null || true`); } catch(_) {}
        } else {
            try { require('child_process').execSync('pkill -9 -f chrome 2>/dev/null || true'); } catch(_) {}
        }
        await new Promise(r => setTimeout(r, 2000));
        state.startupTime = Date.now();
        client.initialize().catch(e => {
            console.error(`[${id}] re-init error (${attempt}):`, e.message);
            if (attempt >= 3) {
                console.error(`[${id}] 3 ניסיונות נכשלו — מאתחל תהליך`);
                setTimeout(() => process.exit(1), 1000);
            } else {
                setTimeout(() => _reinitSession(attempt + 1), 15000);
            }
        });
    }

    client.on('disconnected', (reason) => {
        console.log(`[${id}] התנתק: ${reason} — מנסה שוב בעוד 10 שניות`);
        state.connected = false;
        state.qrBase64 = null;
        setTimeout(() => _reinitSession(1), 10000);
    });

    // health check כל 5 דקות — אם Puppeteer לא מגיב, reinit
    const _healthInterval = setInterval(async () => {
        if (!state.connected) return;
        try {
            const ok = await Promise.race([
                client.pupPage.evaluate(() => !!window.Store?.Msg),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
            ]);
            if (!ok) throw new Error('Store.Msg unavailable');
            console.log(`[${id}] health OK`);
        } catch(e) {
            console.log(`[${id}] health FAIL: ${e.message} — reinit`);
            state.connected = false;
            clearInterval(_healthInterval);
            _reinitSession(1);
        }
    }, 5 * 60 * 1000);

    client.on('message_create', async (msg) => {
        // רק שיחה עם עצמי (self-chat) וללא קבוצות
        if (!msg.fromMe || msg.from.includes('@g.us')) return;
        if (!state.selfId) return;

        // לוג כניסה — אחרי פילטר קבוצות, לפני פילטר selfId
        console.log(`[${id}] msg_create type=${msg.type} to=${msg.to} selfId=${state.selfId} selfLid=${state.selfLid}`);

        // זהה self-chat: @c.us ישיר, @lid מוכר, או אמת דרך contact.isMe
        if (msg.to === state.selfId) {
            // @c.us תואם — self-chat ודאי
        } else if (msg.to?.endsWith('@lid')) {
            if (state.selfLid) {
                if (msg.to !== state.selfLid) return;
            } else {
                // selfLid לא ידוע — אמת דרך contact.isMe (API רשמי של whatsapp-web.js)
                try {
                    const contact = await Promise.race([
                        client.getContactById(msg.to),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
                    ]);
                    if (contact && contact.isMe) {
                        state.selfLid = msg.to;
                        console.log(`[${id}] selfLid זוהה (isMe): ${state.selfLid}`);
                        try { fs.writeFileSync(path.join(__dirname, `.selflid_${id}`), state.selfLid); } catch(_) {}
                    } else {
                        console.log(`[${id}] @lid ${msg.to} — isMe=false, מדלג`);
                        return;
                    }
                } catch(e) {
                    console.log(`[${id}] getContactById נכשל: ${e.message} — מדלג`);
                    return;
                }
            }
        } else { return; }

        if (msg.type === 'ptt' || msg.type === 'audio') {
            if (!state.knownChatIds.has(msg.from)) {
                state.knownChatIds.add(msg.from);
                console.log(`[${id}] צ'אט קולי: ${msg.from}`);
            }
        }

        if (msg.type === 'chat') {
            if (msg.timestamp && msg.timestamp * 1000 < state.startupTime - 5 * 60 * 1000) {
                console.log(`[${id}] הודעת טקסט ישנה — מדלג`);
                return;
            }
            const body = msg.body.trim()
                .replace(/עובדיום/g, 'עובדים ביום')
                .replace(/משובציום/g, 'משובצים ביום');

            // ─── פקודות תיקון ───────────────────────────────────────────────
            if (body === '/סטטוס') {
                const upSec = Math.round((Date.now() - state.startupTime) / 1000);
                const upStr = upSec < 60 ? `${upSec}ש'` : `${Math.round(upSec/60)}ד'`;
                const pendCount = Object.keys(state.pending).length;
                const schedAge = scheduleData?.generatedAt
                    ? Math.round((Date.now() - new Date(scheduleData.generatedAt).getTime()) / 60000) + ' דק\''
                    : 'לא נטען';
                const ctxStr = [state.context.coach, state.context.location, state.context.date].filter(Boolean).join(', ') || 'ריק';
                await client.sendMessage(msg.from,
                    `🔧 *סטטוס בוט*\n\n✅ מחובר: ${state.connected ? 'כן' : 'לא'}\n⏱️ פעיל: ${upStr}\n📅 לו"ז: לפני ${schedAge}\n⏳ pending: ${pendCount}\n🧠 הקשר: ${ctxStr}`
                );
                return;
            }
            if (body === '/נקה') {
                const pendCount = Object.keys(state.pending).length;
                for (const k of Object.keys(state.pending)) delete state.pending[k];
                state.context = { coach: null, location: null, date: null, history: [] };
                await client.sendMessage(msg.from, `🧹 נוקה:\n• ${pendCount} pending\n• הקשר שיחה אופס\n\nהבוט מוכן.`);
                return;
            }
            if (body === '/רענן') {
                await client.sendMessage(msg.from, '⏳ מרענן לו"ז מה-API...');
                try {
                    await refreshScheduleFromAPI();
                    const count = scheduleData?.totalEvents || 0;
                    await client.sendMessage(msg.from, `✅ לו"ז רוענן — ${count} אירועים`);
                } catch(e) {
                    await client.sendMessage(msg.from, `❌ שגיאת רענון: ${e.message}`);
                }
                return;
            }
            if (body === '/ריסטרט') {
                await client.sendMessage(msg.from, '🔄 מאתחל תהליך — יחזור תוך ~30 שניות...');
                setTimeout(() => process.exit(1), 1500);
                return;
            }
            // ────────────────────────────────────────────────────────────────

            // פנה pending שפג תוקפם
            for (const k of Object.keys(state.pending)) {
                if (Date.now() - (state.pending[k]._ts || 0) > 5 * 60 * 1000) {
                    delete state.pending[k];
                }
            }

            const freshKeys = Object.keys(state.pending);
            if (freshKeys.length > 0 && (body === 'כן' || body === 'אשר' || body === '✓')) {
                const key = freshKeys[0];
                const data = state.pending[key];
                delete state.pending[key];

                if (data._intent === 'cancel') {
                    await client.sendMessage(msg.from, '⏳ מבטל פעילויות...');
                    try {
                        const result = await cancelActivities(data.date, data.location);
                        const failNote = result.failCount > 0 ? `\n⚠️ ${result.failCount} אירועים לא עודכנו` : '';
                        await client.sendMessage(msg.from,
                            `✅ *בוטלו ${result.cancelledCount} פעילויות*\n\n📅 ${data.date}${result.matchedLocation ? '\n📍 ' + result.matchedLocation : '\n📍 כל המוקדים'}${failNote}`
                        );
                        refreshScheduleFromAPI().catch(() => {});
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                } else if (data._intent === 'restore') {
                    await client.sendMessage(msg.from, '⏳ משחזר פעילויות...');
                    try {
                        const result = await restoreActivities(data.date, data.location, data.coach || '');
                        const failNote = result.failCount > 0 ? `\n⚠️ ${result.failCount} אירועים לא עודכנו` : '';
                        const coachLine = result.matchedCoach ? `\n👤 ${result.matchedCoach}` : '';
                        await client.sendMessage(msg.from,
                            `✅ *שוחזרו ${result.restoredCount} פעילויות*\n\n📅 ${data.date}${result.matchedLocation ? '\n📍 ' + result.matchedLocation : '\n📍 כל המוקדים'}${coachLine}${failNote}`
                        );
                        refreshScheduleFromAPI().catch(() => {});
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                } else if (data._intent === 'approve_substitution') {
                    await client.sendMessage(msg.from, '⏳ מאשר חילוף...');
                    try {
                        const result = await approveSubstitution(data._requestId, findBest(data.substituteCoach, COACHES) || '', data.wage || null);
                        const subName = result.substituteCoachName || '(לא שובץ)';
                        const wageStr = result.substituteCoachName ? `\n💰 שכר: ${result.finalWage}₪${result.wasOverride ? ' (מותאם)' : ' (ברירת מחדל)'}` : '';
                        const evStr = result.eventsUpdated > 0 ? `\n📋 ${result.eventsUpdated} אירועים עודכנו` : '';
                        await client.sendMessage(msg.from,
                            `✅ *החילוף אושר*\n\n👤 ${data._req.requestingCoachName}\n📅 ${data._req.substitutionDate.split('-').reverse().join('/')}\n📍 ${data._req.clientName}\n🔄 מחליף: ${subName}${wageStr}${evStr}`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                } else if (data._intent === 'swap_coach') {
                    await client.sendMessage(msg.from, '⏳ מבצע שיבוץ...');
                    try {
                        const result = await swapCoachInEvent(data.date, data.client, data.originalCoach, data.substituteCoach, data.wage || null);
                        const wageStr = `${result.finalWage}₪${result.wasOverride ? ' (מותאם)' : ' (ברירת מחדל)'}`;
                        await client.sendMessage(msg.from,
                            `✅ *שיבוץ מחליף בוצע*\n\n📅 ${data.date}\n📍 ${result.matchedClient}\n👤 ${result.matchedOriginal} ← 🔄 ${result.matchedSub}\n💰 שכר: ${wageStr}\n📋 ${result.count} אירועים עודכנו`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                } else if (data._intent === 'add_event') {
                    await client.sendMessage(msg.from, '⏳ יוצר פעילות...');
                    try {
                        const result = await addEvent(data.date, data.client, data.coach, data.startTime, data.endTime, data.program, data.wage || null, data.groupName);
                        const timeStr = data.startTime ? `\n🕐 ${data.startTime}${data.endTime ? '-'+data.endTime : ''}` : '';
                        const progStr = result.programNameFinal ? `\n📚 ${result.programNameFinal}` : '';
                        const wageStr = `\n💰 שכר: ${result.finalWage}₪${result.wasOverride ? ' (מותאם)' : ' (ברירת מחדל)'}`;
                        const groupStr = data.groupName ? `\n👥 קבוצה: ${data.groupName}` : '';
                        await client.sendMessage(msg.from,
                            `✅ *פעילות נוצרה*\n\n📅 ${data.date}\n📍 ${result.matchedClientName}\n👤 ${result.matchedCoach}${timeStr}${progStr}${wageStr}${groupStr}`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                } else if (data._intent === 'add_coach') {
                    await client.sendMessage(msg.from, '⏳ מוסיף מאמן...');
                    try {
                        await addCoach(data.name, data.wage);
                        if (!COACHES.includes(data.name)) COACHES.push(data.name);
                        await client.sendMessage(msg.from, `✅ *מאמן נוסף*\n\n👤 ${data.name}\n💰 שכר ברירת מחדל: ${data.wage}₪`);
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                } else if (data._intent === 'add_client') {
                    await client.sendMessage(msg.from, '⏳ מוסיף מוקד...');
                    try {
                        await addClient(data.name, data.type);
                        const typeLabel = (data.type === 'school' || data.type === 'בית ספר') ? 'בית ספר' : 'פרויקט';
                        await client.sendMessage(msg.from, `✅ *מוקד נוסף*\n\n📍 ${data.name}\n🏷️ סוג: ${typeLabel}`);
                        refreshScheduleFromAPI().catch(() => {});
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                } else if (data._intent === 'update_wage') {
                    await client.sendMessage(msg.from, '⏳ מעדכן שכר...');
                    try {
                        const result = await updateCoachWage(data.coach, data.wage);
                        await client.sendMessage(msg.from,
                            `✅ *שכר עודכן*\n\n👤 ${result.matchedCoach}\n💰 ${result.oldWage}₪ ← ${result.newWage}₪`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                } else {
                    await client.sendMessage(msg.from, '⏳ מעדכן Base44...');
                    try {
                        const result = await fillBase44(data);
                        await client.sendMessage(msg.from,
                            `✅ *הבקשה נוספה ל-Base44*\n\n👤 ${result.matchedCoach || data.requestingCoach}\n📅 ${data.date}\n📍 ${result.matchedLocation || data.location}`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }
                }
                return;
            }

            if (freshKeys.length > 0 && (body === 'לא' || body === 'בטל' || body === 'ביטול')) {
                for (const k of freshKeys) delete state.pending[k];
                await client.sendMessage(msg.from, '🗑️ הבקשה בוטלה.');
                return;
            }

            if (freshKeys.length === 0 && (body === 'כן' || body === 'לא' || body === 'אשר' || body === '✓')) {
                await client.sendMessage(msg.from, '❔ אין בקשה פתוחה. שלח הקלטה קולית.');
                return;
            }
        }

        if (msg.type === 'ptt' || msg.type === 'audio') {
            if (msg.timestamp && msg.timestamp * 1000 < state.startupTime - 5 * 60 * 1000) {
                console.log(`[${id}] הקלטה ישנה — מדלג`);
                return;
            }

            const msgId = msg.id?._serialized;
            if (msgId && state.processedMsgIds.has(msgId)) { console.log(`[${id}] הקלטה כבר עובדה — מדלג`); return; }
            if (msgId) {
                state.processedMsgIds.add(msgId);
                if (state.processedMsgIds.size > 200) {
                    const arr = [...state.processedMsgIds];
                    state.processedMsgIds = new Set(arr.slice(-100));
                }
                try { fs.writeFileSync(state._processedPath, JSON.stringify([...state.processedMsgIds])); } catch(_) {}
            }

            const myTs = Date.now();
            state.lastVoiceTs = myTs;

            try {
                // הורד קודם (Puppeteer) — ורק אחרי שה-download הסתיים שלח "מתמלל"
                // כך transcribe() (2-5 שניות, ללא Puppeteer) מספק בפר טבעי לפני התשובה
                const _dlTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('downloadMedia timeout')), 20000));
                const media = await Promise.race([msg.downloadMedia(), _dlTimeout]);
                const audioBuffer = Buffer.from(media.data, 'base64');
                const _statusSentAt = Date.now();
                await client.sendMessage(msg.from, '🎙️ מתמלל...').catch(() => {});
                const rawTranscript = await transcribe(audioBuffer, id);
                const transcript = rawTranscript.replace(/אפו /g, 'איפה ').replace(/^אפו$/g, 'איפה').replace(/איפוא /g, 'איפה ');
                console.log(`[${id}] תמלול:`, transcript);

                // בדיקת איכות — אם רוב הטקסט לא עברית, זה רעש/זבל
                const hebrewChars = (transcript.match(/[א-ת]/g) || []).length;
                const totalChars = transcript.replace(/\s/g, '').length;
                if (totalChars > 0 && hebrewChars / totalChars < 0.5) {
                    console.log(`[${id}] תמלול זבל — מתעלם`);
                    await client.sendMessage(msg.from, '🔇 לא הצלחתי לשמוע — נסה שוב.').catch(() => {});
                    return;
                }
                if (transcript.trim().length < 2) {
                    await client.sendMessage(msg.from, '🔇 לא הצלחתי לשמוע — נסה שוב.').catch(() => {});
                    return;
                }

                if (state.lastVoiceTs !== myTs) return;
                for (const k of Object.keys(state.pending)) delete state.pending[k];
                const parsed = await detectIntent(transcript, state.context);
                console.log(`[${id}] פירוש:`, JSON.stringify(parsed));

                if (state.lastVoiceTs !== myTs) return;

                // WhatsApp timestamps ברזולוציה של שניה — אם "מתמלל" ותשובה נשלחות באותה שניה הסדר שרירותי.
                // מחכים עד שיעברו לפחות 1.1 שניות מאז ה"מתמלל" לפני שליחת התשובה.
                const _statusGap = Date.now() - _statusSentAt;
                if (_statusGap < 1100) await new Promise(r => setTimeout(r, 1100 - _statusGap));

                // עדכן הקשר רק אם ההודעה רלוונטית — מונע זיהום מרעש
                const ctx = state.context;
                if (parsed.intent !== 'other' && parsed.intent !== 'unknown') {
                    ctx.history = [...ctx.history.slice(-4), transcript];
                    const rawCoach = parsed.coach || parsed.requestingCoach || (parsed.intent === 'query' ? parsed.subject : null);
                    if (rawCoach && rawCoach.length > 1) ctx.coach = rawCoach;
                    if (parsed.location && parsed.location.length > 1) ctx.location = parsed.location;
                    if (parsed.date && /\d{2}\/\d{2}/.test(parsed.date)) ctx.date = parsed.date;
                }

                // תיקון: query עם queryType=available_coaches → available_coaches
                if (parsed.intent === 'query' && parsed.queryType === 'available_coaches') {
                    parsed.intent = 'available_coaches';
                    if (!parsed.coach) parsed.coach = parsed.subject || '';
                }

                // מלא שדות חסרים מהקשר השיחה
                if (parsed.intent !== 'unknown') {
                    if (!parsed.coach && ctx.coach && ['available_coaches','approve_substitution','coach_info','update_wage'].includes(parsed.intent))
                        parsed.coach = ctx.coach;
                    if (!parsed.requestingCoach && ctx.coach && parsed.intent === 'substitution')
                        parsed.requestingCoach = ctx.coach;
                    if (!parsed.subject && ctx.coach && parsed.intent === 'query')
                        parsed.subject = ctx.coach;
                    if (!parsed.location && ctx.location && ['available_coaches','cancel','restore','substitution','swap_coach','add_event'].includes(parsed.intent))
                        parsed.location = ctx.location;
                    if (!parsed.date && ctx.date && ['available_coaches','cancel','restore','substitution','swap_coach','day_summary','add_event'].includes(parsed.intent))
                        parsed.date = ctx.date;
                }

                // הרשאות — מנהל רגיל יכול רק לשאול
                if (role === 'manager' && ['cancel', 'restore', 'substitution'].includes(parsed.intent)) {
                    await client.sendMessage(msg.from, '🚫 אין לך הרשאה לבצע פעולות שינוי. פנה לדין.');
                    return;
                }

                const key = `${Date.now()}_${Math.random().toString(36).slice(2,5)}`;

                if (parsed.intent === 'other' || parsed.intent === 'unknown') {
                    // הודעה לא רלוונטית — הבוט שותק
                    return;

                } else if (parsed.intent === 'query') {
                    const answer = answerQuery(parsed);
                    await client.sendMessage(msg.from, answer);

                } else if (parsed.intent === 'cancel') {
                    const matchedLocation = parsed.location ? findBest(parsed.location, LOCATIONS) : null;
                    if (parsed.location && !matchedLocation) {
                        await client.sendMessage(msg.from, `❌ לא זיהיתי את המוקד "${parsed.location}". נסה שוב.`);
                        return;
                    }
                    await client.sendMessage(msg.from, '⏳ בודק...');
                    const toCancel = await previewCancel(parsed.date, matchedLocation || null);
                    if (toCancel.length === 0) {
                        const locLabel = matchedLocation ? ` ב-${matchedLocation}` : '';
                        await client.sendMessage(msg.from, `📭 אין פעילויות מתוכננות לביטול ב-${parsed.date}${locLabel}.`);
                        return;
                    }
                    state.pending[key] = { ...parsed, _intent: 'cancel', location: matchedLocation || '', _ts: Date.now() };
                    const coachLines = [...new Set(toCancel.map(e => `• ${e.coachName || '—'}${e.clientName ? ' — ' + e.clientName : ''}`))]
                        .join('\n');
                    const warning = parsed.date && matchedLocation ? validateCancel(matchedLocation, parsed.date) : null;
                    const locHeader = matchedLocation || 'כל המוקדים';
                    await client.sendMessage(msg.from,
                        `🔔 *ביטול פעילויות — לאישור*\n\n📅 ${parsed.date}\n📍 ${locHeader}\n🔢 ${toCancel.length} אירועים:\n${coachLines}${warning ? '\n\n' + warning : ''}\n\nענה *כן* לאישור או *לא* לביטול.`
                    );

                } else if (parsed.intent === 'restore') {
                    const matchedLocation = parsed.location ? findBest(parsed.location, LOCATIONS) : null;
                    const matchedCoachR = parsed.coach ? findBest(parsed.coach, COACHES) : null;
                    if (parsed.location && !matchedLocation) {
                        await client.sendMessage(msg.from, `❌ לא זיהיתי את המוקד "${parsed.location}". נסה שוב.`);
                        return;
                    }
                    if (parsed.coach && !matchedCoachR) {
                        await client.sendMessage(msg.from, `❌ לא זיהיתי את המאמן "${parsed.coach}". נסה שוב.`);
                        return;
                    }
                    await client.sendMessage(msg.from, '⏳ בודק...');
                    const toRestore = await previewRestore(parsed.date, matchedLocation || null, matchedCoachR || null);
                    if (toRestore.length === 0) {
                        const locLabel = matchedLocation ? ` ב-${matchedLocation}` : '';
                        const coachLabel = matchedCoachR ? ` של ${matchedCoachR}` : '';
                        await client.sendMessage(msg.from, `📭 אין פעילויות מבוטלות לשחזור${coachLabel} ב-${parsed.date}${locLabel}.`);
                        return;
                    }
                    state.pending[key] = { ...parsed, _intent: 'restore', location: matchedLocation || '', coach: matchedCoachR || '', _ts: Date.now() };
                    const coachLinesR = [...new Set(toRestore.map(e => `• ${e.coachName || '—'}${e.clientName ? ' — ' + e.clientName : ''}`))]
                        .join('\n');
                    const locHeaderR = matchedLocation || 'כל המוקדים';
                    const coachHeaderR = matchedCoachR ? `\n👤 ${matchedCoachR}` : '';
                    await client.sendMessage(msg.from,
                        `🔔 *שחזור פעילויות — לאישור*\n\n📅 ${parsed.date}\n📍 ${locHeaderR}${coachHeaderR}\n🔢 ${toRestore.length} אירועים:\n${coachLinesR}\n\nענה *כן* לאישור או *לא* לביטול.`
                    );

                } else if (parsed.intent === 'substitution') {
                    const matchedCoach = findBest(parsed.requestingCoach, COACHES);
                    const matchedLocation = findBest(parsed.location, LOCATIONS);
                    const matchedReplacement = findBest(parsed.replacementCoach, COACHES);
                    state.pending[key] = { ...parsed, _intent: 'substitution', _ts: Date.now() };
                    const warning = matchedCoach && matchedLocation && parsed.date
                        ? validateSubstitution(matchedCoach, matchedLocation, parsed.date) : null;
                    await client.sendMessage(msg.from,
`🔔 *בקשת חילוף — לוח חילופים* (לא משנה את לוח השיבוצים)

👤 מאמן: ${matchedCoach || parsed.requestingCoach || '—'}
📅 תאריך: ${parsed.date || '—'}
📍 מוקד: ${matchedLocation || parsed.location || '—'}
📋 סיבה: ${parsed.reason || '—'}
🔄 מחליף: ${matchedReplacement || '—'}
💰 תשלום: ${parsed.paymentDetails || '—'}${warning ? '\n\n' + warning : ''}

ענה *כן* לרישום בלוח חילופים, או *לא* לביטול.`
                    );
                } else if (parsed.intent === 'pending_substitutions') {
                    try {
                        await client.sendMessage(msg.from, '⏳ בודק בקשות ממתינות...');
                        const list = await getPendingSubstitutions(parsed.coach || '', parsed.dateFrom || '', parsed.dateTo || '');
                        const rangeLabel = (parsed.dateFrom && parsed.dateTo)
                            ? ` (${parsed.dateFrom}–${parsed.dateTo})`
                            : parsed.dateFrom ? ` (מ-${parsed.dateFrom})` : '';
                        if (list.length === 0) {
                            const coachSuffix = parsed.coach ? ` של ${findBest(parsed.coach, COACHES) || parsed.coach}` : '';
                            await client.sendMessage(msg.from, `✅ אין בקשות חילוף ממתינות${coachSuffix}${rangeLabel}.`);
                        } else {
                            const lines = list.map(r => {
                                const [y, m, d] = r.substitutionDate.split('-');
                                const sub = r.substituteCoachName ? ` ← ${r.substituteCoachName}` : '';
                                return `• ${r.requestingCoachName}${sub} | ${d}/${m} | ${r.clientName}${r.reason ? ' | ' + r.reason : ''}`;
                            }).join('\n');
                            await client.sendMessage(msg.from, `📋 *בקשות חילוף ממתינות${rangeLabel} (${list.length}):*\n\n${lines}`);
                        }
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else if (parsed.intent === 'upcoming_substitutions') {
                    try {
                        await client.sendMessage(msg.from, '⏳ טוען חילופים קרובים...');
                        const days = parseInt(parsed.days) || 7;
                        const { byDate, total, todayIso, toIso } = await getWeekSubstitutions(days);
                        const [ty, tm, td] = todayIso.split('-');
                        const [ey, em, ed] = toIso.split('-');
                        const header = `📆 *חילופים ${td}/${tm} – ${ed}/${em} (${days} ימים)*`;
                        if (total === 0) {
                            await client.sendMessage(msg.from, `${header}\n\n✅ אין חילופים מתוכננים בתקופה זו.`);
                        } else {
                            const heDay = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
                            const statusEmoji = { 'ממתין לבדיקה': '⏳', 'אושר': '✅', 'בוצע': '✔️', 'נדחה': '❌' };
                            const blocks = Object.entries(byDate).map(([iso, reqs]) => {
                                const [y, m, d] = iso.split('-');
                                const dow = heDay[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
                                const lines = reqs.map(r => {
                                    const em = statusEmoji[r.status] || '•';
                                    const sub = r.substituteCoachName ? ` ← ${r.substituteCoachName}` : ' (מחליף לא שובץ)';
                                    return `  ${em} ${r.requestingCoachName}${sub}\n     📍 ${r.clientName}${r.reason ? ' | ' + r.reason : ''}`;
                                }).join('\n');
                                return `*יום ${dow} ${d}/${m}:*\n${lines}`;
                            }).join('\n\n');
                            await client.sendMessage(msg.from, `${header}\n\n${blocks}`);
                        }
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else if (parsed.intent === 'available_coaches') {
                    try {
                        if (!parsed.coach || !parsed.date) {
                            await client.sendMessage(msg.from, '❌ נדרש: שם מאמן ותאריך. לדוגמה: "מי יכול להחליף את אריק ב-10/05"');
                            return;
                        }
                        // אם לא ציינו מוקד — מצא אוטומטית איפה המאמן עובד ביום הזה
                        if (!parsed.location) {
                            const matchedC = findBest(parsed.coach, COACHES);
                            if (matchedC && scheduleData?.rawSchedule?.[parsed.date]) {
                                const dayLocs = scheduleData.rawSchedule[parsed.date].locations
                                    .filter(l => (l.activities||[]).some(a => a.coach === matchedC && a.status !== 'בוטל'))
                                    .map(l => l.location.replace(/\s*\(יוח"א\)\s*/g,'').replace(/\s*\(יול"א\)\s*/g,'').trim());
                                const uniqLocs = [...new Set(dayLocs)];
                                if (uniqLocs.length === 1) {
                                    parsed.location = uniqLocs[0];
                                } else if (uniqLocs.length > 1) {
                                    await client.sendMessage(msg.from, `${matchedC} עובד במספר מוקדים ביום זה:\n${uniqLocs.map(l=>`• ${l}`).join('\n')}\n\nבאיזה מוקד לבדוק זמינות?`);
                                    return;
                                } else {
                                    await client.sendMessage(msg.from, `❌ ${matchedC} לא עובד בתאריך הזה.`);
                                    return;
                                }
                            } else {
                                await client.sendMessage(msg.from, '❌ נדרש גם מוקד. לדוגמה: "מי יכול להחליף את אריק בכולנא ב-10/05"');
                                return;
                            }
                        }
                        await client.sendMessage(msg.from, '⏳ בודק זמינות...');
                        const r = await getAvailableCoaches(parsed.coach, parsed.location, parsed.date);
                        const [dy, dm, dd] = r.isoDate.split('-');
                        const slotStr = r.coachSlots.length > 0
                            ? r.coachSlots.map(e => `${e.startTime||'?'}–${e.endTime||'?'}`).join(', ')
                            : 'שעות לא נמצאו';
                        const header = `👥 *מאמנים זמינים להחליף את ${r.matchedCoach}*\n📍 ${r.matchedLocation}\n📅 ${dd}/${dm} | ⏰ ${slotStr}\n`;
                        if (r.available === 0) {
                            await client.sendMessage(msg.from, `${header}\n😬 כל המאמנים עובדים ביום זה.`);
                            return;
                        }
                        let body = '';
                        if (r.sameArea.length > 0) {
                            body += `\n🟢 *אותו איזור (${r.targetCity || 'קרוב'}):*\n`;
                            body += r.sameArea.map(c => `  • ${c}`).join('\n');
                        }
                        if (r.otherArea.length > 0) {
                            body += `\n\n🔵 *שאר הזמינים:*\n`;
                            body += r.otherArea.map(c => `  • ${c}`).join('\n');
                        }
                        if (r.unknownArea?.length > 0) {
                            body += `\n\n⚪ *זמינים (אזור לא ידוע):*\n`;
                            body += r.unknownArea.map(c => `  • ${c}`).join('\n');
                        }
                        if (r.surprises?.length > 0) {
                            body += `\n\n🎲 *הפתעות (לא משובצים החודש):*\n`;
                            body += r.surprises.map(c => `  • ${c}`).join('\n');
                        }
                        await client.sendMessage(msg.from, header + body);
                    } catch(e) {
                        console.error(`[${id}] available_coaches שגיאה:`, e.message);
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else if (parsed.intent === 'approve_substitution') {
                    if (role === 'manager') { await client.sendMessage(msg.from, '🚫 אין לך הרשאה לאשר חילופים. פנה לדין.'); return; }
                    try {
                        await client.sendMessage(msg.from, '⏳ מחפש בקשה...');
                        let pending = await getPendingSubstitutions(parsed.coach || '');
                        if (parsed.date) {
                            const [d, m, y] = parsed.date.split('/');
                            const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
                            pending = pending.filter(r => r.substitutionDate === iso);
                        }
                        if (pending.length === 0) {
                            const suffix = (parsed.coach ? ` של ${findBest(parsed.coach, COACHES) || parsed.coach}` : '') + (parsed.date ? ` ב-${parsed.date}` : '');
                            await client.sendMessage(msg.from, `📭 אין בקשות ממתינות${suffix}.`); return;
                        }
                        const req = pending[0];
                        const [y, m, d] = req.substitutionDate.split('-');
                        const subCoach = parsed.substituteCoach ? findBest(parsed.substituteCoach, COACHES) : null;
                        const wageNote = parsed.wage ? `\n💰 שכר לאירוע זה: ${parsed.wage}₪` : '\n💰 שכר: ברירת מחדל של המחליף';
                        state.pending[key] = { ...parsed, _intent: 'approve_substitution', _requestId: req.id, _req: req, _ts: Date.now() };
                        await client.sendMessage(msg.from,
`🔔 *אישור חילוף — לאישור*

👤 מאמן מבקש: ${req.requestingCoachName}
📅 תאריך: ${d}/${m}/${y}
📍 מוקד: ${req.clientName}
📋 סיבה: ${req.reason || '—'}
🔄 מחליף: ${subCoach || req.substituteCoachName || '(לא צוין)'}${wageNote}

ענה *כן* לאישור או *לא* לביטול.`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else if (parsed.intent === 'swap_coach') {
                    if (role === 'manager') { await client.sendMessage(msg.from, '🚫 אין לך הרשאה לשבץ מחליפים. פנה לדין.'); return; }
                    try {
                        const matchedClient = parsed.client ? findBest(parsed.client, LOCATIONS) : null;
                        const matchedOriginal = parsed.originalCoach ? findBest(parsed.originalCoach, COACHES) : null;
                        const matchedSub = parsed.substituteCoach ? findBest(parsed.substituteCoach, COACHES) : null;
                        if (!parsed.date || !matchedClient || !matchedOriginal || !matchedSub) {
                            await client.sendMessage(msg.from, `❌ חסרים פרטים. נדרש: תאריך, מוקד, מאמן מקורי ומחליף.`); return;
                        }
                        const wageNote = parsed.wage ? `\n💰 שכר לאירוע זה: ${parsed.wage}₪` : '\n💰 שכר: ברירת מחדל של המחליף';
                        state.pending[key] = { ...parsed, client: matchedClient, originalCoach: matchedOriginal, substituteCoach: matchedSub, _intent: 'swap_coach', _ts: Date.now() };
                        await client.sendMessage(msg.from,
`🔔 *שיבוץ ישיר — לוח שיבוצים* (לא נרשם בלוח חילופים)

📅 תאריך: ${parsed.date}
📍 מוקד: ${matchedClient}
👤 מאמן מקורי: ${matchedOriginal}
🔄 מחליף: ${matchedSub}${wageNote}

ענה *כן* לאישור או *לא* לביטול.`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else if (parsed.intent === 'add_event') {
                    if (role === 'manager') { await client.sendMessage(msg.from, '🚫 אין לך הרשאה להוסיף פעילויות. פנה לדין.'); return; }
                    if (!parsed.date || !parsed.client || !parsed.coach) {
                        await client.sendMessage(msg.from, `❌ חסרים פרטים. נדרש: תאריך, מוקד ומאמן.`); return;
                    }
                    try {
                        const timeStr = parsed.startTime ? `\n🕐 ${parsed.startTime}${parsed.endTime ? '-'+parsed.endTime : ''}` : '';
                        const progStr = parsed.program ? `\n📚 ${parsed.program}` : '';
                        const wageNote = parsed.wage ? `\n💰 שכר: ${parsed.wage}₪` : '\n💰 שכר: ברירת מחדל של המאמן';
                        const groupStr = parsed.groupName ? `\n👥 קבוצה: ${parsed.groupName}` : '';
                        state.pending[key] = { ...parsed, _intent: 'add_event', _ts: Date.now() };
                        await client.sendMessage(msg.from,
`🔔 *הוספת פעילות — לאישור*

📅 תאריך: ${parsed.date}
📍 מוקד: ${parsed.client}
👤 מאמן: ${parsed.coach}${timeStr}${progStr}${wageNote}${groupStr}

ענה *כן* לאישור או *לא* לביטול.`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else if (parsed.intent === 'add_coach') {
                    if (role === 'manager') { await client.sendMessage(msg.from, '🚫 אין לך הרשאה להוסיף מאמנים. פנה לדין.'); return; }
                    if (!parsed.name || !parsed.wage) {
                        await client.sendMessage(msg.from, `❌ חסרים פרטים. נדרש: שם מלא ושכר ברירת מחדל.`); return;
                    }
                    state.pending[key] = { ...parsed, _intent: 'add_coach', _ts: Date.now() };
                    await client.sendMessage(msg.from,
`🔔 *הוספת מאמן — לאישור*

👤 שם: ${parsed.name}
💰 שכר ברירת מחדל: ${parsed.wage}₪

ענה *כן* לאישור או *לא* לביטול.`
                    );

                } else if (parsed.intent === 'add_client') {
                    if (role === 'manager') { await client.sendMessage(msg.from, '🚫 אין לך הרשאה להוסיף מוקדים. פנה לדין.'); return; }
                    if (!parsed.name) {
                        await client.sendMessage(msg.from, `❌ חסר שם מוקד.`); return;
                    }
                    const typeLabel = (parsed.type === 'project' || parsed.type === 'פרויקט') ? 'פרויקט' : 'בית ספר';
                    state.pending[key] = { ...parsed, _intent: 'add_client', _ts: Date.now() };
                    await client.sendMessage(msg.from,
`🔔 *הוספת מוקד — לאישור*

📍 שם: ${parsed.name}
🏷️ סוג: ${typeLabel}

ענה *כן* לאישור או *לא* לביטול.`
                    );

                } else if (parsed.intent === 'update_wage') {
                    if (role === 'manager') { await client.sendMessage(msg.from, '🚫 אין לך הרשאה לעדכן שכר. פנה לדין.'); return; }
                    if (!parsed.coach || !parsed.wage) {
                        await client.sendMessage(msg.from, `❌ חסרים פרטים. נדרש: שם מאמן ושכר חדש.`); return;
                    }
                    try {
                        const matched = findBest(parsed.coach, COACHES);
                        if (!matched) { await client.sendMessage(msg.from, `❌ מאמן "${parsed.coach}" לא נמצא.`); return; }
                        state.pending[key] = { ...parsed, coach: matched, _intent: 'update_wage', _ts: Date.now() };
                        await client.sendMessage(msg.from,
`🔔 *עדכון שכר קבוע — לאישור*

👤 מאמן: ${matched}
💰 שכר חדש: ${parsed.wage}₪

ענה *כן* לאישור או *לא* לביטול.`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else if (parsed.intent === 'coach_info') {
                    try {
                        await client.sendMessage(msg.from, '⏳ מחפש פרטי מאמן...');
                        const info = await getCoachInfo(parsed.coach || '');
                        const evLines = info.next5.length > 0 ? '\n\n📅 *אירועים קרובים:*\n' + info.next5.join('\n') : '\n\n📅 אין אירועים קרובים.';
                        await client.sendMessage(msg.from,
                            `👤 *${info.matchedCoach}*\n\n💰 שכר ברירת מחדל: ${info.defaultWage}₪\n📋 אירועים עתידיים: ${info.upcomingCount}${evLines}`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else if (parsed.intent === 'day_summary') {
                    try {
                        await client.sendMessage(msg.from, '⏳ מחשב סיכום יום...');
                        const s = await getDaySummary(parsed.date);
                        const coachList = s.coaches.length > 0 ? '\n👥 מאמנים: ' + s.coaches.join(', ') : '';
                        await client.sendMessage(msg.from,
`📊 *סיכום יום ${s.date}*

✅ פעילויות מתוכננות: ${s.active}
❌ פעילויות מבוטלות: ${s.cancelled}
💰 סך שכר מאמנים: ${s.totalWages}₪
💵 סך הכנסות: ${s.totalRevenue}₪${coachList}`
                        );
                    } catch(e) {
                        await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                    }

                } else {
                    await client.sendMessage(msg.from, `❓ לא הצלחתי להבין את הבקשה. נסה להקליט שוב.`);
                }
            } catch(e) {
                console.error(`[${id}] שגיאה:`, e.message, e.stack?.split('\n')[1]?.trim() || '');
                const userMsg = e.message?.includes('downloadMedia')
                    ? '⏳ לא הצלחתי להוריד את ההקלטה — נסה שוב.'
                    : e.message?.includes('timeout')
                        ? '⏳ שרת ה-AI עמוס כרגע, נסה שוב בעוד כמה שניות.'
                        : `❌ שגיאה: ${e.message.slice(0,120)}`;
                try { await client.sendMessage(msg.from, userMsg); } catch(_) {}
            }
        }
    });

    state.client = client;
    console.log(`[${id}] (${label}) מאתחל...`);

    // watchdog — Chrome לפעמים נתקע בטעינה ללא שגיאה ובלי QR/ready
    const _watchdog = setTimeout(() => {
        if (!state.connected) {
            console.error(`[${id}] watchdog: לא התחבר תוך 5 דקות — מאתחל תהליך`);
            process.exit(1);
        }
    }, 5 * 60 * 1000);
    client.once('ready', () => clearTimeout(_watchdog));
    client.once('qr', () => clearTimeout(_watchdog));

    client.initialize().catch(e => {
        clearTimeout(_watchdog);
        console.error(`[${id}] init error:`, e.message);
        setTimeout(() => _reinitSession(2), 10000);
    });
    return client;
}

// ─── Express — דף ניהול QR codes ─────────────────────────────────────────────
const app = express();

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WhatsApp Bot — ניהול סשנים</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
    h1 { color: #128C7E; text-align: center; margin-bottom: 30px; }
    .grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
    .card {
      background: white; border-radius: 16px; padding: 24px 20px;
      width: 210px; text-align: center;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
    }
    .card h3 { margin: 0 0 14px; font-size: 15px; color: #333; }
    .badge-owner { display:inline-block; background:#128C7E; color:white; font-size:11px; border-radius:8px; padding:2px 8px; margin-bottom:10px; }
    .badge-manager { display:inline-block; background:#888; color:white; font-size:11px; border-radius:8px; padding:2px 8px; margin-bottom:10px; }
    .status-connected { color: #25D366; font-weight: bold; font-size: 22px; margin: 10px 0; }
    .status-waiting { color: #888; font-size: 12px; margin-top: 8px; }
    .status-init { color: #aaa; font-size: 13px; margin: 20px 0; }
    img { width: 170px; height: 170px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>🤖 WhatsApp Bot — חיבור סשנים</h1>
  <div id="expiry-bar" style="text-align:center;margin-bottom:18px;font-size:13px;color:#888"></div>
  <div class="grid" id="grid">טוען...</div>
  <script>
    async function startSession(id) {
      const r = await fetch('/api/start/' + id, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) { alert(j.error || 'שגיאה'); return; }
    }
    async function refresh() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('grid').innerHTML = data.map(s => \`
          <div class="card">
            <h3>\${s.label}</h3>
            <div class="\${s.role === 'owner' ? 'badge-owner' : 'badge-manager'}">\${s.role === 'owner' ? 'בעלים' : 'מנהל'}</div>
            \${s.connected
              ? '<div class="status-connected">✅ מחובר</div>'
              : s.qrBase64
                ? \`<img src="\${s.qrBase64}" alt="QR Code"><div class="status-waiting">סרוק עם וואטסאפ</div>\`
                : s.started
                  ? '<div class="status-init">⏳ מאתחל...</div>'
                  : \`<button onclick="startSession('\${s.id}')" style="margin-top:16px;padding:10px 18px;background:#128C7E;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">▶ התחל</button>\`
            }
          </div>
        \`).join('');
      } catch(e) { console.error('שגיאת ריענון:', e); }
    }
    const expiry = new Date('2026-05-11T23:59:59');
    const daysLeft = Math.ceil((expiry - Date.now()) / (1000*60*60*24));
    const bar = document.getElementById('expiry-bar');
    if (daysLeft > 0)
      bar.innerHTML = \`⏳ גישת מנהלים תפוג בעוד <strong>\${daysLeft} ימים</strong> (11/05/2026)\`;
    else
      bar.innerHTML = '<span style="color:red;font-weight:bold">⛔ תוקף גישת מנהלים פג</span>';

    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`);
});

app.get('/qr', (req, res) => {
    const ownerSession = SESSIONS.find(s => s.role === 'owner');
    const ownerState = ownerSession ? sessionStates[ownerSession.id] : Object.values(sessionStates)[0];
    const qr = ownerState?.qrBase64 || null;
    const connected = ownerState?.connected || false;
    res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="8">
  <title>QR — WhatsApp Bot</title>
  <style>
    body { margin:0; background:#111; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:Arial,sans-serif; color:#fff; text-align:center; }
    img { width:280px; height:280px; border-radius:16px; background:#fff; padding:8px; }
    .msg { margin-top:18px; font-size:18px; }
    .sub { margin-top:8px; font-size:13px; color:#aaa; }
  </style>
</head>
<body>
  ${connected
    ? `<div class="msg" style="font-size:24px">✅ מחובר</div><div class="sub">הבוט פעיל</div>`
    : qr
      ? `<img src="${qr}" alt="QR"><div class="msg">סרוק עם וואטסאפ</div><div class="sub">הגדרות → מכשירים מקושרים → קישור מכשיר</div>`
      : `<div class="msg">⏳ מאתחל...</div><div class="sub">הדף יתרענן אוטומטית</div>`
  }
</body>
</html>`);
});

app.get('/api/status', (req, res) => {
    res.json(SESSIONS.map(s => ({
        id: s.id,
        label: s.label,
        role: s.role,
        connected: sessionStates[s.id]?.connected || false,
        qrBase64: sessionStates[s.id]?.qrBase64 || null,
        started: !!sessionStates[s.id]
    })));
});

// ─── /api/test — בדיקת כוונות ותשובות בלי WhatsApp ──────────────────────────
app.post('/api/test', express.json(), async (req, res) => {
    const { text, context } = req.body || {};
    if (!text) return res.status(400).json({ error: 'חסר שדה text' });
    try {
        const parsed = await detectIntent(text, context || {});
        let reply = '';
        if (parsed.intent === 'query') {
            reply = answerQuery(parsed);
        } else if (parsed.intent === 'available_coaches') {
            if (!parsed.coach || !parsed.location || !parsed.date) {
                reply = '❌ נדרש: שם מאמן, מוקד ותאריך.';
            } else {
                const r = await getAvailableCoaches(parsed.coach, parsed.location, parsed.date);
                const [dy, dm, dd] = r.isoDate.split('-');
                const slotStr = r.coachSlots.length > 0
                    ? r.coachSlots.map(e => `${e.startTime||'?'}–${e.endTime||'?'}`).join(', ')
                    : 'שעות לא נמצאו';
                reply = `👥 מאמנים זמינים להחליף את ${r.matchedCoach}\n📍 ${r.matchedLocation}\n📅 ${dd}/${dm} | ⏰ ${slotStr}\n`;
                if (r.available === 0) { reply += '\n😬 כל המאמנים עובדים ביום זה.'; }
                else {
                    if (r.sameArea.length > 0)    reply += `\n🟢 אותו איזור (${r.targetCity||'קרוב'}):\n` + r.sameArea.map(c=>`  • ${c}`).join('\n');
                    if (r.otherArea.length > 0)   reply += `\n\n🔵 שאר הזמינים:\n` + r.otherArea.map(c=>`  • ${c}`).join('\n');
                    if (r.unknownArea?.length > 0) reply += `\n\n⚪ אזור לא ידוע:\n` + r.unknownArea.map(c=>`  • ${c}`).join('\n');
                    if (r.surprises?.length > 0)  reply += `\n\n🎲 הפתעות:\n` + r.surprises.map(c=>`  • ${c}`).join('\n');
                }
            }
        } else if (parsed.intent === 'day_summary') {
            if (!parsed.date) { reply = '❌ נדרש תאריך לסיכום יום.'; res.json({ parsed, reply }); return; }
            const s = await getDaySummary(parsed.date);
            reply = `📊 סיכום יום ${s.date}\n✅ מתוכנן: ${s.active}\n❌ בוטל: ${s.cancelled}\n💰 שכר: ${s.totalWages}₪\n💵 הכנסות: ${s.totalRevenue}₪`;
            if (s.coaches.length > 0) reply += '\n👥 ' + s.coaches.join(', ');
        } else if (parsed.intent === 'coach_info') {
            if (!parsed.coach) { reply = '❌ נדרש שם מאמן.'; res.json({ parsed, reply }); return; }
            const info = await getCoachInfo(parsed.coach || '');
            reply = `👤 ${info.matchedCoach}\n💰 שכר: ${info.defaultWage}₪\n📋 אירועים עתידיים: ${info.upcomingCount}`;
            if (info.next5.length > 0) reply += '\n' + info.next5.join('\n');
        } else if (parsed.intent === 'pending_substitutions') {
            const list = await getPendingSubstitutions(parsed.coach || '', parsed.dateFrom || '', parsed.dateTo || '');
            reply = list.length === 0 ? '✅ אין בקשות ממתינות' :
                `📋 ${list.length} בקשות:\n` + list.map(r => {
                    const [y, m, d] = r.substitutionDate.split('-');
                    return `• ${r.requestingCoachName} | ${d}/${m} | ${r.clientName}`;
                }).join('\n');
        } else if (parsed.intent === 'upcoming_substitutions') {
            const days = parseInt(parsed.days) || 7;
            const { byDate, total } = await getWeekSubstitutions(days);
            reply = total === 0 ? `✅ אין חילופים ב-${days} ימים הקרובים` :
                `📆 ${total} חילופים:\n` + Object.entries(byDate).map(([iso, reqs]) => {
                    const [y, m, d] = iso.split('-');
                    return `${d}/${m}: ` + reqs.map(r => r.requestingCoachName).join(', ');
                }).join('\n');
        } else {
            reply = `(intent: ${parsed.intent} — פעולה זו דורשת אישור, לא מבוצעת בבדיקה)`;
        }
        res.json({ parsed, reply });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

const MAX_CONCURRENT_SESSIONS = 2; // הגבלת זיכרון — שרת 2GB תומך ב-2 Chrome במקביל

app.post('/api/start/:id', (req, res) => {
    const session = SESSIONS.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'לא נמצא' });
    if (session.role === 'manager' && Date.now() > MANAGER_EXPIRY.getTime())
        return res.status(403).json({ error: 'גישת ההרצה פגה' });
    if (sessionStates[session.id]) return res.json({ ok: true, msg: 'כבר פועל' });
    const activeCount = Object.keys(sessionStates).length;
    if (activeCount >= MAX_CONCURRENT_SESSIONS)
        return res.status(503).json({ error: `המערכת עמוסה כרגע (${activeCount}/${MAX_CONCURRENT_SESSIONS} סשנים פעילים). נסה שוב בעוד כמה דקות.` });
    createBotInstance(session);
    res.json({ ok: true });
});

// ─── דף הסבר אישי למנהל עם QR מוטמע ────────────────────────────────────────
app.get('/guide/:id', (req, res) => {
    const session = SESSIONS.find(s => s.id === req.params.id && s.role === 'manager');
    if (!session) return res.status(404).send('<h2>לינק לא תקין</h2>');
    const daysLeft = Math.ceil((MANAGER_EXPIRY - Date.now()) / (1000 * 60 * 60 * 24));
    const expiryStr = MANAGER_EXPIRY.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
    res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>בוט הניהול — ${session.label}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f0f2f5; margin: 0; padding: 24px 16px; color: #333; }
    .wrap { max-width: 540px; margin: 0 auto; }
    h1 { color: #128C7E; text-align: center; font-size: 22px; margin-bottom: 6px; }
    .subtitle { text-align: center; color: #888; font-size: 13px; margin-bottom: 28px; }
    .card { background: white; border-radius: 16px; padding: 20px 22px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.07); }
    .card h2 { margin: 0 0 12px; font-size: 16px; color: #128C7E; }
    .card p, .card li { font-size: 14px; line-height: 1.7; margin: 4px 0; }
    .card ol, .card ul { padding-right: 20px; margin: 8px 0; }
    .notice { background: #fff8e1; border-right: 4px solid #ffc107; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; font-size: 13px; color: #666; }
    .notice strong { color: #e67e00; }
    .tag { display: inline-block; background: #e8f5e9; color: #2e7d32; border-radius: 20px; padding: 3px 12px; font-size: 12px; margin: 3px 2px; }
    .tag-no { background: #fce4ec; color: #c62828; }
    #qr-section { text-align: center; padding: 10px 0; }
    #qr-section img { width: 260px; height: 260px; border-radius: 10px; margin: 10px auto; display: block; }
    #qr-status { font-size: 14px; color: #555; margin-top: 8px; }
    #qr-timer { font-size: 12px; color: #e67e00; margin-top: 4px; font-weight: bold; }
    .connected-msg { color: #25D366; font-size: 20px; font-weight: bold; margin: 16px 0; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>🤖 בוט הניהול של AntiGravity</h1>
  <p class="subtitle">שלום ${session.label} 👋</p>

  <div class="notice">
    ⏳ <strong>הרצה בלבד:</strong> הגישה שלך תקפה עד <strong>${expiryStr}</strong>
    ${daysLeft > 0 ? `(${daysLeft} ימים)` : '— <strong style="color:red">הגישה פגה</strong>'}.
    לאחר מכן תקבל הודעה על המשך.
  </div>

  <div class="card">
    <h2>1️⃣ חיבור לוואטסאפ</h2>
    <p>סרוק את הקוד הבא עם הוואטסאפ שלך:</p>
    <ol>
      <li>פתח וואטסאפ בטלפון</li>
      <li>הגדרות ← מכשירים מקושרים ← קישור מכשיר</li>
      <li>סרוק את הקוד למטה — זה הכל ✅</li>
    </ol>
    <div id="qr-section">
      <div id="qr-status">⏳ טוען קוד QR...</div>
    </div>
  </div>

  <div class="card">
    <h2>2️⃣ איך משתמשים בבוט?</h2>
    <p>שלח <strong>הודעה קולית</strong> לבוט בוואטסאפ. הוא מבין עברית מדוברת.</p>
    <p><strong>דוגמאות לשאלות:</strong></p>
    <ul>
      <li>"מה לוח הזמנים של חי סיני מחר?"</li>
      <li>"אילו פעילויות יש היום בבית ספר רוקח?"</li>
      <li>"מי לא עובד ביום חמישי?"</li>
      <li>"מה קורה בתאריך 15 במאי?"</li>
    </ul>
  </div>

  <div class="card">
    <h2>3️⃣ מה אפשר לשאול?</h2>
    <p>בשלב ההרצה יש לך גישה ל<strong>שאילתות מידע בלבד</strong>:</p>
    <div>
      <span class="tag">✅ לוחות זמנים</span>
      <span class="tag">✅ נוכחות מאמנים</span>
      <span class="tag">✅ פעילויות לפי מיקום</span>
      <span class="tag">✅ מי עובד / לא עובד</span>
    </div>
    <p style="margin-top:12px">הפעולות הבאות <strong>סגורות בשלב זה</strong>:</p>
    <div>
      <span class="tag tag-no">🚫 ביטול פעילות</span>
      <span class="tag tag-no">🚫 שיבוץ חלופי</span>
      <span class="tag tag-no">🚫 שחזור פעילות</span>
    </div>
    <p style="margin-top:10px; font-size:13px; color:#888">זה מכוון — שכבת הגנה על המערכת בזמן ההרצה. לאחר אישור דין יורחבו ההרשאות.</p>
  </div>

  <div class="card">
    <h2>4️⃣ שאלות ובעיות</h2>
    <p>פנה ישירות לדין שויקה.</p>
  </div>
</div>
<script>
  const SESSION_ID = '${session.id}';
  let started = false;
  let lastQrSrc = null;
  let qrShownAt = 0;
  let timerInterval = null;

  function startQrTimer() {
    clearInterval(timerInterval);
    qrShownAt = Date.now();
    timerInterval = setInterval(() => {
      const el = document.getElementById('qr-timer');
      if (!el) { clearInterval(timerInterval); return; }
      const elapsed = Math.floor((Date.now() - qrShownAt) / 1000);
      const left = Math.max(0, 20 - (elapsed % 20));
      el.textContent = left > 0 ? \`⏱ הקוד מתחדש בעוד \${left} שניות\` : '🔄 מחדש קוד...';
    }, 500);
  }

  async function startAndPoll() {
    if (!started) {
      started = true;
      await fetch('/api/start/' + SESSION_ID, { method: 'POST' }).catch(() => {});
    }
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      const s = data.find(x => x.id === SESSION_ID);
      if (!s) return;
      const sec = document.getElementById('qr-section');
      const st = document.getElementById('qr-status');
      if (s.connected) {
        clearInterval(timerInterval);
        sec.innerHTML = '<div class="connected-msg">✅ מחובר בהצלחה!</div><p style="font-size:13px;color:#888">אפשר לסגור את הדף ולשלוח הקלטה לבוט בוואטסאפ.</p>';
        return;
      }
      if (s.qrBase64) {
        if (s.qrBase64 !== lastQrSrc) {
          lastQrSrc = s.qrBase64;
          sec.innerHTML = \`<img src="\${s.qrBase64}" alt="QR Code"><div id="qr-timer"></div><div style="font-size:12px;color:#888;margin-top:4px">סרוק עם וואטסאפ: הגדרות ← מכשירים מקושרים ← קישור מכשיר</div>\`;
          startQrTimer();
        }
      } else {
        if (st) st.textContent = '⏳ מכין קוד QR...';
      }
    } catch(e) {}
    setTimeout(startAndPoll, 3000);
  }
  startAndPoll();
</script>
</body>
</html>`);
});

app.listen(80, () => {
    console.log('🌐 דף ניהול זמין: http://164.92.142.75');
    console.log('📖 מדריך מנהלים: http://164.92.142.75/guide/<id>');
});

// ─── הפעל רק סשנים עם autoStart ──────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason?.message || reason);
});

// ניתוק אוטומטי של מנהלים בפקיעת תוקף
setInterval(() => {
    if (Date.now() < MANAGER_EXPIRY.getTime()) return;
    for (const s of SESSIONS) {
        if (s.role === 'manager' && sessionStates[s.id]) {
            console.log(`[${s.id}] ניתוק אוטומטי — תוקף ההרצה פג`);
            try { sessionStates[s.id].client?.destroy(); } catch(_) {}
            delete sessionStates[s.id];
        }
    }
}, 60 * 60 * 1000);

const autoSessions = SESSIONS.filter(s => s.autoStart);
console.log(`\n🚀 מפעיל ${autoSessions.length} סשן (שאר המנהלים יופעלו לפי דרישה)...\n`);
autoSessions.forEach(s => createBotInstance(s));
