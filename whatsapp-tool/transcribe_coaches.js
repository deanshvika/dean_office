/*
 * transcribe_coaches.js — תמלול הקלטות שיחות אישיות עם מאמנים (Groq Whisper, עברית).
 *
 * קלט:  C:\Users\דין\Desktop\שיחות חתך מאמנים\audio\*.m4a  (שם הקובץ = שם המאמן)
 * פלט:  ...\transcripts\<שם המאמן>.txt
 *
 * שימוש חוזר בתבנית התמלול המוכחת מ-server.js:448-482 (whisper-large-v3-turbo, language:'he').
 * מפתח GROQ_API_KEY נטען מ-whatsapp-tool/.env.
 *
 * הרצה:  cd whatsapp-tool && node transcribe_coaches.js            (כל הקבצים)
 *        node transcribe_coaches.js "אייל רותם.m4a"                (קובץ בודד)
 */
require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Groq = require('groq-sdk');

const AUDIO_DIR = 'C:\\Users\\דין\\Desktop\\שיחות חתך מאמנים\\audio';
const OUT_DIR   = 'C:\\Users\\דין\\Desktop\\שיחות חתך מאמנים\\transcripts';
const MAX_MB = 24; // מעל זה Groq עלול לדחות (מגבלת 25MB) — דוגמים מחדש עם ffmpeg
const FFMPEG = 'C:\\Users\\דין\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe';

// דגימה מחדש ל-16kHz mono opus (קטן דרמטית, נתמך ב-Groq) — מחזיר נתיב קובץ זמני
function downsample(fullPath) {
  const tmp = path.join(OUT_DIR, '_tmp_' + Date.now() + '.ogg');
  execFileSync(FFMPEG, ['-y', '-i', fullPath, '-ar', '16000', '-ac', '1', '-c:a', 'libopus', '-b:a', '24k', tmp], { stdio: 'ignore' });
  return tmp;
}

if (!process.env.GROQ_API_KEY) { console.error('חסר GROQ_API_KEY ב-.env'); process.exit(1); }
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
fs.mkdirSync(OUT_DIR, { recursive: true });

async function transcribeFile(fullPath) {
  const call = () => groq.audio.transcriptions.create({
    file: fs.createReadStream(fullPath),
    model: 'whisper-large-v3-turbo',
    language: 'he',
    response_format: 'text',
  });
  // timeout ארוך יותר מהבוט (קבצים ארוכים) + retry אחד
  const withTimeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('transcribe timeout')), ms));
  try {
    return await Promise.race([call(), withTimeout(180000)]);
  } catch (e) {
    if (e.message !== 'transcribe timeout') throw e;
    await new Promise(r => setTimeout(r, 2000));
    return await Promise.race([call(), withTimeout(180000)]);
  }
}

(async () => {
  const only = process.argv[2]; // שם קובץ בודד (אופציונלי)
  let files = fs.readdirSync(AUDIO_DIR).filter(f => /\.(m4a|mp3|ogg|wav|mp4|aac)$/i.test(f));
  if (only) files = files.filter(f => f === only);
  if (!files.length) { console.log('אין קבצי אודיו ב-', AUDIO_DIR); return; }

  console.log(`נמצאו ${files.length} קבצים לתמלול.\n`);
  const failed = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const full = path.join(AUDIO_DIR, f);
    const name = f.replace(/\.[^.]+$/, '');
    const out = path.join(OUT_DIR, name + '.txt');
    if (fs.existsSync(out) && fs.statSync(out).size > 0) {
      console.log(`[${i + 1}/${files.length}] ${name} — תמלול קיים, מדלג`);
      continue;
    }
    const mb = fs.statSync(full).size / 1024 / 1024;
    process.stdout.write(`[${i + 1}/${files.length}] ${name} (${mb.toFixed(1)}MB) ... `);
    let sendPath = full, tmp = null;
    try {
      if (mb > MAX_MB) {
        process.stdout.write('דוגם מחדש (ffmpeg) ... ');
        tmp = downsample(full);
        sendPath = tmp;
      }
      const text = await transcribeFile(sendPath);
      fs.writeFileSync(out, (text || '').trim() + '\n', 'utf8');
      console.log(`✓ נשמר (${(text || '').length} תווים)`);
    } catch (e) {
      console.log('✗ נכשל: ' + e.message);
      failed.push(name + ' — ' + e.message);
    } finally {
      if (tmp) { try { fs.unlinkSync(tmp); } catch (_) {} }
    }
  }

  console.log('\nסיום.');
  if (failed.length) console.log('נכשלו:\n - ' + failed.join('\n - '));
  else console.log('כל הקבצים תומללו בהצלחה.');
})().catch(e => { console.error('שגיאה כללית:', e); process.exit(1); });
