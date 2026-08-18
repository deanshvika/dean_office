/*
 * transcribe_meeting.js — תמלול מדויק של שיחה/פגישה בודדת, עם חותמות זמן לכל סגמנט.
 *
 * ההבדל מ-transcribe_coaches.js (שנשאר כמו שהוא, לצינור המאמנים):
 *   - מקבל *נתיב מלא* לקובץ בודד, לא שם קובץ בתוך תיקייה קבועה.
 *   - whisper-large-v3 (ולא -turbo) — מדויק יותר בעברית.
 *   - response_format: 'verbose_json' → סגמנטים עם start/end. בלי זה אי אפשר לשייך דוברים.
 *   - temperature 0 + prompt בסגנון verbatim, כדי שהמודל לא "ינקה" מילות מילוי.
 *   - חיתוך לצ'אנקים בגבולות שקט: מונע סחיפת חותמות זמן לאורך הקלטה ארוכה.
 *     הסחיפה הזו היא הסיכון האמיתי כאן, כי ציר הדוברים מגיע מהוידאו ברזולוציית שנייה.
 *
 * הרצה:
 *   node transcribe_meeting.js --in "<נתיב לאודיו>" --out "<תיקיית פלט>" [--chunk 300]
 *
 * פלט:  <out>/<שם>.segments.json   (גולמי — כדי לא לשלם/לחכות שוב על כל שינוי עיצוב)
 *       <out>/<שם>.txt             (טקסט רץ, לקריאה מהירה)
 */
require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const Groq = require('groq-sdk');

const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];

const IN_FILE  = opts.in;
const OUT_DIR  = opts.out;
const CHUNK_S  = Number(opts.chunk || 300);   // אורך צ'אנק מבוקש בשניות
const SEARCH_S = 60;                          // כמה לחפש מסביב ליעד אחרי נקודת שקט
const FFMPEG   = 'C:\\Users\\דין\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe';
const FFPROBE  = FFMPEG.replace('ffmpeg.exe', 'ffprobe.exe');

// prompt בסגנון verbatim — Whisper מחקה את הסגנון של ה-prompt, ולכן דוגמה שמכילה
// מילות מילוי וחזרות מקרבת אותו לתמלול מילה-במילה במקום לניסוח "מסודר".
const VERBATIM_PROMPT =
  'שיחה מקצועית בעברית בין כמה משתתפות. אה, כן, אז... אמ, אני חושבת ש... כאילו, ' +
  'זאת אומרת, בעצם, נכון נכון, אוקיי, רגע רגע. תמלול מלא מילה במילה כולל מילות מילוי וחזרות.';

if (!IN_FILE || !OUT_DIR) { console.error('שימוש: node transcribe_meeting.js --in "<audio>" --out "<dir>"'); process.exit(1); }
if (!fs.existsSync(IN_FILE)) { console.error('הקובץ לא קיים: ' + IN_FILE); process.exit(1); }
if (!process.env.GROQ_API_KEY) { console.error('חסר GROQ_API_KEY ב-.env'); process.exit(1); }

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = path.basename(IN_FILE).replace(/\.[^.]+$/, '');
const TMP  = path.join(OUT_DIR, '_tmp_' + BASE);
fs.mkdirSync(TMP, { recursive: true });

const ff = (args) => execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });

function duration(file) {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

// 16kHz mono opus 24kbps — אותה דחיסה מאומתת של transcribe_coaches.js.
// זו דגימה מחדש (resample) של *כל* הקובץ, לא דגימה חלקית: שום שנייה לא נחתכת.
function encodeSlice(src, dst, start, dur) {
  const args = ['-y', '-ss', String(start), '-i', src];
  if (dur != null) args.push('-t', String(dur));
  args.push('-ar', '16000', '-ac', '1', '-c:a', 'libopus', '-b:a', '24k', dst);
  ff(args);
}

// נקודות שקט לאורך הקובץ — כדי לחתוך בין מילים ולא באמצע מילה.
// spawnSync ולא execFileSync: ffmpeg כותב את פלט silencedetect ל-stderr,
// ו-execFileSync מחזיר רק stdout כשהפקודה מצליחה — לכן הרשימה תמיד יצאה ריקה
// והחיתוך נפל בחזרה לגבולות עגולים שחתכו מילים באמצע.
function silences(file, noiseDb) {
  const r = spawnSync(FFMPEG, ['-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=0.30`, '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const stderr = (r.stderr || '') + (r.stdout || '');
  const out = [];
  const re = /silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(stderr))) out.push({ start: +m[1], end: +m[2] });
  return out;
}

// גבולות צ'אנקים: מתקרבים ליעד CHUNK_S, ונצמדים לאמצע נקודת השקט הקרובה ביותר
function cutPoints(total, sil) {
  const points = [0];
  let target = CHUNK_S;
  while (target < total - 30) {
    const near = sil
      .filter(s => Math.abs((s.start + s.end) / 2 - target) < SEARCH_S && s.start > points[points.length - 1] + 30)
      .sort((a, b) => Math.abs((a.start + a.end) / 2 - target) - Math.abs((b.start + b.end) / 2 - target))[0];
    points.push(near ? (near.start + near.end) / 2 : target);
    target = points[points.length - 1] + CHUNK_S;
  }
  points.push(total);
  return points;
}

async function transcribe(file) {
  const call = () => groq.audio.transcriptions.create({
    file: fs.createReadStream(file),
    model: 'whisper-large-v3',
    language: 'he',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    temperature: 0,
    prompt: VERBATIM_PROMPT,
  });
  const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error('transcribe timeout')), ms));
  try {
    return await Promise.race([call(), timeout(600000)]);
  } catch (e) {
    if (e.message !== 'transcribe timeout') throw e;
    await new Promise(r => setTimeout(r, 3000));
    return await Promise.race([call(), timeout(600000)]);
  }
}

(async () => {
  const total = duration(IN_FILE);
  console.log(`קובץ: ${path.basename(IN_FILE)} — ${(total / 60).toFixed(1)} דקות`);

  console.log('מאתר נקודות שקט לחיתוך...');
  const full = path.join(TMP, 'full.ogg');
  encodeSlice(IN_FILE, full, 0, null);
  // מרפים את סף הרעש עד שיש מספיק שקטים לחתוך בהם. הקלטת ועידה דחוסה
  // מגיעה עם רצפת רעש גבוהה, ו--35dB עלול לא למצוא ולו שקט אחד.
  let sil = [];
  for (const db of [-35, -30, -25, -20]) {
    sil = silences(full, db);
    console.log(`  סף ${db}dB → ${sil.length} נקודות שקט`);
    if (sil.length >= Math.floor(total / CHUNK_S)) break;
  }
  if (!sil.length) console.log('  ⚠️ לא נמצא שקט — חיתוך בגבולות עגולים (עלול לחתוך מילה)');
  const pts = cutPoints(total, sil);
  console.log(`→ ${pts.length - 1} צ'אנקים: ` + pts.map(fmt).join(' | '));

  const segments = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const start = pts[i], dur = pts[i + 1] - pts[i];
    const chunk = path.join(TMP, `chunk_${String(i).padStart(2, '0')}.ogg`);
    encodeSlice(IN_FILE, chunk, start, dur);
    const mb = fs.statSync(chunk).size / 1024 / 1024;
    process.stdout.write(`[${i + 1}/${pts.length - 1}] ${fmt(start)}–${fmt(pts[i + 1])} (${mb.toFixed(1)}MB) ... `);

    const res = await transcribe(chunk);
    // חותמות הזמן של כל צ'אנק מתחילות מ-0 → מוסיפים את ההיסט האבסולוטי
    for (const s of (res.segments || [])) {
      segments.push({
        start: +(s.start + start).toFixed(2),
        end: +(s.end + start).toFixed(2),
        text: (s.text || '').trim(),
        no_speech_prob: s.no_speech_prob,
        compression_ratio: s.compression_ratio,
        avg_logprob: s.avg_logprob,
        chunk: i,
      });
    }
    console.log(`✓ ${(res.segments || []).length} סגמנטים`);
    fs.unlinkSync(chunk);
  }

  segments.sort((a, b) => a.start - b.start);

  // ולידציה — Whisper נוטה ללולאות חזרה ולהזיות על קטעי שקט
  const suspect = segments.filter(s => s.no_speech_prob > 0.6 || s.compression_ratio > 2.4);
  let repeats = 0, prev = '';
  for (const s of segments) { if (s.text && s.text === prev) repeats++; prev = s.text; }
  const covered = segments.length ? segments[segments.length - 1].end : 0;

  console.log('\n--- ולידציה ---');
  console.log(`סגמנטים: ${segments.length}`);
  console.log(`כיסוי: עד ${fmt(covered)} מתוך ${fmt(total)}`);
  console.log(`חשודים כהזיה (no_speech>0.6 או compression>2.4): ${suspect.length}`);
  console.log(`סגמנטים זהים עוקבים: ${repeats}`);

  const outJson = path.join(OUT_DIR, BASE + '.segments.json');
  const outTxt  = path.join(OUT_DIR, BASE + '.txt');
  fs.writeFileSync(outJson, JSON.stringify({ file: IN_FILE, duration: total, segments }, null, 1), 'utf8');
  fs.writeFileSync(outTxt, segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim() + '\n', 'utf8');
  console.log(`\n✓ ${outJson}`);
  console.log(`✓ ${outTxt}`);

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
})().catch(e => { console.error('שגיאה:', e.message); process.exit(1); });

function fmt(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
