'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

for (const mode of ['electron', 'web']) test(`${mode} weapon editor CRUD, translation, persistence and streamed projectile gameplay`, { timeout: 100000 }, async t => {
 const baseId='NNGRxjPsrz';
 const root = path.resolve(__dirname, '..');
 const tmpRoot = path.join(root, 'build/custom-unit-tests'); fs.mkdirSync(tmpRoot, { recursive: true });
 const dir = fs.mkdtempSync(path.join(tmpRoot, 'electron-'));
 const mainInspect = `(async () => {
 if (!window.ige || !ige.pixi || ige.pixi.loader.progress !== 100) return { waiting: true, ige: !!window.ige, pixi: !!window.ige?.pixi, progress: window.ige?.pixi?.loader?.progress };
 if (!window.__editorTest) {
  window.__editorTest = 1; document.getElementById('custom-unit-open').click(); return null;
 }
 const base = document.getElementById('custom-unit-base');
 if (!base.options.length) return null;
 if (window.__editorTest === 1) {
  document.getElementById('custom-weapon-tab').click(); window.__editorTest = 10; return null;
 }
 if (window.__editorTest === 10) {
  if (!document.getElementById('custom-weapon-name').value) return null;
  document.getElementById('custom-weapon-name').value = 'GUI Burst';
  document.getElementById('custom-weapon-pattern').value = 'burst';
  document.getElementById('custom-weapon-pattern').dispatchEvent(new Event('input',{bubbles:true}));
  document.getElementById('custom-weapon-damage').value = '19';
  document.getElementById('custom-weapon-form').requestSubmit(); window.__editorTest = 11; return null;
 }
 if (window.__editorTest === 11) {
  const w = await (await fetch('/api/custom-weapons')).json();
  if (!w.weapons.length || document.getElementById('custom-weapon-message').textContent === window.gameI18n.t('custom.working')) return null;
  window.__weapon = w.weapons[0];
  if (document.querySelectorAll('#custom-weapon-list button').length !== 1) throw new Error('Weapon list missing');
  document.getElementById('custom-weapon-damage').value = '10';
  document.getElementById('custom-weapon-form').requestSubmit();window.__editorTest = 12;return null;
 }
 if (window.__editorTest === 12) {
  const w = await (await fetch('/api/custom-weapons')).json();
  if (w.weapons[0]?.revision !== 2 || document.getElementById('custom-weapon-message').textContent === window.gameI18n.t('custom.working')) return null;
  window.__weapon = w.weapons[0];
  document.getElementById('custom-weapon-copy').click();
  document.getElementById('custom-weapon-form').requestSubmit();window.__editorTest = 13;return null;
 }
 if (window.__editorTest === 13) {
  const w = await (await fetch('/api/custom-weapons')).json();
  if (w.weapons.length !== 2 || document.getElementById('custom-weapon-message').textContent === window.gameI18n.t('custom.working')) return null;
  window.confirm = () => true;document.getElementById('custom-weapon-delete').click();window.__editorTest = 14;return null;
 }
 if (window.__editorTest === 14) {
  const w = await (await fetch('/api/custom-weapons')).json();
  if (w.weapons.length !== 1 || document.getElementById('custom-weapon-message').textContent === window.gameI18n.t('custom.working')) return null;
  document.getElementById('custom-unit-tab').click();window.__editorTest = 15;return null;
 }
 if (window.__editorTest === 15) {
  if(base.options.length !== 44) throw new Error('Expected 44 playable prototypes');
  base.value = 'TtQ4275KLf'; base.dispatchEvent(new Event('change'));
  if(!document.getElementById('custom-unit-hints').textContent.includes('Form changes')) throw new Error('Form hint missing');
  base.value = '${baseId}'; base.dispatchEvent(new Event('change'));
  document.getElementById('custom-unit-name').value = 'Electron Custom Adapter';
  document.getElementById('custom-unit-health').value = '432';
  document.getElementById('custom-unit-speed').value = '14';
  document.getElementById('custom-unit-opponent').value = '${baseId}';
  document.querySelectorAll('#custom-unit-weapons select').forEach(select => { select.value = window.__weapon.id; select.dispatchEvent(new Event('change'));if (!select.nextElementSibling?.nextElementSibling?.textContent && !select.parentElement.querySelector('.custom-warning')?.textContent) throw new Error('Replacement warning missing'); });
  document.getElementById('custom-unit-form').requestSubmit(); window.__editorTest = 2; return null;
 }
 const data = await (await fetch('/api/custom-units')).json();
 if (!data.units.length || document.getElementById('custom-unit-start').disabled) return null;
 if (window.__editorTest === 2) {
  document.getElementById('custom-unit-name').value = 'Unsaved draft';
  window.gameI18n.setLanguage('th');
  if (document.getElementById('custom-unit-title').textContent !== 'ยูนิตสร้างเอง') throw new Error('Thai editor text missing');
  if (document.getElementById('custom-unit-name').value !== 'Unsaved draft') throw new Error('Language switch erased the draft');
  window.__editorTest = 3; return null;
 }
 if (window.__editorTest === 3 && document.getElementById('custom-unit-message').textContent !== window.gameI18n.t('custom.working')) {
  document.getElementById('custom-unit-start').click(); window.__editorTest = 4;
 }
 return { weapon: window.__weapon, saved: data.units[0], message: document.getElementById('custom-unit-message').textContent };
})()`;
 const sandboxInspect = `(async () => {
 if (!window.ige || !ige.pixi || ige.pixi.loader.progress !== 100 || !ige.client?.server || !window.isCustomSandbox) return { waiting: true, ige: !!window.ige,
  progress: window.ige?.pixi?.loader?.progress, server: !!window.ige?.client?.server, custom: !!window.isCustomSandbox };
 if (!window.__sandboxConnected) { window.__sandboxConnected = true; window.trainingDemoMode = 'fight'; document.getElementById('play-game-button').click(); return null; }
 const custom = ige.$$('unit').find(unit => unit._stats.type.startsWith('cu-'));
 const opponent = ige.$$('unit').find(unit => unit._stats.type === '${baseId}');
 if (!custom || !opponent || !ige.client.myPlayer?.getSelectedUnit()) return { waiting: true, custom: !!custom, opponent: !!opponent, player: !!ige.client.myPlayer, units: ige.$$('unit').map(x=>x._stats.type) };
 const sprite = custom._pixiTexture?.texture?.valid;
 if (!window.__humanInput) {
  const directions = [{key:'w',dx:0,dy:-50},{key:'d',dx:50,dy:0},{key:'s',dx:0,dy:50},{key:'a',dx:-50,dy:0}];
  const walls = ige.map.data.layers.find(layer => layer.name === 'walls');
  const direction = directions.find(d=>{ const x=Math.floor((custom._translate.x+d.dx)/ige.scaleMapDetails.tileWidth), y=Math.floor((custom._translate.y+d.dy)/ige.scaleMapDetails.tileHeight); return x>=0 && y>=0 && x<ige.map.data.width && y<ige.map.data.height && !walls?.data[y*ige.map.data.width+x]; }) || directions[0];
  window.__humanInput = { at: Date.now(), x: custom._translate.x, y: custom._translate.y, key: direction.key };
  return { input: direction.key };
 }
 window.__humanInput.projectiles = Math.max(window.__humanInput.projectiles || 0, ige.$$('projectile').length);
 if (Date.now() - window.__humanInput.at < 1600) return null;
 if (Date.now() - window.__humanInput.at < 6500 && (!window.__humanInput.projectiles || Math.hypot(custom._translate.x-window.__humanInput.x,custom._translate.y-window.__humanInput.y)<5)) return {input:window.__humanInput.key};
 const demo = (await (await fetch('/api/demo/status')).json()).demo;
 return { sprite, health: custom._stats.attributes.health.max, type: custom._stats.type,
  selected: ige.client.myPlayer.getSelectedUnit()._stats.type, url: ige.network._url,
  expected: ige.client.server.url, players: demo.teams.blue.players.length + demo.teams.red.players.length,
  editorHidden: document.getElementById('custom-unit-open').hidden, mode: window.trainingDemoMode,
  visible: custom._pixiContainer?.visible, projectiles: window.__humanInput.projectiles,
  items: custom._stats.itemIds, currentItem: custom.getCurrentItem()?._stats.itemTypeId,
  movement: Math.hypot(custom._translate.x - window.__humanInput.x, custom._translate.y - window.__humanInput.y) };
})()`;
 fs.writeFileSync(path.join(dir, 'main.js'), `
const { app, BrowserWindow } = require('electron'); const fs = require('fs'); const path = require('path');
app.setPath('userData', path.join(__dirname, 'user-data'));
process.env.BATTLEFIGHT_RESOURCE_ROOT = ${JSON.stringify(root)};
delete process.env.BATTLEFIGHT_CUSTOM_UNITS;
const result = { errors: [] }; let mainContents; let finishing = false;
const deadline = setTimeout(() => { fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result)); app.quit(); }, 75000);
app.on('web-contents-created', (_, contents) => {
 if (!mainContents) mainContents = contents;
 contents.on('console-message', (...args) => { const m = typeof args[1] === 'object' ? args[1].message : args[2]; if (/error|failed/i.test(m || '')) result.errors.push(String(m).slice(0,300)); });
 contents.on('did-finish-load', () => {
  if (contents.getURL() === 'about:blank') return;
  const sandbox = contents !== mainContents;
  const timer = setInterval(async () => {
   try {
    const state = await contents.executeJavaScript(sandbox ? ${JSON.stringify(sandboxInspect)} : ${JSON.stringify(mainInspect)});
    if (state) result[sandbox ? 'sandbox' : 'editor'] = state;
    if (state?.input) {
     BrowserWindow.fromWebContents(contents).show(); BrowserWindow.fromWebContents(contents).focus();
     contents.focus();
     contents.sendInputEvent({type:'keyDown',keyCode:state.input.toUpperCase()});
     contents.sendInputEvent({type:'mouseMove',x:740,y:410});
     contents.sendInputEvent({type:'mouseDown',x:740,y:410,button:'left',clickCount:1});
    }
    fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result));
    if (sandbox && state?.sprite && !finishing) {
     contents.sendInputEvent({type:'keyUp',keyCode:'W'});
     contents.sendInputEvent({type:'keyUp',keyCode:'A'});
     contents.sendInputEvent({type:'keyUp',keyCode:'S'});
     contents.sendInputEvent({type:'keyUp',keyCode:'D'});
     contents.sendInputEvent({type:'mouseUp',x:740,y:410,button:'left',clickCount:1});
     finishing = true; clearTimeout(deadline); clearInterval(timer);
     fs.writeFileSync(${JSON.stringify(path.join(root, 'build/custom-unit-smoke.json'))}, JSON.stringify(state));
     fs.writeFileSync(${JSON.stringify(path.join(root, 'build/custom-unit-preview.png'))}, (await contents.capturePage()).toPNG());
     fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result));
     BrowserWindow.fromWebContents(contents).close();
     setTimeout(async () => {
      const status = await mainContents.executeJavaScript("fetch('/api/custom-units/sandbox/status').then(r=>r.json())");
      result.stopped = status.session === null;
      fs.writeFileSync(path.join(__dirname, 'result.json'), JSON.stringify(result)); app.quit();
     }, 2000);
    }
   } catch (error) { result.errors.push(error.message); }
  }, 800);
  contents.once('destroyed', () => clearInterval(timer));
 });
});
if (${JSON.stringify(mode)} === 'electron') require(${JSON.stringify(path.join(root, 'desktop/main.js'))});
else {
 const { fork } = require('child_process'); let server; let quitting = false;
 app.whenReady().then(() => {
  server = fork(${JSON.stringify(path.join(root, 'server/custom-units/sandbox-entry.js'))}, ['-g','./src'], {
   cwd: ${JSON.stringify(root)}, execArgv: [], stdio:['ignore','ignore','ignore','ipc'],
   env: {...process.env, ELECTRON_RUN_AS_NODE:'1', BATTLEFIGHT_DESKTOP:'1', BATTLEFIGHT_SANDBOX:'',
    BATTLEFIGHT_USER_DATA:path.join(__dirname,'user-data','training-data')}
  });
  server.on('message', msg => {
   if (msg.type !== 'battlefight-ready') return;
   const window = new BrowserWindow({width:1280,height:850,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
   window.webContents.setWindowOpenHandler(() => ({action:'allow',overrideBrowserWindowOptions:{show:true,webPreferences:{backgroundThrottling:false}}}));
   window.webContents.session.webRequest.onBeforeRequest((details,callback)=>{
    let allowed = details.url === 'about:blank'; try {allowed = allowed || new URL(details.url).hostname === '127.0.0.1';}catch(_){}
    callback({cancel:!allowed});
   });
   window.loadURL('http://127.0.0.1:'+msg.httpPort);
  });
 });
 app.on('before-quit', event => {
  if (!server || quitting) return; event.preventDefault(); quitting = true;
  server.once('exit',()=>app.quit()); server.send({type:'battlefight-shutdown'});
 });
}
`);
 const child = spawn(require('electron'), [path.join(dir, 'main.js')], { env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') },
  stdio: 'ignore', windowsHide: true, timeout: 90000 });
 try {
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  const file = path.join(dir, 'result.json'); const result = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
  assert.equal(code, 0, JSON.stringify(result));
  assert.ok(result.sandbox?.sprite, JSON.stringify(result));
  assert.equal(result.sandbox.health, 432);
  assert.equal(result.sandbox.selected, result.editor.saved.id);
  assert.equal(result.sandbox.players, 2);
  assert.equal(result.sandbox.url, result.sandbox.expected);
  assert.ok(result.sandbox.visible);
  assert.ok(result.sandbox.movement > 5, JSON.stringify(result));
  assert.ok(result.sandbox.projectiles > 0, JSON.stringify(result));
  assert.ok(result.stopped, JSON.stringify(result));
  const { CustomUnitStore } = require('../server/custom-units/CustomUnitStore');
  const game = JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
  const reopened = new CustomUnitStore(path.join(dir,'user-data','custom-units'),game).get(result.editor.saved.id);
  assert.equal(reopened.health,432); assert.equal(reopened.revision,1);
  assert.ok(reopened.weapons.every(id=>id===result.editor.weapon.id));
  const weapon = new CustomUnitStore(path.join(dir,'user-data','custom-units'),game).weaponStore.get(result.editor.weapon.id);
  assert.equal(weapon.revision,2); assert.equal(weapon.damage,10);assert.equal(weapon.pattern,'burst');
  t.diagnostic(JSON.stringify(result));
 } finally { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
});
