const { bootTrainingGame } = require('../server/training/MatchWorker');
const { TrainingStepper } = require('../server/training/TrainingStepper');

async function main() {
  const { ige, clock } = await bootTrainingGame({ matchId: 'test-emo-life', manualSteps: true });
  const stepper = new TrainingStepper({ ige, clock });
  const player = ige.$$('player')[0];
  const emoType = ige.game.getAsset('unitTypes', '2GjTUKR9Bz');
  const emoData = JSON.parse(JSON.stringify(emoType));
  emoData.type = '2GjTUKR9Bz';
  emoData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
  const emoUnit = player.createUnit(emoData);
  stepper.step();
  player.selectUnit(emoUnit.id());
  player.control.input.mouse = { x: 600, y: 500 };

  const birdWing = ige.$(emoUnit._stats.itemIds[1]); // Bird Wing
  console.log('Using Bird Wing...');
  birdWing.use();

  for (let s = 1; s <= 200; s++) {
    stepper.step();
    if (s % 20 === 0) {
      const projs = ige.$$('projectile').map(p => p._stats.name + ' (' + p.id() + ')');
      console.log('Step ' + s + ' (' + Math.round(s * 16.6) + ' ms): projs=' + projs.length, projs.slice(0, 5));
    }
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
