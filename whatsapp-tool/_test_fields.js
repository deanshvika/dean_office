require('dotenv').config();
const fs = require('fs');
const { token, appId } = JSON.parse(fs.readFileSync('/root/whatsapp-tool/base44_token.json', 'utf8'));
const BASE_URL = 'https://base44.app/api/apps/' + appId;
const H = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

async function run() {
    // Full SubstitutionRequest structure
    console.log('\n=== SubstitutionRequest — full sample ===');
    const r1 = await fetch(BASE_URL + '/entities/SubstitutionRequest?limit=3', { headers: H });
    const d1 = await r1.json();
    const reqs = Array.isArray(d1) ? d1 : (d1.results || d1.items || d1.data || []);
    if (reqs.length > 0) {
        console.log('fields:', Object.keys(reqs[0]).join(', '));
        console.log('sample 1:', JSON.stringify(reqs[0], null, 2));
    }

    // Full Event structure
    console.log('\n=== Event — full sample ===');
    const r2 = await fetch(BASE_URL + '/entities/Event?limit=2', { headers: H });
    const d2 = await r2.json();
    const evs = Array.isArray(d2) ? d2 : (d2.results || d2.items || d2.data || []);
    if (evs.length > 0) {
        console.log('fields:', Object.keys(evs[0]).join(', '));
        console.log('sample:', JSON.stringify(evs[0], null, 2));
    }
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
