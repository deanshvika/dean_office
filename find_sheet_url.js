const fs = require('fs');

// קרא את קובץ ה-History כ-binary וחפש URLs של Google Sheets
const buf = fs.readFileSync('C:/Temp/ch.db');
const str = buf.toString('latin1');

// חפש את כל URLs של Google Sheets
const regex = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/[^\x00\s"]*/g;
const matches = str.match(regex) || [];
const unique = [...new Set(matches)];

console.log('נמצאו', unique.length, 'URLs של Google Sheets:');
unique.slice(0, 15).forEach((u, i) => console.log(i+1, u));
