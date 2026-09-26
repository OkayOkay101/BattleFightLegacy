const { bootTrainingGame } = require('../server/training/MatchWorker');
const { TrainingStepper } = require('../server/training/TrainingStepper');

async function main() {
  const { ige, clock } = await bootTrainingGame({
    matchId: 'test-emo-barrage',
    seed: 42,
    manualSteps: true
  });
  const stepper = new TrainingStepper({ ige, clock });
  const Projectile = global.Projectile;

  const bluePlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
  const redPlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'red');

  // Spawn Emo for Blue
  const emoType = ige.game.getAsset('unitTypes', '2GjTUKR9Bz');
  const emoData = JSON.parse(JSON.stringify(emoType));
  emoData.type = '2GjTUKR9Bz';
  emoData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
  const emoUnit = bluePlayer.createUnit(emoData);
  bluePlayer.selectUnit(emoUnit.id());
  stepper.step();

  // Spawn Enemy for Red
  const enemyType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
  const enemyData = JSON.parse(JSON.stringify(enemyType));
  enemyData.type = 'H6K6gpqlPE';
  enemyData.defaultData = { translate: { x: 550, y: 500 }, rotate: 0 };
  const enemyUnit = redPlayer.createUnit(enemyData);
  stepper.step();

  console.log('Enemy initial HP:', enemyUnit._stats.attributes.health.value);

  // Fire 1st needle bullet directly at enemy
  const p1 = new Projectile(Object.assign(
    JSON.parse(JSON.stringify(ige.game.getAsset('projectileTypes', 'QO2It59aJE'))),
    {
      bulletForce: 20,
      sourceUnitId: emoUnit.id(),
      sourcePlayerId: bluePlayer.id(),
      damageData: { sourceUnitId: emoUnit.id(), sourcePlayerId: bluePlayer.id() },
      defaultData: {
        rotate: 0,
        translate: { x: 500, y: 500 },
        velocity: { x: 20, y: 0 }
      },
      streamMode: 1
    }
  ));

  // Advance 10 steps (approx 160ms) to let p1 hit
  for (let s = 0; s < 10; s++) stepper.step();
  console.log('After Bullet 1 -> Enemy HP:', enemyUnit._stats.attributes.health.value, 'p1 alive?', p1._alive);

  // Wait 15 more steps for cooldown (total > 200ms cooldown)
  for (let s = 0; s < 15; s++) stepper.step();

  // Fire 2nd needle bullet directly at enemy
  const p2 = new Projectile(Object.assign(
    JSON.parse(JSON.stringify(ige.game.getAsset('projectileTypes', 'QO2It59aJE'))),
    {
      bulletForce: 20,
      sourceUnitId: emoUnit.id(),
      sourcePlayerId: bluePlayer.id(),
      damageData: { sourceUnitId: emoUnit.id(), sourcePlayerId: bluePlayer.id() },
      defaultData: {
        rotate: 0,
        translate: { x: 500, y: 500 },
        velocity: { x: 20, y: 0 }
      },
      streamMode: 1
    }
  ));

  // Advance 15 steps to let p2 hit
  for (let s = 0; s < 15; s++) stepper.step();
  console.log('After Bullet 2 -> Enemy HP:', enemyUnit._stats.attributes.health.value, 'p2 alive?', p2._alive);

  // Immediately fire Bullet 3 while cooldown is ACTIVE (< 200ms)
  const p3 = new Projectile(Object.assign(
    JSON.parse(JSON.stringify(ige.game.getAsset('projectileTypes', 'QO2It59aJE'))),
    {
      bulletForce: 20,
      sourceUnitId: emoUnit.id(),
      sourcePlayerId: bluePlayer.id(),
      damageData: { sourceUnitId: emoUnit.id(), sourcePlayerId: bluePlayer.id() },
      defaultData: {
        rotate: 0,
        translate: { x: 500, y: 500 },
        velocity: { x: 20, y: 0 }
      },
      streamMode: 1
    }
  ));

  // Advance 5 steps: p3 hits while on cooldown
  for (let s = 0; s < 5; s++) stepper.step();
  console.log('After Bullet 3 (on CD) -> Enemy HP:', enemyUnit._stats.attributes.health.value, 'p3 alive?', p3._alive);

  if (p1._alive !== false) throw new Error('FAIL: Bullet 1 did not destroy on hit!');
  if (p2._alive !== false) throw new Error('FAIL: Bullet 2 did not destroy on hit!');
  if (p3._alive !== false) throw new Error('FAIL: Bullet 3 on cooldown did not destroy on hit!');
  if (enemyUnit._stats.attributes.health.value > 85) {
    throw new Error('FAIL: Enemy did not take damage from both bullets! HP: ' + enemyUnit._stats.attributes.health.value);
  }

  console.log('SUCCESS: Both bullets hit, dealt damage, and bullet during CD destroyed cleanly!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
