const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const SERVER = '164.92.142.75';
const USER = 'root';
const PASS = 'Dean9466048Dd';
const REMOTE_DIR = '/root/whatsapp-tool';

const FILES = ['server.js', 'brain.js'];

async function main() {
    const conn = new Client();
    await new Promise((resolve, reject) => {
        conn.on('ready', resolve).on('error', reject).connect({
            host: SERVER, port: 22, username: USER, password: PASS,
            readyTimeout: 15000
        });
    });
    console.log('✓ מחובר');

    const sftp = await new Promise((resolve, reject) => {
        conn.sftp((err, s) => err ? reject(err) : resolve(s));
    });

    for (const f of FILES) {
        const lp = path.join(__dirname, f);
        if (!fs.existsSync(lp)) { console.log(`  דילוג (לא קיים): ${f}`); continue; }
        await new Promise((resolve, reject) => {
            sftp.fastPut(lp, REMOTE_DIR + '/' + f, err => err ? reject(err) : resolve());
        });
        console.log(`  ✓ ${f}`);
    }

    function ssh(cmd) {
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

    // שמור גיבוי git לפני deploy
    await ssh(`cd ${REMOTE_DIR} && git add server.js brain.js && git diff --cached --quiet || git commit -m "deploy $(date '+%d/%m %H:%M')"`);

    // restart ישיר — שומר על Chrome session ומחבר מהר יותר מ-stop+start
    await ssh(`pm2 restart bot-server`);
    await new Promise(r => setTimeout(r, 8000));
    await ssh(`pm2 logs bot-server --lines 10 --nostream`);

    conn.end();
    console.log('\n✅ עודכן!');
}

main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
