const { bootTrainingGame } = require('../server/training/MatchWorker');
const { TrainingStepper } = require('../server/training/TrainingStepper');

async function main() {
  const { ige, clock } = await bootTrainingGame({
    matchId: 'test-diva-skills',
    seed: 42,
    manualSteps: true
  });
  const stepper = new TrainingStepper({ ige, clock });

  const bluePlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
  const redPlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'red');

  // Spawn Diva for Blue
  const divaType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
  const divaData = JSON.parse(JSON.stringify(divaType));
  divaData.type = 'H6K6gpqlPE';
  divaData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
  const divaUnit = bluePlayer.createUnit(divaData);
  bluePlayer.selectUnit(divaUnit.id());
  stepper.step();

  // Spawn Teammate for Blue (Nadia)
  const allyType = ige.game.getAsset('unitTypes', 'Pko4SCDSlz');
  const allyData = JSON.parse(JSON.stringify(allyType));
  allyData.type = 'Pko4SCDSlz';
  allyData.defaultData = { translate: { x: 450, y: 500 }, rotate: 0 };
  const allyUnit = bluePlayer.createUnit(allyData);
  stepper.step();

  // Spawn Enemy for Red (another Diva)
  const enemyType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
  const enemyData = JSON.parse(JSON.stringify(enemyType));
  enemyData.type = 'H6K6gpqlPE';
  enemyData.defaultData = { translate: { x: 550, y: 500 }, rotate: 0 };
  const enemyUnit = redPlayer.createUnit(enemyData);
  stepper.step();

  console.log('--- TEST 1: Sixth Sense ---');
  console.log('Before cast:');
  console.log('  Diva HP:', divaUnit._stats.attributes.health.value);
  console.log('  Ally HP:', allyUnit._stats.attributes.health.value);
  console.log('  Enemy HP:', enemyUnit._stats.attributes.health.value);

  // Sixth Sense is item index 1 or 2
  const sixthSense = ige.$(divaUnit._stats.itemIds.find(id => {
    const item = ige.$(id);
    return item && item._stats.name.includes('Sixth Sense');
  }));
  console.log('Found item:', sixthSense._stats.name);
  sixthSense.use();

  const projs = ige.$$('projectile').filter(p => p._stats.type === 'wjY6n30UkW');
  console.log('Projs count:', projs.length);

  // Step physics to let projectile travel and hit enemy
  for (let i = 0; i < 30; i++) {
    stepper.step();
    const aliveProjs = ige.$$('projectile').filter(p => p._stats.type === 'wjY6n30UkW' && p._alive !== false);
    if (aliveProjs.length > 0) {
      console.log(`Step ${i + 1}: alive=${aliveProjs.length}, enemy HP=${enemyUnit._stats.attributes.health.value}`);
      aliveProjs.forEach(p => console.log('   proj pos:', p._translate.x, p._translate.y, 'vel:', p.body?.getLinearVelocity()));
    }
  }

  console.log('After Sixth Sense:');
  console.log('  Diva HP:', divaUnit._stats.attributes.health.value);
  console.log('  Ally HP:', allyUnit._stats.attributes.health.value);
  console.log('  Enemy HP:', enemyUnit._stats.attributes.health.value);

  if (allyUnit._stats.attributes.health.value !== 120) {
    throw new Error('FAIL: Ally was attacked by Sixth Sense!');
  }
  if (enemyUnit._stats.attributes.health.value >= 120) {
    throw new Error('FAIL: Enemy was not attacked by Sixth Sense!');
  }
  console.log('SUCCESS: Sixth Sense correctly targeted ONLY the enemy!');

  console.log('\n--- TEST 2: Hexa-Shift Anti-Suicide ---');
  const hexaShift = ige.$(divaUnit._stats.itemIds.find(id => {
    const item = ige.$(id);
    return item && item._stats.name.includes('Hexa-Shift');
  }));
  console.log('Found item:', hexaShift._stats.name);

  // Set Diva HP to 40 (<= 60 triggers +110 buff)
  divaUnit.attribute.update('health', 40, true);
  console.log('Diva HP before Hexa-Shift:', divaUnit._stats.attributes.health.value);
  hexaShift.use();
  stepper.step();
  console.log('Diva HP after Hexa-Shift buff:', divaUnit._stats.attributes.health.value);
  if (divaUnit._stats.attributes.health.value !== 120) {
    throw new Error('FAIL: Hexa-Shift buff did not heal Diva to max HP 120!');
  }

  // Diva takes damage while buff is active (HP drops to 30, which is < 110)
  divaUnit.attribute.update('health', 30, true);
  console.log('Diva HP after taking damage:', divaUnit._stats.attributes.health.value);

  // Advance clock 4.5 seconds (timeout of 4000ms triggers)
  for (let i = 0; i < 280; i++) {
    stepper.step();
  }

  console.log('Diva HP after 4000ms timeout:', divaUnit._stats.attributes.health.value);
  console.log('Diva is alive?', divaUnit._alive);
  if (divaUnit._alive === false || divaUnit._stats.attributes.health.value <= 0) {
    throw new Error('FAIL: Diva died when Hexa-Shift buff expired!');
  }
  if (divaUnit._stats.attributes.health.value < 1) {
    throw new Error('FAIL: Diva HP dropped below 1!');
  }
  console.log('SUCCESS: Hexa-Shift preserved Diva life at HP:', divaUnit._stats.attributes.health.value);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
