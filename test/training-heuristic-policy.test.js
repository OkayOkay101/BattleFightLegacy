const test = require('node:test');
const assert = require('node:assert/strict');
const { mutatePolicy, pairedLowerBound, candidateScore } = require('../server/training/HeuristicPolicy');

test('mutation changes only tactical parameters within safe bounds', () => {
	const source = { version: 'baseline', kind: 'heuristic', params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } };
	const candidate = mutatePolicy(source, 7, 'candidate-7');
	assert.equal(candidate.version, 'candidate-7');
	assert.equal(Object.keys(candidate.params).length, 3);
	assert.equal(Object.values(candidate.params).filter(value => value !== 1).length, 1);
	assert.ok(Object.values(candidate.params).every(value => value >= 0.5 && value <= 1.5));
});

test('paired bootstrap accepts a dominant candidate but rejects a coin flip', () => {
	assert.ok(pairedLowerBound(Array(30).fill(1)) > 0.5);
	assert.ok(pairedLowerBound([...Array(15).fill(1), ...Array(15).fill(0)]) <= 0.5);
	assert.equal(candidateScore('blue', 'blue'), 1);
	assert.equal(candidateScore('red', 'blue'), 0);
	assert.equal(candidateScore(null, 'blue'), 0.5);
});
