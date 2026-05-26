// test that date filter + status update works
const { Client } = require('ssh2');

const TEST = `
const fs = require('fs');
const { token, appId } = JSON.parse(fs.readFileSync('./base44_token.json'));
const BASE = 'https://base44.app/api/apps/' + appId;
const H = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

(async () => {
    // בדוק פילטר לפי תאריך
    const today = new Date().toISOString().slice(0,10);
    const r = await fetch(BASE + '/entities/Event?date=' + today + '&limit=5', { headers: H });
    console.log('date filter status:', r.status);
    const events = await r.json();
    console.log('events today:', Array.isArray(events) ? events.length : events);
    if (Array.isArray(events) && events[0]) {
        const ev = events[0];
        console.log('sample:', ev.date, ev.clientName, ev.coachName, 'status:', ev.status, 'id:', ev.id);
    }
})().catch(e => console.error(e.message));
`;

const conn = new Client();
conn.on('ready', () => {
    conn.exec(`cd /root/whatsapp-tool && node -e '${TEST.replace(/'/g, "'\\''")}' 2>&1`, (err, stream) => {
        if (err) { conn.end(); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stdout.write(d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect({ host: '164.92.142.75', port: 22, username: 'root', password: 'Dean9466048Dd', readyTimeout: 15000 });
