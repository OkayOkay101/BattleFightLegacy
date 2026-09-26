const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingTrajectory } = require('../server/training/TrainingTrajectory');

function decision(playerId, policyVersion, simulatedAt) {
	return { playerId, policyVersion, rosterHash: 'roster', observation: Array(86).fill(0),
		options: [Array(17).fill(0)], chosenIndex: 0, logProb: -0.2, value: 0,
		simulatedAt };
}

test('training trajectory keeps one policy snapshot and awards team result only at terminal decision', () => {
	const trajectory = new TrainingTrajectory();
	trajectory.record(decision('blue-1', 'n1', 100));
	trajectory.record(decision('blue-1', 'n1', 200));
	assert.throws(() => trajectory.record(decision('blue-1', 'n2', 300)), /version/i);
	const rows = trajectory.finish({ status: 'complete', winner: 'blue' },
		{ players: { 'blue-1': { teamId: 'blue', damageDealt: 25, assists: 1 } } },
		{ split: 'train', speedMode: 'max', parityStatus: 'passed' });
	assert.equal(rows.length, 2);
	assert.equal(rows[0].reward, 0);
	assert.equal(rows[0].done, false);
	assert.equal(rows[1].done, true);
	assert.ok(rows[1].reward >= 1 && rows[1].reward <= 1.1);
});

test('trajectory rejects validation and unverified accelerated matches', () => {
	const trajectory = new TrainingTrajectory();
	trajectory.record(decision('red-1', 'n1', 100));
	const result = { status: 'complete', winner: null };
	const stats = { players: { 'red-1': { teamId: 'red' } } };
	assert.deepEqual(trajectory.finish(result, stats, { split: 'validation', speedMode: 'max', parityStatus: 'passed' }), []);
	assert.deepEqual(trajectory.finish(result, stats, { split: 'train', speedMode: 'max', parityStatus: 'failed' }), []);
	assert.equal(trajectory.finish(result, stats, { split: 'train', speedMode: 'max', parityStatus: 'passed' })[0].reward, 0);
});
