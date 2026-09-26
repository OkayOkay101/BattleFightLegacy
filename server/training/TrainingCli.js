const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { TrainingSupervisor, workerCount } = require('./TrainingSupervisor');
const { TrainingStore } = require('./TrainingStore');
const { exportTierStats, toCsv } = require('./TrainingExport');
const { PolicyRegistry } = require('./PolicyRegistry');
const { runNeuralPreflight } = require('./NeuralPreflight');
const { runParitySuite } = require('./TrainingParity');
const { NeuralTrainer } = require('./NeuralTrainer');

function parseArgs(argv) {
	const options = { command: argv[0] || 'status' };
	for (let index = 1; index < argv.length; index++) {
		const key = argv[index];
		if (!key.startsWith('--') || !argv[index + 1]) throw new Error(`Invalid option ${key}`);
		options[key.slice(2)] = argv[++index];
	}
	options.dataDir = path.resolve(options['data-dir'] || path.join(__dirname, '../../training-data'));
	return options;
}

async function readJson(file) {
	try { return JSON.parse(await fs.readFile(file, 'utf8')); }
	catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function writeJsonAtomic(file, value, { rename = fs.rename } = {}) {
	const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
	await fs.writeFile(temp, JSON.stringify(value));
	try {
		for (let attempt = 0; ; attempt++) {
			try { await rename(temp, file); break; }
			catch (error) {
				if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 9) throw error;
				await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
			}
		}
	}
	finally { await fs.rm(temp, { force: true }); }
}

function processAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try { process.kill(pid, 0); return true; }
	catch (error) { if (error.code === 'ESRCH') return false; return true; }
}

function resolveSpeed(requestedSpeed, parity) {
	if (requestedSpeed !== 'max') return { speedMode: 'realtime', parityStatus: 'not-required', parityDetails: null };
	if (!parity) return { speedMode: 'realtime', parityStatus: 'unverified', parityDetails: null };
	return { speedMode: parity.ok ? 'max' : 'realtime', parityStatus: parity.ok ? 'passed' : 'failed',
		parityDetails: parity.cases };
}

async function daemon(options) {
	const lockFile = path.join(options.dataDir, 'supervisor.lock.json');
	const statusFile = path.join(options.dataDir, 'status.json');
	const stopFile = path.join(options.dataDir, 'stop-request.json');
	const runId = options['run-id'];
	const supervisor = new TrainingSupervisor({ dataDir: options.dataDir, runId,
		mode: options.neural === 'on' ? 'neural' : 'heuristic',
		workers: Number(options.workers),
		maxMatches: options.matches ? Number(options.matches) : Infinity,
		maxDurationMs: options['duration-ms'] ? Number(options['duration-ms']) : 300000,
		speedMode: options['speed-mode'] || 'realtime', parityStatus: options['parity-status'] || 'not-required' });
	const publish = async state => writeJsonAtomic(statusFile, { ...supervisor.status(), pid: process.pid, state,
		requestedSpeedMode: options['requested-speed'] || supervisor.speedMode,
		parityDetails: options['parity-details'] ?
			(options['parity-details'].startsWith('{') || options['parity-details'].startsWith('[') ?
				JSON.parse(options['parity-details']) :
				JSON.parse(Buffer.from(options['parity-details'], 'base64').toString('utf8'))) : null,
		updatedAt: Date.now() });
	await writeJsonAtomic(lockFile, { pid: process.pid, runId, startedAt: Date.now() });
	await publish('starting');
	let ready = false;
	let stopStartedAt = null;
	const interval = setInterval(async () => {
		try {
			const request = await readJson(stopFile);
			if (request?.runId === runId) {
				if (stopStartedAt === null) { stopStartedAt = Date.now(); supervisor.stop(); }
				else if (Date.now() - stopStartedAt > 30000) supervisor.stop({ abortActive: true });
			}
			await publish(!ready ? 'starting' : (supervisor.stopRequested ? 'stopping' : 'running'));
		} catch (error) { console.error(error); }
	}, 500);
	try {
		await supervisor.start({ onReady: async () => {
			ready = true;
			await publish(supervisor.stopRequested ? 'stopping' : 'running');
		} });
		await publish('stopped');
	}
	finally {
		clearInterval(interval);
		const lock = await readJson(lockFile);
		if (lock?.runId === runId) await fs.rm(lockFile, { force: true });
		const request = await readJson(stopFile);
		if (request?.runId === runId) await fs.rm(stopFile, { force: true });
	}
}

async function start(options) {
	if (options.neural === 'on') runNeuralPreflight();
	if (options.neural && !['on', 'off'].includes(options.neural)) throw new Error('Use --neural on or --neural off');
	workerCount(options.workers === undefined ? undefined : Number(options.workers));
	if (options.matches !== undefined && (!Number.isInteger(Number(options.matches)) || Number(options.matches) < 1)) throw new RangeError('matches must be positive');
	if (options['duration-ms'] !== undefined && (!Number.isFinite(Number(options['duration-ms'])) || Number(options['duration-ms']) <= 0)) throw new RangeError('duration-ms must be positive');
	const requestedSpeed = options.speed || 'max';
	if (!['realtime', 'max'].includes(requestedSpeed)) throw new RangeError('Use --speed realtime or --speed max');
	await fs.mkdir(options.dataDir, { recursive: true });
	const lockFile = path.join(options.dataDir, 'supervisor.lock.json');
	const existing = await readJson(lockFile);
	if (existing && processAlive(existing.pid)) throw new Error(`Training already running (PID ${existing.pid})`);
	if (existing) await fs.rm(lockFile, { force: true });
	const runId = crypto.randomUUID();
	await fs.writeFile(lockFile, JSON.stringify({ pid: process.pid, runId, startingAt: Date.now() }), { flag: 'wx' });
	let daemonStarted = false;
	try {
		let { speedMode, parityStatus, parityDetails } = resolveSpeed(requestedSpeed);
		if (requestedSpeed === 'max') {
			try {
				let policies = null;
				if (options.neural === 'on') {
					const trainer = new NeuralTrainer({ dataDir: options.dataDir });
					const candidate = await trainer.initialize();
					policies = { bluePolicy: candidate, redPolicy: new PolicyRegistry(options.dataDir).policy('baseline') };
				}
				const parity = runParitySuite([1, 2, 3], { durationMs: 3000, policies });
				({ speedMode, parityStatus, parityDetails } = resolveSpeed(requestedSpeed, parity));
			} catch (error) {
				parityStatus = 'error';
				parityDetails = { error: error.message };
				speedMode = 'realtime';
			}
		}
	const args = [__filename, 'daemon', '--data-dir', options.dataDir, '--run-id', runId,
		'--workers', String(workerCount(options.workers === undefined ? undefined : Number(options.workers))),
		'--neural', options.neural || 'off',
		'--speed-mode', speedMode, '--requested-speed', requestedSpeed, '--parity-status', parityStatus];
	if (parityDetails) args.push('--parity-details', Buffer.from(JSON.stringify(parityDetails)).toString('base64'));
	for (const key of ['matches', 'duration-ms']) if (options[key] !== undefined) args.push(`--${key}`, String(options[key]));
	const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore', windowsHide: true });
	child.unref();
		daemonStarted = true;
	const statusFile = path.join(options.dataDir, 'status.json');
	for (let attempt = 0; attempt < 100; attempt++) {
		const status = await readJson(statusFile);
		if (status?.runId === runId && status.pid === child.pid && status.state !== 'starting') return status;
		if (!processAlive(child.pid)) break;
		await new Promise(resolve => setTimeout(resolve, 100));
	}
		throw new Error('Training daemon did not become ready; inspect training-data/status.json');
	} catch (error) {
		if (!daemonStarted) {
			const lock = await readJson(lockFile);
			if (lock?.runId === runId && lock.pid === process.pid) await fs.rm(lockFile, { force: true });
		}
		throw error;
	}
}

async function stop(options) {
	const lock = await readJson(path.join(options.dataDir, 'supervisor.lock.json'));
	if (!lock || !processAlive(lock.pid)) return { state: 'not-running' };
	await writeJsonAtomic(path.join(options.dataDir, 'stop-request.json'), { runId: lock.runId, requestedAt: Date.now() });
	return { state: 'stopping', pid: lock.pid, runId: lock.runId };
}

async function status(options) {
	const report = await readJson(path.join(options.dataDir, 'status.json'));
	if (!report) return { state: 'not-started' };
	return { ...report, state: report.state === 'running' && !processAlive(report.pid) ? 'stale' : report.state };
}

async function exportResults(options) {
	const matches = await new TrainingStore(options.dataDir).readMatches();
	const rows = exportTierStats(matches);
	return options.format === 'json' ? JSON.stringify(rows, null, 2) : toCsv(rows);
}

async function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	const registry = new PolicyRegistry(options.dataDir);
	switch (options.command) {
	case 'start': console.log(JSON.stringify(await start(options))); break;
	case 'daemon': await daemon(options); break;
	case 'stop': console.log(JSON.stringify(await stop(options))); break;
	case 'status': console.log(JSON.stringify(await status(options))); break;
	case 'export': process.stdout.write(await exportResults(options)); break;
	case 'neural-check': console.log(JSON.stringify(runNeuralPreflight())); break;
	case 'auto':
		if (!['on', 'off'].includes(options.enabled)) throw new Error('Use --enabled on or --enabled off');
		registry.setAutoUpdate(options.enabled === 'on');
		console.log(JSON.stringify(registry.status()));
		break;
	case 'activate':
		if (!options.version) throw new Error('Use --version VERSION');
		registry.activate(options.version);
		console.log(JSON.stringify(registry.status()));
		break;
	case 'rollback':
		registry.rollback();
		console.log(JSON.stringify(registry.status()));
		break;
	default: throw new Error(`Unknown training command ${options.command}`);
	}
}

if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

module.exports = { parseArgs, start, stop, status, exportResults, processAlive, resolveSpeed, writeJsonAtomic };
