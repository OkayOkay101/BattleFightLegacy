const { bootTrainingGame } = require('../server/training/MatchWorker');

async function test() {
	const { ige, match, stats, clock } = await bootTrainingGame({
		matchId: 'test-dash',
		seed: 123,
		manualSteps: true
	});

	// Find an active player
	const player = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');

	// Spawn Nadia ('Pko4SCDSlz')
	const unitType = ige.game.getAsset('unitTypes', 'Pko4SCDSlz');
	const unitData = JSON.parse(JSON.stringify(unitType));
	unitData.type = 'Pko4SCDSlz';
	unitData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
	const nadiaUnit = player.createUnit(unitData);

	// Process queue to create physics body
	ige.physics.update(1000 / 60);
	player.selectUnit(nadiaUnit.id());

	const items = (nadiaUnit._stats.itemIds || []).map(id => ige.$(id));
	const frozenDash = items.find(it => it && it._stats.name === 'Frozen Dash');

	console.log('Nadia start pos:', { x: nadiaUnit._translate.x, y: nadiaUnit._translate.y });
	
	// Face upwards (rotate = 0)
	nadiaUnit.rotateTo(0, 0, 0);
	
	console.log('Calling frozenDash.use()...');
	frozenDash.use();
	
	for (let i = 1; i <= 10; i++) {
		ige.physics.update(1000 / 60);
		console.log(`Step ${i}: pos:`, { x: Math.round(nadiaUnit._translate.x), y: Math.round(nadiaUnit._translate.y) }, 'velocity:', nadiaUnit.body.getLinearVelocity().y.toFixed(2));
	}
	process.exit(0);
}

test().catch(err => { console.error(err); process.exit(1); });
