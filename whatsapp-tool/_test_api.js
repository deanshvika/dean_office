const http = require('http');
function test(text, label) {
  return new Promise(resolve => {
    const body = JSON.stringify({ text });
    const req = http.request({
      host: 'localhost', port: 80, path: '/api/test', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          console.log(label + ': intent=' + j.parsed?.intent + ' date=' + (j.parsed?.date||'-'));
          if (j.reply) console.log('  ' + j.reply.slice(0, 120));
        } catch(e) { console.log(label + ' FAIL:', data.slice(0, 150)); }
        resolve();
      });
    });
    req.on('error', e => { console.log(label + ' ERR:', e.message); resolve(); });
    req.write(body); req.end();
  });
}
(async () => {
  await test('מי עובד מחר?', 'שאלה1 — מי עובד');
  await test('מי יכול להחליף את אריק בכלנא ב-10/05?', 'שאלה2 — זמינות מחליפים');
  await test('מה הסטטוס של בית ספר רוקח ב-08/05?', 'שאלה3 — סטטוס מוקד');
  console.log('✅ בדיקות הסתיימו');
})();
