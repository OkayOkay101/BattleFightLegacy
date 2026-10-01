const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingTrajectory } = require('../server/training/TrainingTrajectory');
const { getSchema } = require('../server/training/NeuralSchema');

function decision(at, potential, extra = {}) {
	return { playerId: 'p1', policyVersion: 'n-v2', rosterHash: 'roster', schemaVersion: 2,
		schemaHash: getSchema(2).schemaHash, environmentHash: 'environment', trainingProtocolVersion: 2,
		matchId: 'match1', lifeId: 'life1', teamId: 'blue', potential,
		observation: Array(149).fill(0), options: [Array(18).fill(0), Array(18).fill(1)],
		chosenIndex: 0, logProb: -Math.log(2), value: 0, simulatedAt: at,
		requestedAction: { movement: 'hold', fire: false, slot: null }, ...extra };
}
const result = { status: 'complete', winner: 'blue', durationMs: 5000 };
const stats = { players: { p1: { teamId: 'blue', damageDealt: 10000, assists: 100 } } };

test('v2 trajectory gives dense potential reward and only the match terminal ends an episode', () => {
	const trajectory = new TrainingTrajectory();
	trajectory.record(decision(1000, 0));
	trajectory.record(decision(1100, 0.1));
	trajectory.record(decision(4200, 0.2, { lifeId: 'life2' }));
	const rows = trajectory.finish(result, stats, { endedAt: 5000 });
	assert.equal(rows.length, 3);
	assert.ok(Math.abs(rows[0].reward - 0.999 * 0.1) < 1e-10);
	assert.ok(Math.abs(rows[1].reward - (Math.pow(0.999, 31) * 0.2 - 0.1)) < 1e-10);
	assert.equal(rows[1].done, false, 'respawn retains one player episode');
	assert.equal(rows[2].reward, 0.8, 'old terminal damage/assist shaping is absent in v2');
	assert.equal(rows[2].done, true);
	assert.equal(rows[2].nextSimulatedAt, 5000);
	assert.equal(rows[0].nextSimulatedAt, 1100);
	assert.equal('observation86' in rows[0], false, 'canonical v2 arrays avoid duplicated archive payload');
});

test('v2 reward telescopes across transitions rather than paying for repeated unchanged states', () => {
	const trajectory = new TrainingTrajectory();
	trajectory.record(decision(0, 0.2));
	trajectory.record(decision(100, 0.2));
	trajectory.record(decision(200, 0.2));
	const rows = trajectory.finish({ status: 'complete', winner: null }, stats, { endedAt: 300 });
	const discounted = rows.reduce((sum, row, i) => sum + Math.pow(0.999, i) * row.reward, 0);
	assert.ok(Math.abs(discounted + 0.2) < 1e-10);
	assert.ok(rows.slice(0, 2).every(row => row.reward <= 0));
});

test('v2 trajectory refuses mixed schema/environment/protocol and invalid time/value data', () => {
	for (const extra of [{ environmentHash: 'other' }, { schemaHash: 'other' }, { trainingProtocolVersion: 3 }]) {
		const trajectory = new TrainingTrajectory(); trajectory.record(decision(100, 0));
		assert.throws(() => trajectory.record(decision(200, 0, extra)), /environment|schema|protocol/i);
	}
	for (const extra of [{ potential: NaN }, { matchId: '' }, { lifeId: '' }, { teamId: '' }, { observation: Array(149).fill(NaN) }]) {
		assert.throws(() => new TrainingTrajectory().record(decision(100, 0, extra)), /invalid/i);
	}
	const trajectory = new TrainingTrajectory(); trajectory.record(decision(100, 0));
	assert.throws(() => trajectory.record(decision(99, 0)), /time/i);
});

test('v2 execution telemetry keeps the original sampled index and likelihood', () => {
	const trajectory = new TrainingTrajectory(); trajectory.record(decision(100, 0));
	trajectory.recordExecution('p1', { fire: false, movement: 'path', moving: true }, ['path']);
	assert.equal(trajectory.rows[0].chosenIndex, 0);
	assert.equal(trajectory.rows[0].logProb, -Math.log(2));
	assert.deepEqual(trajectory.rows[0].overrideReasons, ['path']);
	assert.equal(trajectory.rows[0].executedAction.movement, 'path');
});

test('selection/final tests and invalid accelerated or incomplete matches never return training rows', () => {
	const trajectory = new TrainingTrajectory(); trajectory.record(decision(100, 0));
	for (const split of ['selection', 'final-test', 'validation']) {
		assert.deepEqual(trajectory.finish(result, stats, { split, endedAt: 5000 }), []);
	}
	assert.deepEqual(trajectory.finish({ status: 'failed' }, stats, { endedAt: 5000 }), []);
	assert.deepEqual(trajectory.finish(result, stats, { speedMode: 'max', parityStatus: 'failed', endedAt: 5000 }), []);
});
