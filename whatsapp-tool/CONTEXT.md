# הקשר מלא — בוט WhatsApp ניהול AntiGravity

> הדבק קובץ זה בתחילת שיחת Claude חדשה כדי לקבל הקשר מלא על המערכת.

---

## תיאור כללי

בוט WhatsApp מולטי-יוזר לניהול לוח שיבוצים של מאמני AntiGravity.
הבוט מקשיב להקלטות קוליות בעברית, מתמלל אותן (Whisper), מפענח את הכוונה (Claude Haiku), ומחזיר מידע מהלו"ז או מבצע פעולות ב-Base44.

---

## שרת

| פרמטר | ערך |
|-------|-----|
| IP | `164.92.142.75` |
| ספק | DigitalOcean |
| OS | Ubuntu |
| משתמש | `root` |
| סיסמה | `Dean9466048Dd` |
| ניהול תהליך | PM2 (`bot-server`) |
| פורט HTTP | 80 |
| תיקיית פרויקט | `/root/whatsapp-tool` |

### פקודות שרת שימושיות (SSH)
```bash
pm2 logs bot-server --lines 40 --nostream   # לוגים אחרונים
pm2 restart bot-server                       # restart
pm2 status                                   # סטטוס תהליכים
```

---

## קבצים ראשיים (מקומי)

| קובץ | תפקיד |
|------|--------|
| `server.js` | הקוד הראשי — בוט + Express |
| `brain.js` | (לא בשימוש פעיל כרגע) |
| `deploy.js` | deploy מלא (Node+Chrome+PM2) |
| `ecosystem.config.js` | הגדרות PM2 |
| `.env` | ANTHROPIC_API_KEY, GROQ_API_KEY |
| `base44_token.json` | `{ token, appId }` לגישה ל-Base44 |
| `schedule_data.json` | קאש לו"ז מקומי (מתרענן כל 30 דקות) |
| `.wwebjs_auth/` | session data של WhatsApp לכל סשן |

### deploy מהיר (רק server.js):
```javascript
// מ-deploy.js: SFTP fastPut → pm2 restart bot-server
// לא דרך deploy.js המלא — זה מהיר יותר
```

---

## סשנים (SESSIONS)

```javascript
const MANAGER_EXPIRY = new Date('2026-05-11T23:59:59');

const SESSIONS = [
    { id: 'owner',    label: 'דין (בעלים)',  role: 'owner',   autoStart: true  },
    { id: 'manager1', label: 'חי סיני',      role: 'manager', autoStart: false },
    { id: 'manager2', label: 'חן צור',        role: 'manager', autoStart: false },
    { id: 'manager3', label: 'מיכל בן אשר',  role: 'manager', autoStart: false },
    { id: 'manager4', label: 'חי ניר',        role: 'manager', autoStart: false },
];
```

- **owner** (דין): הרשאות מלאות — ביטול / שיבוץ / שחזור / שאילתות
- **manager1–4**: שאילתות מידע בלבד. גישה פוגת **11/05/2026** — אחרי כן מנותקים אוטומטית.
- **autoStart: false** = המנהלים לא מתחילים אוטומטית אחרי restart. הם צריכים לפתוח את הלינק האישי שלהם פעם אחת.

---

## לינקים

| מטרה | URL |
|------|-----|
| דף ניהול (כל הסשנים + QR) | `http://164.92.142.75` |
| מדריך חי סיני + QR | `http://164.92.142.75/guide/manager1` |
| מדריך חן צור + QR | `http://164.92.142.75/guide/manager2` |
| מדריך מיכל בן אשר + QR | `http://164.92.142.75/guide/manager3` |
| מדריך חי ניר + QR | `http://164.92.142.75/guide/manager4` |

דפי `/guide/:id` — מציגים הסבר שימוש + QR לסריקה + טיימר ספירה לאחור לרענון QR.
**QR גודל 260px.** הסשן מתחיל אוטומטית עם פתיחת הדף.

---

## ארכיטקטורה טכנית

```
[משתמש שולח הקלטה קולית]
        ↓ (fromMe=true, type=ptt/audio)
[message_create handler]
        ↓
[transcribe — Groq Whisper-large-v3, עברית]
        ↓
[detectIntent — Claude Haiku]
        ↓
  ┌─────────────────────────────────┐
  │ intent=query   → answerQuery()  │
  │ intent=cancel  → previewCancel  │  (owner בלבד)
  │ intent=restore → previewRestore │  (owner בלבד)
  │ intent=substitution → Base44 API│  (owner בלבד)
  └─────────────────────────────────┘
        ↓
[client.sendMessage — תשובה בוואטסאפ]
```

### זרימת אישור פעולות (cancel/restore/substitution):
1. בוט שולח preview + "ענה **כן** לאישור / **לא** לביטול"
2. משתמש שולח "כן" → פעולה מתבצעת
3. pending פג תוקף אחרי 5 דקות

---

## detectIntent (Claude Haiku)

מחזיר JSON עם המבנה הבא לפי סוג הבקשה:

```json
// שאילתת לו"ז מאמן/מוקד
{"intent":"query","subject":"שם מאמן/מוקד","range":"week/next_week/date","date":"DD/MM/YYYY","queryType":"schedule/status/times/locations/present/absent"}

// ביטול
{"intent":"cancel","date":"DD/MM/YYYY","location":"...","cancelAll":false}

// שחזור
{"intent":"restore","date":"DD/MM/YYYY","location":"...","coach":"..."}

// חילוף
{"intent":"substitution","requestingCoach":"","date":"DD/MM/YYYY","location":"","reason":"","replacementCoach":"","paymentDetails":"","notes":""}
```

**חשוב:** ימי השבוע הקרובים מחושבים מראש ב-Node.js ומוזרקים לפרומפט — מונע טעויות תאריך של ה-AI.

**תיקון fallback בanswerQuery:** אם AI מחזיר `queryType:'locations'` אבל subject הוא שם מאמן → מתוקן אוטומטית ל-`queryType:'status'`.

---

## answerQuery — סוגי שאילתות

| queryType | תיאור | דוגמה |
|-----------|--------|--------|
| `schedule` | לו"ז מאמן/מוקד בטווח | "איפה עובד אריק השבוע?" |
| `status` | סטטוס ספציפי מאמן/מוקד בתאריך | "איפה אריק עובד ב-10/05?" |
| `times` | שעות פעילות במוקד | "מאיזה שעה יש פעילות ברוקח?" |
| `locations` | מוקדים פעילים בתאריך (ללא מאמן) | "אילו בתי ספר פעילים ביום ראשון?" |
| `present` | מאמנים שעובדים בתאריך | "מי עובד מחר?" |
| `absent` | מאמנים שלא עובדים | "מי פנוי ביום חמישי?" |

---

## Base44 API

```javascript
// קריאות API
GET  /api/apps/{appId}/entities/Event?limit=15000        // לו"ז
POST /api/apps/{appId}/entities/SubstitutionRequest      // בקשת חילוף
PUT  /api/apps/{appId}/entities/Event/{id}               // עדכון סטטוס (cancel/restore)
```

- token + appId נשמרים ב-`base44_token.json`
- הלו"ז מתרענן מה-API כל **30 דקות**, ומקאש ל-`schedule_data.json`
- רענון גם אחרי כל ביטול/שחזור

---

## הגבלות הרשאות

```javascript
// בתוך message_create handler:
if (role === 'manager' && ['cancel', 'restore', 'substitution'].includes(parsed.intent)) {
    await client.sendMessage(msg.from, '🚫 אין לך הרשאה לבצע פעולות שינוי. פנה לדין.');
    return;
}
```

**מה מנהלים יכולים:** כל סוגי השאילתות (schedule, status, times, locations, present, absent)
**מה חסום למנהלים:** cancel, restore, substitution

---

## מנגנוני הגנה בקוד

### מניעת כפילויות הקלטה:
```javascript
// 1. הקלטות ישנות נזרקות
if (msg.timestamp * 1000 < state.startupTime - 60000) return;

// 2. ID tracking — כל הקלטה נרשמת, כפולות נזרקות
if (state.processedMsgIds.has(msgId)) return;
state.processedMsgIds.add(msgId);

// 3. lastVoiceTs — אם הגיעה הקלטה חדשה, הישנה מבוטלת
if (state.lastVoiceTs !== myTs) return;

// 4. startupTime מתעדכן בכל reconnect
setTimeout(() => {
    state.startupTime = Date.now();
    client.initialize();
}, 10000);
```

### סינון קבוצות:
```javascript
if (!msg.fromMe || msg.from.includes('@g.us')) return;
```

---

## תפוגת גישת מנהלים

- **תאריך תפוגה:** 11/05/2026 23:59:59
- אחרי התפוגה: מנהלים לא יכולים להתחיל סשן חדש
- ניתוק אוטומטי בודק כל שעה
- להאריך: שנה `MANAGER_EXPIRY` ב-server.js + deploy
- להסיר לחלוטין: מחק את בלוק הבדיקה + עדכן MANAGER_EXPIRY

---

## dependencies עיקריות

```json
{
  "whatsapp-web.js": "מנוע WhatsApp (Puppeteer + Chrome)",
  "@anthropic-ai/sdk": "Claude Haiku לפענוח כוונות",
  "groq-sdk": "Whisper-large-v3 לתמלול",
  "express": "שרת HTTP (פורט 80)",
  "qrcode": "יצירת QR codes",
  "ssh2": "deploy מקומי"
}
```

---

## נקודות עדיין פתוחות / לשים לב

1. **מיכל (manager3)** — עדיין לא סרקה QR. צריך לשלוח לה את הלינק: `http://164.92.142.75/guide/manager3`
2. **כל המנהלים** — עדיין לא התחברו. יצטרכו לפתוח לינק אחד פעם ולסרוק QR.
3. **תפוגת מנהלים** — להזכיר לדין לפני 11/05/2026 אם להאריך / לנתק / להרחיב הרשאות.
4. **Base44 SubstitutionRequest** — swapType=permanent וביטול חוזר חסומים עד הרשאה מפורשת מדין.
