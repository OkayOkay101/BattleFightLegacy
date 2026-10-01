const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../server/training/TrainingRuntime');
const { getSchema } = require('../server/training/NeuralSchema');
const { ROSTER_IDS, rosterHash } = require('../server/training/NeuralObservation');

function fixture(split = 'train') {
	const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });
	const weights = { schemaVersion: 2, schemaHash: getSchema(2).schemaHash, environmentHash: 'a'.repeat(64),
		trainingProtocolVersion: 2, rosterHash, actor: [layer(64, 167), layer(64, 64), layer(1, 64)], critic: [layer(64, 149), layer(1, 64)] };
	const player = { id: () => 'p1', _stats: { trainingTeamId: 'blue' }, getSelectedUnit: () => ({ id: () => 'life1' }) };
	const ige = { $$: () => [] };
	const runtime = install(ige, { match: { matchId: 'match1', scores: { blue: 1, red: 0 } }, split,
		candidateVersion: 'n-v2', bluePolicy: { kind: 'neural', version: 'n-v2', weights }, redPolicy: { kind: 'heuristic' } });
	const snapshot = { self: { characterId: ROSTER_IDS[0] }, enemies: [{ id: 'enemy', distance: 100, visible: true }],
		targets: [{ id: 'enemy', distance: 100, visible: true }], weapons: [], allies: [], projectiles: [] };
	return { runtime, player, snapshot };
}

test('runtime adds match/life/team/potential to v2 learner rows and records actual execution', () => {
	const { runtime, player, snapshot } = fixture();
	assert.ok(runtime.decideNeural(player, snapshot, 100));
	assert.equal(runtime.neuralError, null);
	const row = runtime.trajectory.rows[0];
	assert.equal(row.matchId, 'match1');
	assert.equal(row.lifeId, 'life1');
	assert.equal(row.teamId, 'blue');
	assert.equal(row.potential, 0.0125);
	runtime.recordExecution(player, { fire: false, moving: true }, ['path']);
	assert.equal(row.executedAction.moving, true);
	assert.deepEqual(row.overrideReasons, ['path']);
});

test('selection and final-test use deterministic decisions and never record optimizer data', () => {
	for (const split of ['selection', 'final-test', 'validation']) {
		const { runtime, player, snapshot } = fixture(split);
		const original = Math.random; Math.random = () => { throw new Error('evaluation must not sample'); };
		try { assert.ok(runtime.decideNeural(player, snapshot, 100)); }
		finally { Math.random = original; }
		assert.equal(runtime.neuralError, null, runtime.neuralError);
		assert.equal(runtime.trajectory.rows.length, 0);
	}
});

test('v2 inference failures are explicit and cannot silently generate a partial usable batch', () => {
	const { runtime, player, snapshot } = fixture();
	runtime.config.bluePolicy.weights.actor[2].bias[0] = NaN;
	assert.equal(runtime.decideNeural(player, snapshot, 100), null);
	assert.ok(runtime.neuralError);
	assert.equal(runtime.trajectory.rows.length, 0);
});

test('a frozen self-play opponent using the learner version never samples or enters PPO', () => {
	const { runtime, player, snapshot } = fixture();
	runtime.config.learnerSide = 'blue';
	runtime.config.redPolicy = runtime.config.bluePolicy;
	const opponent = { ...player, id: () => 'p2', _stats: { trainingTeamId: 'red' } };
	const random = Math.random;
	Math.random = () => { throw new Error('frozen opponent must use argmax'); };
	try { assert.ok(runtime.decideNeural(opponent, snapshot, 100)); }
	finally { Math.random = random; }
	assert.equal(runtime.neuralError, null);
	assert.equal(runtime.trajectory.rows.length, 0);
	assert.ok(runtime.decideNeural(player, snapshot, 100));
	assert.equal(runtime.trajectory.rows.length, 1);
});

test('a transient unit outside the eligible roster contributes no neural training rows', () => {
	const {runtime,player,snapshot}=fixture();
	snapshot.self.characterId='hLrbyj6dKv';
	assert.equal(runtime.decideNeural(player,snapshot,100),null);
	assert.equal(runtime.neuralError,null);
	assert.equal(runtime.trajectory.rows.length,0);
});
