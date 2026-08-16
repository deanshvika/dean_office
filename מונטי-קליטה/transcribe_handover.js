/*
 * transcribe_handover.js — תמלול הקלטות פגישות החפיפה עם מונטי.
 *
 * עוטף את whatsapp-tool/transcribe_coaches.js עם תיקיות החפיפה. אותה לוגיקה
 * מוכחת (Groq whisper-large-v3-turbo, עברית, דילוג על תמלול קיים, דגימה
 * מחדש ב-ffmpeg מעל 24MB) — בלי שכפול קוד.
 *
 * קלט:  C:\Users\דין\Desktop\חפיפת מונטי\audio\*.m4a
 * פלט:  C:\Users\דין\Desktop\חפיפת מונטי\transcripts\*.txt
 *
 * הרצה:  node מונטי-קליטה/transcribe_handover.js
 *        node מונטי-קליטה/transcribe_handover.js "פגישה 1.m4a"
 */
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = path.join(process.env.USERPROFILE, 'Desktop', 'חפיפת מונטי');
const SCRIPT = path.join(__dirname, '..', 'whatsapp-tool', 'transcribe_coaches.js');

const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
const args = [SCRIPT, '--audio', path.join(BASE, 'audio'), '--out', path.join(BASE, 'transcripts'), ...only];

const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
