const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingSupervisor } = require('../server/training/TrainingSupervisor');

test('neural match IDs remain stable across supervisor restarts for checkpointed jobs', () => {
	const makeSupervisor = runId => Object.assign(Object.create(TrainingSupervisor.prototype), {
		mode: 'neural', runId, maxMatches: Infinity, phase: 'validation', phaseIndex: 8,
		candidate: { version: 'n42' }, champion: { version: 'baseline' }, neuralPending: [], outcomes: {},
		trainer: { minimumDecisions: 8192 }, dispatched: 0,
		registry: { status: () => ({ previousVersion: null }), policy: version => ({ version }) }
	});
	const first = makeSupervisor('first-run');
	const originalJob = first._nextNeuralJob();

	const resumed = makeSupervisor('resumed-run');
	assert.equal(resumed._nextNeuralJob().matchId, originalJob.matchId);
});
