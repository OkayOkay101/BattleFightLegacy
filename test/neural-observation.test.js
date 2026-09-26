const test = require('node:test');
const assert = require('node:assert/strict');
const { buildObservation, FEATURE_COUNT, ROSTER_IDS, rosterHash } = require('../server/training/NeuralObservation');
const { enumerateLegalActions } = require('../server/training/NeuralActions');
const { scoreActions } = require('../server/training/NeuralInference');

test('observation keeps its stable 86-feature model input and eligible character marked', () => {
	const observation = buildObservation({
		self: { health: 0.75, x: 0.2, y: 0.3, vx: 0, vy: 0, characterId: ROSTER_IDS[0] },
		allies: [{ features: [0.1, 0.2, 0.9] }], enemies: [], projectiles: [], weaponReady: [1, 0, 0, 0]
	});
	assert.equal(FEATURE_COUNT, 86);
	assert.equal(ROSTER_IDS.length, 40);
	assert.equal(observation.length, 86);
	assert.deepEqual([...observation.slice(0, 5)].map(value => Math.round(value * 100)), [75, 20, 30, 0, 0]);
	assert.equal(observation[46], 1);
	assert.equal(observation[85], 0);
	assert.match(rosterHash, /^[a-f0-9]{64}$/);
});

test('legal actions never include an unready weapon or impossible blocked shot', () => {
	const actions = enumerateLegalActions({
		targets: [{ id: 'enemy', distance: 100, visible: false }],
		weapons: [{ slot: 0, ready: false, range: 500 }, { slot: 1, ready: true, range: 500 }]
	});
	assert.ok(actions.length >= 1);
	assert.ok(actions.every(option => option.action.slot === null));
	const bounced = enumerateLegalActions({
		targets: [{ id: 'enemy', distance: 100, visible: false }],
		weapons: [{ slot: 1, ready: true, range: 500, ricochetAim: { x: 30, y: 40 } }]
	});
	assert.ok(bounced.some(option => option.action.slot === 1 && option.action.aimMode === 'ricochet'));
	assert.ok(bounced.every(option => option.features.length === 17));
});

test('enumerated hold action is legal for inference when no shot is available', () => {
	const actions = enumerateLegalActions({ targets: [], weapons: [] });
	const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });
	const weights = { actor: [layer(64, 103), layer(64, 64), layer(1, 64)],
		critic: [layer(64, 86), layer(1, 64)] };
	assert.equal(actions.length, 1);
	assert.ok(Number.isFinite(scoreActions(weights, new Float32Array(86), actions).logits[0]));
});

test('ricochet option belongs only to the target with a verified bounce path', () => {
	const options = enumerateLegalActions({
		targets: [
			{ id: 'reachable', distance: 100, visible: false, ricochetAims: { 0: { x: 1, y: 2 } } },
			{ id: 'blocked', distance: 100, visible: false, ricochetAims: {} }
		],
		weapons: [{ slot: 0, ready: true, range: 500 }]
	});
	assert.ok(options.some(option => option.action.targetId === 'reachable' && option.action.aimMode === 'ricochet'));
	assert.ok(options.every(option => option.action.targetId !== 'blocked'));
});
