const XLSX = require('xlsx');

const coaches = [
  'קרן דבוש', 'טל וזגיאל', 'דוד אשורי', 'נועם כהן', 'תום בריאולובסקי',
  'ליאור מרגוליס', 'שמעון יצחק', 'רומי לני', 'דניאל לנדאו', 'סיון טפירו',
  'אריק מונטבילסקי', 'אופק סגל', 'אסף זוהר', 'ליז אפרגן', 'פיקאדו ינאו',
  'תמיר חלף', 'חי ניר', 'דובי מילר', 'וליד אבו חמוד', 'סהר ליכטנפלד',
  'גילי ששון', 'אייל רותם', 'יובל גורפיין', 'עידן אדלר'
];

function generateSlots(startTime, endTime, durationMin) {
  const slots = [];
  let [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const endMinutes = eh * 60 + em;
  while (sh * 60 + sm + durationMin <= endMinutes) {
    const s = `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`;
    let nm = sm + durationMin, nh = sh;
    if (nm >= 60) { nh++; nm -= 60; }
    slots.push({ start: s, end: `${String(nh).padStart(2,'0')}:${String(nm).padStart(2,'0')}` });
    sh = nh; sm = nm;
  }
  return slots;
}

const schedule = [
  { date: '21/06/2026', day: 'ראשון',  start: '10:00', end: '12:00' },
  { date: '22/06/2026', day: 'שני',    start: '16:00', end: '18:00' },
  { date: '23/06/2026', day: 'שלישי',  start: '13:00', end: '15:00' },
  { date: '25/06/2026', day: 'חמישי',  start: '19:30', end: '21:00' },
  { date: '28/06/2026', day: 'ראשון',  start: '10:00', end: '12:00' },
  { date: '29/06/2026', day: 'שני',    start: '16:00', end: '18:00' },
  { date: '30/06/2026', day: 'שלישי',  start: '13:00', end: '15:00' },
];

// בנה שורות הנתונים
const rows = [];
rows.push(['תאריך', 'יום', 'שעת התחלה', 'שעת סיום', 'שם מאמן']);

for (const d of schedule) {
  const slots = generateSlots(d.start, d.end, 20);
  for (const slot of slots) {
    rows.push([d.date, d.day, slot.start, slot.end, '']);
  }
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);

// רוחב עמודות
ws['!cols'] = [
  { wch: 13 }, // תאריך
  { wch: 9 },  // יום
  { wch: 13 }, // התחלה
  { wch: 13 }, // סיום
  { wch: 22 }, // שם מאמן
];

XLSX.utils.book_append_sheet(wb, ws, 'שיבוץ חתך יוני');

// גיליון מאמנים
const coachRows = [['#', 'שם מאמן'], ...coaches.map((c, i) => [i + 1, c])];
const wsCoaches = XLSX.utils.aoa_to_sheet(coachRows);
wsCoaches['!cols'] = [{ wch: 5 }, { wch: 22 }];
XLSX.utils.book_append_sheet(wb, wsCoaches, 'רשימת מאמנים');

const outPath = 'שיבוץ_חתך_יוני_2026.xlsx';
XLSX.writeFile(wb, outPath);

const total = rows.length - 1;
console.log(`✅ הקובץ נוצר: ${outPath}`);
console.log(`   ${total} שורות שיבוץ | ${coaches.length} מאמנים`);
