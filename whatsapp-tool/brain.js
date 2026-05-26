require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Anthropic = require('@anthropic-ai/sdk');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// רשימות מהמערכת
const COACHES = ["להט מעיין","קרן דבוש","יהונתן רום","טל וזגיאל","דוד אשורי","דין שויקה","שרי אנטין","עמית אלבז","נועם כהן","תום בריאולובסקי","ליאור מרגוליס","שמעון יצחק","גל ניקסון","רומי לני","שלו אהרוני","דניאל לנדאו","סיון טפירו","אריק מונטבילסקי","אופק סגל","אסף זוהר","ליז אפרגן","פיקאדו ינאו","תמיר חלף","חי ניר","דובי מילר","וליד אבו חמוד","סהר ליכטנפלד","גילי ששון","אייל רותם","יובל גורפיין"];
const LOCATIONS = ["הצלח\"ה איתמר","הצלחה חופית","הצלח\"ה מקיף ח'","הצלח\"ה הדרים ראשל\"צ","איתמר בן אב\"י (גפ\"ן), ת\"א","שורשים","הצלח\"ה הבילויים, ראשל\"צ","בי\"ס שפירא (יול\"א), ת\"א","בי\"ס שורשים (יול\"א), ת\"א","הצלח\"ה עין הקורא, ראשל\"צ","חט\"ב שמיר, ת\"א","בי\"ס איתמר בן אב\"י","בי\"ס המתמיד, ר\"ג","בי\"ס גבריאלי, ת\"א","בי\"ס לפיד, הוד השרון","בי\"ס מגן (יוח\"א), ת\"א","בי\"ס מגן","בי\"ס גבעון (יוח\"א), ת\"א","בי\"ס טבע, ת\"א","בי\"ס גבעון, ת\"א","בי\"ס רוקח, ת\"א","בי\"ס רוקח (יוח\"א), ת\"א","בי\"ס מרחבים, יבנה","בי\"ס שמיר, חולון","בי\"ס אלומות (יוח\"א), ת\"א","בי\"ס בית צורי, ת\"א","בי\"ס בית צורי (יוח\"א), ת\"א","בי\"ס יהודה מכבי (יוח\"א), ת\"א","בי\"ס נופי ים (יוח\"א), ת\"א","בי\"ס צמרות, באר יעקב","בי\"ס יוחנני, הרצליה","בי\"ס כפיר (יוח\"א), ת\"א","בי\"ס בלוך, ת\"א","בי\"ס בלוך (יוח\"א), ת\"א","בי\"ס נופים (יול\"א), ת\"א","נווה זמר, רעננה","נופי ים, ת\"א","אור זבולון, אריאל","בי\"ס כלנא יחד (יוח\"א), יפו","בי\"ס כלנא יחד, יפו","בי\"ס וייצמן, רחובות"];

// נתוני לו"ז מ-Base44
let scheduleData = null;

function loadScheduleData() {
    try {
        const p = path.join(__dirname, 'schedule_data.json');
        if (fs.existsSync(p)) scheduleData = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch(e) { console.log('לא ניתן לטעון schedule_data.json:', e.message); }
}

async function refreshScheduleFromAPI() {
    const tokenPath = path.join(__dirname, 'base44_token.json');
    if (!fs.existsSync(tokenPath)) { console.log('[schedule] אין טוקן — מדלג על רענון'); return; }
    const { token, appId } = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

    console.log('[schedule] מרענן נתוני לו"ז מ-API...');
    try {
        const res = await fetch(`https://base44.app/api/apps/${appId}/entities/Event?limit=15000`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!res.ok) { console.log('[schedule] API נכשל:', res.status); return; }
        const list = await res.json();
        if (!Array.isArray(list) || list.length === 0) { console.log('[schedule] אין נתונים'); return; }

        const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
        const locationDays = {}, locationCoaches = {}, coachLocations = {}, dateToLocations = {}, rawSchedule = {};
        const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD בשעון מקומי

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
        console.log(`[schedule] ✓ עודכן — ${list.length} אירועים (${Object.keys(rawSchedule).length} תאריכים עתידיים, ${Object.keys(locationDays).length} מוקדים, ${Object.keys(coachLocations).length} מאמנים)`);
    } catch(e) {
        console.log('[schedule] שגיאת רענון:', e.message);
    }
}

async function refreshIfStale() {
    const p = path.join(__dirname, 'schedule_data.json');
    if (fs.existsSync(p)) {
        const age = Date.now() - fs.statSync(p).mtimeMs;
        if (age < 25 * 60 * 1000) { // פחות מ-25 דקות — לא צריך
            console.log(`[schedule] נתונים עדכניים (${Math.round(age/3600000)}h), מדלג`);
            return;
        }
    }
    await refreshScheduleFromAPI();
}

loadScheduleData();
// רענון אוטומטי: בדוק בהפעלה ואחר כך כל 30 דקות
refreshIfStale().catch(() => {});
setInterval(() => refreshScheduleFromAPI().catch(() => {}), 30 * 60 * 1000);

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
            const coachLocList = Object.keys(coachLocs).join(', ');
            warnings.push(`⚠️ לפי הלו"ז, ${coach} לא מועסק ב-${location}. המוקדים שלו: ${coachLocList}`);
        } else if (coachLocs[location]) {
            const coachDays = coachLocs[location];
            if (!coachDays.includes(dayOfWeek)) {
                warnings.push(`⚠️ ${coach} ב-${location} פעיל ב-${coachDays.join('/')} — לא ב${dayOfWeek}`);
            }
        }
    }
    return warnings.length > 0 ? warnings.join('\n') : null;
}

// מענה לשאלות על הלו"ז
function answerQuery(parsed) {
    if (!scheduleData) return '❌ אין נתוני לו"ז זמינים (הרץ scrape-schedule.js).';

    const raw = scheduleData.rawSchedule || {};
    const hebrewDays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

    // תאריכי השבוע הנוכחי
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

    const subject = parsed.subject || '';  // מאמן / מוקד
    const range = parsed.range || 'week';  // week / next_week / date / all

    // קבע טווח תאריכים
    let fromDate, toDate;
    if (range === 'next_week') { fromDate = nextWeekStart; toDate = nextWeekEnd; }
    else if (range === 'date' && parsed.date) {
        const [d, m, y] = parsed.date.split('/');
        fromDate = new Date(`${y}-${m}-${d}`); toDate = new Date(fromDate);
    } else { fromDate = today; toDate = weekEnd; } // ברירת מחדל: השבוע

    // שאלה על סטטוס פעילות
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
                        lines.push(`${loc.location} ${a.time || '—'} — ${st}`);
                    }
                }
            }
            if (lines.length === 0) return `📭 ${matchedCoachS} לא מופיע ב-${dateLabel}.`;
            return `📊 *${matchedCoachS}* — ${dateLabel}:\n\n${lines.join('\n')}`;
        }
        return `❓ ציין מוקד או מאמן ותאריך לבדיקת סטטוס.`;
    }

    // שאלה על שעות פעילות
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

    // שאלה איזה מוקדים פעילים ביום מסוים
    if (parsed.queryType === 'locations' && parsed.date) {
        const dayData = raw[parsed.date];
        const dateLabel = dateToDisplay(parsed.date);
        if (!dayData) return `📭 אין פעילויות ב-${dateLabel}.`;
        const activeLocations = dayData.locations
            .filter(l => (l.activities || []).some(a => a.status !== 'בוטל'))
            .map(l => {
                const coaches = [...new Set((l.activities || [])
                    .filter(a => a.status !== 'בוטל' && a.coach)
                    .map(a => a.coach))];
                return `${l.location}${coaches.length ? ' — ' + coaches.join(', ') : ''}`;
            });
        if (activeLocations.length === 0) return `📭 אין פעילויות מתוכננות ב-${dateLabel}.`;
        return `📍 *מוקדים פעילים — ${dateLabel}*:\n\n${activeLocations.join('\n')}`;
    }

    // שאלה מי כן עובד ביום מסוים
    if (parsed.queryType === 'present' && parsed.date) {
        const dayData = raw[parsed.date];
        const workingCoaches = new Set();
        if (dayData) {
            for (const loc of dayData.locations) {
                for (const a of (loc.activities || [])) {
                    if (a.status !== 'בוטל' && a.coach) workingCoaches.add(a.coach);
                }
            }
        }
        const working = COACHES.filter(c => workingCoaches.has(c));
        const dateLabel = dateToDisplay(parsed.date);
        if (working.length === 0) return `😴 אין מאמנים עובדים ב-${dateLabel}.`;
        return `✅ *מאמנים שעובדים — ${dateLabel}*:\n\n${working.join('\n')}`;
    }

    // שאלה מי לא עובד ביום מסוים
    if (parsed.queryType === 'absent' && parsed.date) {
        const dayData = raw[parsed.date];
        const workingCoaches = new Set();
        if (dayData) {
            for (const loc of dayData.locations) {
                for (const a of (loc.activities || [])) {
                    if (a.status !== 'בוטל' && a.coach) workingCoaches.add(a.coach);
                }
            }
        }
        const absent = COACHES.filter(c => !workingCoaches.has(c));
        const dateLabel = dateToDisplay(parsed.date);
        if (absent.length === 0) return `✅ כל המאמנים עובדים ב-${dateLabel}.`;
        return `😴 *מאמנים שלא עובדים — ${dateLabel}*:\n\n${absent.join('\n')}`;
    }

    const matchedCoach = subject ? findBest(subject, COACHES) : null;
    const matchedLocation = subject ? findBest(subject, LOCATIONS) : null;

    // שאלה על מאמן
    if (matchedCoach) {
        const entries = [];
        for (const [date, { locations }] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            for (const loc of locations) {
                const activeActs = (loc.activities || []).filter(a => a.coach === matchedCoach && a.status !== 'בוטל');
                if (activeActs.length === 0) continue;
                const times = activeActs.map(a => a.time).filter(t => /^\d{1,2}:\d{2}$/.test(t)).sort();
                entries.push(`${dateToDisplay(date)} — ${loc.location}${times.length ? ' ' + times[0] : ''}`);
            }
        }
        if (entries.length === 0) return `📭 אין פעילויות ל${matchedCoach} בטווח שנבדק.`;
        const rangeLabel = range === 'next_week' ? 'שבוע הבא' : (range === 'date' ? parsed.date : 'השבוע');
        return `📅 *${matchedCoach}* — ${rangeLabel}:\n\n${entries.join('\n')}`;
    }

    // שאלה על מוקד
    if (matchedLocation) {
        const entries = [];
        for (const [date, { locations }] of Object.entries(raw)) {
            if (!dateInRange(date, fromDate, toDate)) continue;
            const loc = locations.find(l => l.location === matchedLocation);
            if (loc) {
                const activeCoaches = [...new Set((loc.activities || []).filter(a => a.status !== 'בוטל' && a.coach).map(a => a.coach))];
                if (activeCoaches.length === 0) continue;
                entries.push(`${dateToDisplay(date)} — ${activeCoaches.join(', ')}`);
            }
        }
        if (entries.length === 0) return `📭 אין פעילויות ב${matchedLocation} בטווח שנבדק.`;
        const rangeLabel = range === 'next_week' ? 'שבוע הבא' : (range === 'date' ? parsed.date : 'השבוע');
        return `📅 *${matchedLocation}* — ${rangeLabel}:\n\n${entries.join('\n')}`;
    }

    // שאלה כללית על תאריך — מי עובד היום / מחר
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

// בקשות ממתינות לאישור
const pending = {};

// התאמה חכמה
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
    const clean = s => s.replace(/['"״]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    const inp = clean(input);
    const exact = list.find(o => clean(o) === inp);
    if (exact) return exact;
    const contains = list.find(o => clean(o).includes(inp) || inp.includes(clean(o).split(',')[0]));
    if (contains) return contains;
    const words = inp.split(' ').filter(w => w.length >= 3);
    // שם מלא (שתי מילים+): חפש לפי כל המילים יחד — לא לפי שם פרטי בלבד
    const byWords = list.find(o => words.length > 1 && words.every(w => clean(o).includes(w)));
    if (byWords) return byWords;
    // שם בודד: חפש לפי התחלה
    const firstName = inp.split(' ')[0];
    const byFirst = inp.includes(' ') ? null : list.find(o => clean(o).startsWith(firstName));
    if (byFirst) return byFirst;
    const byAny = list.find(o => words.some(w => w.length >= 4 && clean(o).includes(w)));
    if (byAny) return byAny;
    // fuzzy — edit distance 1 על מילים (מטפל בויצמן/וייצמן, שגיאות כתיב קטנות)
    const byFuzzy = list.find(o => {
        const parts = clean(o).split(/[\s,.()"״]+/).filter(p => p.length >= 4);
        return words.filter(w => w.length >= 4).some(w => parts.some(p => editDist(w, p) <= 1));
    });
    if (byFuzzy) return byFuzzy;
    return null;
}

// תמלול הקלטה
async function transcribe(audioBuffer, mimeType) {
    const tmpFile = path.join(__dirname, 'tmp_audio.ogg');
    fs.writeFileSync(tmpFile, audioBuffer);
    try {
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(tmpFile),
            model: 'whisper-large-v3',
            language: 'he',
            response_format: 'text'
        });
        return transcription;
    } finally {
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch(_) {}
    }
}

// זיהוי סוג הבקשה
async function detectIntent(text) {
    const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
            role: 'user',
            content: `זהה את סוג הבקשה וחלץ פרטים. החזר JSON בלבד.
תאריך היום: ${new Date().toLocaleDateString('he-IL', {day:'2-digit',month:'2-digit',year:'numeric'})} (${['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][new Date().getDay()]})

אם זו בקשת ביטול פעילות:
{"intent":"cancel","date":"DD/MM/YYYY","location":"השם המדויק מהרשימה, או ריק אם כל היום","cancelAll":false}

אם זו בקשת שחזור פעילות שבוטלה / החזרה למצב מתוכנן:
{"intent":"restore","date":"DD/MM/YYYY","location":"השם המדויק מהרשימה, או ריק אם כל היום","coach":"שם המאמן אם צוין במפורש, ריק אחרת"}

אם זו בקשת חילוף:
{"intent":"substitution","requestingCoach":"","date":"DD/MM/YYYY","location":"השם המדויק מהרשימה","reason":"","replacementCoach":"","paymentDetails":"","notes":""}

אם זו שאלה מי כן עובד / איזה מאמנים עובדים / מי יש לו פעילות ביום מסוים:
{"intent":"query","subject":"","range":"date","date":"DD/MM/YYYY","queryType":"present"}

אם זו שאלה על לוח הזמנים של מאמן ספציפי / מוקד ספציפי (איפה עובד מאמן, מתי יש פעילות במוקד):
{"intent":"query","subject":"שם מאמן או שם מוקד — השם המדויק מהרשימה","range":"week/next_week/date/all","date":"DD/MM/YYYY אם שאלו על תאריך ספציפי","queryType":"schedule"}

אם זו שאלה מי לא עובד / מי פנוי / איזה מאמנים אין להם פעילות ביום מסוים:
{"intent":"query","subject":"","range":"date","date":"DD/MM/YYYY","queryType":"absent"}

אם זו שאלה על סטטוס פעילות (מתוכנן/בוטל, האם פעילות בוטלה, האם מאמן עובד ב[תאריך]):
{"intent":"query","subject":"שם מאמן או שם מוקד","range":"date","date":"DD/MM/YYYY","queryType":"status"}

אם זו שאלה על שעות פעילות (מה השעות, מאיזה שעה, באיזה שעה מתחיל):
{"intent":"query","subject":"שם מוקד","range":"date/week","date":"DD/MM/YYYY אם ציינו תאריך","queryType":"times"}

אם זו שאלה איזה מוקדים / בתי ספר / מקומות יש בהם פעילות / עובדים / פתוחים ביום מסוים:
{"intent":"query","subject":"","range":"date","date":"DD/MM/YYYY","queryType":"locations"}

מילים שמעידות על שאלה: איפה, מתי, מי עובד, מי לא עובד, מי פנוי, לוח זמנים, מה יש, כמה, מה השבוע, שבוע הבא, סטטוס, בוטל, שעות, מאיזה שעה, איזה בתי ספר, אילו מוקדים, כמה מוקדים, היכן יש פעילות

מילים שמעידות על ביטול: בטל, ביטול, לא יתקיים, מבוטל, לא מתקיים, בתל, ביטל, בטול
מילים שמעידות על שחזור: שחזר, החזר, הפעל מחדש, בטל ביטול, חזרה לפעילות, שחזור, מתוכנן שוב
שים לב: המתמלל לפעמים שומע "בתל" במקום "בטל" — התייחס לשניהם כביטול.
דוגמה: "בתל פעילות באור זבולון" = cancel של אור זבולון.
מילות מפתח "כל היום" / "כל הפעילויות" / "כל המוקדים" → cancelAll:true, location:""

חשוב לתאריך — כללי חד משמעיים:

כשמספר סידורי מופיע לפני שם חודש (ינואר/פברואר/מרץ/אפריל/מאי/יוני/יולי/אוגוסט/ספטמבר/אוקטובר/נובמבר/דצמבר) — המספר הוא יום בחודש:
ראשון=1, שני=2, שלישי=3, רביעי=4, חמישי=5, שישי=6, שביעי=7, שמיני=8, תשיעי=9, עשירי=10

דוגמאות תאריך (מספר סידורי + חודש):
"בשלישי במאי" = 03/05 (ה-3 במאי — לא יום שלישי!)
"ברביעי ביוני" = 04/06
"בחמישי ביולי" = 05/07
"בשני באוקטובר" = 02/10
"בשמיני באוגוסט" = 08/08
"ביום ראשון השלישי במאי" = 03/05 (ה-3 במאי)
"ביום שני העשירי ביוני" = 10/06
"ביום חמישי ה-22 ביולי" = 22/07

"יום שלישי" לבד (ללא חודש) = יום שלישי הקרוב בשבוע
"מחר" = תאריך מחר (היום + 1 יום)
"היום" = תאריך היום

חשוב: שדה location חייב להיות שם מדויק מהרשימה הבאה (אפילו אם התמלול שגוי מעט):
${LOCATIONS.join('\n')}

טקסט: "${text}"`
        }]
    });
    let raw = msg.content[0].text.replace(/```json\n?|\n?```/g,'').trim();
    try {
        return JSON.parse(raw);
    } catch(e) {
        // תקן מרכאות שגויות בתוך שמות עבריים (בי"ס, ת"א וכו')
        const fixed = raw.replace(/([א-ת])"([א-ת])/g, '$1\\"$2');
        return JSON.parse(fixed);
    }
}

// --- Base44 API helpers ---
function base44Headers() {
    const { token } = JSON.parse(fs.readFileSync(path.join(__dirname, 'base44_token.json'), 'utf8'));
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function base44Url(appId, entity, id) {
    return `https://base44.app/api/apps/${appId}/entities/${entity}${id ? '/'+id : ''}`;
}

// בקשת חילוף דרך API
async function fillBase44(data) {
    const matchedCoach = findBest(data.requestingCoach, COACHES);
    const matchedLocation = findBest(data.location, LOCATIONS);
    const matchedReplacement = findBest(data.replacementCoach, COACHES);

    if (!matchedCoach) throw new Error(`מאמן מבקש לא זוהה: "${data.requestingCoach}"`);
    if (!matchedLocation) throw new Error(`מוקד לא זוהה: "${data.location}"`);

    const { token, appId } = JSON.parse(fs.readFileSync(path.join(__dirname, 'base44_token.json'), 'utf8'));
    const H = base44Headers();

    const [d, m, y] = data.date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

    // מצא IDs של מאמן ומוקד — קודם לפי תאריך הבקשה, ואז סריקה רחבה אם חסר
    let clientId = '', requestingCoachId = '', substituteCoachId = '';

    async function scanEventsForIds(events) {
        for (const ev of events) {
            if (!clientId && ev.clientName === matchedLocation && ev.clientId) clientId = ev.clientId;
            if (!requestingCoachId && ev.coachName === matchedCoach && ev.coachId) requestingCoachId = ev.coachId;
            if (matchedReplacement && !substituteCoachId && ev.coachName === matchedReplacement && ev.coachId) substituteCoachId = ev.coachId;
            if (clientId && requestingCoachId && (!matchedReplacement || substituteCoachId)) break;
        }
    }

    const evDateRes = await fetch(`${base44Url(appId, 'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (evDateRes.ok) await scanEventsForIds(await evDateRes.json());

    if (!clientId || !requestingCoachId || (matchedReplacement && !substituteCoachId)) {
        const evAllRes = await fetch(`${base44Url(appId, 'Event')}?limit=2000`, { headers: H });
        if (!evAllRes.ok) throw new Error(`API שגיאה: ${evAllRes.status}`);
        await scanEventsForIds(await evAllRes.json());
    }

    const body = {
        substitutionDate: isoDate,
        requestingCoachName: matchedCoach,
        requestingCoachId,
        clientName: matchedLocation,
        clientId,
        substituteCoachName: matchedReplacement || '',
        substituteCoachId,
        reason: data.reason || '',
        notes: data.notes || '',
        temporarySubstituteName: '',
        summaryDetails: '',
        status: 'ממתין לבדיקה'
    };

    const r = await fetch(base44Url(appId, 'SubstitutionRequest'), {
        method: 'POST', headers: H, body: JSON.stringify(body)
    });
    if (!r.ok) {
        const err = await r.text();
        throw new Error(`API שגיאה ${r.status}: ${err.slice(0,150)}`);
    }
    console.log(`[API] ✓ בקשת חילוף נוצרה`);
    return { success: true, matchedCoach, matchedLocation };
}

// ביטול פעילויות דרך API
async function cancelActivities(date, location) {
    const matchedLocation = location ? findBest(location, LOCATIONS) : null;
    if (location && !matchedLocation) throw new Error(`המוקד "${location}" לא נמצא — ביטול נמנע`);

    const { token, appId } = JSON.parse(fs.readFileSync(path.join(__dirname, 'base44_token.json'), 'utf8'));
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

    const res = await fetch(`${base44Url(appId,'Event')}?date=${isoDate}&limit=500`, { headers: H });
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

    let count = 0, failCount = 0;
    for (const ev of toCancel) {
        const r = await fetch(base44Url(appId, 'Event', ev.id), {
            method: 'PUT', headers: H,
            body: JSON.stringify({ ...ev, status: 'canceled' })
        });
        if (r.ok) { count++; console.log(`[API] ✓ בוטל: ${ev.clientName} ${ev.coachName} ${ev.startTime||''}`); }
        else { failCount++; console.log(`[API] שגיאה ${r.status} עבור ${ev.id}`); }
    }
    return { success: true, cancelledCount: count, failCount, matchedLocation };
}

async function previewCancel(date, location) {
    const { token, appId } = JSON.parse(fs.readFileSync(path.join(__dirname, 'base44_token.json'), 'utf8'));
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const res = await fetch(`${base44Url(appId,'Event')}?date=${isoDate}&limit=500`, { headers: H });
    if (!res.ok) throw new Error(`API שגיאה: ${res.status}`);
    const events = await res.json();
    return events.filter(e =>
        (e.status === 'planned' || e.status === 'מתוכנן') &&
        (!location || e.clientName === location)
    );
}

async function previewRestore(date, location, coach) {
    const { token, appId } = JSON.parse(fs.readFileSync(path.join(__dirname, 'base44_token.json'), 'utf8'));
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const res = await fetch(`${base44Url(appId,'Event')}?date=${isoDate}&limit=500`, { headers: H });
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

    const { token, appId } = JSON.parse(fs.readFileSync(path.join(__dirname, 'base44_token.json'), 'utf8'));
    const H = base44Headers();
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;

    const res = await fetch(`${base44Url(appId,'Event')}?date=${isoDate}&limit=500`, { headers: H });
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

    let count = 0, failCount = 0;
    for (const ev of toRestore) {
        const r = await fetch(base44Url(appId, 'Event', ev.id), {
            method: 'PUT', headers: H,
            body: JSON.stringify({ ...ev, status: 'planned' })
        });
        if (r.ok) { count++; console.log(`[API] ✓ שוחזר: ${ev.clientName} ${ev.coachName} ${ev.startTime||''}`); }
        else { failCount++; console.log(`[API] שגיאה ${r.status} עבור ${ev.id}`); }
    }
    return { success: true, restoredCount: count, failCount, matchedLocation, matchedCoach };
}

// WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-accelerated-2d-canvas',
            '--disable-features=VizDisplayCompositor'
        ],
        protocolTimeout: 120000
    }
});

client.on('qr', (qr) => {
    console.log('\n=== סרוק QR ===\n');
    qrcode.generate(qr, { small: true });
    fs.writeFileSync(path.join(__dirname, 'qr.txt'), qr, 'utf8');
});

client.on('ready', async () => {
    const info = client.info;
    console.log(`\n✓ מחובר כ-${info.pushname} (${info.wid.user})`);
    console.log('מאזין להודעות...\n');
});

const knownChatIds = new Set();
let lastVoiceTs = 0;
const STARTUP_TIME = Date.now(); // הזמן שהבוט עלה — להתעלם מהקלטות ישנות

process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason?.message || reason);
    process.exit(1);
});

client.on('message_create', async (msg) => {
    const chat = await msg.getChat();

    // סנן: רק הודעות שנשלחו מעצמי, לא בקבוצה
    if (!msg.fromMe || chat.isGroup) return;

    // רשום כל צ'אט שממנו הגיעה הקלטה קולית (יכולים להיות כמה @lid IDs)
    if (msg.type === 'ptt' || msg.type === 'audio') {
        if (!knownChatIds.has(chat.id._serialized)) {
            knownChatIds.add(chat.id._serialized);
            console.log(`[INFO] צ'אט קולי נוסף: ${chat.id._serialized}`);
        }
    }

    // טקסט — בדוק אם זו תגובת אישור
    if (msg.type === 'chat') {
        const body = msg.body.trim();
        const pendingKeys = Object.keys(pending);

        // פנה pending שפג תוקפם (מעל 5 דקות)
        for (const k of pendingKeys) {
            if (Date.now() - (pending[k]._ts || 0) > 5 * 60 * 1000) {
                delete pending[k];
                console.log('[pending] פג תוקף:', k);
            }
        }

        const freshKeys = Object.keys(pending);
        if (freshKeys.length > 0 && (body === 'כן' || body === 'אשר' || body === '✓')) {
            const key = freshKeys[0];
            const data = pending[key];
            delete pending[key];

            if (data._intent === 'cancel') {
                await client.sendMessage(msg.from, '⏳ מבטל פעילויות...');
                try {
                    const result = await cancelActivities(data.date, data.location);
                    const failNote = result.failCount > 0 ? `\n⚠️ ${result.failCount} אירועים לא עודכנו (שגיאת API)` : '';
                    await client.sendMessage(msg.from,
                        `✅ *בוטלו ${result.cancelledCount} פעילויות*\n\n📅 ${data.date}${result.matchedLocation ? '\n📍 ' + result.matchedLocation : '\n📍 כל המוקדים'}${failNote}`
                    );
                    refreshScheduleFromAPI().catch(() => {});
                } catch(e) {
                    console.error('שגיאת ביטול:', e.message);
                    await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                }
            } else if (data._intent === 'restore') {
                await client.sendMessage(msg.from, '⏳ משחזר פעילויות...');
                try {
                    const result = await restoreActivities(data.date, data.location, data.coach || '');
                    const failNote = result.failCount > 0 ? `\n⚠️ ${result.failCount} אירועים לא עודכנו (שגיאת API)` : '';
                    const coachLine = result.matchedCoach ? `\n👤 ${result.matchedCoach}` : '';
                    await client.sendMessage(msg.from,
                        `✅ *שוחזרו ${result.restoredCount} פעילויות*\n\n📅 ${data.date}${result.matchedLocation ? '\n📍 ' + result.matchedLocation : '\n📍 כל המוקדים'}${coachLine}${failNote}`
                    );
                    refreshScheduleFromAPI().catch(() => {});
                } catch(e) {
                    console.error('שגיאת שחזור:', e.message);
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
                    console.error('שגיאת Base44:', e.message);
                    await client.sendMessage(msg.from, `❌ שגיאה: ${e.message}`);
                }
            }
            return;
        }

        if (freshKeys.length > 0 && (body === 'לא' || body === 'בטל' || body === 'ביטול')) {
            delete pending[freshKeys[0]];
            await client.sendMessage(msg.from, '🗑️ הבקשה בוטלה.');
            return;
        }

        // "כן"/"לא" ללא בקשה פתוחה — הסבר למשתמש
        if (freshKeys.length === 0 && (body === 'כן' || body === 'לא' || body === 'אשר' || body === '✓')) {
            await client.sendMessage(msg.from, '❔ אין בקשה פתוחה. שלח הקלטה קולית.');
            return;
        }
    }

    // הקלטה קולית
    if (msg.type === 'ptt' || msg.type === 'audio') {
        // התעלם מהקלטות שנשלחו לפני שהבוט עלה (הודעות ממתינות מסשן קודם)
        if (msg.timestamp && msg.timestamp * 1000 < STARTUP_TIME - 60000) {
            console.log(`[SKIP] הקלטה ישנה מ-${new Date(msg.timestamp * 1000).toLocaleTimeString('he-IL')}, מדלג`);
            return;
        }

        const myTs = Date.now();
        lastVoiceTs = myTs;

        console.log('[RECV] voice from', msg.from, 'ts:', msg.timestamp);
        try { await client.sendMessage(msg.from, '🎙️ מתמלל...'); } catch(e) { console.error('[SEND ERR] מתמלל:', e.message); }
        try {
            const media = await msg.downloadMedia();
            const audioBuffer = Buffer.from(media.data, 'base64');
            const transcript = await transcribe(audioBuffer, media.mimetype);
            console.log('תמלול:', transcript);

            // אם הגיעה הקלטה חדשה יותר בזמן התמלול — זרוק
            if (lastVoiceTs !== myTs) {
                console.log('הקלטה ישנה — מדלג (הגיעה חדשה יותר)');
                return;
            }

            // נקה pending ישנים — הקלטה חדשה מחליפה כל מה שהיה לפני
            for (const k of Object.keys(pending)) delete pending[k];

            await client.sendMessage(msg.from, `⏳ מפענח...`);
            const parsed = await detectIntent(transcript);
            console.log('פירוש:', JSON.stringify(parsed));

            // בדוק שוב — אם הגיעה הקלטה חדשה בזמן הפענוח — זרוק
            if (lastVoiceTs !== myTs) {
                console.log('הקלטה ישנה (אחרי פענוח) — מדלג');
                return;
            }

            const key = Date.now().toString();

            if (parsed.intent === 'query') {
                const answer = answerQuery(parsed);
                console.log('[SEND] query answer to', msg.from, ':', answer.slice(0, 60));
                await client.sendMessage(msg.from, answer);
                console.log('[SEND] done');
            } else if (parsed.intent === 'cancel') {
                const matchedLocation = parsed.location ? findBest(parsed.location, LOCATIONS) : null;

                if (parsed.location && !matchedLocation) {
                    await client.sendMessage(msg.from, `❌ לא זיהיתי את המוקד "${parsed.location}" ברשימה. נסה שוב עם שם מדויק יותר.`);
                    return;
                }

                // בדוק קודם כמה אירועים יש לבטל
                await client.sendMessage(msg.from, '⏳ בודק...');
                const toCancel = await previewCancel(parsed.date, matchedLocation || null);
                if (toCancel.length === 0) {
                    const locLabel = matchedLocation ? ` ב-${matchedLocation}` : '';
                    await client.sendMessage(msg.from, `📭 אין פעילויות מתוכננות לביטול ב-${parsed.date}${locLabel}.`);
                    return;
                }

                console.log(`ביטול: ${parsed.date} | מוקד=${matchedLocation} | ${toCancel.length} אירועים`);
                pending[key] = { ...parsed, _intent: 'cancel', location: matchedLocation || '', _ts: Date.now() };

                const coachLines = [...new Set(toCancel.map(e => `• ${e.coachName || '—'}${e.clientName ? ' — ' + e.clientName : ''}`))]  .join('\n');
                const warning = parsed.date && matchedLocation ? validateCancel(matchedLocation, parsed.date) : null;
                const locHeader = matchedLocation ? matchedLocation : 'כל המוקדים';
                const confirmMsg = `🔔 *ביטול פעילויות — לאישור*\n\n📅 ${parsed.date}\n📍 ${locHeader}\n🔢 ${toCancel.length} אירועים:\n${coachLines}${warning ? '\n\n' + warning : ''}\n\nענה *כן* לאישור או *לא* לביטול.`;
                await client.sendMessage(msg.from, confirmMsg);
            } else if (parsed.intent === 'restore') {
                const matchedLocation = parsed.location ? findBest(parsed.location, LOCATIONS) : null;
                const matchedCoachR = parsed.coach ? findBest(parsed.coach, COACHES) : null;

                if (parsed.location && !matchedLocation) {
                    await client.sendMessage(msg.from, `❌ לא זיהיתי את המוקד "${parsed.location}" ברשימה. נסה שוב.`);
                    return;
                }
                if (parsed.coach && !matchedCoachR) {
                    await client.sendMessage(msg.from, `❌ לא זיהיתי את המאמן "${parsed.coach}" ברשימה. נסה שוב.`);
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

                console.log(`שחזור: ${parsed.date} | מוקד=${matchedLocation} | מאמן=${matchedCoachR} | ${toRestore.length} אירועים`);
                pending[key] = { ...parsed, _intent: 'restore', location: matchedLocation || '', coach: matchedCoachR || '', _ts: Date.now() };

                const coachLinesR = [...new Set(toRestore.map(e => `• ${e.coachName || '—'}${e.clientName ? ' — ' + e.clientName : ''}`))]
                    .join('\n');
                const locHeaderR = matchedLocation ? matchedLocation : 'כל המוקדים';
                const coachHeaderR = matchedCoachR ? `\n👤 ${matchedCoachR}` : '';
                const confirmMsgR = `🔔 *שחזור פעילויות — לאישור*\n\n📅 ${parsed.date}\n📍 ${locHeaderR}${coachHeaderR}\n🔢 ${toRestore.length} אירועים:\n${coachLinesR}\n\nענה *כן* לאישור או *לא* לביטול.`;
                await client.sendMessage(msg.from, confirmMsgR);
            } else if (parsed.intent !== 'substitution') {
                await client.sendMessage(msg.from, `❓ לא הצלחתי להבין את הבקשה. נסה להקליט שוב.`);
                console.log('intent לא מזוהה:', parsed.intent);
            } else {
                const matchedCoach = findBest(parsed.requestingCoach, COACHES);
                const matchedLocation = findBest(parsed.location, LOCATIONS);
                const matchedReplacement = findBest(parsed.replacementCoach, COACHES);
                console.log(`התאמות: מאמן=${matchedCoach} | מוקד=${matchedLocation} | מחליף=${matchedReplacement}`);
                pending[key] = { ...parsed, _intent: 'substitution', _ts: Date.now() };

                const warning = matchedCoach && matchedLocation && parsed.date
                    ? validateSubstitution(matchedCoach, matchedLocation, parsed.date) : null;

                const confirmMsg =
`🔔 *בקשת חילוף — לאישור*

👤 מאמן: ${matchedCoach || parsed.requestingCoach || '—'}
📅 תאריך: ${parsed.date || '—'}
📍 מוקד: ${matchedLocation || parsed.location || '—'}
📋 סיבה: ${parsed.reason || '—'}
🔄 מחליף: ${matchedReplacement || '—'}
💰 תשלום: ${parsed.paymentDetails || '—'}${warning ? '\n\n' + warning : ''}

ענה *כן* לאישור ועדכון Base44, או *לא* לביטול.`;
                await client.sendMessage(msg.from, confirmMsg);
            }
        } catch(e) {
            console.error('שגיאה:', e.message);
            try { await client.sendMessage(msg.from, `❌ שגיאה: ${e.message.slice(0,120)}`); } catch(_) {}
        }
    }
});

client.on('auth_failure', () => {
    console.error('שגיאת חיבור');
    process.exit(1);
});

client.on('disconnected', (reason) => {
    console.log('התנתק מוואטסאפ:', reason, '— מאתחל...');
    process.exit(1); // PM2 יפעיל מחדש אוטומטית
});

console.log('מתחבר לוואטסאפ...');
client.initialize().catch(e => {
    console.error('[init error]', e.message);
    process.exit(1);
});
