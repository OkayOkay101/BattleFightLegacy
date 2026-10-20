'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SandboxManager } = require('../server/custom-units/SandboxManager');
const { catalog } = require('../server/custom-units/CustomUnitStore');
const { soloCatalog } = require('../server/custom-units/SoloCatalog');
const { loadSnapshot } = require('../server/custom-units/SandboxRuntime');
const root = path.resolve(__dirname, '..');
const game = JSON.parse(fs.readFileSync(path.join(root, 'src/game.json'))).data;

test('Solo Test accepts native playable characters without a saved custom unit', async () => {
 const manager = new SandboxManager({ root, directory: '', game, store: null });
 assert.equal(typeof manager.startSolo, 'function');
 let captured;
 manager._startSnapshot = async snapshot => { captured = snapshot; return snapshot; };
 const before = JSON.stringify(game.unitTypes);
 const entries = soloCatalog(game);
 assert.equal(entries.length, 45);
 assert.equal(catalog(game).length,44,'custom catalog must not silently gain an unsupported adapter');
 for (const entry of entries) {
  await manager.startSolo({ characterId: entry.id });
  assert.equal(captured.mode, 'solo');
  assert.equal(captured.unit.id, entry.id);
  assert.equal(captured.controller, 'human');
 }
 await assert.rejects(manager.startSolo({ characterId: 'not-playable' }), /Unknown playable character/);
 assert.equal(JSON.stringify(game.unitTypes), before);
});

test('Solo snapshot preserves native definitions and creates no custom IDs', () => {
 const directory = path.join(root, 'build/solo-unit-tests'); fs.mkdirSync(directory, {recursive:true});
 const file = path.join(directory, 'snapshot.json');
 const data = structuredClone(game);
 fs.writeFileSync(file, JSON.stringify({ schemaVersion:1, mode:'solo', unit:{id:'morrowRouteCartographer',name:'Morrow'}, controller:'human', opponent:'NNGRxjPsrz' }));
 try {
  const snapshot = loadSnapshot(data, file);
  assert.equal(snapshot.compiled.id, 'morrowRouteCartographer');
  assert.deepEqual(Object.keys(data.unitTypes), Object.keys(game.unitTypes));
  for (const id of Object.keys(game.unitTypes)) {
   for (const field of ['attributes','bodies','defaultItems','cellSheet']) assert.deepEqual(data.unitTypes[id][field], game.unitTypes[id][field], id + ':' + field);
  }
 } finally { fs.unlinkSync(file); }
});

test('Morrow projectiles and route marker have readable world sizes', () => {
 for (const id of ['ol_eJa6Cej','Z1m9TfXgfi']) {
  assert.ok(game.projectileTypes[id].bodies.default.width >= 40, id + ' should be at least 40px');
  assert.ok(game.projectileTypes[id].bodies.default.height >= 40);
 }
 assert.ok(game.itemTypes.pTci7A1HLy.bodies.dropped.width >= 60);
 for (const id of ['pTci7A1HLy','morrowAtlasTelegraph']) assert.notEqual(game.itemTypes[id].lifeSpan,0,id+' must survive the engine frame until its owned skill timer fires');
});
