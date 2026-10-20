const assert = require('node:assert/strict');
const { bootTrainingGame } = require('../../server/training/MatchWorker');
const { TrainingStepper } = require('../../server/training/TrainingStepper');

async function main() {
  const { ige, clock } = await bootTrainingGame({ seed: 42, manualSteps: true });
  ige.game._thinkBattleBot = () => {};
  const stepper = new TrainingStepper({ ige, clock });
  const blue = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
  const red = ige.$$('player').find(p => p._stats.trainingTeamId === 'red');
  for (const unit of ige.$$('unit').slice()) unit.remove();
  for (const projectile of ige.$$('projectile').slice()) projectile.destroy();
  const characterId = process.argv[2];
  function spawn(player, type, x) {
    const data = JSON.parse(JSON.stringify(ige.game.getAsset('unitTypes', type)));
    const unit = player.createUnit({ ...data, type, defaultData: { translate: { x, y: 500 }, rotate: Math.PI / 2 } });
    player.selectUnit(unit.id());
    return unit;
  }
  const unit = spawn(blue, characterId, 500);
  const enemy = spawn(red, 'H6K6gpqlPE', 750);
  unit.botAimPosition = { x: 750, y: 500 };
  blue.control.input.mouse.x = 750;
  blue.control.input.mouse.y = 500;
  const playerInput = process.argv.includes('--input');
  if (playerInput) {
    blue._stats.isBattleBot = false;
    blue._stats.controlledBy = 'human';
    blue._stats.clientId = 'test-client';
  }
  for (let i = 0; i < 2; i++) stepper.step();
  const results = [];
  for (const [slot, id] of unit._stats.itemIds.entries()) {
    const item = ige.$(id);
    if (!item || item._stats.itemTypeId === 'bSTcqysckL') continue; // Hexa-Shift is a buff.
    for (const shot of ige.$$('projectile').slice()) shot.destroy();
    const before = ige.server.totalProjectilesCreated;
    item._stats.lastUsed = 0;
    if (playerInput) {
      unit.changeItem(slot);
      blue.control.keyDown('mouse', 'button1');
      for (let i = 0; i < 12 && ige.server.totalProjectilesCreated === before; i++) stepper.step();
      blue.control.keyUp('mouse', 'button1');
    } else item.use();
    const emitted = ige.server.totalProjectilesCreated - before;
    const shots = ige.$$('projectile').filter(p => p._stats.sourceUnitId === unit.id());
    results.push({ item: item._stats.name, emitted, types: shots.map(p => p._stats.type),
      streamModes: shots.map(p => p.streamMode()) });
    assert.ok(emitted > 0, `${item._stats.name} emitted no projectiles; ${JSON.stringify({ errors: ige.script.errorLogs,
      currentItem: unit.getCurrentItem()?._stats.name, health: unit._stats.attributes.health.value,
      alive: unit._alive, itemUsed: item._stats.isBeingUsed, lastUsed: item._stats.lastUsed, now: ige.now,
      cost: item._stats.cost, attributes: unit._stats.attributes, variables: unit.variables })}`);
    assert.ok(shots.length > 0, `${item._stats.name} has no live projectiles`);
    for (const shot of shots) {
      assert.equal(shot.streamMode(), 1, 'scripted bullets must reach browser clients');
      assert.ok(Number.isFinite(shot._translate.x) && Number.isFinite(shot._translate.y));
    }
  }
  console.log('CHARACTER_PROJECTILES ' + JSON.stringify({ characterId, results, errors: ige.script.errorLogs,
    enemyHealth: enemy._stats.attributes.health.value }));
  stepper.dispose();
}
main().then(() => process.exit(0)).catch(error => { console.error(error.stack); process.exit(1); });
