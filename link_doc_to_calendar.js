const http = require('http');
const { spawn } = require('child_process');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
const CLIENT_SECRET = 'v6V3fKV_zWU7iw1DrpO1rknX';
const PORT = 55218;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar'
].join(' ');

const TOKEN_CACHE = path.join(__dirname, '.oauth_token.json');
const DOC_TITLE = 'יעדים צוות שוטף טווח קצר';
const TARGET_LINE = 170;

// מחר 11:30 → 2026-05-28 11:30 ישראל
const START_ISO = '2026-05-28T11:30:00+03:00';
const END_ISO   = '2026-05-28T12:30:00+03:00';

async function getToken() {
  if (fs.existsSync(TOKEN_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
      if (cached.refresh_token) {
        const params = new URLSearchParams({
          client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          refresh_token: cached.refresh_token, grant_type: 'refresh_token'
        });
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });
        const tok = await r.json();
        if (tok.access_token) {
          console.log('✅ access_token חודש מ-refresh_token');
          return tok.access_token;
        }
      }
    } catch (e) { console.log('cache refresh failed:', e.message); }
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, REDIRECT);
        const code = u.searchParams.get('code');
        if (!code) { res.end('waiting...'); return; }
        const params = new URLSearchParams({
          code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT, grant_type: 'authorization_code'
        });
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString()
        });
        const tok = await r.json();
        if (tok.access_token) {
          res.end('<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:50px;background:#000;color:#fff"><h1>✅ אישור התקבל</h1></body></html>');
          server.close();
          if (tok.refresh_token) fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tok, null, 2));
          resolve(tok.access_token);
        } else {
          res.end('Token exchange failed: ' + JSON.stringify(tok));
          server.close();
          reject(new Error('no token: ' + JSON.stringify(tok)));
        }
      } catch (e) {
        res.end('error: ' + e.message); server.close(); reject(e);
      }
    });
    server.listen(PORT, () => {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&prompt=consent&login_hint=deanshvika@gmail.com`;
      console.log('\n=== נדרש אישור OAuth ===');
      console.log('פותח Chrome אוטומטית. אם לא נפתח — הדבק את ה-URL הבא בדפדפן:');
      console.log(authUrl);
      console.log('\nממתין עד 5 דקות לאישור...\n');
      const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      spawn(chromeExe, ['--profile-directory=Default', authUrl], { detached: true, stdio: 'ignore' }).unref();
    });
    setTimeout(() => { server.close(); reject(new Error('timeout - אישור לא הגיע תוך 5 דקות')); }, 300000);
  });
}

async function api(method, url, token, body) {
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

function extractLines(doc) {
  const lines = [];
  for (const el of doc.body.content) {
    if (el.paragraph) {
      const text = (el.paragraph.elements || []).map(e => e.textRun?.content || '').join('');
      lines.push({
        startIndex: el.startIndex,
        endIndex: el.endIndex,
        text,
        paragraphStyle: el.paragraph.paragraphStyle || {}
      });
    }
  }
  return lines;
}

async function main() {
  const token = await getToken();

  // 1) חפש את המסמך לפי שם
  console.log(`\nמחפש מסמך בשם "${DOC_TITLE}"...`);
  const q = encodeURIComponent(`name='${DOC_TITLE}' and mimeType='application/vnd.google-apps.document' and trashed=false`);
  const search = await api('GET', `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10`, token);
  if (!search.files || !search.files.length) throw new Error('לא נמצא מסמך בשם זה.');
  console.log('נמצאו מסמכים:');
  search.files.forEach((f, i) => console.log(`  ${i+1}. ${f.name}  id=${f.id}  modified=${f.modifiedTime}`));
  const docId = search.files[0].id;
  const DOC_URL = `https://docs.google.com/document/d/${docId}/edit`;
  console.log(`✅ DOC ID: ${docId}`);

  // 2) קרא את תוכן המסמך
  let doc = await api('GET', `https://docs.googleapis.com/v1/documents/${docId}`, token);
  let lines = extractLines(doc);
  console.log(`סה"כ פסקאות: ${lines.length}`);
  console.log('3 שורות אחרונות:');
  lines.slice(-3).forEach((l, i) => {
    const idx = lines.length - 3 + i + 1;
    console.log(`  ${idx}: "${l.text.slice(0, 80).replace(/\n/g, '\\n')}"`);
  });

  const targetIdx = Math.min(TARGET_LINE, lines.length) - 1;
  let target = lines[targetIdx];
  if (!target.text.trim()) throw new Error(`שורה ${targetIdx + 1} ריקה. אין מה לקשר.`);
  const originalStyle = target.paragraphStyle.namedStyleType || 'NORMAL_TEXT';
  console.log(`שורה יעד (${targetIdx + 1}): "${target.text.slice(0, 100).replace(/\n/g, '\\n')}" [סגנון: ${originalStyle}]`);

  // 3) הפוך את השורה ל-HEADING_6 כדי לקבל headingId לעוגן URL
  // (Heading 6 הוא הקטן ביותר — מינימום שינוי ויזואלי)
  console.log('מחיל סגנון HEADING_6 כדי לקבל עוגן anchor...');
  await api('POST', `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, token, {
    requests: [{
      updateParagraphStyle: {
        range: { startIndex: target.startIndex, endIndex: target.endIndex },
        paragraphStyle: { namedStyleType: 'HEADING_6' },
        fields: 'namedStyleType'
      }
    }]
  });

  // קרא שוב כדי לקבל את ה-headingId
  doc = await api('GET', `https://docs.googleapis.com/v1/documents/${docId}`, token);
  lines = extractLines(doc);
  target = lines[targetIdx];
  const headingId = target.paragraphStyle.headingId;
  if (!headingId) throw new Error('headingId לא הוקצה לשורה.');
  console.log(`✅ headingId: ${headingId}`);
  const ANCHOR_URL = `${DOC_URL}#heading=${headingId}`;
  console.log(`עוגן לשורה: ${ANCHOR_URL}`);

  // 4) צור אירוע ביומן עם תיאור שמכיל קישור לשורה
  console.log(`\nיוצר אירוע ביומן: ${START_ISO}`);
  const calBody = {
    summary: target.text.trim().slice(0, 200) || DOC_TITLE,
    description: `📍 קפיצה ישירה לשורה במסמך:\n${ANCHOR_URL}\n\nמסמך: ${DOC_TITLE}\nשורה: ${targetIdx + 1}`,
    start: { dateTime: START_ISO, timeZone: 'Asia/Jerusalem' },
    end:   { dateTime: END_ISO,   timeZone: 'Asia/Jerusalem' },
    reminders: { useDefault: true },
    source: { title: DOC_TITLE, url: ANCHOR_URL }
  };
  const event = await api('POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events', token, calBody);
  console.log(`✅ אירוע: ${event.htmlLink}`);

  // 5) הוסף קישור והדגשה על השורה במסמך (מצביעים לאירוע)
  const lineText = target.text;
  const hasNewline = lineText.endsWith('\n');
  const linkStart = target.startIndex;
  const linkEnd = target.endIndex - (hasNewline ? 1 : 0);

  console.log('מוסיף hyperlink + highlight על השורה...');
  await api('POST', `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, token, {
    requests: [
      {
        updateTextStyle: {
          range: { startIndex: linkStart, endIndex: linkEnd },
          textStyle: {
            link: { url: event.htmlLink },
            underline: true,
            foregroundColor: { color: { rgbColor: { red: 0.06, green: 0.32, blue: 0.78 } } }
          },
          fields: 'link,underline,foregroundColor'
        }
      },
      {
        updateTextStyle: {
          range: { startIndex: linkStart, endIndex: linkEnd },
          textStyle: {
            backgroundColor: { color: { rgbColor: { red: 1.0, green: 0.95, blue: 0.6 } } }
          },
          fields: 'backgroundColor'
        }
      }
    ]
  });

  console.log('\n=== ✅ סיום ===');
  console.log(`Doc:    ${DOC_URL}`);
  console.log(`Line:   ${targetIdx + 1} / ${lines.length}`);
  console.log(`Anchor: ${ANCHOR_URL}`);
  console.log(`Event:  ${event.htmlLink}`);
  console.log('\nמעבר על השורה במסמך → קליק → קופץ לאירוע.');
  console.log('בתיאור האירוע יש קישור שקופץ ישר לשורה.');
}

main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
