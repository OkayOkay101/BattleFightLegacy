const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fork } = require('node:child_process');

test('live training bots emit neural decisions from fixed-step combat', () => {
	const script = `
		let randomState = 0x51a7e;
		Math.random = () => {
			randomState = (randomState + 0x6d2b79f5) >>> 0;
			let value = Math.imul(randomState ^ randomState >>> 15, 1 | randomState);
			value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
			return ((value ^ value >>> 14) >>> 0) / 4294967296;
		};
		const { bootTrainingGame } = require('./server/training/MatchWorker');
		const { TrainingStepper } = require('./server/training/TrainingStepper');
		const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });
		const weights = { actor: [layer(64,103), layer(64,64), layer(1,64)], critic: [layer(64,86), layer(1,64)] };
		bootTrainingGame({ manualSteps: true, maxDurationMs: 1000,
			bluePolicy: { kind: 'neural', version: 'n-smoke', weights },
			redPolicy: { kind: 'heuristic', version: 'baseline', params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } }
		}).then(({ ige, clock }) => {
			const stepper = new TrainingStepper({ ige, clock });
			for (let i = 0; i < 60; i++) stepper.step();
			console.log('NEURAL_SMOKE ' + JSON.stringify({ rows: ige.training.trajectory?.rows.length || 0,
				versions: [...new Set((ige.training.trajectory?.rows || []).map(row => row.policyVersion))],
				observedSelfMotion: (ige.training.trajectory?.rows || []).some(row => {
					const obs = row.observation || row.observation86 || row.observation82;
					return Math.abs(obs[3]) + Math.abs(obs[4]) > 0;
				}) }));
			stepper.dispose(); process.exit(0);
		}).catch(error => { console.error(error); process.exit(1); });
	`;
	const run = spawnSync(process.execPath, ['-e', script], {
		cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 15000
	});
	assert.equal(run.status, 0, run.stderr || run.stdout);
	const line = run.stdout.split(/\r?\n/).find(value => value.startsWith('NEURAL_SMOKE '));
	assert.ok(line, run.stdout);
	const report = JSON.parse(line.slice('NEURAL_SMOKE '.length));
	assert.ok(report.rows >= 10, `expected live decisions, got ${report.rows}`);
	assert.deepEqual(report.versions, ['n-smoke']);
	assert.equal(report.observedSelfMotion, true);
});

test('neural training worker returns complete on-policy transitions to its supervisor', async () => {
	const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });
	const weights = { actor: [layer(64, 103), layer(64, 64), layer(1, 64)],
		critic: [layer(64, 86), layer(1, 64)] };
	const child = fork(path.resolve(__dirname, '../server/training/MatchWorker.js'), [], {
		stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true
	});
	const report = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => { child.kill(); reject(new Error('neural worker timed out')); }, 15000);
		child.on('error', reject);
		child.on('exit', code => { if (code && !reportReceived) reject(new Error(`neural worker exited ${code}`)); });
		let reportReceived = false;
		child.on('message', message => {
			if (message?.type !== 'result') return;
			reportReceived = true;
			clearTimeout(timer);
			resolve(message.report);
		});
		child.send({ type: 'run', matchId: 'neural-ipc-smoke', seed: 5, maxDurationMs: 1000,
			speedMode: 'max', parityStatus: 'passed', split: 'train',
			bluePolicy: { kind: 'neural', version: 'n-ipc', weights },
			redPolicy: { kind: 'heuristic', version: 'baseline', params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } } });
	});
	assert.equal(report.result.status, 'complete');
	assert.ok(report.trajectory.length >= 10);
	assert.ok(report.trajectory.every(row => row.policyVersion === 'n-ipc'));
	assert.ok(report.trajectory.some(row => row.done));
});
