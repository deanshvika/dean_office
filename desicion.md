# החלטות עבודה

## גיבוי אוטומטי ל-Git (2026-05-26)

**ההחלטה:** כל פעם שדין מבקש "תגבה" / "גיבוי" / "backup" — לבצע אוטומטית:
1. `git add .`
2. `git commit -m "..."` עם הודעה מתארת
3. `git push`

**בלי לשאול אישור מראש. בלי לבקש סיסמאות. בדיוק כפי שעשינו בפעם הראשונה.**

**Remote:** https://github.com/deanshvika/dean_office

**הגנה על סודות:**
- ה-`.gitignore` הקיים מסנן: `.wwebjs_auth/`, `.env`, `node_modules/`, `base44_token.json`, `*password*`, `*credentials*`, `base44_userdata/`
- לפני כל push, לוודא שאין סודות חדשים ב-staging (בדיקה מהירה: `git ls-files --cached | grep -iE "(\.env$|token|password|credential|\.wwebjs_auth)"`)
- אם מתגלה קובץ סוד חדש שלא ב-.gitignore — לעצור, להוסיף ל-.gitignore, ורק אז להמשיך

**הקבצים שנשארים תמיד מקומיים (אסור לדחוף):**
- `.wwebjs_auth/` — סשני WhatsApp
- `whatsapp-tool/.env` — API keys
- `whatsapp-tool/base44_token.json` — טוקני Base44
- `node_modules/` — חבילות npm
- כל קובץ עם `password` / `credentials` בשם
