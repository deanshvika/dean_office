const fs = require('fs');
const buf = fs.readFileSync('C:/Temp/ch_hist.db');
const str = buf.toString('latin1');
const regex = /https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+\/[^\x00\s"]*/g;
const matches = str.match(regex) || [];
const unique = [...new Set(matches.map(u => u.replace(/[^\x20-\x7e].*$/, '')))];
console.log('נמצאו', unique.length, 'URLs של Google Docs:');
unique.slice(0, 30).forEach((u, i) => console.log(i+1, u));
