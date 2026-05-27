const http = require('http');
const { spawn } = require('child_process');
const { URL } = require('url');

const SPREADSHEET_ID = '1gz-Dzdak8ky2bpKbWFwU6iPr6tURgwrbwNBDZJcpPhg';
const CLIENT_ID = '1072944905499-vm2v2i5dvn0a0d2o4ca36i1vge8cvbn0.apps.googleusercontent.com';
const CLIENT_SECRET = 'v6V3fKV_zWU7iw1DrpO1rknX';
const PORT = 55218;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

async function getToken() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, REDIRECT);
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        if (err) {
          res.end('OAuth error: ' + err);
          server.close();
          reject(new Error(err));
          return;
        }
        if (!code) {
          res.end('waiting...');
          return;
        }
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
          res.end('<html dir="rtl"><body style="font-family:Arial;text-align:center;padding:50px;background:#000;color:#fff"><h1>✅ אישור התקבל!</h1><p>אפשר לסגור את החלון הזה.</p></body></html>');
          server.close();
          resolve(tok.access_token);
        } else {
          res.end('Token exchange failed: ' + JSON.stringify(tok));
          server.close();
          reject(new Error('no token: ' + JSON.stringify(tok)));
        }
      } catch (e) {
        res.end('error: ' + e.message);
        server.close();
        reject(e);
      }
    });
    server.listen(PORT, () => {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent&login_hint=deanshvika@gmail.com`;
      console.log('פותח Chrome (פרופיל Default) לאישור...');
      const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      spawn(chromeExe, ['--profile-directory=Default', authUrl], { detached: true, stdio: 'ignore' }).unref();
    });
    setTimeout(() => { server.close(); reject(new Error('timeout - אישור לא הגיע תוך 120 שניות')); }, 120000);
  });
}

async function main() {
  const token = await getToken();
  console.log('Token התקבל. מביא מטא-דאטה...');

  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets(properties(sheetId,title,gridProperties))`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const meta = await metaRes.json();
  if (meta.error) throw new Error('API error: ' + meta.error.message);

  console.log(`גיליונות בקובץ (${meta.sheets.length}):`);
  meta.sheets.forEach(s => console.log(`  - "${s.properties.title}" (${s.properties.gridProperties.rowCount}x${s.properties.gridProperties.columnCount})`));

  const requests = [];
  for (const sheet of meta.sheets) {
    const sheetId = sheet.properties.sheetId;
    const rows = sheet.properties.gridProperties.rowCount;
    const cols = sheet.properties.gridProperties.columnCount;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: cols },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0, green: 0, blue: 0 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat.foregroundColor)'
      }
    });
  }

  console.log(`שולח ${requests.length} בקשות עיצוב...`);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ requests })
  });
  const d = await r.json();
  if (!r.ok) throw new Error('batchUpdate failed: ' + (d?.error?.message || r.status));
  console.log('✅ רקע שחור הוחל על כל הגיליונות בקובץ!');
}

main().catch(e => { console.error('שגיאה:', e.message); process.exit(1); });
