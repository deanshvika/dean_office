# workflow — סדר העבודה המחייב

## הפקת עמוד (חובה, לא לדלג)

1. **אפיון יום** → קובץ `curriculum/days/<day_id>.yaml` (Day Spec).
2. **טקסט מדויק** — מהבנקים; מנוקד לפי `niqqud_rules`.
3. **נתונים מספריים מפורשים** בכל משימת חשבון.
4. **ולידציה** (`validate_page.mjs`) — MUST PASS.
5. **רינדור** (`render.mjs` → `render_pdf.mjs`) — HTML → PDF/PNG.
6. **מיזוג + דוח** (`run_batch.mjs`).

## כללי ברזל

- NEVER לדלג ישר לויזואל בלי נתונים מובנים.
- NEVER לרנדר עמוד חשבון בלי שהוולידציה עברה (`--force` הוא חריג מודע בלבד).
- NEVER לעבור להפקה סדרתית לפני שפיילוט יום אחד עובד מושלם.
- כל שינוי מבני/עיצובי — לפני batch, לא תוך כדי.

## הרצה

```bash
node scripts/validate_page.mjs <day_id>       # ולידציה בלבד
node scripts/run_batch.mjs --day <day_id>      # פייפליין מלא ליום
```

## הוספת יום חדש (התהליך השוטף)

1. העתק `curriculum/day_spec_template.yaml` → `days/<day_id>.yaml`.
2. מלא פריטים, מספרים, מילים (מהבנקים). לעמוד מנוקד — טקסט חופשי דרך Nakdan מאומת.
3. `run_batch --day <day_id>`. אם FAIL — תקן את הנתונים (לא את הקוד).

עוזר AI רשאי *להציע* Day Spec מהעקרונות — הוולידציה והבנק מונעים ממנו להכניס טעויות.
