const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const game = require('../src/game.json').data;

test('Tundus and Emo Sky bullet URLs resolve to real local images after browser decoding', () => {
  for (const id of ['Ry9WhLFR7g', 'wjY6n30UkW', '9GFW92lh7K', 'QO2It59aJE', 'cMvxbT4XYa', 'Kji0WMuuP2']) {
    const url = game.projectileTypes[id].cellSheet.url;
    const file = path.resolve(__dirname, '..', '.' + decodeURIComponent(url));
    assert.ok(fs.existsSync(file), `${game.projectileTypes[id].name}: missing image ${url}`);
  }
});

for (const [name, id] of [['Tundus (Sixth Diva)', 'H6K6gpqlPE'], ['Emo & Sky', '2GjTUKR9Bz']]) {
  test(`${name} casts its projectile weapons through the real runtime`, () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'helpers/character-projectile-probe.js'), id],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('CHARACTER_PROJECTILES '));
    assert.ok(line, result.stdout);
    const report = JSON.parse(line.slice('CHARACTER_PROJECTILES '.length));
    assert.equal(Object.keys(report.errors).length, 0, JSON.stringify(report.errors));
  });
  test(`${name} fires by holding the player's mouse button`, () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'helpers/character-projectile-probe.js'), id, '--input'],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
