require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function base44Headers() {
    const { token } = JSON.parse(fs.readFileSync(path.join(__dirname,'base44_token.json'),'utf8'));
    return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
}

async function detectIntent(text) {
    const today = new Date();
    const todayStr = today.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric'});
    const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 600,
        messages: [{ role: 'user', content:
`זהה את הכוונה. החזר JSON בלבד.
תאריך היום: ${todayStr}
מילים שמעידות על ביטול: בטל, ביטול, בתל, לא יתקיים.
אם ביטול: {"intent":"cancel","date":"DD/MM/YYYY","location":"שם מוקד מדויק","cancelAll":false}
טקסט: "${text}"`
        }]
    });
    let raw = msg.content[0].text.replace(/```json\n?|\n?```/g,'').trim();
    try { return JSON.parse(raw); }
    catch(e) { return JSON.parse(raw.replace(/([א-ת])"([א-ת])/g, '$1\\"$2')); }
}

async function previewCancel(date, location) {
    const { token, appId } = JSON.parse(fs.readFileSync(path.join(__dirname,'base44_token.json'),'utf8'));
    const H = base44Headers();
    const [d,m,y] = date.split('/');
    const isoDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    const res = await fetch(`https://base44.app/api/apps/${appId}/entities/Event?date=${isoDate}&limit=500`, { headers: H });
    const events = await res.json();
    return events.filter(e =>
        (e.status === 'planned' || e.status === 'מתוכנן') &&
        (!location || e.clientName === location)
    );
}

const TESTS = [
    'בטל פעילות בויצמן בתאריך החמישי במאי',
    'בטל פעילות בויצמן בתאריך 19 אפריל',
    'בטל את כל הפעילויות ב 29 ביוני',
];

(async () => {
    for (const text of TESTS) {
        console.log('\n---');
        console.log('טקסט:', text);
        try {
            const intent = await detectIntent(text);
            console.log('intent:', JSON.stringify(intent));
            if (intent.intent === 'cancel') {
                const events = await previewCancel(intent.date, intent.location || null);
                if (events.length === 0) {
                    console.log('✅ תגובה נכונה: "אין פעילויות מתוכננות לביטול"');
                } else {
                    console.log(`✅ נמצאו ${events.length} אירועים — תוצג הודעת אישור:`);
                    events.forEach(e => console.log(` • ${e.coachName} — ${e.clientName}`));
                }
            }
        } catch(e) {
            console.log('❌ שגיאה:', e.message);
        }
    }
})();
