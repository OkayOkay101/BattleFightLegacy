const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { scoreActions, loadWeights } = require('../server/training/NeuralInference');
const { rosterHash } = require('../server/training/NeuralObservation');

function layer(rows, cols, bias = 0) {
	return { rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(bias) };
}

function envelope(payload) {
	const serialized = JSON.stringify(payload);
	return { payload: serialized, checksum: crypto.createHash('sha256').update(serialized).digest('hex') };
}

test('Node inference respects 103/86 dimensions and masks impossible actions', () => {
	const weights = loadWeights(envelope({ schemaVersion: 1, observationSchemaVersion: 1, rosterHash,
		actor: [layer(64, 103), layer(64, 64), layer(1, 64, 0.25)],
		critic: [layer(64, 86), layer(1, 64, 0.5)] }));
	const scored = scoreActions(weights, new Float32Array(86), [
		{ features: new Float32Array(17), legal: true }, { features: new Float32Array(17), legal: false }
	]);
	assert.deepEqual(scored.logits, [0.25, -Infinity]);
	assert.equal(scored.value, 0.5);
});

test('checksum or roster mismatch rejects neural weights', () => {
	assert.throws(() => loadWeights({ payload: '{}', checksum: 'bad' }), /checksum/i);
	assert.throws(() => loadWeights(envelope({ schemaVersion: 1, rosterHash: 'wrong' })), /roster/i);
});
