// קליינט ניקוד אוטומטי — Dicta Nakdan (שירות חינמי, state-of-the-art לעברית).
// שימוש: לבוטסטרפ/הרחבת content_banks/niqqud_bank.yaml ולמילים חדשות בימי שפה/אנגלית.
// לא נקרא בזמן רינדור — הבנק הסגור מספק את הטקסט. זה כלי הקמה/הרחבה.
//
//   import { nakdanText } from './niqqud_client.mjs';
//   const menuqad = await nakdanText('הקבוצה מתכוננת לפעילות');
//
// דורש חיבור אינטרנט. תמיד לעבור אימות אנושי חד-פעמי לפני הכנסה לבנק.

const ENDPOINT = 'https://nakdan-2-0.loadbalancer.dicta.org.il/api';

export async function nakdanText(plain, { genre = 'modern' } = {}) {
  if (!plain || !plain.trim()) return plain;
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'nakdan', data: plain, genre, addmorph: false, matchpartial: true }),
  });
  if (!res.ok) throw new Error(`Nakdan HTTP ${res.status}`);
  const tokens = await res.json();
  // כל token: { word, sep, options: [{ w: "מְנֻקָּד", ... }] }
  return tokens.map((t) => {
    if (t.options && t.options.length && t.options[0].w) {
      return String(t.options[0].w).replace(/\|/g, '');   // הסרת מפרידי הברות אם קיימים
    }
    return t.word ?? t.sep ?? '';
  }).join('');
}

// בדיקת חיבור מהירה: node scripts/niqqud_client.mjs "טקסט לבדיקה"
if (process.argv[1] && process.argv[1].endsWith('niqqud_client.mjs')) {
  const text = process.argv[2] || 'הקבוצה מתכוננת לפעילות';
  nakdanText(text)
    .then((r) => console.log('מקור:  ' + text + '\nמנוקד: ' + r))
    .catch((e) => { console.error('שגיאת Nakdan:', e.message); process.exit(1); });
}
