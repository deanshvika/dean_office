const fs = require('fs');

// קרא את קובץ ה-History ומצא את ה-URL החדש ביותר של Google Sheets
// Chrome שומר timestamps כ-microseconds מ-1601-01-01
const buf = fs.readFileSync('C:/Temp/ch2.db');

// חפש URLs של Sheets
const str = buf.toString('binary');
const regex = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/g;

// מצא את כל ה-IDs הייחודיים
const ids = new Set();
let m;
while ((m = regex.exec(str)) !== null) {
  ids.add(m[1]);
}

console.log('כל IDs שנמצאו:', [...ids].length);

// עכשיו חפש כל ID וספור כמה פעמים הוא מופיע - החדש ביותר יופיע פחות פעמים
const counts = {};
for (const id of ids) {
  const re = new RegExp(id, 'g');
  const c = (str.match(re) || []).length;
  counts[id] = c;
}

// מיין לפי מספר הופעות (פחות = חדש יותר)
const sorted = Object.entries(counts).sort((a,b) => a[1]-b[1]);
console.log('\nלפי מספר הופעות (פחות הופעות = חדש יותר):');
sorted.slice(0,8).forEach(([id, c]) => {
  console.log(`  ${c} פעמים: https://docs.google.com/spreadsheets/d/${id}/edit`);
});
