// group_export.js — חילוץ רשימת חברי קבוצת וואטסאפ + יצירת קבוצה חדשה
// שימוש:
//   node group_export.js list "מאמני ניקה"        → מחלץ חברי קבוצה לקובץ
//   node group_export.js groups                    → מציג את כל הקבוצות שאתה חבר בהן
//   node group_export.js create "שם קבוצה" numbers.txt → יוצר קבוצה עם המספרים בקובץ
//
// משתמש בסשן נפרד (clientId: grouptool) כדי לא להפריע לבוט הראשי.

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2] || 'groups';
const ARG1 = process.argv[3] || '';
const ARG2 = process.argv[4] || '';

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'grouptool' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

client.on('qr', async (qr) => {
    console.log('\n================ סרוק את ה-QR הזה בוואטסאפ (מכשירים מקושרים) ================\n');
    qrcodeTerminal.generate(qr, { small: true });
    try {
        await QRCode.toFile(path.join(__dirname, 'grouptool_qr.png'), qr, { width: 400 });
        console.log('\nגם נשמר כתמונה: grouptool_qr.png (פתח אם ה-QR בטרמינל לא ברור)\n');
    } catch (_) {}
});

client.on('auth_failure', (m) => { console.error('שגיאת אימות:', m); process.exit(1); });
client.on('disconnected', (r) => { console.error('נותק:', r); });

client.on('ready', async () => {
    console.log(`\n✓ מחובר כ-${client.info.pushname} (${client.info.wid.user})\n`);
    try {
        if (MODE === 'groups') {
            await listGroups();
        } else if (MODE === 'list') {
            await exportGroup(ARG1);
        } else if (MODE === 'create') {
            await createGroup(ARG1, ARG2);
        } else {
            console.log('מצב לא מוכר. השתמש: groups | list | create');
        }
    } catch (e) {
        console.error('שגיאה:', e.message);
    }
    await client.destroy();
    process.exit(0);
});

async function listGroups() {
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup);
    console.log(`נמצאו ${groups.length} קבוצות:\n`);
    const lines = groups.map((g, i) => `${i + 1}. ${g.name}  —  ${g.participants?.length || '?'} חברים`);
    lines.forEach(l => console.log(l));
    fs.writeFileSync(path.join(__dirname, 'groups_list.txt'), lines.join('\n'), 'utf8');
    console.log('\nנשמר ל-groups_list.txt');
}

async function exportGroup(query) {
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup);
    const norm = s => (s || '').replace(/['"״]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const q = norm(query);
    let group = groups.find(g => norm(g.name) === q)
        || groups.find(g => norm(g.name).includes(q))
        || groups.find(g => q.split(' ').every(w => norm(g.name).includes(w)));
    if (!group) {
        console.log(`לא נמצאה קבוצה התואמת "${query}" (נסרקו ${groups.length} קבוצות, לא מציג אותן).`);
        console.log('נסה ניסוח אחר של שם הקבוצה.');
        return;
    }
    console.log(`קבוצה: ${group.name}  (${group.participants.length} חברים)\nמחלץ שמות אנשי קשר...\n`);

    const rows = [];
    for (let i = 0; i < group.participants.length; i++) {
        const p = group.participants[i];
        const number = p.id.user;
        let name = '';
        try {
            const contact = await client.getContactById(p.id._serialized);
            name = contact.name || contact.pushname || contact.verifiedName || '';
        } catch (_) {}
        rows.push({ idx: i + 1, name: name || '(לא שמור באנשי קשר)', number, isAdmin: p.isAdmin || p.isSuperAdmin });
    }

    // פלט טקסט מסודר
    const txt = [
        `קבוצה: ${group.name}`,
        `סה"כ חברים: ${rows.length}`,
        `נוצר: ${new Date().toLocaleString('he-IL')}`,
        '',
        ...rows.map(r => `${String(r.idx).padStart(3, ' ')}. ${r.name}${r.isAdmin ? ' [מנהל]' : ''}  —  ${r.number}`)
    ].join('\n');
    fs.writeFileSync(path.join(__dirname, 'group_members.txt'), txt, 'utf8');
    fs.writeFileSync(path.join(__dirname, 'group_members.json'), JSON.stringify({ group: group.name, members: rows }, null, 2), 'utf8');
    console.log(txt);
    console.log('\n✓ נשמר ל-group_members.txt ול-group_members.json');
}

async function createGroup(name, numbersFile) {
    if (!name || !numbersFile) { console.log('שימוש: create "שם" numbers.txt'); return; }
    const raw = fs.readFileSync(path.join(__dirname, numbersFile), 'utf8');
    const numbers = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        .map(n => n.replace(/[^\d]/g, ''))
        .map(n => n.startsWith('0') ? '972' + n.slice(1) : (n.startsWith('972') ? n : n))
        .map(n => n + '@c.us');
    console.log(`יוצר קבוצה "${name}" עם ${numbers.length} משתתפים...`);
    const res = await client.createGroup(name, numbers);
    console.log('תוצאה:', JSON.stringify(res, null, 2));
    fs.writeFileSync(path.join(__dirname, 'create_group_result.json'), JSON.stringify(res, null, 2), 'utf8');
    console.log('✓ נשמר ל-create_group_result.json');
}

client.initialize();
