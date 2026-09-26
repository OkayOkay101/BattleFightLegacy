const { bootTrainingGame } = require('../server/training/MatchWorker');

async function test() {
	const { ige } = await bootTrainingGame({
		matchId: 'test-all-dashes',
		seed: 123,
		manualSteps: true
	});

	const player = ige.$$('player').find(p => p._stats.trainingTeamId === 'blue');
	const heroes = [
		{ unitId: 'Pko4SCDSlz', skillName: 'Frozen Dash' },
		{ unitId: 'aclAiyngYW', skillName: 'Umbral Dash' },
		{ unitId: 'TRneecJl6K', skillName: 'Shorthop' },
		{ unitId: 'AuD3DjTn9B', skillName: 'Blood Rush' },
		{ unitId: 'SjFRDVdyhm', skillName: 'Shield Bash' },
		{ unitId: 'mgyCFapknQ', skillName: 'Pekker Woop! Woo!' },
		{ unitId: 'oLypCauaxT', skillName: 'Dual Technique : Quick Thrust' }
	];

	for (const h of heroes) {
		const unitType = ige.game.getAsset('unitTypes', h.unitId);
		const unitData = JSON.parse(JSON.stringify(unitType));
		unitData.type = h.unitId;
		unitData.defaultData = { translate: { x: 500, y: 500 }, rotate: 0 };
		const unit = player.createUnit(unitData);

		ige.physics.update(1000 / 60);
		player.selectUnit(unit.id());
		unit.rotateTo(0, 0, 0);

		const items = (unit._stats.itemIds || []).map(id => ige.$(id));
		const skill = items.find(it => it && it._stats.name === h.skillName);
		if (!skill) {
			console.error(`Skill ${h.skillName} not found on ${unitType.name}`);
			continue;
		}

		skill.use();
		ige.physics.update(1000 / 60);
		const vy = unit.body.getLinearVelocity().y;
		console.log(`[PASS] ${unitType.name.padEnd(16)} -> ${skill._stats.name.padEnd(30)} recoilForce: ${String(skill._stats.recoilForce).padEnd(8)} vy: ${vy.toFixed(2)}`);
	}

	process.exit(0);
}

test().catch(err => { console.error(err); process.exit(1); });
