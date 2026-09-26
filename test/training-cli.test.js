const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { start, stop, status, exportResults, resolveSpeed, writeJsonAtomic } = require('../server/training/TrainingCli');

test('status replacement retries a temporary Windows rename lock', async () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-status-retry-'));
	try {
		const statusFile = path.join(dataDir, 'status.json');
		fs.writeFileSync(statusFile, '{"state":"starting"}');
		let attempts = 0;
		await writeJsonAtomic(statusFile, { state: 'running' }, { rename: async (source, target) => {
			attempts++;
			if (attempts < 3) throw Object.assign(new Error('file temporarily locked'), { code: 'EPERM' });
			await fsp.rename(source, target);
		} });
		assert.equal(attempts, 3);
		assert.deepEqual(JSON.parse(fs.readFileSync(statusFile, 'utf8')), { state: 'running' });
	} finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('failed parity preflight falls back to realtime and keeps the failure visible', () => {
	assert.deepEqual(resolveSpeed('max', { ok: false, cases: [{ seed: 2, differences: ['contacts'] }] }), {
		speedMode: 'realtime', parityStatus: 'failed',
		parityDetails: [{ seed: 2, differences: ['contacts'] }]
	});
});

test('training start, status and stop control only their own detached supervisor', async () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-cli-'));
	try {
		const running = await start({ dataDir, workers: '1', matches: '10', 'duration-ms': '5000', speed: 'realtime' });
		assert.equal(running.state, 'running');
		assert.equal((await status({ dataDir })).runId, running.runId);
		assert.equal((await stop({ dataDir })).runId, running.runId);
		let stopped;
		for (let attempt = 0; attempt < 100; attempt++) {
			stopped = await status({ dataDir });
			if (stopped.state === 'stopped') break;
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		assert.equal(stopped.state, 'stopped');
		assert.ok((await exportResults({ dataDir, format: 'csv' })).startsWith('policyKind,policyVersion,split,characterId'));
	} finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('default speed runs parity preflight before starting a detached accelerated worker', async () => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-max-cli-'));
	try {
		const started = await start({ dataDir, workers: '1', matches: '1', 'duration-ms': '1000' });
		assert.equal(started.speedMode, 'max');
		assert.equal(started.parityStatus, 'passed');
		let state;
		for (let attempt = 0; attempt < 100; attempt++) {
			state = await status({ dataDir });
			if (state.state === 'stopped') break;
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		assert.equal(state.state, 'stopped');
		const matches = await new (require('../server/training/TrainingStore').TrainingStore)(dataDir).readMatches();
		assert.equal(matches.length, 1);
		assert.equal(matches[0].speedMode, 'max');
		assert.equal(matches[0].parityStatus, 'passed');
	} finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('neural CLI starts its detached trainer and keeps auto-activation off',
	{ skip: !process.env.TRAINING_PYTHON, timeout: 30000 }, async () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-neural-cli-'));
		try {
		const started = await start({ dataDir, workers: '1', matches: '1', 'duration-ms': '1000',
			neural: 'on', speed: 'realtime' });
		assert.equal(started.mode, 'neural');
		assert.ok(started.candidateVersion, 'start must wait until the saved/new neural policy is initialized');
		assert.equal(started.phase, 'train');
			let state;
			for (let attempt = 0; attempt < 200; attempt++) {
				state = await status({ dataDir });
				if (state.state === 'stopped') break;
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			assert.equal(state.state, 'stopped');
			assert.equal(state.completed, 1);
			assert.equal(new (require('../server/training/PolicyRegistry').PolicyRegistry)(dataDir).status().autoUpdate, false);
		} finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
	});

test('stop waits for an active match to finish before marking training stopped',
	{ timeout: 15000 }, async () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-graceful-stop-'));
		try {
		await start({ dataDir, workers: '1', matches: '10', 'duration-ms': '3000', speed: 'realtime' });
			let active;
			for (let attempt = 0; attempt < 50; attempt++) {
				active = await status({ dataDir });
				if (active.active === 1) break;
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			assert.equal(active.active, 1);
			await stop({ dataDir });
			let stopped;
			for (let attempt = 0; attempt < 100; attempt++) {
				stopped = await status({ dataDir });
				if (stopped.state === 'stopped') break;
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			assert.equal(stopped.state, 'stopped');
			assert.equal(stopped.completed, 1);
		} finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
	});

test('accelerated neural CLI proves parity with frozen neural decisions before using results',
	{ skip: !process.env.TRAINING_PYTHON, timeout: 45000 }, async () => {
		const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-neural-max-cli-'));
		try {
			const started = await start({ dataDir, workers: '1', matches: '1', 'duration-ms': '1000',
				neural: 'on', speed: 'max' });
			assert.equal(started.speedMode, 'max');
			assert.equal(started.parityStatus, 'passed');
			assert.ok(started.parityDetails.every(entry => entry.neuralDecisions > 0));
			let state;
			for (let attempt = 0; attempt < 200; attempt++) {
				state = await status({ dataDir });
				if (state.state === 'stopped') break;
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			assert.equal(state.state, 'stopped');
		} finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
	});
