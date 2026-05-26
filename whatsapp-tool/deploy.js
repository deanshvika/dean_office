const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const SERVER = '164.92.142.75';
const USER = 'root';
const PASS = 'Dean9466048Dd';
const LOCAL_DIR = __dirname;
const REMOTE_DIR = '/root/whatsapp-tool';

// קבצים חיוניים בלבד (לא session Chrome שנועל)
const COPY_FILES = [
    'brain.js', 'server.js', 'package.json', 'package-lock.json',
    'ecosystem.config.js', '.env', 'base44_token.json',
    'schedule_data.json', 'setup-server.sh'
];

// תיקיות לסנכרון (ללא Chrome cache)
const COPY_DIRS = ['.wwebjs_auth', 'base44_userdata'];
const SKIP_SUBDIRS = ['Cache', 'Cache_Data', 'Code Cache', 'GPUCache', 'ShaderCache', 'DawnCache'];

function ssh(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let out = '', errOut = '';
            stream.on('data', d => { out += d; process.stdout.write(d.toString()); });
            stream.stderr.on('data', d => { errOut += d; });
            stream.on('close', (code) => {
                if (code !== 0 && !errOut.includes('already')) reject(new Error(`exit ${code}: ${errOut.slice(0,200)}`));
                else resolve(out);
            });
        });
    });
}

function upload(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (err) => {
            if (err) { console.log(`  דילוג (נעול): ${path.basename(localPath)}`); resolve(); }
            else resolve();
        });
    });
}

function mkdirRemote(sftp, dir) {
    return new Promise(resolve => sftp.mkdir(dir, () => resolve()));
}

async function uploadDir(sftp, localDir, remoteDir, skipDirs = []) {
    await mkdirRemote(sftp, remoteDir);
    let entries;
    try { entries = fs.readdirSync(localDir, { withFileTypes: true }); }
    catch(e) { return; }

    for (const entry of entries) {
        if (skipDirs.includes(entry.name)) continue;
        if (entry.name.startsWith('LOG')) continue;
        if (entry.name === 'LOCK') continue;
        const lp = path.join(localDir, entry.name);
        const rp = remoteDir + '/' + entry.name;
        if (entry.isDirectory()) {
            await uploadDir(sftp, lp, rp, skipDirs);
        } else {
            process.stdout.write(`  ${entry.name}\n`);
            await upload(sftp, lp, rp);
        }
    }
}

async function main() {
    const conn = new Client();
    await new Promise((resolve, reject) => {
        conn.on('ready', resolve).on('error', reject).connect({
            host: SERVER, port: 22, username: USER, password: PASS,
            readyTimeout: 30000
        });
    });
    console.log('✓ מחובר לשרת');

    const sftp = await new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
    });

    // צור תיקיית פרויקט
    await mkdirRemote(sftp, REMOTE_DIR);

    console.log('\n=== מעלה קבצים ראשיים ===');
    for (const f of COPY_FILES) {
        const lp = path.join(LOCAL_DIR, f);
        if (fs.existsSync(lp)) {
            process.stdout.write(`  ${f}\n`);
            await upload(sftp, lp, REMOTE_DIR + '/' + f);
        }
    }

    console.log('\n=== מעלה session WhatsApp ===');
    await uploadDir(sftp, path.join(LOCAL_DIR, '.wwebjs_auth'), REMOTE_DIR + '/.wwebjs_auth', SKIP_SUBDIRS);

    console.log('\n=== מעלה session Base44 ===');
    await uploadDir(sftp, path.join(LOCAL_DIR, 'base44_userdata'), REMOTE_DIR + '/base44_userdata', SKIP_SUBDIRS);

    console.log('\n✓ קבצים הועלו');

    console.log('\n=== מתקין Node.js 20 ===');
    await ssh(conn, 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>&1 | tail -2');
    await ssh(conn, 'apt-get install -y nodejs 2>&1 | tail -2');
    console.log('✓ Node.js');

    console.log('\n=== מתקין Chrome ===');
    await ssh(conn, 'apt-get install -y wget 2>&1 | tail -1');
    await ssh(conn, 'wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb 2>&1');
    await ssh(conn, 'apt-get install -y /tmp/chrome.deb 2>&1 | tail -3 || apt-get install -f -y 2>&1 | tail -3');
    console.log('✓ Chrome');

    console.log('\n=== מתקין PM2 ===');
    await ssh(conn, 'npm install -g pm2 2>&1 | tail -2');
    console.log('✓ PM2');

    console.log('\n=== מתקין npm dependencies ===');
    await ssh(conn, `cd ${REMOTE_DIR} && npm install 2>&1 | tail -3`);
    console.log('✓ dependencies');

    console.log('\n=== PM2 startup ===');
    try {
        const startupCmd = await ssh(conn, 'pm2 startup systemd -u root --hp /root 2>&1');
        const match = startupCmd.match(/sudo\s+.+/);
        if (match) await ssh(conn, match[0]);
    } catch(e) { console.log('startup (המשך בכל זאת)'); }

    console.log('\n=== מפעיל בוט ===');
    await ssh(conn, `cd ${REMOTE_DIR} && pm2 stop brain-bot 2>/dev/null || true`);
    await ssh(conn, `cd ${REMOTE_DIR} && pm2 stop bot-server 2>/dev/null || true`);
    await ssh(conn, `cd ${REMOTE_DIR} && pm2 delete brain-bot 2>/dev/null || true`);
    await ssh(conn, `cd ${REMOTE_DIR} && pm2 start ecosystem.config.js`);
    await ssh(conn, 'pm2 save');

    console.log('\n=== לוגים (אחרי 15 שניות) ===');
    await new Promise(r => setTimeout(r, 15000));
    await ssh(conn, 'pm2 logs bot-server --lines 20 --nostream');

    conn.end();
    console.log('\n✅ השרת מוכן!');
}

main().catch(e => { console.error('\n❌ שגיאה:', e.message); process.exit(1); });
