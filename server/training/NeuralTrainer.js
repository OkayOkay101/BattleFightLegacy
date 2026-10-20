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
	constructor({ dataDir, pythonExecutable, minimumDecisions = 8192, schemaVersion = 1,
		environmentHash, trainingProtocolVersion = 2, parentVersion, pythonRunner = execFileAsync } = {}) {
		if (!dataDir) throw new TypeError('Neural training data directory is required');
		this.dataDir = path.resolve(dataDir);
		if (![1, 2, 3].includes(schemaVersion)) throw new RangeError('Invalid neural schema');
		if (schemaVersion >= 2 && !/^[a-f0-9]{64}$/.test(environmentHash || '')) throw new TypeError('Neural environment hash is required');
		if (schemaVersion >= 2 && trainingProtocolVersion !== 2) throw new TypeError('Neural training requires protocol version 2');
		this.schemaVersion = schemaVersion;
		this.environmentHash = environmentHash;
		this.trainingProtocolVersion = trainingProtocolVersion;
		this.parentVersion = parentVersion;
		this.pythonRunner = pythonRunner;
		this.neuralDir = path.join(this.dataDir, schemaVersion >= 2 ? `neural-v${schemaVersion}` : 'neural');
		this.pythonExecutable = pythonExecutable || resolvePython().executable;
		this.minimumDecisions = minimumDecisions;
		this.registry = new PolicyRegistry(this.dataDir);
		this.manifest = null;
	}

	async _python(batchFile) {
		await fs.mkdir(this.neuralDir, { recursive: true });
		const args = [path.resolve(__dirname, '../../training-python/train.py'),
			'--data-dir', this.neuralDir, '--roster-hash', rosterHash];
		args.push('--schema-version', String(this.schemaVersion), '--next-version', this.registry.nextNeuralVersion());
		if (this.schemaVersion >= 2) {
			args.push('--environment-hash', this.environmentHash, '--protocol-version', String(this.trainingProtocolVersion));
			if (!this.manifest) {
				const parent = this.parentVersion || this.registry.status().championVersion;
				if (/^n-\d{6}$/.test(parent)) {
					const parentSchema = this.registry.policy(parent)?.weights?.schemaVersion || 1;
					const parentDir = parentSchema >= 2 ? `neural-v${parentSchema}` : 'neural';
					args.push('--parent-checkpoint', path.join(this.dataDir, parentDir, `optimizer-${parent}.pt`));
				}
			}
		}
		if (batchFile) args.push('--batch', batchFile);
		const { stdout } = await this.pythonRunner(this.pythonExecutable, args, {
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
		const weights = loadWeights(envelope);
		if (this.schemaVersion >= 2 && ['schemaVersion', 'observationSchemaVersion', 'actionSchemaVersion',
			'schemaHash', 'environmentHash', 'trainingProtocolVersion', 'parentVersion'].some(key => manifest[key] !== weights[key])) {
			throw new Error('Neural optimizer manifest metadata mismatch');
		}
		if (weights.schemaVersion !== this.schemaVersion || (this.schemaVersion >= 2 &&
			(weights.environmentHash !== this.environmentHash || weights.trainingProtocolVersion !== this.trainingProtocolVersion))) {
			throw new Error('Neural optimizer metadata mismatch');
		}
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
		if (this.schemaVersion >= 2) {
			const { getSchema } = require('./NeuralSchema');
			if (rows.some(row => row.schemaVersion !== this.schemaVersion || row.schemaHash !== getSchema(this.schemaVersion).schemaHash ||
				row.environmentHash !== this.environmentHash || row.trainingProtocolVersion !== this.trainingProtocolVersion)) {
				throw new Error('Neural PPO batch mixes schema, environment or protocol metadata');
			}
			if (rows.filter(row => row.options?.length > 1).length < this.minimumDecisions) throw new RangeError('Neural PPO multi-option batch is too small');
		}
		const batchFile = path.join(this.neuralDir, `batch-${crypto.randomUUID()}.json`);
		await fs.writeFile(batchFile, JSON.stringify(rows), { flag: 'wx' });
		try { return await this._python(batchFile); }
		finally { await fs.rm(batchFile, { force: true }); }
	}
}

module.exports = { NeuralTrainer };
