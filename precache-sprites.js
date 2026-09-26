/**
 * precache-sprites.js
 * Downloads all CDN assets referenced in game.json to local disk.
 * Run once: node precache-sprites.js
 */
const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const GAME_JSON = path.resolve('../BattleFight-export(1)/game.json');
const ASSETS_DIR = path.resolve('./assets');
const CONCURRENCY = 10; // parallel downloads

const j = JSON.parse(fs.readFileSync(GAME_JSON, 'utf8'));
const data = j.data;

// collect all unique CDN asset URLs
const urls = new Set();
['projectileTypes', 'unitTypes', 'itemTypes'].forEach(type => {
	Object.values(data[type] || {}).forEach(obj => {
		if (obj.cellSheet && obj.cellSheet.url && obj.cellSheet.url.startsWith('http')) {
			urls.add(obj.cellSheet.url);
		}
	});
});

// also include sound URLs if present
['projectileTypes', 'unitTypes', 'itemTypes'].forEach(type => {
	Object.values(data[type] || {}).forEach(obj => {
		if (obj.sound) {
			Object.values(obj.sound).forEach(s => {
				if (s && s.file && s.file.startsWith('http')) urls.add(s.file);
			});
		}
	});
});

const allUrls = [...urls];
console.log(`Total assets to cache: ${allUrls.size || allUrls.length}`);

// filter only missing
const toDownload = allUrls.filter(url => {
	try {
		const u = new URL(url);
		const localPath = path.join(ASSETS_DIR, u.hostname, u.pathname);
		return !fs.existsSync(localPath);
	} catch { return false; }
});

console.log(`Already cached: ${allUrls.length - toDownload.length}`);
console.log(`Need to download: ${toDownload.length}`);

if (toDownload.length === 0) {
	console.log('✅ All assets already cached!');
	process.exit(0);
}

function downloadFile(url) {
	return new Promise((resolve) => {
		try {
			const u = new URL(url);
			const localPath = path.join(ASSETS_DIR, u.hostname, u.pathname);
			fs.mkdirSync(path.dirname(localPath), { recursive: true });

			const client = url.startsWith('https') ? https : http;
			const file = fs.createWriteStream(localPath);
			const req = client.get(url, (res) => {
				if (res.statusCode === 301 || res.statusCode === 302) {
					file.close();
					fs.unlink(localPath, () => {});
					return downloadFile(res.headers.location).then(resolve);
				}
				if (res.statusCode !== 200) {
					file.close();
					fs.unlink(localPath, () => {});
					return resolve({ url, ok: false, status: res.statusCode });
				}
				res.pipe(file);
				file.on('finish', () => { file.close(); resolve({ url, ok: true }); });
			});
			req.on('error', (e) => {
				file.close();
				fs.unlink(localPath, () => {});
				resolve({ url, ok: false, error: e.message });
			});
			req.setTimeout(15000, () => { req.destroy(); resolve({ url, ok: false, error: 'timeout' }); });
		} catch (e) {
			resolve({ url, ok: false, error: e.message });
		}
	});
}

async function runBatch(urls, concurrency) {
	let done = 0, failed = 0;
	const queue = [...urls];

	async function worker() {
		while (queue.length > 0) {
			const url = queue.shift();
			const result = await downloadFile(url);
			done++;
			if (!result.ok) {
				failed++;
				process.stderr.write(`✗ ${url} (${result.error || result.status})\n`);
			}
			if (done % 50 === 0 || done === urls.length) {
				process.stdout.write(`Progress: ${done}/${urls.length} (failed: ${failed})\n`);
			}
		}
	}

	const workers = Array.from({ length: concurrency }, () => worker());
	await Promise.all(workers);
	return { done, failed };
}

(async () => {
	console.log(`\nDownloading ${toDownload.length} assets with ${CONCURRENCY} parallel connections...\n`);
	const { done, failed } = await runBatch(toDownload, CONCURRENCY);
	console.log(`\n✅ Done! ${done - failed} downloaded, ${failed} failed.`);
})();
