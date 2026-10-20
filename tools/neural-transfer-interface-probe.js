// Controlled single-decision probe, not an actual match or optimizer sample.
const { PolicyRegistry } = require('../server/training/PolicyRegistry');
const { chooseNeuralAction } = require('../server/training/NeuralController');
const { ROSTER_IDS } = require('../server/training/NeuralObservation');
const registry = new PolicyRegistry('training-data');
const outputs = [];
for (const characterId of ROSTER_IDS.slice(0, 3)) {
	const enemy = { id: 'enemy', distance: 600, visible: true, hostile: true, features: [1, .75, .5, 0, 0] };
	const snapshot = { self: { characterId, health: 1, x: .25, y: .5, vx: 0, vy: 0, attackRange: 200 },
		targets: [enemy], enemies: [enemy], allies: [], projectiles: [],
		weapons: [{ slot: 0, ready: true, range: 200 }], weaponReady: [1, 0, 0, 0], activeSlot: 0,
		weaponState: [{ present: 1, cooldown: 0, ammoRatio: 1, unlimited: 1, affordability: 1, range: .2, speed: .3, damage: .03 }],
		terrain: Array(8).fill(1), navigation: {}, match: { remaining: 1, ownScore: 0, enemyScore: 0 } };
	for (const version of ['n-000027', 'n-000042', 'n-000043']) {
		const policy = registry.policy(version);
		const result = chooseNeuralAction({ weights: policy.weights, policyVersion: version, playerId: 'probe',
			simulatedAt: 0, snapshot, training: false });
		outputs.push({ characterId, version, action: result.action, options: result.options.length });
	}
}
console.log(JSON.stringify({ scope: 'controlled out-of-range snapshot, not match winrate', targetDistance: 600, weaponRange: 200, outputs }));
