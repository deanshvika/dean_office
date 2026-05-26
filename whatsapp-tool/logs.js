const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    console.log('📡 מחובר — מציג לוגים חיים (Ctrl+C לעצירה)\n');
    conn.exec('pm2 logs bot-server --lines 20', (err, stream) => {
        if (err) { console.error(err.message); conn.end(); return; }
        stream.on('data', d => process.stdout.write(d.toString()));
        stream.stderr.on('data', d => process.stdout.write(d.toString()));
        stream.on('close', () => conn.end());
    });
}).connect({ host: '164.92.142.75', port: 22, username: 'root', password: 'Dean9466048Dd', readyTimeout: 10000 });
