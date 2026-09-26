const { bootTrainingGame } = require('../server/training/MatchWorker');
const { TrainingStepper } = require('../server/training/TrainingStepper');

async function main() {
  const { ige, clock } = await bootTrainingGame({
    matchId: 'test-hit',
    seed: 42,
    manualSteps: true
  });
  const stepper = new TrainingStepper({ ige, clock });

  // Get blue player and red player
  const bluePlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
  const redPlayer = ige.$$('player').find(p => p._stats.trainingTeamId === 'red');

  // Spawn Diva for blue
  const divaType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
  const divaData = JSON.parse(JSON.stringify(divaType));
  divaData.type = 'H6K6gpqlPE';
  divaData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
  const divaUnit = bluePlayer.createUnit(divaData);
  stepper.step();

  // Spawn Target dummy for red at (550, 500)
  const enemyType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
  const enemyData = JSON.parse(JSON.stringify(enemyType));
  enemyData.type = 'H6K6gpqlPE';
  enemyData.defaultData = { translate: { x: 550, y: 500 }, rotate: 0 };
  const enemyUnit = redPlayer.createUnit(enemyData);
  stepper.step();

  console.log('Diva HP:', divaUnit._stats.attributes.health.value);
  console.log('Enemy HP:', enemyUnit._stats.attributes.health.value);

  // Diva shoots Power of the Six towards enemy (angle 0)
  const item = ige.$(divaUnit._stats.itemIds[0]);
  console.log('Using item:', item._stats.name);
  bluePlayer.control.input.mouse = { x: 600, y: 500 };
  item.use();

  console.log('Projectiles after use:', ige.$$('projectile').length);
  const projs = ige.$$('projectile').filter(p => p._stats.type === 'Ry9WhLFR7g');
  projs.forEach((p, idx) => {
    console.log(`Proj ${idx} pos:`, p._translate.x, p._translate.y, 'rotate:', p._rotate?.z);
    if (p.body) {
      console.log(`  body pos:`, p.body.getPosition(), 'linVel:', p.body.getLinearVelocity());
    }
  });

  for (let i = 0; i < 30; i++) {
    stepper.step();
  }

  console.log('After 30 steps:');
  console.log('Diva HP:', divaUnit._stats.attributes.health.value);
  console.log('Enemy HP:', enemyUnit._stats.attributes.health.value);
  console.log('Projectiles remaining:', ige.$$('projectile').length);
  ige.$$('projectile').forEach(p => console.log('  Remaining:', p._stats.name, p.id(), p._stats.type));

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
