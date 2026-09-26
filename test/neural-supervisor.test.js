const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TrainingSupervisor } = require('../server/training/TrainingSupervisor');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');
const { TrainingStore } = require('../server/training/TrainingStore');

test('neural supervisor trains one homogeneous batch then freezes a new candidate for validation',
	{ skip: !process.env.TRAINING_PYTHON, timeout: 60000 }, async () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-neural-supervisor-'));
		try {
			const supervisor = new TrainingSupervisor({ dataDir, mode: 'neural', workers: 1, maxMatches: 2,
				maxDurationMs: 1000, speedMode: 'max', parityStatus: 'passed',
				neuralMinimumDecisions: 10, pythonExecutable: process.env.TRAINING_PYTHON });
			const status = await supervisor.start();
			assert.equal(status.mode, 'neural');
			assert.equal(status.completed, 2);
			assert.equal(status.candidateVersion, 'n-000001');
			assert.equal(new PolicyRegistry(dataDir).policy('n-000001').kind, 'neural');
			const reports = await new TrainingStore(dataDir).readMatches();
			assert.deepEqual(reports.map(report => report.split), ['train', 'validation']);
			assert.ok(reports[0].trajectory.length >= 10);
			assert.deepEqual(reports[1].trajectory, []);
		} finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
	});
