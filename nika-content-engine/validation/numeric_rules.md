# numeric_rules — חוקי ולידציה מספרית (חשבון)

הכלל העליון: **אין רינדור בלי PASS מספרי.**

## שדות חובה לפי סוג משימה

- `count`: `item`, `count`. אם יש `options` — MUST להכיל את `count`, בלי כפילויות.
- `arith`: `op` (addition/subtraction), `a{item,count}`, `b{item,count}`, `result`.
- `compare`: `item`, `a`, `b` (MUST `a≠b`), `ask` (more/less).
- `equalize`: `item`, `a`, `b`, `answer`.
- `write_count`: `groups[]` עם `item`,`count`.
- `match`: `pairs[]{item,count}`, `numbers[]`.

## בדיקות (נאכפות ב-`validate_page.mjs`)

1. **טווח:** כל כמות בטווח השכבה (`math_bank.number_ranges`). א' = 1–10.
2. **אריתמטיקה:** `arith` → `a op b == result`. `equalize` → `answer == a-b` (ו-`a≥b`).
3. **התאמת ספירה↔תשובה:** `count` MUST בין ה-`options` ו הוא התשובה.
4. **match:** רב-הסטים `numbers` == הכמויות המצוירות (פרמוטציה).
5. **בונוס find_count:** ה-`target` MUST להופיע כ-`count` באחת ממשימות העמוד.
6. **אייקון קיים:** לכל `item` MUST קובץ `assets/icons/<item>.svg`.

כל כשל → **העמוד נפסל, אין רינדור.**
