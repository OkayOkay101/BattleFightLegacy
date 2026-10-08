'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CustomUnitStore, catalog, compileUnit } = require('../server/custom-units/CustomUnitStore');
const { loadSnapshot } = require('../server/custom-units/SandboxRuntime');
const { buildTrainingRoster } = require('../server/training/TrainingRoster');
const game = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/game.json'))).data;
const baseId = 'NNGRxjPsrz';
const temporaryRoot = path.join(__dirname, '../build/custom-unit-tests');
fs.mkdirSync(temporaryRoot, { recursive: true });
const input = () => ({ baseId, name: 'My PewPew', health: 250, speed: 14,
 weapons: game.unitTypes[baseId].defaultItems.map(x => x.key) });

test('save, reopen, revise, copy and delete without changing the source definitions', () => {
 const dir = fs.mkdtempSync(path.join(temporaryRoot, 'bf-custom-'));
 try {
  const before = JSON.stringify(game);
  const store = new CustomUnitStore(dir, game);
  const saved = store.save(input());
  assert.equal(saved.revision, 1);
  assert.equal(new CustomUnitStore(dir, game).list().units[0].id, saved.id);
  const revised = store.save({ ...saved, health: 400 });
  assert.equal(revised.revision, 2);
  assert.throws(() => store.save({ ...saved, name: 'Stale' }), /revision/i);
  const copy = store.save({ ...input(), name: 'Copy' });
  assert.notEqual(copy.id, saved.id);
  const compiled = compileUnit(game, revised);
  assert.equal(compiled.unit.attributes.health.max, 400);
  assert.equal(compiled.unit.attributes.speed.value, 14);
  assert.equal(compiled.unit.attributes.speed.min, 0);
  assert.notEqual(compiled.id, baseId);
  assert.equal(JSON.stringify(game), before);
  store.remove(saved.id, revised.revision);
  assert.equal(store.list().units.length, 1);
  assert.throws(() => store.get('../escape'), /Invalid/);
 } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('invalid fields, incompatible weapons and unavailable prototypes are rejected', () => {
 const dir = fs.mkdtempSync(path.join(temporaryRoot, 'bf-custom-'));
 try {
  const store = new CustomUnitStore(dir, game);
  for (const patch of [{ health: NaN }, { speed: -1 }, { name: '' }, { weapons: ['missing'] }, { baseId: 'hLrbyj6dKv' }]) {
   assert.throws(() => store.save({ ...input(), ...patch }));
  }
  const list = catalog(game);
  assert.ok(list.find(x => x.id === baseId).available);
  assert.ok(list.find(x => x.id === '1yCQJedPRM').available);
  for (const entry of list.filter(x => x.available)) {
   entry.weapons.forEach((slot, n) => assert.ok(slot.some(x => x.id === entry.defaults.weapons[n])));
  }
 } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('corrupt saved files are reported and never silently replaced', () => {
 const dir = fs.mkdtempSync(path.join(temporaryRoot, 'bf-custom-'));
 try {
  const store = new CustomUnitStore(dir, game), saved = store.save(input());
  fs.writeFileSync(path.join(dir, saved.id + '.json'), '{broken');
  assert.equal(store.list().errors.length, 1);
  assert.throws(() => store.get(saved.id), /corrupt/i);
  assert.throws(() => store.save({ ...saved, name: 'overwrite' }), /corrupt/i);
 } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sandbox overlay does not enter the training roster or retain audio', () => {
 const dir = fs.mkdtempSync(path.join(temporaryRoot, 'bf-overlay-'));
 try {
  const store = new CustomUnitStore(dir, game), saved = store.save(input());
  const file = path.join(dir, 'snapshot.json');
  fs.writeFileSync(file, JSON.stringify({ unit: saved, opponent: baseId, controller: 'human' }));
  const copy = JSON.parse(JSON.stringify(game));
  const before = buildTrainingRoster(game);
  loadSnapshot(copy, file);
  assert.deepEqual(buildTrainingRoster(copy).eligible, before.eligible);
  assert.ok(!before.eligible.some(x => x.id === saved.id));
  assert.deepEqual(copy.sound, {});
  assert.deepEqual(copy.scripts.hRwdzzEwgW.triggers, []);
 } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
