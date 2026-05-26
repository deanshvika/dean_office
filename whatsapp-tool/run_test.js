const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const SERVER = '164.92.142.75';
const USER = 'root';
const PASS = 'Dean9466048Dd';
const REMOTE_DIR = '/root/whatsapp-tool';

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

    const lp = path.join(__dirname, '_test_full.js');
    await new Promise((resolve, reject) => {
        sftp.fastPut(lp, REMOTE_DIR + '/_test_full.js', err => err ? reject(err) : resolve());
    });
    console.log('✓ הועלה _test_full.js\n');

    await new Promise((resolve, reject) => {
        conn.exec(`cd ${REMOTE_DIR} && node _test_full.js; rm -f _test_full.js`, (err, stream) => {
            if (err) return reject(err);
            stream.on('data', d => process.stdout.write(d.toString()));
            stream.stderr.on('data', d => process.stdout.write(d.toString()));
            stream.on('close', resolve);
        });
    });

    conn.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
