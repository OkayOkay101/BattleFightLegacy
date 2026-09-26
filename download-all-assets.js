const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const gamePath = path.resolve('./src/game.json');
const assetsDir = path.resolve('./assets');
const j = JSON.parse(fs.readFileSync(gamePath, 'utf8'));

// 1. Find all asset URLs in game.json
const urls = new Set();
function findUrls(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      if (v.includes('cache.modd.io') || v.includes('modd.s3.amazonaws.com') || v.includes('s3-us-west-1.amazonaws.com')) {
        urls.add(v);
      }
    } else if (typeof v === 'object') {
      findUrls(v);
    }
  }
}
findUrls(j);

console.log('Total asset URLs in game.json:', urls.size);

// Check which are missing
const toDownload = [];
for (const u of urls) {
  try {
    const parsed = new URL(u);
    const localPath = path.join(assetsDir, parsed.hostname, parsed.pathname);
    if (!fs.existsSync(localPath)) {
      toDownload.push({ url: u, localPath });
    }
  } catch(e) {}
}

console.log('Already present:', urls.size - toDownload.length);
console.log('To download/cache:', toDownload.length);

function downloadFile(item) {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(path.dirname(item.localPath), { recursive: true });
      const client = item.url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(item.localPath);
      const req = client.get(encodeURI(item.url), (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlink(item.localPath, () => {});
          return downloadFile({ url: res.headers.location, localPath: item.localPath }).then(resolve);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(item.localPath, () => {});
          return resolve({ url: item.url, ok: false, status: res.statusCode });
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve({ url: item.url, ok: true }); });
      });
      req.on('error', (e) => {
        file.close();
        fs.unlink(item.localPath, () => {});
        resolve({ url: item.url, ok: false, error: e.message });
      });
      req.setTimeout(10000, () => { req.destroy(); resolve({ url: item.url, ok: false, error: 'timeout' }); });
    } catch(e) {
      resolve({ url: item.url, ok: false, error: e.message });
    }
  });
}

async function run() {
  const concurrency = 10;
  const queue = [...toDownload];
  let done = 0;
  let failed = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      const res = await downloadFile(item);
      done++;
      if (!res.ok) failed++;
      if (done % 50 === 0 || done === toDownload.length) {
        console.log(`Progress: ${done}/${toDownload.length} (failed: ${failed})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`Done! Downloaded ${done - failed}, Failed: ${failed}`);
}

run();
