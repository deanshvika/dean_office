# מנוע התוכן הלימודי — NIKA (ניקה ספורט וקהילה)

מייצר דפי עבודה מודפסים (חשבון · שפה · אנגלית) לשתי שכבות (א' / ב'–ג'), **ללא טעויות במספרים ובניקוד**.

## העיקרון: 3 שכבות שלא מתערבבות

```
נתונים (Day Spec YAML)  →  ולידציה (שער חובה)  →  תבנית + נכסים  →  רינדור PDF/PNG
```

ה-AI/האדם בוחר *מה* להגיד (איזה פריט, כמה, איזו מילה). **הקוד** מבטיח שהייצוג תמיד נכון:
- **מספרים:** הקוד מדביק את אייקון הפריט בדיוק `count` פעמים. אי אפשר שהמספר המצויר לא יתאים לתשובה.
- **ניקוד:** הטקסט נשלף מבנק מנוקד סגור ומאומת. ה-AI לא מנקד חופשי.
- **ולידציה:** שער חובה מחשב מחדש כל תרגיל ופוסל דף עם טעות *לפני* הרינדור.

## מבנה

| תיקייה | תוכן |
|--------|------|
| `system/` | מסמכי DNA: overview, pedagogical_rules, brand_rules, niqqud_rules, workflow |
| `curriculum/` | `day_spec_template.yaml`, `summer_camp_plan.yaml`, ו-`days/*.yaml` (יחידת עבודה ליום) |
| `content_banks/` | בנק ניקוד סגור + בנקי תחום (אוצר מילים/פריטים מאושר) |
| `templates/` | `shared.css` (מסגרת מותג) + `render.mjs` (בניית ה-HTML לכל סוג עמוד) |
| `assets/` | `logo/`, `icons/` (line-art בגרדיאנט מותג), `illustrations/`, `fonts/` |
| `validation/` | חוקי ולידציה + `validate_page.mjs` |
| `scripts/` | `lib.mjs`, `generate_page.mjs`, `render_pdf.mjs`, `run_batch.mjs`, `niqqud_client.mjs` |
| `output/` | תוצרים לפי שכבה + דוחות הפקה |

## הרצה

### לוח בקרה (אפליקציה) — מומלץ
לחיצה כפולה על **`start-app.bat`** (או קיצור "לוח בקרה NIKA" בשולחן העבודה) → נפתח `http://localhost:5178`.
טופס → תצוגה חיה → ולידציה → הורדת PDF. **אל תסגור את חלון השרת בזמן עבודה.**

```bash
node scripts/server.mjs      # מפעיל את הלוח ידנית
```

### CLI (הפקה ישירה)
```bash
# הרצת יום בודד: ולידציה → רינדור 4 עמודים → output
node scripts/run_batch.mjs --day grade_1_math_day_1

# רק ולידציה
node scripts/validate_page.mjs grade_1_math_day_1
```

## מחסנית

Node.js (ESM). YAML דרך `js-yaml`. רינדור HTML→PDF/PNG דרך Playwright/Chromium (תמיכה מיטבית ב-RTL עברי + ניקוד).
`playwright` נפתר מ-`node_modules` של תיקיית האב.

## סטטוס נכסים

תיקיית `assets/icons/` מכילה סט **סטארטר** של אייקוני line-art בסגנון המותג. יש להחליף/להשלים בנכסים הרשמיים של NIKA (לוגו וקטורי, פונטים, איורי סצנה) — ראה `assets/README.md`.
