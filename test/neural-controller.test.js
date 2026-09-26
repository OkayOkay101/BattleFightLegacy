const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseNeuralAction } = require('../server/training/NeuralController');
const { rosterHash, ROSTER_IDS } = require('../server/training/NeuralObservation');

function layer(rows, cols, bias = 0) {
	return { rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(bias) };
}

test('neural controller chooses a legal observed action and records its on-policy probability', () => {
	const weights = { actor: [layer(64, 103), layer(64, 64), layer(1, 64)],
		critic: [layer(64, 86), layer(1, 64)] };
	const decision = chooseNeuralAction({
		weights, policyVersion: 'n1', playerId: 'blue-1', simulatedAt: 100,
		snapshot: { self: { health: 1, characterId: ROSTER_IDS[0] }, allies: [], enemies: [], projectiles: [],
			weaponReady: [1, 0, 0, 0], targets: [{ id: 'enemy', distance: 100, visible: true }],
			weapons: [{ slot: 0, ready: true, range: 500 }] }, random: () => 0.99
	});
	assert.equal(decision.record.rosterHash, rosterHash);
	assert.equal(decision.record.observation.length, 86);
	assert.ok(decision.record.options.length >= 2);
	assert.equal(decision.action.targetId, decision.options[decision.record.chosenIndex].action.targetId);
	assert.ok(Number.isFinite(decision.record.logProb));
	assert.equal(decision.record.policyVersion, 'n1');
});
