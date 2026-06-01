// continue.js — Connect to the already-running controlled Chrome (port 9333),
// wait until the user finishes signing in, then scrape the Drive folder and
// download every file.

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const puppeteer = require('puppeteer-core');

const FOLDER_URL = process.argv[2] || 'https://drive.google.com/drive/folders/1VwYUoF1gcLygRhn2_q9mGuDrfIp9pBjX';
const DEBUG_PORT = 9333;
const DOWNLOADS = path.join(__dirname, 'downloads');

function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getWSUrl() {
  const data = await new Promise((resolve) => {
    const r = http.get(`http://localhost:${DEBUG_PORT}/json/version`, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    r.on('error', () => resolve(null));
  });
  if (!data) throw new Error('Chrome not reachable on port ' + DEBUG_PORT);
  return JSON.parse(data).webSocketDebuggerUrl;
}

async function findDrivePage(browser) {
  const pages = await browser.pages();
  let candidate = pages.find(p => p.url().includes('drive.google.com'));
  if (candidate) return candidate;
  candidate = pages.find(p => p.url().includes('accounts.google.com'));
  if (candidate) return candidate;
  return pages[0];
}

async function waitForLogin(page) {
  log('Waiting for sign-in to complete (max 5 minutes)...');
  for (let i = 0; i < 300; i++) {
    const url = page.url();
    if (url.includes('drive.google.com') && !url.includes('accounts.google.com')) {
      log(`signed in! url=${url}`);
      return;
    }
    if (i % 10 === 0) log(`  still on: ${url.slice(0, 80)}`);
    await sleep(1000);
  }
  throw new Error('Timed out waiting for sign-in');
}

async function scrapeFolder(page) {
  log('Ensuring we are on the target folder...');
  if (!page.url().includes('/folders/')) {
    await page.goto(FOLDER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  log('Waiting for folder UI...');
  await sleep(8000);

  // Switch to list view to get consistent DOM
  // Try to extract files via [data-id] which Drive uses on rows.
  let files = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    document.querySelectorAll('[data-id]').forEach(el => {
      const id = el.getAttribute('data-id');
      if (!id || seen.has(id)) return;
      // skip likely-non-file nodes
      if (id.length < 10) return;
      seen.add(id);
      const aria = el.getAttribute('aria-label') || '';
      const text = (el.innerText || '').split('\n')[0] || '';
      out.push({ id, name: aria || text });
    });
    return out;
  });

  if (files.length === 0) {
    log('No items via [data-id]. Trying alternate selector...');
    files = await page.evaluate(() => {
      const out = [];
      // Drive sometimes uses jsname / role=link in newer UI
      document.querySelectorAll('div[role="gridcell"] [data-tooltip]').forEach(el => {
        const name = el.getAttribute('data-tooltip');
        if (name) out.push({ id: null, name });
      });
      return out;
    });
  }

  log(`scraped ${files.length} items`);
  fs.writeFileSync(path.join(__dirname, 'file_list.json'), JSON.stringify(files, null, 2));
  return files;
}

async function downloadFile(page, fileId, destPath) {
  // Use CDP to download via the authenticated session.
  // Easiest: navigate a new tab to the download URL and let Chrome save it.
  const client = await page.target().createCDPSession();
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOADS,
  });
  const url = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  log(`  downloading ${fileId} via ${url}`);
  // Open in same tab to trigger download
  try {
    await page.evaluate((u) => { window.location.href = u; }, url);
  } catch (e) {}
  await sleep(4000);
}

async function downloadAllViaFetch(page, files) {
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  // Use page.evaluate + fetch to get blobs with session cookies, then save via Node.
  // We'll send file contents back as base64.
  for (const f of files) {
    if (!f.id) continue;
    const dst = path.join(DOWNLOADS, sanitize(f.name || f.id));
    if (fs.existsSync(dst)) { log(`  skip (exists) ${f.name}`); continue; }
    log(`  fetching ${f.name} (${f.id})`);
    const url = `https://drive.google.com/uc?export=download&id=${f.id}&confirm=t`;
    try {
      const result = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) return { ok: false, status: r.status };
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        const b64 = btoa(bin);
        const ct = r.headers.get('content-type') || '';
        const cd = r.headers.get('content-disposition') || '';
        return { ok: true, b64, contentType: ct, contentDisposition: cd, size: bytes.length };
      }, url);
      if (!result.ok) { log(`    FAIL status=${result.status}`); continue; }
      log(`    got ${result.size} bytes, type=${result.contentType}`);
      // If content-type is HTML and small, it's likely the "scan warning" page for big files
      // — for Docs/Sheets, will need export endpoint instead.
      fs.writeFileSync(dst, Buffer.from(result.b64, 'base64'));
      log(`    saved -> ${dst}`);
    } catch (e) {
      log(`    error: ${e.message}`);
    }
  }
}

function sanitize(name) {
  return (name || 'unnamed').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 180);
}

async function main() {
  const wsUrl = await getWSUrl();
  log(`connecting to ${wsUrl}`);
  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl, defaultViewport: null });
  let page = await findDrivePage(browser);
  await waitForLogin(page);
  // After login, the page might be the Drive root. Navigate to target.
  await page.goto(FOLDER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const files = await scrapeFolder(page);
  if (files.length > 0) {
    await downloadAllViaFetch(page, files);
  } else {
    log('No files found — dumping page for inspection.');
    fs.writeFileSync(path.join(__dirname, 'page_dump.html'), await page.content());
  }
  await browser.disconnect();
  log('done');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
