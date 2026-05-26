const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const KEYWORDS = ['ניקה', 'מאמן', 'שיבוץ', 'מולטיסקילס', 'כדוריד', 'זוזו', 'nike'];
const OUTPUT_FILE = 'voice_dna_raw.txt';
const MAX_MESSAGES_PER_CHAT = 500;

if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--max-old-space-size=512'],
        protocolTimeout: 120000
    }
});

client.on('qr', (qr) => {
    console.log('\n=== סרוק את הקוד הזה עם הוואטסאפ שלך ===\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('\n✓ מחובר. מחפש שיחות...\n');

    const chats = await client.getChats();
    const relevant = chats.filter(chat => {
        const name = (chat.name || '').toLowerCase();
        return KEYWORDS.some(kw => name.includes(kw.toLowerCase()));
    });

    console.log(`נמצאו ${relevant.length} שיחות. מתחיל חילוץ...\n`);

    let totalMessages = 0;

    for (let i = 0; i < relevant.length; i++) {
        const chat = relevant[i];
        console.log(`[${i + 1}/${relevant.length}] ${chat.name}`);

        try {
            const messages = await chat.fetchMessages({ limit: MAX_MESSAGES_PER_CHAT });
            const outgoing = messages.filter(m => m.fromMe && m.body && m.body.trim().length > 0);

            if (outgoing.length > 0) {
                const lines = outgoing.map(m => {
                    const date = new Date(m.timestamp * 1000).toLocaleDateString('he-IL');
                    return `[${chat.name}] [${date}]\n${m.body.trim()}`;
                }).join('\n---\n') + '\n---\n';

                fs.appendFileSync(OUTPUT_FILE, lines, 'utf8');
                totalMessages += outgoing.length;
                console.log(` → ${outgoing.length} הודעות`);
            } else {
                console.log(` → אין הודעות יוצאות`);
            }
        } catch (err) {
            console.log(` → שגיאה: ${err.message}`);
        }
    }

    console.log(`\n✓ סיום! ${totalMessages} הודעות נשמרו ב-${OUTPUT_FILE}`);
    process.exit(0);
});

client.on('auth_failure', () => {
    console.error('שגיאת חיבור');
    process.exit(1);
});

console.log('מתחבר לוואטסאפ...');
client.initialize();
