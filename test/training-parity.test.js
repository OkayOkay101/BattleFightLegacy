const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { compareTrace, runParitySuite } = require('../server/training/TrainingParity');
const { rosterHash } = require('../server/training/NeuralObservation');

const base = {
	itemUses: [{ tick: 6, actor: 'blue-1', itemTypeId: 'wand' }],
	neuralActions: [{ tick: 6, actor: 'blue-1', choice: 1 }],
	contacts: [{ tick: 10, kind: 'wallBounce', projectile: 'p1' }],
	healthChanges: [{ tick: 12, target: 'red-1', before: 100, after: 90 }],
	deaths: [{ tick: 20, victim: 'red-1', killer: 'blue-1' }],
	scores: [{ tick: 20, blue: 1, red: 0 }],
	winner: 'blue',
	positions: [{ tick: 20, participant: 'blue-1', x: 1, y: 2 }]
};

test('identical gameplay traces pass with tiny floating-point position drift', () => {
	const accelerated = structuredClone(base);
	accelerated.positions[0].x += 0.00005;
	assert.deepEqual(compareTrace(base, accelerated), { ok: true, differences: [] });
});

test('changed damage, contact order, death, score or winner fails parity', () => {
	for (const field of ['itemUses', 'neuralActions', 'contacts', 'healthChanges', 'deaths', 'scores', 'winner']) {
		const accelerated = structuredClone(base);
		if (field === 'winner') accelerated.winner = 'red';
		else accelerated[field] = [...accelerated[field], accelerated[field][0]];
		const result = compareTrace(base, accelerated);
		assert.equal(result.ok, false, field);
		assert.deepEqual(result.differences, [field], field);
	}
});

test('paced and unpaced parity also checks live neural decisions from the same frozen policy', async () => {
	const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });
	const payload = JSON.stringify({ schemaVersion: 1, observationSchemaVersion: 1, rosterHash,
		actor: [layer(64, 103), layer(64, 64), layer(1, 64)],
		critic: [layer(64, 86), layer(1, 64)] });
	const policies = { bluePolicy: { kind: 'neural', version: 'n-parity',
		weightsEnvelope: { payload, checksum: crypto.createHash('sha256').update(payload).digest('hex') } },
		redPolicy: { kind: 'heuristic', version: 'baseline', params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } } };
	const result = await runParitySuite([7], { durationMs: 1000, policies });
	assert.equal(result.ok, true, JSON.stringify(result.cases));
	assert.ok(result.cases[0].neuralDecisions > 0);
});

test('position beyond tolerance or non-finite coordinate fails parity', () => {
	const accelerated = structuredClone(base);
	accelerated.positions[0].x += 0.001;
	assert.deepEqual(compareTrace(base, accelerated).differences, ['positions']);
	accelerated.positions[0].x = NaN;
	assert.deepEqual(compareTrace(base, accelerated).differences, ['positions']);
});

test('a real short 3v3 match has the same event trace paced and unpaced', async () => {
	const result = await runParitySuite([1], { durationMs: 1000 });
	assert.equal(result.ok, true, JSON.stringify(result.cases));
	assert.equal(result.cases.length, 1);
	assert.equal(result.cases[0].seed, 1);
	assert.ok(result.cases[0].realtimeWallMs >= 1000);
	assert.ok(result.cases[0].maxWallMs > 0);
});
