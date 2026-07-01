# assets — נכסי מותג

## מה יש עכשיו (סטארטר)

`icons/` — סט אייקוני line-art בסגנון המותג (bottle, ball, flag, hoop, bag, shoes, cone), קו מתאר בגרדיאנט, ללא מילוי. מספיק כדי שהמנוע יעבוד.

## מה דין צריך להעביר (נכסים רשמיים של NIKA)

| תיקייה | קובץ | הערה |
|--------|------|------|
| `logo/` | `nika_logo.svg` (וקטור) + PNG | מחליף את טקסט "NIKA" ב-`render.mjs`/`header()` |
| `fonts/` | קובצי הפונט הרשמיים (woff2) | לעדכן את ה-`@font-face`/`font-family` ב-`shared.css` |
| `icons/` | אייקוני הפריטים הרשמיים (SVG line-art מועדף) | להחליף באותם שמות קובץ: `<item>.svg` |
| `illustrations/` | איורי סצנה (ילדים בפעילות) | ימולאו באזור `.scene` בכותרת (`header()` ב-render.mjs) |

## כללים

- אייקונים MUST line-art עם `stroke="url(#grad)"` ו-`fill="none"` (ראה `system/brand_rules.md`).
- שמות קובצי האייקונים MUST תואמים למפתחות ב-`content_banks/niqqud_bank.items`.
- החלפה = פשוט לדרוס את הקובץ באותו שם. אין צורך לגעת בקוד.

## שילוב לוגו/איורים בקוד

- לוגו: ב-`templates/render.mjs`, פונקציית `header()` — להחליף `<div class="logo">NIKA</div>` ב-`<img src=".../logo/nika_logo.svg">`.
- איור סצנה: למלא את `<div class="scene">` ב-`header()` בתמונה מתאימה לפי נושא היום.
