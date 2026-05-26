const text = process.argv.slice(2).join(' ');
if (!text) { console.error('שימוש: node test "שאלה"'); process.exit(1); }

fetch('http://164.92.142.75/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
})
.then(r => r.json())
.then(j => {
    console.log('🔍 פירוש:', JSON.stringify(j.parsed));
    console.log('\n💬 תשובה:\n' + (j.reply || j.error));
})
.catch(e => console.error('❌', e.message));
