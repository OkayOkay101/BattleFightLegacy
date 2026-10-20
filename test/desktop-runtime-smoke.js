'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

test('desktop entry resolves packaged dependencies in an Electron utility process', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-runtime-test-'));
	try {
		fs.copyFileSync(path.resolve(__dirname, '../server/desktop-entry.js'), path.join(directory, 'desktop-entry.js'));
		fs.writeFileSync(path.join(directory, 'ige.js'), `
require('q');
process.parentPort.postMessage({ type: 'dependency-ready' });
process.exit(0);
`);
		fs.writeFileSync(path.join(directory, 'main.js'), `
const { app, utilityProcess } = require('electron');
const fs = require('fs');
const path = require('path');
app.whenReady().then(() => {
 const child = utilityProcess.fork(path.join(__dirname, 'desktop-entry.js'), [], {
  env: { ...process.env, BATTLEFIGHT_RESOURCE_ROOT: __dirname,
   BATTLEFIGHT_USER_DATA: path.join(__dirname, 'user', 'training-data') }
 });
 const timer = setTimeout(() => { child.kill(); app.exit(2); }, 10000);
 child.on('message', message => {
  fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(message));
  if (message.type === 'battlefight-error') child.postMessage({ type: 'battlefight-shutdown' });
 });
 child.on('exit', () => { clearTimeout(timer); app.quit(); });
});
`);
		const executable = require('electron');
		const child = spawn(executable, [path.join(directory, 'main.js')], {
			env: { ...process.env, NODE_PATH: path.resolve(__dirname, '../node_modules') },
			stdio: 'ignore', windowsHide: true, timeout: 20000
		});
		const code = await new Promise((resolve, reject) => {
			child.once('error', reject);
			child.once('exit', resolve);
		});
		assert.equal(code, 0, 'Electron runtime must exit cleanly');
		const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'));
		assert.equal(result.type, 'dependency-ready', result.message || JSON.stringify(result));
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
