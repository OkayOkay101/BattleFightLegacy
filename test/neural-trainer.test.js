const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NeuralTrainer } = require('../server/training/NeuralTrainer');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');
const { rosterHash } = require('../server/training/NeuralObservation');

test('real Python optimizer persists a validated neural policy across trainer restart',
	{ skip: !process.env.TRAINING_PYTHON }, async () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-neural-trainer-'));
		try {
			const trainer = new NeuralTrainer({ dataDir, pythonExecutable: process.env.TRAINING_PYTHON,
				minimumDecisions: 8 });
			const initial = await trainer.initialize();
			assert.equal(initial.version, 'n-000000');
			const row = { playerId: 'blue-1', policyVersion: initial.version, rosterHash,
				observation: Array(86).fill(0.01), observation86: Array(86).fill(0.01), observation82: Array(86).fill(0.01),
				options: [Array(17).fill(0), [1, ...Array(16).fill(0)]], options17: [Array(17).fill(0), [1, ...Array(16).fill(0)]], options13: [Array(17).fill(0), [1, ...Array(16).fill(0)]],
				chosenIndex: 1, logProb: -Math.log(2), value: 0, reward: 1, done: true, simulatedAt: 100 };
			const updated = await trainer.train(Array(8).fill(row));
			assert.equal(updated.version, 'n-000001');
			assert.equal(new PolicyRegistry(dataDir).policy('n-000001').kind, 'neural');
			assert.equal((await new NeuralTrainer({ dataDir, pythonExecutable: process.env.TRAINING_PYTHON }).initialize()).version,
				'n-000001');
		} finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
	});
