const fs = require('fs');
const path = require('path');

const HEADERS = ['#','מאמן','מקצועיות 30%','נוכחות 25%','לקוחות 20%','הנהלה 15%','צמיחה 10%','ציון סופי'];
const COACHES = [
  'קרן דבוש','טל וזגיאל','דוד אשורי','דין שויקה','נועם כהן',
  'תום בריאולובסקי','ליאור מרגוליס','שלו אהרוני','דניאל לנדאו','סיון טפירו',
  'אריק מונטבילסקי','אופק סגל','אסף זוהר','ליז אפרגן','פיקאדו ינאו',
  'תמיר חלף','דובי מילר','וליד אבו חמוד','סהר ליכטנפלד','גילי ששון',
  'אייל רותם','יובל גורפיין','עידן אדלר'
];

const rows = COACHES.map((name, i) => {
  const r = i + 2; // שורת הגיליון (שורה 1 = כותרות)
  const formula = `=(C${r}*0.3+D${r}*0.25+E${r}*0.2+F${r}*0.15+G${r}*0.1)*20`;
  return [String(i + 1), name, '', '', '', '', '', formula].join('\t');
});

const tsv = [HEADERS.join('\t'), ...rows].join('\r\n');
fs.writeFileSync(path.join(__dirname, 'coach_eval.tsv'), tsv, 'utf8');
console.log('coach_eval.tsv נכתב — ' + (rows.length) + ' מאמנים');
