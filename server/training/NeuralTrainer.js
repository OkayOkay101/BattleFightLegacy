const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { resolvePython } = require('./NeuralPreflight');
const { rosterHash } = require('./NeuralObservation');
const { PolicyRegistry } = require('./PolicyRegistry');
const { loadWeights } = require('./NeuralInference');

const execFileAsync = promisify(execFile);

class NeuralTrainer {
	constructor({ dataDir, pythonExecutable, minimumDecisions = 8192 } = {}) {
		if (!dataDir) throw new TypeError('Neural training data directory is required');
		this.dataDir = path.resolve(dataDir);
		this.neuralDir = path.join(this.dataDir, 'neural');
		this.pythonExecutable = pythonExecutable || resolvePython().executable;
		this.minimumDecisions = minimumDecisions;
		this.registry = new PolicyRegistry(this.dataDir);
		this.manifest = null;
	}

	async _python(batchFile) {
		await fs.mkdir(this.neuralDir, { recursive: true });
		const args = [path.resolve(__dirname, '../../training-python/train.py'),
			'--data-dir', this.neuralDir, '--roster-hash', rosterHash];
		if (batchFile) args.push('--batch', batchFile);
		const { stdout } = await execFileAsync(this.pythonExecutable, args, {
			cwd: path.resolve(__dirname, '../../training-python'), maxBuffer: 1024 * 1024 * 4,
			windowsHide: true
		});
		const manifest = JSON.parse(stdout.trim());
		if (manifest.rosterHash !== rosterHash || !/^n-\d{6}$/.test(manifest.version)) {
			throw new Error('Invalid neural optimizer manifest');
		}
		const expectedPath = path.join(this.neuralDir, `weights-${manifest.version}.json`);
		if (path.resolve(manifest.weightsPath) !== expectedPath) throw new Error('Neural weight path escaped data directory');
		const envelope = JSON.parse(await fs.readFile(expectedPath, 'utf8'));
		loadWeights(envelope);
		this.registry.savePolicy({ kind: 'neural', version: manifest.version, weightsEnvelope: envelope });
		this.manifest = manifest;
		return this.registry.policy(manifest.version);
	}

	async initialize() { return this._python(null); }

	async train(rows) {
		if (!this.manifest) throw new Error('Neural trainer must be initialized');
		if (!Array.isArray(rows) || rows.length < this.minimumDecisions) throw new RangeError('Neural PPO batch is too small');
		if (rows.some(row => row.policyVersion !== this.manifest.version || row.rosterHash !== rosterHash)) {
			throw new Error('Neural PPO batch mixes versions or roster hashes');
		}
		const batchFile = path.join(this.neuralDir, `batch-${crypto.randomUUID()}.json`);
		await fs.writeFile(batchFile, JSON.stringify(rows), { flag: 'wx' });
		try { return await this._python(batchFile); }
		finally { await fs.rm(batchFile, { force: true }); }
	}
}

module.exports = { NeuralTrainer };
