const { bootTrainingGame } = require('../server/training/MatchWorker');
const { TrainingStepper } = require('../server/training/TrainingStepper');

async function test() {
	const { ige, clock } = await bootTrainingGame({
		matchId: 'test-overlord',
		seed: 123,
		manualSteps: true
	});

	const stepper = new TrainingStepper({ ige, clock });

	const player = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
	player._stats.controlledBy = 'human';
	player._stats.isBattleBot = false;
	console.log('Player controlledBy:', player._stats.controlledBy, 'isBattleBot:', player._stats.isBattleBot, 'has control:', !!player.control);
	const unitType = ige.game.getAsset('unitTypes', '1GujroMg7D');
	const unitData = JSON.parse(JSON.stringify(unitType));
	unitData.type = '1GujroMg7D';
	unitData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
	const overlordUnit = player.createUnit(unitData);

	stepper.step();
	player.selectUnit(overlordUnit.id());

	const items = (overlordUnit._stats.itemIds || []).map(id => ige.$(id));
	const minionSwarm = items.find(it => it && it._stats.name === 'Minion Swarm');

	console.log('Using Minion Swarm...');
	minionSwarm.use();

	player.control.input.mouse = { x: 800, y: 800, button1: false, button3: false };

	for (let i = 0; i < 150; i++) {
		stepper.step();
	}

	let allUnits = ige.$$('unit');
	let minions = allUnits.filter(u => u._stats.type === 'tPW4ck2QvI');
	console.log('Overlord minions count after 2.5 seconds:', minions.length);

	for (const m of minions) {
		console.log(`[2.5s] Minion ${m.id()}: pos=(${Math.round(m._translate.x)}, ${Math.round(m._translate.y)}) angleToTarget=${m.angleToTarget?.toFixed(2)} rotate.z=${m._rotate.z.toFixed(2)} isMoving=${m.isMoving} currentAction=${m.ai && m.ai.currentAction}`);
	}

	// Step forward another 150 frames (up to 5 seconds total)
	for (let i = 0; i < 150; i++) {
		stepper.step();
	}

	allUnits = ige.$$('unit');
	minions = allUnits.filter(u => u._stats.type === 'tPW4ck2QvI');
	console.log('\nOverlord minions count after 5.0 seconds:', minions.length);

	for (const m of minions) {
		console.log(`[5.0s] Minion ${m.id()}: pos=(${Math.round(m._translate.x)}, ${Math.round(m._translate.y)}) angleToTarget=${m.angleToTarget?.toFixed(2)} rotate.z=${m._rotate.z.toFixed(2)} isMoving=${m.isMoving} currentAction=${m.ai && m.ai.currentAction}`);
		const mItems = (m._stats.itemIds || []).map(id => ige.$(id));
		const mWeapon = mItems[0];
		console.log(`  weapon: ${mWeapon && mWeapon._stats.name}, isBeingUsed: ${mWeapon && mWeapon._stats.isBeingUsed}`);
	}

	console.log('Projectiles in world:', ige.$$('projectile').length);

	process.exit(0);
}

test().catch(err => { console.error(err); process.exit(1); });
