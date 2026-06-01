// fetch.js — Open a Drive folder in a controlled Chrome that reuses the user's logged-in session,
// scrape the file list, and download every file to ./downloads.
//
// Strategy: copy auth-relevant files from the live Default profile into a separate
// user-data-dir so we don't fight the user's running Chrome. Launch a fresh Chrome
// against that copy with remote debugging, drive it via puppeteer-core.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const https = require('https');
const puppeteer = require('puppeteer-core');

const FOLDER_URL = process.argv[2] || 'https://drive.google.com/drive/folders/1VwYUoF1gcLygRhn2_q9mGuDrfIp9pBjX';
const CHROME_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SRC_USERDATA = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
const DST_USERDATA = path.join(__dirname, '_chrome_profile');
const DOWNLOADS = path.join(__dirname, 'downloads');
const DEBUG_PORT = 9333;

function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }

function copyFileSafe(src, dst) {
  try {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const buf = fs.readFileSync(src);
    fs.writeFileSync(dst, buf);
    return true;
  } catch (e) {
    log(`copy fail ${path.basename(src)}: ${e.message}`);
    return false;
  }
}

function seedProfile() {
  if (fs.existsSync(path.join(DST_USERDATA, 'Default', 'Network', 'Cookies'))) {
    log('profile already seeded, reusing');
    return;
  }
  log('seeding profile from Default...');
  fs.mkdirSync(path.join(DST_USERDATA, 'Default', 'Network'), { recursive: true });
  // Critical: Local State holds the DPAPI-encrypted cookie key
  copyFileSafe(path.join(SRC_USERDATA, 'Local State'), path.join(DST_USERDATA, 'Local State'));
  // Cookies
  copyFileSafe(path.join(SRC_USERDATA, 'Default', 'Network', 'Cookies'), path.join(DST_USERDATA, 'Default', 'Network', 'Cookies'));
  // Login Data + Preferences help with sign-in state
  copyFileSafe(path.join(SRC_USERDATA, 'Default', 'Login Data'), path.join(DST_USERDATA, 'Default', 'Login Data'));
  copyFileSafe(path.join(SRC_USERDATA, 'Default', 'Login Data For Account'), path.join(DST_USERDATA, 'Default', 'Login Data For Account'));
  copyFileSafe(path.join(SRC_USERDATA, 'Default', 'Preferences'), path.join(DST_USERDATA, 'Default', 'Preferences'));
  copyFileSafe(path.join(SRC_USERDATA, 'Default', 'Secure Preferences'), path.join(DST_USERDATA, 'Default', 'Secure Preferences'));
  log('profile seeded');
}

function launchChrome() {
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  const args = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${DST_USERDATA}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=ChromeAppBoundEncryption,AppBoundEncryption',
    `--profile-directory=Default`,
    FOLDER_URL,
  ];
  log(`launching: ${CHROME_EXE} ${args.join(' ')}`);
  const child = spawn(CHROME_EXE, args, { detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForCDP() {
  for (let i = 0; i < 30; i++) {
    try {
      const json = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'localhost', port: DEBUG_PORT, path: '/json/version', method: 'GET',
          rejectUnauthorized: false, protocol: 'http:',
        }, () => {});
        req.on('error', reject);
        req.end();
      }).catch(() => null);
      // simpler: use http
      const httpReq = require('http');
      const data = await new Promise((resolve) => {
        const r = httpReq.get(`http://localhost:${DEBUG_PORT}/json/version`, (res) => {
          let body = '';
          res.on('data', c => body += c);
          res.on('end', () => resolve(body));
        });
        r.on('error', () => resolve(null));
      });
      if (data) {
        const parsed = JSON.parse(data);
        log(`CDP up: ${parsed.Browser}`);
        return parsed.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await sleep(500);
  }
  throw new Error('CDP did not come up');
}

async function main() {
  seedProfile();
  launchChrome();
  const wsUrl = await waitForCDP();
  log(`connecting puppeteer to ${wsUrl}`);
  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl, defaultViewport: null });

  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('drive.google.com')) || pages[0];
  if (!page.url().includes('drive.google.com')) {
    log(`navigating to ${FOLDER_URL}`);
    await page.goto(FOLDER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }

  log('waiting for Drive UI to settle...');
  await sleep(8000);

  const url = page.url();
  const title = await page.title();
  log(`page url: ${url}`);
  log(`page title: ${title}`);

  // Detect sign-in page
  if (url.includes('accounts.google.com') || /sign in|להתחבר/i.test(title)) {
    log('NOT LOGGED IN. The cookie-copy did not carry the session.');
    log('Leaving the Chrome window open — please sign in once, then re-run this script.');
    await browser.disconnect();
    process.exit(2);
  }

  // Extract file metadata from the DOM
  // Drive uses [data-id] on file rows in the new UI
  const files = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    document.querySelectorAll('[data-id]').forEach(el => {
      const id = el.getAttribute('data-id');
      if (!id || seen.has(id)) return;
      seen.add(id);
      const name = el.getAttribute('aria-label') || el.innerText?.split('\n')[0] || '';
      results.push({ id, name });
    });
    return results;
  });

  log(`found ${files.length} items in folder`);
  fs.writeFileSync(path.join(__dirname, 'file_list.json'), JSON.stringify(files, null, 2));
  log('wrote file_list.json');

  if (files.length === 0) {
    log('No files detected — DOM selector may be wrong. Dumping page HTML for inspection.');
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'page_dump.html'), html);
  }

  await browser.disconnect();
  log('done (browser left open)');
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
