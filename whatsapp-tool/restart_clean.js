const { Client } = require('ssh2');

function ssh(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let out = '';
            stream.on('data', d => { out += d; process.stdout.write(d.toString()); });
            stream.stderr.on('data', d => process.stdout.write(d.toString()));
            stream.on('close', () => resolve(out));
        });
    });
}

async function main() {
    const conn = new Client();
    await new Promise((resolve, reject) =>
        conn.on('ready', resolve).on('error', reject)
            .connect({ host: '164.92.142.75', port: 22, username: 'root', password: 'Dean9466048Dd', readyTimeout: 10000 })
    );
    console.log('✓ מחובר\n');

    console.log('=== עוצר PM2 ===');
    await ssh(conn, 'pm2 stop bot-server');

    console.log('\n=== הורג Chrome תקוע ===');
    await ssh(conn, 'pkill -f chrome || true; pkill -f chromium || true; sleep 2');

    console.log('\n=== מפעיל מחדש ===');
    await ssh(conn, 'cd /root/whatsapp-tool && pm2 start ecosystem.config.js');

    console.log('\n=== מחכה 15 שניות ===');
    await new Promise(r => setTimeout(r, 15000));

    console.log('\n=== לוגים ===');
    await ssh(conn, 'pm2 logs bot-server --lines 20 --nostream');

    conn.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
