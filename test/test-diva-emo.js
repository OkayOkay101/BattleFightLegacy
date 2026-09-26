const { bootTrainingGame } = require('../server/training/MatchWorker');
const { TrainingStepper } = require('../server/training/TrainingStepper');

async function test() {
	const { ige, clock } = await bootTrainingGame({
		matchId: 'test-diva-emo',
		seed: 123,
		manualSteps: true
	});

	const stepper = new TrainingStepper({ ige, clock });
	const player = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
	player._stats.controlledBy = 'human';
	player._stats.isBattleBot = false;

	console.log('=== TESTING SIXTH DIVA ===');
	const divaType = ige.game.getAsset('unitTypes', 'H6K6gpqlPE');
	const divaData = JSON.parse(JSON.stringify(divaType));
	divaData.type = 'H6K6gpqlPE';
	divaData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
	const divaUnit = player.createUnit(divaData);
	stepper.step();
	player.selectUnit(divaUnit.id());
	player.control.input.mouse = { x: 700, y: 500, button1: false, button3: false };

	const divaItems = (divaUnit._stats.itemIds || []).map(id => ige.$(id));
	console.log('Diva items count:', divaItems.length);
	for (const item of divaItems) {
		if (!item) continue;
		console.log(`\nTesting Diva Item: ${item._stats.name} (${item.id()})`);
		const projBefore = ige.$$('projectile').length;
		const hpBefore = divaUnit._stats.attributes.health.value;
		try {
			item.use();
		} catch (e) {
			console.error(`Error using ${item._stats.name}:`, e);
		}
		for (let i = 0; i < 10; i++) stepper.step();
		const projAfter = ige.$$('projectile').length;
		const hpAfter = divaUnit._stats.attributes.health.value;
		console.log(`  Projectiles created: ${projAfter - projBefore}, HP: ${hpBefore} -> ${hpAfter}`);
	}

	console.log('\n=== TESTING EMO & SKY ===');
	const emoType = ige.game.getAsset('unitTypes', '2GjTUKR9Bz');
	const emoData = JSON.parse(JSON.stringify(emoType));
	emoData.type = '2GjTUKR9Bz';
	emoData.defaultData = { translate: { x: 600, y: 600 }, rotate: 0 };
	const emoUnit = player.createUnit(emoData);
	stepper.step();
	player.selectUnit(emoUnit.id());

	const emoItems = (emoUnit._stats.itemIds || []).map(id => ige.$(id));
	console.log('Emo & Sky items count:', emoItems.length);
	for (const item of emoItems) {
		if (!item) continue;
		console.log(`\nTesting Emo Item: ${item._stats.name} (${item.id()})`);
		const projBefore = ige.$$('projectile').length;
		const hpBefore = emoUnit._stats.attributes.health.value;
		try {
			item.use();
		} catch (e) {
			console.error(`Error using ${item._stats.name}:`, e);
		}
		for (let i = 0; i < 10; i++) stepper.step();
		const projAfter = ige.$$('projectile').length;
		const hpAfter = emoUnit._stats.attributes.health.value;
		console.log(`  Projectiles created: ${projAfter - projBefore}, HP: ${hpBefore} -> ${hpAfter}`);
	}

	process.exit(0);
}

test().catch(err => { console.error(err); process.exit(1); });
