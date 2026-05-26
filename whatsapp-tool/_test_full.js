const http = require('http');

const TESTS = [
  { text: 'שחזר פעילות בכלנא ב-12/05',                            expect: 'restore',      label: 'restore' },
  { text: 'עדכן בלוח חילופים שאריק מבקש חילוף ב-12/05 בכלנא, יחליף ליאור', expect: 'substitution', label: 'substitution' },
  { text: 'שבץ את ליאור במקום אריק בכלנא ב-12/05',                expect: 'swap_coach',   label: 'swap_coach' },
  { text: 'בטל פעילות בכלנא ב-15/05',                             expect: 'cancel',       label: 'cancel' },
  { text: 'מי עובד בכלנא ב-14/05',                                 expect: 'query',        label: 'query (מוקד)' },
  { text: 'מי יכול להחליף את אריק בכלנא ב-14/05',                 expect: 'available_coaches', label: 'available_coaches' },
  { text: 'תוסיף את אריק לפעילות בכלנא ב-20/05 בשעה 08:00-09:00', expect: 'add_event',    label: 'add_event' },
  { text: 'עדכן שכר ל-ליאור ל-200',                                expect: 'update_wage',  label: 'update_wage' },
  { text: 'מה הלו"ז של אריק ב-14/05',                              expect: 'query',        label: 'query (מאמן)' },
  { text: 'כמה פעילויות ומה השכר הכולל מחר',                      expect: 'day_summary',  label: 'day_summary' },
];

const DELAY_MS = 62000;

function callApi(text) {
  return new Promise(resolve => {
    const body = JSON.stringify({ text });
    const req = http.request({
      host: 'localhost', port: 80, path: '/api/test', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve({ error: data.slice(0,100) }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(body); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  let pass = 0, failures = [];
  const n = TESTS.length;
  console.log('waiting 62s before first test (TPM cooldown)...');
  await sleep(62000);
  console.log('running ' + n + ' tests (~' + Math.ceil((n * DELAY_MS) / 1000) + 's)...\n');

  for (let i = 0; i < n; i++) {
    const { text, expect, label } = TESTS[i];
    if (i > 0) await sleep(DELAY_MS);
    const result = await callApi(text);
    const intent = result.parsed?.intent || ('ERR:' + (result.error || JSON.stringify(result)).slice(0,40));
    const ok = intent === expect;
    if (ok) { pass++; console.log('[OK] ' + label + ' -> ' + intent); }
    else { failures.push({ label, expect, got: intent }); console.log('[FAIL] ' + label + ': expected=' + expect + ' got=' + intent); }
  }

  console.log('\n=== ' + pass + '/' + n + ' passed ===');
  if (failures.length) { console.log('FAILURES:'); failures.forEach(f => console.log('  ' + f.label + ': ' + f.got)); }
})();
