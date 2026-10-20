'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

test('Electron connects to its server and receives rendered player units', async (t) => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-game-test-'));
	try {
		const entry = path.resolve(__dirname, '../desktop/main.js');
		const selectedPolicy = process.env.BATTLEFIGHT_SMOKE_POLICY || null;
		const selectedSchema = Number(process.env.BATTLEFIGHT_SMOKE_SCHEMA || 2);
		const inspect = `(async () => {
if (!window.ige || !ige.client || !ige.client.server || !ige.network || !ige.pixi || ige.pixi.loader.progress !== 100) return null;
if (!window.__desktopSmokeStarted) {
 window.__desktopSmokeStarted = true;
 if (${JSON.stringify(selectedPolicy)}) {
  const selected = await fetch('/api/demo/policies', {method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({blue:${JSON.stringify(selectedPolicy)},red:'champion'})});
  if (!selected.ok) throw new Error('V2 desktop selection rejected: '+await selected.text());
 }
 window.trainingDemoMode = 'spectate';
 ige.client.connectToServer();
}
const units = ige.$$('unit').filter(unit => !!unit._stats.ownerId);
const spriteErrors = Object.values(ige.game.data.unitTypes).map(type => type.cellSheet && type.cellSheet.url).filter(url => url && ige.pixi.loader.resources[url] && ige.pixi.loader.resources[url].error);
const projectileIds = ['Ry9WhLFR7g', 'wjY6n30UkW', '9GFW92lh7K', 'QO2It59aJE', 'cMvxbT4XYa', 'Kji0WMuuP2'];
const projectileSprites = projectileIds.filter(id => {
 const type = ige.game.data.projectileTypes[id];
 const resource = type && type.cellSheet && ige.pixi.loader.resources[type.cellSheet.url];
 return resource && !resource.error && resource.texture && resource.texture.valid;
}).length;
const demo = ${JSON.stringify(selectedPolicy)} ? (await (await fetch('/api/demo/status')).json()).demo : null;
return {url:ige.network._url, expected:ige.client.server.url, units:units.length, spriteErrors, projectileSprites, demo,
 sprites:units.filter(unit => unit._pixiTexture && unit._pixiTexture.texture && unit._pixiTexture.texture.valid && unit._pixiContainer && unit._pixiContainer.visible).length};
})()`;
		fs.writeFileSync(path.join(directory, 'main.js'), `
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
app.setPath('userData', path.join(__dirname, 'user-data'));
const deadline = setTimeout(() => app.exit(2), 35000);
app.on('web-contents-created', (_, contents) => {
 contents.once('did-finish-load', () => {
  const poll = setInterval(async () => {
   try {
    const state = await contents.executeJavaScript(${JSON.stringify(inspect)});
    if (state) fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(state));
    if (state && state.units > 0 && state.sprites > 0) {
     clearInterval(poll); clearTimeout(deadline); app.quit();
    }
   } catch (error) {
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify({error:error.message}));
   }
  }, 1000);
  contents.once('destroyed', () => clearInterval(poll));
 });
});
require(${JSON.stringify(entry)});
`);
		const child = spawn(require('electron'), [path.join(directory, 'main.js')], {
			env: { ...process.env, NODE_PATH: path.resolve(__dirname, '../node_modules') },
			stdio: 'ignore', windowsHide: true, timeout: 45000
		});
		const code = await new Promise((resolve, reject) => {
			child.once('error', reject);
			child.once('exit', resolve);
		});
		const resultPath = path.join(directory, 'result.json');
		const result = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : {};
		assert.equal(code, 0, `Game startup failed: ${JSON.stringify(result)}`);
		assert.equal(result.url, result.expected);
		assert.ok(result.units > 0 && result.sprites > 0, JSON.stringify(result));
		assert.deepEqual(result.spriteErrors, [], 'all character sprite sheets must load');
		assert.equal(result.projectileSprites, 6, 'all Tundus and Emo Sky projectile sprites must load');
		if (selectedPolicy) {
			assert.equal(result.demo.resolvedModels.blue, selectedPolicy);
			assert.equal(result.demo.teams.blue.schemaVersion, selectedSchema);
			assert.equal(result.demo.neuralError, null);
		}
		t.diagnostic(`Received ${result.units} player units with ${result.sprites} valid visible sprites and ${result.projectileSprites} projectile textures at ${result.url}`);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
