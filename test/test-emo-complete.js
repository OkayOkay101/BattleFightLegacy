const { bootTrainingGame } = require('../server/training/MatchWorker');
const { TrainingStepper } = require('../server/training/TrainingStepper');

async function main() {
  const { ige, clock } = await bootTrainingGame({
    matchId: 'test-emo-complete',
    seed: 42,
    manualSteps: true
  });
  const stepper = new TrainingStepper({ ige, clock });

  const bluePlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
  const redPlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'red');

  // Spawn Emo for Blue
  const emoType = ige.game.getAsset('unitTypes', '2GjTUKR9Bz');
  const emoData = JSON.parse(JSON.stringify(emoType));
  emoData.type = '2GjTUKR9Bz';
  emoData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
  const emoUnit = bluePlayer.createUnit(emoData);
  bluePlayer.selectUnit(emoUnit.id());
  bluePlayer.control.input.mouse = { x: 500, y: 500 };
  stepper.step();

  // Spawn Enemy for Red at (550, 500)
  const enemyType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
  const enemyData = JSON.parse(JSON.stringify(enemyType));
  enemyData.type = 'H6K6gpqlPE';
  enemyData.defaultData = { translate: { x: 550, y: 500 }, rotate: 0 };
  const enemyUnit = redPlayer.createUnit(enemyData);
  stepper.step();

  console.log('Enemy initial HP:', enemyUnit._stats.attributes.health.value);

  // Find Bird Wing item
  const birdWing = ige.$(emoUnit._stats.itemIds.find(id => {
    const item = ige.$(id);
    return item && item._stats.name.includes('Bird Wing');
  }));
  console.log('Found item:', birdWing._stats.name);
  birdWing.use();
  const projs = ige.$$('projectile');
  console.log('Projectiles right after birdWing.use():', projs.map(p => `${p._stats.name} (${p.id()}) pos: ${p._translate.x},${p._translate.y}`));

  let minEnemyHp = enemyUnit._stats.attributes.health.value;
  let totalHits = 0;

  for (let s = 1; s <= 200; s++) {
    stepper.step();
    if (s % 30 === 0) {
      const projs = ige.$$('projectile');
      const types = {};
      projs.forEach(p => { types[p._stats.name] = (types[p._stats.name] || 0) + 1; });
      console.log(`Step ${s}: total projs=${projs.length}`, types);
    }
    const hp = enemyUnit._stats.attributes.health.value;
    if (hp < minEnemyHp) {
      console.log(`Step ${s}: Enemy took damage! HP ${minEnemyHp} -> ${hp}`);
      minEnemyHp = hp;
      totalHits++;
    }
  }

  console.log('Final Enemy HP:', minEnemyHp);
  console.log('Total damage instances:', totalHits);

  if (minEnemyHp >= 120) {
    throw new Error('FAIL: Enemy took no damage from Emo & Sky Bird Wing!');
  }
  if (totalHits < 1) {
    throw new Error('FAIL: No hits recorded!');
  }

  console.log('SUCCESS: Emo & Sky Bird Wing barrage successfully damaged the enemy!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
