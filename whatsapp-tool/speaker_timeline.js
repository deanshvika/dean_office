/*
 * speaker_timeline.js — בונה ציר זמן "מי מדבר" מתוך וידאו תצוגת-הדובר-הפעיל של Zoom.
 *
 * הרעיון: ב-avo (active speaker view) Zoom מציג בכל רגע את הדובר הנוכחי במסך מלא,
 * עם שמו צרוב בפינה השמאלית-התחתונה — טקסט לבן על קופסה אטומה למחצה.
 *
 * החתימה היא *מתווית השם*, לא הפריים המלא. ניסיתי קודם למזער את כל הפריים
 * ולקבץ לפי הרקע — זה נכשל: המשתתפות זזות הרבה, והשונות בתוך אותו אדם גדולה
 * מהשונות בין אנשים (74 אשכולות במקום 3). המתווית לעומת זאת היא טקסט קבוע
 * ברזולוציה קבועה: אחרי סף בהירות נשארות רק האותיות הלבנות, זהות פיקסל-בפיקסל.
 *
 * חותכים רק את 78 הפיקסלים הראשונים — הרוחב שנמצא בתוך קופסת המתווית גם
 * בשם הקצר ביותר. מעבר לזה מציץ הוידאו עצמו והרקע מזהם את החתימה.
 *
 * הסף מוחל ב-JS ולא ב-ffmpeg כדי שאפשר יהיה לכוון אותו בלי לחלץ מחדש.
 *
 * שלבים:
 *   node speaker_timeline.js --video <avo.mp4> --work <dir> --step signatures
 *   node speaker_timeline.js --work <dir> --step cluster [--threshold N]
 *   node speaker_timeline.js --video <avo.mp4> --work <dir> --step samples
 *      → קוראים את <work>/clusters_sheet.png ומזינים שמות:
 *   node speaker_timeline.js --work <dir> --segments <x.segments.json> \
 *        --step assign --names "0=Maya Elhalal,1=Moran Rabau,2=Abigail Tenembaum"
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];

const FFMPEG = 'C:\\Users\\דין\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.2-full_build\\bin\\ffmpeg.exe';
const WORK  = opts.work;
const FPS   = Number(opts.fps || 2);
const CROP  = (opts.crop || '78:34:0:326').split(':').map(Number); // w:h:x:y של מתווית השם
const [CW, CH] = CROP;
const WHITE = Number(opts.white || 190);   // סף בהירות לבידוד האותיות
const DS    = 2;                            // הקטנה אחרי הסף → עמידות לתזוזת פיקסל
const SW = Math.floor(CW / DS), SH = Math.floor(CH / DS);

if (!WORK) { console.error('חסר --work'); process.exit(1); }
fs.mkdirSync(WORK, { recursive: true });
const RAW_FILE = path.join(WORK, 'labels.gray');
const CLU_FILE = path.join(WORK, 'clusters.json');

const ff = a => execFileSync(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const fmt = s => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`; };

// ---------- שלב 1: חילוץ אזור המתווית בגווני אפור ----------
function stepSignatures() {
  if (!opts.video) { console.error('חסר --video'); process.exit(1); }
  console.log(`מחלץ מתוויות ${CW}x${CH} ב-${FPS}fps...`);
  ff(['-y', '-i', opts.video, '-vf', `fps=${FPS},crop=${CROP.join(':')},format=gray`,
      '-f', 'rawvideo', '-pix_fmt', 'gray', RAW_FILE]);
  const n = fs.statSync(RAW_FILE).size / (CW * CH);
  console.log(`✓ ${n} מתוויות (${fmt(n / FPS)} וידאו)`);
}

// סף → הקטנה בממוצע. הממוצע הופך "יש אות/אין אות" לערך רציף,
// כך שהזזה של פיקסל בודד לא קופצת למרחק גדול.
function loadSignatures() {
  const buf = fs.readFileSync(RAW_FILE);
  const frameSize = CW * CH, n = buf.length / frameSize, out = [];
  for (let f = 0; f < n; f++) {
    const off = f * frameSize;
    const sig = new Float32Array(SW * SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      let s = 0;
      for (let dy = 0; dy < DS; dy++) for (let dx = 0; dx < DS; dx++)
        s += buf[off + (y * DS + dy) * CW + (x * DS + dx)] > WHITE ? 255 : 0;
      sig[y * SW + x] = s / (DS * DS);
    }
    out.push(sig);
  }
  return out;
}

const LEN = () => SW * SH;
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

// ---------- שלב 2: אשכולות ----------
function stepCluster() {
  const sigs = loadSignatures();
  const blank = sigs.map(s => s.reduce((a, b) => a + b, 0) / s.length < 4); // פריים בלי מתווית כלל
  console.log(`${sigs.length} פריימים, מהם ${blank.filter(Boolean).length} בלי מתווית`);

  if (opts.threshold == null) {
    console.log('\nסף  אשכולות  מעל 1%');
    for (const t of [3, 5, 8, 12, 16, 20, 25, 30, 40]) {
      const c = greedy(sigs, blank, t);
      const big = c.counts.filter(n => n / sigs.length > 0.01).length;
      console.log(`${String(t).padStart(3)}  ${String(c.centroids.length).padStart(7)}  ${big}`);
    }
    console.log('\nהרץ שוב עם --threshold <ערך>');
    return;
  }

  const t = Number(opts.threshold);
  const c = greedy(sigs, blank, t);
  // אשכולות זעירים = פריימי מעבר/דהייה. מאחדים אל האשכול הגדול הקרוב אליהם.
  const keep = c.counts.map(n => n / sigs.length >= 0.01);
  if (!keep.some(Boolean)) { console.error('אין אשכול משמעותי — הורד סף'); process.exit(1); }
  const map = c.centroids.map((cen, i) => {
    if (keep[i]) return i;
    let best = -1, bd = Infinity;
    c.centroids.forEach((o, j) => { if (keep[j]) { const d = dist(cen, o); if (d < bd) { bd = d; best = j; } } });
    return best;
  });
  const ids = [...new Set(c.centroids.map((_, i) => keep[i] ? i : map[i]))].sort((a, b) => a - b);
  const renum = Object.fromEntries(ids.map((id, i) => [id, i]));

  const timeline = [];
  for (let i = 0; i < c.labels.length; i++) {
    const id = c.labels[i] === null ? null : renum[map[c.labels[i]]];
    const last = timeline[timeline.length - 1];
    if (last && last.cluster === id) last.end = (i + 1) / FPS;
    else timeline.push({ cluster: id, start: i / FPS, end: (i + 1) / FPS });
  }

  const totals = {};
  for (const r of timeline) totals[r.cluster] = (totals[r.cluster] || 0) + (r.end - r.start);
  fs.writeFileSync(CLU_FILE, JSON.stringify({ fps: FPS, threshold: t, clusters: ids.length, timeline }, null, 1));
  console.log(`\n✓ ${ids.length} אשכולות, ${timeline.length} מקטעים`);
  const span = c.labels.length / FPS;
  for (const k of Object.keys(totals).sort()) console.log(`  אשכול ${k}: ${fmt(totals[k])} (${(100*totals[k]/span).toFixed(1)}%)`);
}

function greedy(sigs, blank, thr) {
  const centroids = [], counts = [], sums = [], labels = [];
  for (let i = 0; i < sigs.length; i++) {
    if (blank[i]) { labels.push(null); continue; }
    const s = sigs[i];
    let best = -1, bd = Infinity;
    for (let j = 0; j < centroids.length; j++) { const d = dist(s, centroids[j]); if (d < bd) { bd = d; best = j; } }
    if (best >= 0 && bd < thr) {
      counts[best]++;
      for (let k = 0; k < s.length; k++) { sums[best][k] += s[k]; centroids[best][k] = sums[best][k] / counts[best]; }
      labels.push(best);
    } else {
      centroids.push(Float64Array.from(s)); sums.push(Float64Array.from(s)); counts.push(1);
      labels.push(centroids.length - 1);
    }
  }
  return { centroids, counts, labels };
}

// ---------- שלב 3: נציג לכל אשכול, בגיליון אחד לקריאה ----------
function stepSamples() {
  if (!opts.video) { console.error('חסר --video'); process.exit(1); }
  const { timeline } = JSON.parse(fs.readFileSync(CLU_FILE, 'utf8'));
  const byCluster = {};
  for (const r of timeline) if (r.cluster !== null) (byCluster[r.cluster] ||= []).push(r);

  const dir = path.join(WORK, 'samples');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const keys = Object.keys(byCluster).sort((a, b) => a - b);
  keys.forEach((k, idx) => {
    // נציג מאמצע המקטע הארוך ביותר — הרחק ככל האפשר ממעברים
    const longest = byCluster[k].slice().sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
    const t = (longest.start + longest.end) / 2;
    ff(['-y', '-ss', String(t), '-i', opts.video, '-frames:v', '1',
        '-vf', `crop=260:34:0:326,scale=780:102:flags=neighbor`,
        path.join(dir, `${String(idx).padStart(2, '0')}.png`)]);
    console.log(`אשכול ${k} → ${fmt(t)} (${fmt(longest.end - longest.start)} רצוף)`);
  });

  const sheet = path.join(WORK, 'clusters_sheet.png');
  ff(['-y', '-i', path.join(dir, '%02d.png'), '-vf', `tile=1x${keys.length}`, sheet]);
  console.log(`\n✓ ${sheet} — השורות לפי סדר האשכולות 0..${keys.length - 1}`);
}

// ---------- שלב 4: שמות + מיזוג עם הסגמנטים ----------
function stepAssign() {
  const names = Object.fromEntries((opts.names || '').split(',').filter(Boolean)
    .map(p => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const { timeline } = JSON.parse(fs.readFileSync(CLU_FILE, 'utf8'));
  const data = JSON.parse(fs.readFileSync(opts.segments, 'utf8'));

  const out = data.segments.map(s => {
    // הדובר של סגמנט = מי שמחזיק את רוב הזמן בחלון [start,end] בציר הוידאו
    const share = {};
    for (const r of timeline) {
      if (r.cluster === null) continue;
      const ov = Math.min(s.end, r.end) - Math.max(s.start, r.start);
      if (ov > 0) share[r.cluster] = (share[r.cluster] || 0) + ov;
    }
    const ranked = Object.entries(share).sort((a, b) => b[1] - a[1]);
    const tot = ranked.reduce((a, b) => a + b[1], 0) || 1;
    const top = ranked[0];
    return {
      ...s,
      cluster: top ? +top[0] : null,
      speaker: top ? (names[top[0]] || `דובר ${top[0]}`) : null,
      // ביטחון נמוך = מעבר דובר בתוך הסגמנט — אלה מועמדים לבדיקה ידנית
      confidence: top ? +(top[1] / tot).toFixed(2) : 0,
    };
  });

  // סגמנטים בלי שיוך יורשים את הדובר הקודם (בד"כ פריימי מעבר בתוך תור דיבור)
  for (let i = 0; i < out.length; i++) if (!out[i].speaker) {
    out[i].speaker = (out[i - 1] && out[i - 1].speaker) || (out.find(s => s.speaker) || {}).speaker || 'לא ידוע';
    out[i].inherited = true;
  }

  const low = out.filter(s => s.confidence < 0.75).length;
  const outFile = opts.out || path.join(WORK, 'transcript_speakers.json');
  fs.writeFileSync(outFile, JSON.stringify({ ...data, names, segments: out }, null, 1), 'utf8');
  const per = {};
  for (const s of out) per[s.speaker] = (per[s.speaker] || 0) + (s.end - s.start);
  console.log(`✓ ${out.length} סגמנטים — ${low} בביטחון נמוך (<0.75)`);
  for (const k of Object.keys(per)) console.log(`  ${k}: ${fmt(per[k])}`);
  console.log(`✓ ${outFile}`);
}

const steps = { signatures: stepSignatures, cluster: stepCluster, samples: stepSamples, assign: stepAssign };
const fn = steps[opts.step];
if (!fn) { console.error('--step חייב להיות אחד מ: ' + Object.keys(steps).join(', ')); process.exit(1); }
fn();
