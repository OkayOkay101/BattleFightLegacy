const test = require('node:test');
const assert = require('node:assert/strict');
const { buildObservation } = require('../server/training/NeuralObservation');
const { enumerateLegalActions } = require('../server/training/NeuralActions');

const candidates = Array.from({ length: 9 }, (_, direction) => ({ direction,
	angle: direction < 8 ? direction * Math.PI / 4 : null, moving: direction < 8,
	clear: direction !== 2, risk: direction / 10 }));
function snapshot() {
	return { self: { moveSpeed: 300 }, targets: [{ id: 'enemy', distance: 100, visible: true }],
		weapons: [{ slot: 0, ready: true, range: 500 }], enemies: [],
		projectiles: [{ id: 'danger', distance: 200, features: [.2, 0, -.4, 0] },
			{ id: 'near', distance: 10, features: [.01, 0, 0, 0] }],
		dodge: { imminent: true, currentRisk: 1, threats: [{ collisionTime: .2, damage: 100, radius: 10, velocity: { x: -400, y: 0 } }],
			candidates, risks: candidates.map(c => c.risk) } };
}
test('schema3 preserves old V2 shape and appends threat times, damage, route risk and clearance', () => {
	const s = snapshot(), old = buildObservation(s, 2), value = buildObservation(s, 3);
	assert.equal(old.length, 149); assert.equal(value.length, 184);
	assert.ok(Math.abs(value[26] - .2) < 1e-6, 'threat ordering is preserved, not distance ordering');
	assert.ok(Math.abs(old[26] - .01) < 1e-6, 'V2 ordering remains distance based');
	assert.ok(value[149] > 0 && value[149] < 1);
	assert.ok(Math.abs(value[150] - .1) < 1e-6);
	assert.deepEqual([...value.slice(174, 183)], candidates.map(c => c.clear ? 1 : 0));
	assert.ok(Math.abs(value[183] - .3) < 1e-6);
	assert.ok([...value].every(Number.isFinite));
});
test('schema3 reserves all reachable explicit dodge directions while preserving firing/logit features', () => {
	const options = enumerateLegalActions(snapshot(), 3);
	assert.ok(options.length <= 32);
	assert.deepEqual(new Set(options.filter(o => Number.isInteger(o.action.dodgeDirection)).map(o => o.action.dodgeDirection)),
		new Set(candidates.filter(c => c.clear).map(c => c.direction)));
	assert.ok(options.every(o => o.features.length === 27 && o.action.fire && o.features[17] === 1));
	for (const o of options.filter(o => Number.isInteger(o.action.dodgeDirection))) {
		assert.equal(o.features[18 + o.action.dodgeDirection], 1);
		assert.equal(o.action.movement, o.action.dodgeDirection === 8 ? 'hold' : 'dodge');
	}
});
test('schema3 can evade lingering bullets without an enemy target and keeps no-fire legality', () => {
	const s = snapshot(); s.targets = []; s.weapons = [];
	const options = enumerateLegalActions(s, 3);
	assert.ok(options.some(o => o.action.movement === 'dodge'));
	assert.ok(options.every(o => o.action.fire === false && o.action.slot === null && o.action.targetId === null));
	const idle = enumerateLegalActions({ targets: [], projectiles: [], dodge: { imminent: false, currentRisk: 0 } }, 3);
	assert.equal(idle.length, 1);
});
