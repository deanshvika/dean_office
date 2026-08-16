/*
 * upload_to_drive.js
 * ---------------------------------------------------------------------------
 * מעלה קובץ ל-Google Drive דרך פרופיל האוטומציה (פורט 9222) — בלי קליקים
 * עיוורים ברמת מערכת ההפעלה.
 *
 * למה זה קיים: השלב upload בסקיל text-to-gdocs מסתמך על SendKeys והדבקה
 * עיוורת, ולכן נכשל כש-VS Code חוטף פוקוס (הוא Electron — אותה מחלקת חלון
 * כמו Chrome). כאן הכל עובר דרך CDP: הקליקים הם page.mouse בתוך הדף הספציפי,
 * ובחירת הקובץ נעשית ב-waitForFileChooser — האינטראקציה עם דיאלוג המערכת
 * מיורטת ע"י הדפדפן ולא דורשת פוקוס כלל.
 *
 * הרצה:  node upload_to_drive.js "<נתיב מלא לקובץ>" [--open]
 *          --open : פותח את הקובץ שהועלה כמסמך/גיליון גוגל ומדפיס את הכתובת
 */
const fs = require('fs');
const path = require('path');
const { getBrowser } = require('./chrome_automation');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DRIVE = 'https://drive.google.com/drive/my-drive';

// מאתר אלמנט לפי טקסט/aria-label ולוחץ עליו בעכבר של הדף (לא של מערכת ההפעלה)
async function clickByText(page, patterns, label) {
  const spot = await page.evaluate(pats => {
    const rx = pats.map(p => new RegExp(p));
    const els = document.querySelectorAll('button,[role="button"],[role="menuitem"],div[aria-label],span');
    for (const el of els) {
      const t = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim();
      if (!t || t.length > 80) continue;
      if (!rx.some(r => r.test(t))) continue;
      const r2 = el.getBoundingClientRect();
      if (r2.width > 8 && r2.height > 8) return { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2, t };
    }
    return null;
  }, patterns);
  if (!spot) { console.log(`  ✗ ${label}: לא נמצא`); return false; }
  await page.mouse.click(spot.x, spot.y);
  console.log(`  ✓ ${label}: "${spot.t}"`);
  return true;
}

async function uploadFile(page, filePath) {
  // מסלול א' — input[type=file] שכבר קיים ב-DOM: הדרך הכי דטרמיניסטית
  const input = await page.$('input[type=file]');
  if (input) {
    await input.uploadFile(filePath);
    console.log('  ✓ הקובץ הוזרק ל-input[type=file] קיים');
    return true;
  }

  // מסלול ב' — תפריט "חדש" > "העלאת קבצים", עם יירוט דיאלוג הקובץ ע"י הדפדפן
  console.log('  אין input קיים — פותח תפריט "חדש"...');
  if (!await clickByText(page, ['^חדש$', '^New$', 'חדש '], 'כפתור חדש')) return false;
  await sleep(1800);

  const chooserPromise = page.waitForFileChooser({ timeout: 30000 });
  if (!await clickByText(page, ['העלאת קבצים', 'העלאת קובץ', 'File upload'], 'העלאת קבצים')) return false;

  const chooser = await chooserPromise;
  await chooser.accept([filePath]);
  console.log('  ✓ הקובץ נבחר דרך waitForFileChooser');
  return true;
}

async function waitForUpload(page, name, tries = 40) {
  for (let i = 0; i < tries; i++) {
    await sleep(3000);
    const state = await page.evaluate(n => {
      const body = document.body.innerText || '';
      if (body.includes(n)) return 'found';
      if (/מעלה|Uploading|נותרו/.test(body)) return 'uploading';
      return 'waiting';
    }, name);
    if (state === 'found') return true;
    if (i % 4 === 0) console.log(`  ...${state} (${(i + 1) * 3}s)`);
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const filePath = args[0];
  if (!filePath) throw new Error('שימוש: node upload_to_drive.js "<נתיב לקובץ>" [--open]');
  if (!fs.existsSync(filePath)) throw new Error('הקובץ לא קיים: ' + filePath);

  const name = path.basename(filePath);
  const nameNoExt = name.replace(/\.[^.]+$/, '');
  console.log(`מעלה: ${name}`);

  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.goto(DRIVE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(8000);
  await page.bringToFront();

  if (!await uploadFile(page, filePath)) throw new Error('לא הצלחתי להתחיל את ההעלאה.');

  console.log('ממתין לסיום ההעלאה...');
  const ok = await waitForUpload(page, nameNoExt);
  const shots = path.join(__dirname, '.tmp_shots');
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, 'upload_done.png') });
  if (!ok) {
    console.log('⚠️ לא זוהה סיום העלאה. ראה .tmp_shots/upload_done.png');
  } else {
    console.log('✅ ההעלאה הושלמה.');
  }

  // איתור הקובץ וקבלת כתובתו כגיליון/מסמך גוגל
  if (process.argv.includes('--open')) {
    await page.goto('https://drive.google.com/drive/search?q=' + encodeURIComponent(nameNoExt),
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(7000);
    // מעדיפים התאמה לשם המלא *עם הסיומת* — זה הקובץ שהרגע הועלה.
    // בלי זה, עותק גוגל-דוקס ישן באותו שם (בלי סיומת) חוטף את ההתאמה
    // ומוחזרת כתובת של גרסה קודמת.
    const id = await page.evaluate((full, noExt) => {
      const rows = [...document.querySelectorAll('[data-id]')]
        .map(el => ({ id: el.getAttribute('data-id'), t: (el.innerText || '') }))
        .filter(r => /^1[\w-]{20,}$/.test(r.id));
      const exact = rows.find(r => r.t.includes(full));
      if (exact) return exact.id;
      const loose = rows.find(r => r.t.includes(noExt));
      return loose ? loose.id : null;
    }, name, nameNoExt);
    if (id) {
      // סוג המסמך נגזר מהסיומת — DOCX פותח כ-document, XLSX כ-spreadsheets.
      // בעבר זה היה מקובע ל-spreadsheets ולכן החזיר כתובת שגויה לכל מסמך Word.
      const kind = /\.(docx?|rtf|odt|txt|html?)$/i.test(name) ? 'document' : 'spreadsheets';
      const url = `https://docs.google.com/${kind}/d/${id}/edit`;
      console.log('\n🔗 ' + url);
      // קובץ הכתובת נגזר משם הקובץ שהועלה — אחרת כל העלאה הייתה דורסת
      // את school_coach_sheet_url.txt גם כשמדובר בגיליון אחר לגמרי.
      const i = process.argv.indexOf('--url-file');
      const urlFile = i > -1 && process.argv[i + 1]
        ? process.argv[i + 1]
        : path.join(__dirname, `${nameNoExt}_url.txt`);
      fs.writeFileSync(urlFile, url + '\n');
      console.log('   נשמר ב: ' + urlFile);
    } else {
      console.log('⚠️ לא הצלחתי לחלץ את מזהה הקובץ — פתח ידנית מהדרייב.');
    }
  }

  browser.disconnect();
}

if (require.main === module) {
  main().catch(e => { console.error('❌ שגיאה:', e.message); process.exit(1); });
}
