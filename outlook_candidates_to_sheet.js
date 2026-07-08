/*
 * outlook_candidates_to_sheet.js
 * -------------------------------------------------------------------------
 * מחלץ מיילי "פנייה חדשה לגיוס מאמנים" מ-Outlook הקלאסי (דרך COM, בלי סיסמה)
 * ומסדר אותם ב-Google Sheet. הרצה על-פי-פקודה:  node outlook_candidates_to_sheet.js
 *
 * זרימה:
 *   1) read_outlook_candidates.ps1  → קורא את התיבה דרך COM → JSON (utf8) בקובץ זמני
 *   2) חילוץ שדות מובנים (regex לפי תוויות עבריות)
 *   3) OAuth ל-Google (cache+refresh), יצירת/איתור הגיליון
 *   4) דדופ לפי אימייל (עמודת מפתח מוסתרת) → append רק לחדשים
 *
 * דורש: Outlook הקלאסי מותקן (COM). אישור Google חד-פעמי (נשמר ב-.oauth_token_candidates.json).
 */
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { URL } = require('url');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- הגדרות ----------
const SUBJECT_MARKER = 'פנייה חדשה לגיוס מאמנים';
const PS_SCRIPT = path.join(__dirname, 'read_outlook_candidates.ps1');
const SHEET_URL_FILE = path.join(__dirname, 'candidates_sheet_url.txt');
const SHEET_FILE_TITLE = 'מועמדים לגיוס מאמנים';
const TAB_TITLE = 'מועמדים';

const CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
const CLIENT_SECRET = 'v6V3fKV_zWU7iw1DrpO1rknX';
const OAUTH_PORT = 55218;
const REDIRECT = `http://localhost:${OAUTH_PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_CACHE = path.join(__dirname, '.oauth_token_candidates.json');

// כותרות הטבלה. העמודה האחרונה (_key) מוסתרת ומשמשת לדדופ.
const HEADERS = [
  'תאריך פנייה', 'שם מלא', 'טלפון', 'אימייל', 'גיל', 'עיר מגורים',
  'ניסיון עם ילדים', 'ימים פנויים בשבוע', 'זמינות בוקר', 'זמינות צהריים',
  'פרילנס', 'ביטוח אחריות מקצועית', 'קישור לקו"ח', 'מוטיבציה', '_key'
];
const KEY_COL_INDEX = HEADERS.length - 1;            // עמודת המפתח (0-based)
const KEY_COL_LETTER = String.fromCharCode(65 + KEY_COL_INDEX); // 'O'

// התוויות בגוף המייל, לפי הסדר. משמשות גם כעוגני-עצירה בחילוץ.
const LABELS = [
  'שם מלא', 'גיל', 'עיר מגורים', 'טלפון נייד', 'אימייל',
  'ניסיון וזמינות', 'ניסיון בעבודה עם ילדים', 'ימים פנויים בשבוע',
  'זמינות בוקר', 'זמינות צהריים', 'פרטים נוספים', 'פרילנס',
  'ביטוח אחריות מקצועית', 'קישור לקורות חיים / פרופיל מקצועי',
  'מוטיבציה', 'תאריך שליחה', 'המשך טיפול מומלץ'
];

// ---------- חילוץ ----------
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// מאתר "תווית:" ומחזיר {index, valueStart} או -1
function findLabel(body, label, from = 0) {
  const re = new RegExp(escapeRe(label) + '\\s*:');
  const m = re.exec(body.slice(from));
  if (!m) return -1;
  return { index: from + m.index, valueStart: from + m.index + m[0].length };
}

// מחזיר את הערך שבין "label:" לתווית הידועה הבאה
function field(body, label) {
  const f = findLabel(body, label);
  if (f === -1) return '';
  let end = body.length;
  for (const other of LABELS) {
    if (other === label) continue;
    const o = findLabel(body, other, f.valueStart);
    if (o !== -1 && o.index < end) end = o.index;
  }
  return body.slice(f.valueStart, end).replace(/\s+/g, ' ').trim();
}

function normalizePhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits[0] === '0') return digits.slice(0, 3) + '-' + digits.slice(3);
  if (digits.length === 9 && digits[0] === '0') return digits.slice(0, 2) + '-' + digits.slice(2);
  return raw.trim();
}

function extractEmail(s) {
  const m = (s || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}

function isForward(subject) {
  const s = (subject || '').trim().toLowerCase();
  return s.startsWith('fw:') || s.startsWith('fwd:') || s.startsWith('re:');
}

function fmtDate(iso, fallback) {
  let d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) d = fallback ? new Date(fallback) : null;
  if (!d || isNaN(d.getTime())) return (iso || fallback || '').trim();
  try {
    return d.toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return d.toISOString(); }
}

// ממיר מייל גולמי (מ-PS) לרשומת מועמד מסודרת
function parseCandidate(item) {
  const body = item.Body || '';
  const name = field(body, 'שם מלא') ||
    ((item.Subject || '').split(SUBJECT_MARKER)[1] || '').match(/[–\-]\s*(.+?)\s*\|/)?.[1]?.trim() || '';
  const phone = normalizePhone(field(body, 'טלפון נייד'));
  const email = extractEmail(field(body, 'אימייל'));
  const key = email || phone.replace(/\D/g, '') || (name + '|' + (item.Received || ''));

  return {
    key,
    isForward: isForward(item.Subject),
    received: item.Received || '',
    row: [
      fmtDate(field(body, 'תאריך שליחה'), item.Received),
      name || '⚠ לבדיקה',
      phone,
      email,
      field(body, 'גיל'),
      field(body, 'עיר מגורים'),
      field(body, 'ניסיון בעבודה עם ילדים'),
      field(body, 'ימים פנויים בשבוע'),
      field(body, 'זמינות בוקר'),
      field(body, 'זמינות צהריים'),
      field(body, 'פרילנס'),
      field(body, 'ביטוח אחריות מקצועית'),
      field(body, 'קישור לקורות חיים / פרופיל מקצועי'),
      field(body, 'מוטיבציה'),
      key
    ]
  };
}

// ---------- קריאת Outlook (PowerShell COM) ----------
function readOutlook() {
  const outFile = path.join(os.tmpdir(), `nika_candidates_${process.pid}.json`);
  const b64 = Buffer.from(SUBJECT_MARKER, 'utf8').toString('base64');
  console.log('קורא את תיבת Outlook (COM)...');
  const r = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', PS_SCRIPT, '-MarkerB64', b64, '-OutFile', outFile
  ], { encoding: 'utf8', windowsHide: true });

  if (r.error) throw new Error('הרצת PowerShell נכשלה: ' + r.error.message);
  if (!fs.existsSync(outFile)) {
    throw new Error('PowerShell לא יצר פלט. stdout=' + (r.stdout || '') + ' stderr=' + (r.stderr || ''));
  }
  let raw = fs.readFileSync(outFile, 'utf8');
  try { fs.unlinkSync(outFile); } catch {}
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // הסר BOM אם יש
  const data = JSON.parse(raw);
  if (!data.ok) throw new Error('שגיאת Outlook COM: ' + (data.error || 'לא ידוע'));
  const items = Array.isArray(data.items) ? data.items : (data.items ? [data.items] : []);
  console.log(`נמצאו ${items.length} מיילים תואמים בתיבה.`);
  return items;
}

// ---------- OAuth ל-Google ----------
async function getGoogleToken() {
  if (fs.existsSync(TOKEN_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
      if (cached.refresh_token) {
        const params = new URLSearchParams({
          client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          refresh_token: cached.refresh_token, grant_type: 'refresh_token'
        });
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
        });
        const tok = await r.json();
        if (tok.access_token) { console.log('✅ access_token חודש מהמטמון'); return tok.access_token; }
      }
    } catch (e) { console.log('רענון מטמון נכשל, פותח אישור חדש:', e.message); }
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, REDIRECT);
        const err = u.searchParams.get('error');
        if (err) { res.end('OAuth error: ' + err); server.close(); return reject(new Error(err)); }
        const code = u.searchParams.get('code');
        if (!code) { res.end('waiting...'); return; }
        const params = new URLSearchParams({
          code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT, grant_type: 'authorization_code'
        });
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString()
        });
        const tok = await r.json();
        if (tok.access_token) {
          res.end('<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:50px;background:#000;color:#fff"><h1>✅ אישור התקבל!</h1><p>אפשר לחזור לטרמינל.</p></body></html>');
          server.close();
          if (tok.refresh_token) fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tok, null, 2));
          resolve(tok.access_token);
        } else { res.end('Token exchange failed: ' + JSON.stringify(tok)); server.close(); reject(new Error('no token: ' + JSON.stringify(tok))); }
      } catch (e) { res.end('error: ' + e.message); server.close(); reject(e); }
    });
    server.listen(OAUTH_PORT, async () => {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent&login_hint=deanshvika@gmail.com`;
      console.log('\n=== נדרש אישור Google חד-פעמי ===\nאם החלון לא עולה — הדבק בדפדפן שמחובר ל-deanshvika@gmail.com:\n' + authUrl + '\n');
      // מנסה לפתוח בפרופיל האוטומציה (מחובר ל-deanshvika@gmail.com), ובחזית
      try {
        const { getBrowser } = require('./chrome_automation');
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(authUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.bringToFront();
        browser.disconnect();
        console.log('נפתח מסך האישור בפרופיל האוטומציה. אשר שם.');
      } catch (e) {
        console.log('פתיחה בפרופיל האוטומציה נכשלה (' + e.message + '). פותח Chrome רגיל...');
        const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        spawn(chromeExe, ['--profile-directory=Default', authUrl], { detached: true, stdio: 'ignore' }).unref();
      }
    });
    setTimeout(() => { server.close(); reject(new Error('timeout - אישור לא הגיע תוך 10 דקות')); }, 600000);
  });
}

async function sheetsApi(method, url, token, body) {
  const r = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}: ${typeof data === 'string' ? data : data?.error?.message || JSON.stringify(data)}`);
  return data;
}

// ---------- יצירה/איתור הגיליון ----------
async function getOrCreateSheet(token) {
  if (fs.existsSync(SHEET_URL_FILE)) {
    const content = fs.readFileSync(SHEET_URL_FILE, 'utf8').trim();
    const idMatch = content.match(/\/d\/([A-Za-z0-9_-]+)/) || content.match(/^([A-Za-z0-9_-]{20,})$/m);
    if (idMatch) {
      const spreadsheetId = idMatch[1];
      const meta = await sheetsApi('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetUrl,sheets(properties(sheetId,title))`, token);
      const sh = meta.sheets[0].properties;
      console.log(`✅ גיליון קיים: ${meta.spreadsheetUrl}`);
      return { spreadsheetId, sheetId: sh.sheetId, tabTitle: sh.title, url: meta.spreadsheetUrl, created: false };
    }
  }

  console.log('יוצר גיליון חדש...');
  const created = await sheetsApi('POST', 'https://sheets.googleapis.com/v4/spreadsheets', token, {
    properties: { title: SHEET_FILE_TITLE, locale: 'iw_IL' },
    sheets: [{ properties: { title: TAB_TITLE, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } }]
  });
  const spreadsheetId = created.spreadsheetId;
  const sheetId = created.sheets[0].properties.sheetId;
  const url = created.spreadsheetUrl;

  // כותרות
  await sheetsApi('PUT',
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${TAB_TITLE}'!A1`)}?valueInputOption=RAW`,
    token, { values: [HEADERS] });

  // עיצוב כותרת + הסתרת עמודת המפתח
  await sheetsApi('POST', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, token, {
    requests: [
      { repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HEADERS.length },
        cell: { userEnteredFormat: { backgroundColor: { red: 0.11, green: 0.24, blue: 0.42 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true }, verticalAlignment: 'MIDDLE' } },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
      }},
      { updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: KEY_COL_INDEX, endIndex: KEY_COL_INDEX + 1 },
        properties: { hiddenByUser: true }, fields: 'hiddenByUser'
      }}
    ]
  });

  fs.writeFileSync(SHEET_URL_FILE, url + '\n');
  console.log(`✅ גיליון נוצר: ${url}`);
  return { spreadsheetId, sheetId, tabTitle: TAB_TITLE, url, created: true };
}

async function getExistingKeys(token, spreadsheetId, tabTitle) {
  const range = encodeURIComponent(`'${tabTitle}'!${KEY_COL_LETTER}2:${KEY_COL_LETTER}`);
  const data = await sheetsApi('GET', `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, token);
  const keys = new Set();
  (data.values || []).forEach(r => { if (r[0]) keys.add(r[0]); });
  return keys;
}

// ---------- main ----------
async function main() {
  const items = readOutlook();

  // חילוץ + דדופ פנימי (עדיפות למקור על פני Fw, וכרונולוגי)
  const parsed = items.map(parseCandidate)
    .sort((a, b) => (a.isForward - b.isForward) || (new Date(a.received) - new Date(b.received)));
  const byKey = new Map();
  for (const c of parsed) if (!byKey.has(c.key)) byKey.set(c.key, c);
  const candidates = [...byKey.values()].sort((a, b) => new Date(a.received) - new Date(b.received));
  console.log(`מועמדים ייחודיים לאחר דדופ פנימי: ${candidates.length}`);

  const token = await getGoogleToken();
  const sheet = await getOrCreateSheet(token);
  const existing = await getExistingKeys(token, sheet.spreadsheetId, sheet.tabTitle);

  const fresh = candidates.filter(c => !existing.has(c.key));
  const skipped = candidates.length - fresh.length;

  if (fresh.length) {
    await sheetsApi('POST',
      `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/${encodeURIComponent(`'${sheet.tabTitle}'!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      token, { values: fresh.map(c => c.row) });
  }

  const needReview = fresh.filter(c => c.row[1] === '⚠ לבדיקה').length;
  console.log('\n=== סיכום ===');
  console.log(`מיילים תואמים בתיבה:      ${items.length}`);
  console.log(`מועמדים ייחודיים:          ${candidates.length}`);
  console.log(`נוספו לגיליון (חדשים):     ${fresh.length}`);
  console.log(`דולגו (כבר קיימים):         ${skipped}`);
  if (needReview) console.log(`⚠ שם לא זוהה (לבדיקה ידנית): ${needReview}`);
  console.log(`\nהגיליון: ${sheet.url}`);
  if (fresh.length) {
    console.log('\nנוספו:');
    fresh.forEach(c => console.log(`  • ${c.row[1]}  |  ${c.row[2]}  |  ${c.row[3]}`));
  }
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}

module.exports = { readOutlook, parseCandidate, field, normalizePhone, extractEmail, fmtDate };
