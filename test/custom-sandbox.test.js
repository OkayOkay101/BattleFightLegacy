'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SandboxManager, localRequest } = require('../server/custom-units/SandboxManager');
const { CustomUnitStore } = require('../server/custom-units/CustomUnitStore');
const root = path.resolve(__dirname, '..');
const game = JSON.parse(fs.readFileSync(path.join(root, 'src/game.json'))).data;

test('startup acquisition failure releases the starting lock and permits retry', async () => {
 const tmpRoot = path.join(root, 'build/custom-unit-tests'); fs.mkdirSync(tmpRoot, { recursive: true });
 const dir = fs.mkdtempSync(path.join(tmpRoot, 'startup-'));
 const store = new CustomUnitStore(dir, game);
 const baseId = 'NNGRxjPsrz';
 const unit = store.save({ baseId, name: 'Failure test', health: 100, speed: 10, weapons: game.unitTypes[baseId].defaultItems.map(x => x.key) });
 const blocked = path.join(dir, 'not-a-directory'); fs.writeFileSync(blocked, 'blocked');
 const manager = new SandboxManager({ root, directory: blocked, game, store });
 try {
  for (let n = 0; n < 2; n++) {
   await assert.rejects(manager.start({ id: unit.id, controller: 'human', opponent: baseId }), /EEXIST/);
   assert.equal(manager.starting, false); assert.equal(manager.active, null);
  }
 } finally { await manager.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sandbox WebSocket requires both arena origin and capability', () => {
 const { allowSandboxSocket } = require('../server/custom-units/SandboxAccess');
 const token = 'a'.repeat(64);
 const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { origin: 'http://127.0.0.1:12345' }, url: '/?custom-session=' + token };
 assert.ok(allowSandboxSocket(req, token, 12345));
 assert.ok(!allowSandboxSocket({ ...req, url: '/' }, token, 12345));
 assert.ok(!allowSandboxSocket({ ...req, headers: { origin: 'https://other.example' } }, token, 12345));
 assert.ok(!allowSandboxSocket({ ...req, url: '/?custom-session=' + 'b'.repeat(64) }, token, 12345));
});

test('asynchronous spawn error without exit still releases lock and snapshot', {timeout:10000}, async () => {
 const { EventEmitter } = require('events'); const { PassThrough } = require('stream');
 const tmpRoot = path.join(root,'build/custom-unit-tests'); fs.mkdirSync(tmpRoot,{recursive:true});
 const dir = fs.mkdtempSync(path.join(tmpRoot,'spawn-error-')); const store = new CustomUnitStore(dir,game);
 const baseId='NNGRxjPsrz'; const saved=store.save({baseId,name:'Spawn failure',health:100,speed:10,weapons:game.unitTypes[baseId].defaultItems.map(x=>x.key)});
 const forkProcess=()=>{const child=new EventEmitter(); child.stdout=new PassThrough(); child.stderr=new PassThrough(); child.kill=()=>false; child.send=()=>{};
  setImmediate(()=>{child.emit('error',new Error('spawn ENOENT'));setImmediate(()=>child.emit('close',-1));});return child;};
 const manager=new SandboxManager({root,directory:dir,game,store,forkProcess});
 try {
  await assert.rejects(manager.start({id:saved.id,controller:'human',opponent:baseId}),/ENOENT/);
  assert.equal(manager.active,null); assert.equal(manager.starting,false);
  assert.ok(!fs.readdirSync(dir).some(file=>file.startsWith('sandbox-')));
 } finally {await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('local API denies remote, cross-origin and rebound requests', () => {
 const req = (address, host, origin) => ({ socket: { remoteAddress: address }, headers: { host, origin } });
 assert.ok(localRequest(req('::ffff:127.0.0.1', '127.0.0.1:80', 'http://127.0.0.1:80')));
 assert.ok(!localRequest(req('192.168.1.5', '127.0.0.1:80')));
 assert.ok(!localRequest(req('127.0.0.1', 'evil.example')));
 assert.ok(!localRequest(req('127.0.0.1', 'localhost', 'https://evil.example')));
});

test('real sandbox uses isolated ports, fixed 1v1 lineup and dies on stop', { timeout: 60000 }, async t => {
 const tmpRoot = path.join(root, 'build/custom-unit-tests');
 fs.mkdirSync(tmpRoot, { recursive: true });
 const dir = fs.mkdtempSync(path.join(tmpRoot, 'sandbox-'));
 const store = new CustomUnitStore(dir, game);
 const baseId = 'NNGRxjPsrz';
 const saved = store.save({ baseId, name: 'Sandbox PewPew', health: 321, speed: 14,
  weapons: game.unitTypes[baseId].defaultItems.map(x => x.key) });
 const manager = new SandboxManager({ root, directory: dir, game, store, testMode: true });
 try {
  const session = await manager.start({ id: saved.id, controller: 'heuristic', opponent: baseId });
  assert.notEqual(session.httpPort, session.wsPort);
  assert.ok(session.url.startsWith('http://127.0.0.1:'));
  const WebSocket = require('ws');
  const denied = new WebSocket(`ws://127.0.0.1:${session.wsPort}/`, { origin: session.url });
  assert.equal(await new Promise((resolve, reject) => { denied.on('close', resolve); denied.on('error', reject); }), 1008);
  const data = await (await fetch(session.url + '/src/game.json')).json();
  assert.equal(data.data.unitTypes[saved.id].attributes.health.max, 321);
  assert.equal(data.data.unitTypes[baseId].attributes.health.max, game.unitTypes[baseId].attributes.health.max);
  const demo = await (await fetch(session.url + '/api/demo/status')).json();
  assert.equal(demo.demo.teams.blue.players.length, 1);
  assert.equal(demo.demo.teams.red.players.length, 1);
  assert.equal(demo.demo.teams.blue.players[0].characterId, saved.id);
  assert.equal(demo.demo.models.blue, 'baseline');
  function inspect(extra = {}) {
   return new Promise(resolve => {
    const listener = message => { if (message.type === 'sandbox-inspection') { manager.active.child.removeListener('message', listener); resolve(message); } };
    manager.active.child.on('message', listener); manager.active.child.send({ type: 'inspect-sandbox', ...extra });
   });
  }
  const before = await inspect({ duel: true });
  let after, seenProjectiles = 0;
  for (let n = 0; n < 12; n++) {
   await new Promise(resolve => setTimeout(resolve, 500));
   after = await inspect(); seenProjectiles = Math.max(seenProjectiles, after.projectiles);
  }
  assert.ok(after.units.some(unit => { const previous = before.units.find(old => old.id === unit.id); return previous && Math.hypot(unit.position.x - previous.position.x, unit.position.y - previous.position.y) > 5; }), JSON.stringify(after));
  assert.ok(seenProjectiles > 0, 'heuristic must fire real projectile skills');
  const victim = after.units.find(unit => unit.type === saved.id);
  await inspect({ kill: saved.id });
  await new Promise(resolve => setTimeout(resolve, 4000));
  const respawned = await inspect();
  assert.ok(respawned.units.some(unit => unit.type === saved.id && unit.id !== victim.id && unit.health > 0), JSON.stringify(respawned));
  assert.equal(respawned.stats.teams.blue.deaths, 1);
  const reset = await fetch(session.url + '/api/custom-sandbox/control', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Custom-Unit-Token': session.token }, body: JSON.stringify({ action: 'reset' }) });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).demo.teams.blue.deaths, 0);
  store.save({ ...saved, health: 999 });
  assert.equal(data.data.unitTypes[saved.id].attributes.health.max, 321);
  await assert.rejects(manager.start({ id: saved.id, controller: 'neural', opponent: baseId }));
  await manager.stop(session.id);
  assert.equal(manager.active, null);
  await assert.rejects(fetch(session.url + '/api/demo/status'));
  t.diagnostic('Isolated sandbox API, original definitions and 1v1 heuristic lineup verified');
 } finally { await manager.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
