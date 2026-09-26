const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TrainingSupervisor, workerCount } = require('../server/training/TrainingSupervisor');
const { TrainingStore } = require('../server/training/TrainingStore');

test('worker count accepts 1..8 and leaves one logical core by default', () => {
	assert.equal(workerCount(undefined, 8), 4);
	assert.equal(workerCount(undefined, 2), 1);
	assert.equal(workerCount(8, 2), 8);
	assert.throws(() => workerCount(9, 8), /1\.\.8/);
});

test('two isolated workers finish two short matches and persist them once', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-supervisor-'));
	try {
		const supervisor = new TrainingSupervisor({ dataDir: dir, workers: 2, maxMatches: 2, maxDurationMs: 500, runId: 'test-run' });
		await supervisor.start();
		const matches = await new TrainingStore(dir).readMatches();
		assert.equal(matches.length, 2);
		assert.notEqual(matches[0].result.matchId, matches[1].result.matchId);
		assert.ok(matches.every(report => Object.keys(report.stats.players).length === 6));
		const sides = matches.sort((a, b) => a.result.matchId.localeCompare(b.result.matchId)).map(report => report.evaluation.candidateSide);
		assert.deepEqual(sides, ['blue', 'red']);
		assert.ok(matches.every(report => report.policyVersions.blue !== report.policyVersions.red));
		assert.equal(supervisor.status().completed, 2);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('unverified accelerated result cannot enter candidate validation', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-parity-gate-'));
	try {
		const supervisor = new TrainingSupervisor({ dataDir: dir, workers: 1 });
		supervisor.candidate = { version: 'candidate' };
		const report = { split: 'validation', speedMode: 'max', parityStatus: 'failed',
			evaluation: { candidateVersion: 'candidate', candidateSide: 'blue', pairIndex: 1 },
			result: { winner: 'blue' } };
		await supervisor._recordResult(report);
		assert.deepEqual(supervisor.outcomes, {});
		await supervisor._recordResult({ ...report, parityStatus: 'passed' });
		assert.deepEqual(supervisor.outcomes['1'], [1]);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('accelerated supervisor requires parity proof and stores a verified fixed-step result', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-max-supervisor-'));
	try {
		assert.throws(() => new TrainingSupervisor({ dataDir: dir, workers: 1,
			speedMode: 'max', parityStatus: 'unverified' }), /parity/i);
		const supervisor = new TrainingSupervisor({ dataDir: dir, workers: 1, maxMatches: 1,
			maxDurationMs: 1000, speedMode: 'max', parityStatus: 'passed', runId: 'max-test' });
		await supervisor.start();
		const matches = await new TrainingStore(dir).readMatches();
		assert.equal(matches.length, 1);
		assert.equal(matches[0].speedMode, 'max');
		assert.equal(matches[0].parityStatus, 'passed');
		assert.equal(matches[0].simulatedMs, 1000);
		assert.ok(matches[0].wallMs > 0);
		assert.equal(matches[0].result.status, 'complete');
		assert.equal(supervisor.status().simulatedMs, 1000);
		assert.ok(supervisor.status().simulatedSecondsPerWallSecond > 0);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('status reports candidate validation win rate with its match denominator', () => {
	const supervisor = new TrainingSupervisor({ workers: 1 });
	supervisor.outcomes = { 0: [1, 0.5], 1: [0, 1], 2: [1] };
	const status = supervisor.status();
	assert.equal(status.candidateValidationGames, 4);
	assert.equal(status.candidateValidationWinRate, 0.625);
});

test('neural resume replays only a missing validation side after a worker was interrupted', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-neural-resume-gap-'));
	try {
		const store = new TrainingStore(dir);
		for (const [index, winner] of [[0, 'blue'], [1, 'red'], [2, 'blue'], [4, 'red'], [5, 'blue']]) {
			await store.appendMatch({ result: { matchId: `neural-n-000021-validation-${index}`, status: 'complete', winner },
				evaluation: { candidateVersion: 'n-000021', candidateSide: index % 2 ? 'red' : 'blue',
					pairIndex: Math.floor(index / 2) }, split: 'validation', speedMode: 'realtime' });
		}
		const neuralStore = new TrainingStore(path.join(dir, 'neural-state'));
		await neuralStore.saveCheckpoint({ kind: 'neural-evaluation', championVersion: 'baseline',
			candidateVersion: 'n-000021', phase: 'validation', phaseIndex: 6,
			outcomes: { 0: [1, 1], 1: [1], 2: [1, 1] } });
		const supervisor = new TrainingSupervisor({ dataDir: dir, workers: 1 });
		supervisor.mode = 'neural';
		supervisor.neuralStore = neuralStore;
		supervisor.trainer = { initialize: async () => ({ version: 'n-000021' }) };
		supervisor.phase = 'train';
		supervisor.neuralPending = [];
		await supervisor._initializeNeural();
		const missing = supervisor._nextNeuralJob();
		assert.equal(missing.matchId, 'neural-n-000021-validation-3');
		assert.equal(supervisor._nextNeuralJob().matchId, 'neural-n-000021-validation-6');
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
