const test = require('node:test');
const assert = require('node:assert/strict');
const { canPromoteNeural } = require('../server/training/NeuralPromotion');

test('neural promotion needs 30 paired champion wins and verified parity', () => {
	const wins = Array.from({ length: 30 }, () => [1, 1]);
	assert.equal(canPromoteNeural({ championPairs: wins, parityPassed: true }), true);
	assert.equal(canPromoteNeural({ championPairs: wins.slice(0, 29), parityPassed: true }), false);
	assert.equal(canPromoteNeural({ championPairs: wins, parityPassed: false }), false);
	assert.equal(canPromoteNeural({ championPairs: Array.from({ length: 30 }, () => [0.5, 0.5]), parityPassed: true }), false);
});

test('clear regression against archived baseline blocks promotion', () => {
	const wins = Array.from({ length: 30 }, () => [1, 1]);
	assert.equal(canPromoteNeural({ championPairs: wins, archivedPairs: Array.from({ length: 30 }, () => [0, 0]),
		parityPassed: true }), false);
	assert.equal(canPromoteNeural({ championPairs: wins, archivedPairs: wins, parityPassed: true }), true);
});
