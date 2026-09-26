const test = require('node:test');
const assert = require('node:assert/strict');
const { enumerateLegalActions } = require('../server/training/NeuralActions');

test('blocked target falls back to a target-directed approach action', () => {
	const [fallback] = enumerateLegalActions({ self: { attackRange: 350 },
		targets: [{ id: 'behind-wall', distance: 240, visible: false }],
		weapons: [{ slot: 0, ready: true, range: 500 }] });

	assert.deepEqual(fallback.action, { targetId: 'behind-wall', movement: 'approach', slot: null, aimMode: 'direct' });
});

test('visible target beyond weapon and tactical range falls back to approach', () => {
	const [fallback] = enumerateLegalActions({ self: { attackRange: 350 },
		targets: [{ id: 'far', distance: 700, visible: true }],
		weapons: [{ slot: 0, ready: true, range: 500 }] });

	assert.deepEqual(fallback.action, { targetId: 'far', movement: 'approach', slot: null, aimMode: 'direct' });
});

test('visible in-range target with no ready weapon falls back to strafing', () => {
	const [fallback] = enumerateLegalActions({ self: { attackRange: 350 },
		targets: [{ id: 'cooling-down', distance: 240, visible: true }], weapons: [] });

	assert.deepEqual(fallback.action, { targetId: 'cooling-down', movement: 'strafe_left', slot: null, aimMode: 'direct' });
});
