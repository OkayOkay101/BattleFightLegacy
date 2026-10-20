const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadWeights } = require('./NeuralInference');

const BASELINE = Object.freeze({ version: 'baseline', kind: 'heuristic',
	params: Object.freeze({ rangeScale: 1, dodgeScale: 1, switchScale: 1 }) });

function validPolicy(value) {
	if (!value || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.version)) return false;
	if (value.kind === 'neural') {
		try { loadWeights(value.weightsEnvelope); return true; }
		catch (error) { return false; }
	}
	return !!(value.kind === 'heuristic' && value.params &&
		['rangeScale', 'dodgeScale', 'switchScale'].every(key =>
			Number.isFinite(value.params[key]) && value.params[key] >= 0.5 && value.params[key] <= 1.5));
}

function sealed(value) {
	const payload = JSON.stringify(value);
	return JSON.stringify({ payload, checksum: crypto.createHash('sha256').update(payload).digest('hex') });
}

function unseal(raw) {
	const envelope = JSON.parse(raw);
	if (crypto.createHash('sha256').update(envelope.payload).digest('hex') !== envelope.checksum) throw new Error('Policy checksum mismatch');
	return JSON.parse(envelope.payload);
}

function writeAtomic(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
	fs.writeFileSync(temp, sealed(value));
	try { fs.renameSync(temp, file); }
	finally { if (fs.existsSync(temp)) fs.rmSync(temp); }
}

class PolicyRegistry {
	constructor(directory = path.resolve(__dirname, '../../training-data')) {
		this.directory = path.resolve(directory);
		this.configFile = path.join(this.directory, 'registry.json');
		this.config = { autoUpdate: false, activeVersion: 'baseline', championVersion: 'baseline', previousVersion: 'baseline' };
		try {
			const parsed = unseal(fs.readFileSync(this.configFile, 'utf8'));
			if (typeof parsed.autoUpdate === 'boolean' && typeof parsed.activeVersion === 'string' &&
				typeof parsed.championVersion === 'string' && typeof parsed.previousVersion === 'string') this.config = parsed;
		} catch (error) { /* Missing or corrupt registry uses safe defaults. */ }
	}

	status() { return { ...this.config }; }

	policy(version) {
		if (version === 'baseline') return BASELINE;
		if (!/^[a-zA-Z0-9_-]{1,64}$/.test(version)) return null;
		try {
			const value = unseal(fs.readFileSync(path.join(this.directory, 'policies', `${version}.json`), 'utf8'));
			if (!validPolicy(value) || value.version !== version) return null;
			return value.kind === 'neural' ? { ...value, weights: loadWeights(value.weightsEnvelope) } : value;
		} catch (error) { return null; }
	}

	savePolicy(value) {
		value = { kind: 'heuristic', ...value };
		if (!validPolicy(value) || value.version === 'baseline') throw new TypeError('Invalid training policy');
		const file = path.join(this.directory, 'policies', `${value.version}.json`);
		if (/^n-\d{6}$/.test(value.version) && fs.existsSync(file)) {
			if (JSON.stringify(unseal(fs.readFileSync(file, 'utf8'))) === JSON.stringify(value)) return;
			throw new Error(`Cannot overwrite numbered policy ${value.version}`);
		}
		if (/^n-\d{6}$/.test(value.version)) {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			const temporary = `${file}.${crypto.randomUUID()}.tmp`;
			fs.writeFileSync(temporary, sealed(value));
			try { fs.linkSync(temporary, file); }
			catch (error) { if (error.code === 'EEXIST') throw new Error(`Cannot overwrite numbered policy ${value.version}`); throw error; }
			finally { fs.rmSync(temporary, { force: true }); }
			return;
		}
		writeAtomic(file, value);
	}

	nextNeuralVersion() {
		let maximum = -1;
		const folders = ['policies', 'neural'];
		try {
			// Reserve published optimizer/weight numbers even if a crash prevented
			// publication in the policy registry. Only canonical local directories count.
			for (const entry of fs.readdirSync(this.directory, { withFileTypes: true })) {
				if (entry.isDirectory() && /^neural-v[1-9]\d*$/.test(entry.name)) folders.push(entry.name);
			}
		} catch (error) { if (error.code !== 'ENOENT') throw error; }
		for (const folder of folders) {
			let files; try { files = fs.readdirSync(path.join(this.directory, folder)); }
			catch (error) { if (error.code === 'ENOENT') continue; throw error; }
			for (const file of files) { const match = file.match(/(?:^|-)n-(\d{6})(?:\.|$)/);
				if (match) maximum = Math.max(maximum, Number(match[1])); }
		}
		if (maximum >= 999999) throw new RangeError('Neural policy numbering exhausted');
		return `n-${String(maximum + 1).padStart(6, '0')}`;
	}

	_saveConfig() { writeAtomic(this.configFile, this.config); }

	setAutoUpdate(enabled) {
		if (typeof enabled !== 'boolean') throw new TypeError('auto-update must be boolean');
		this.config.autoUpdate = enabled;
		this._saveConfig();
	}

	activate(version) {
		if (!this.policy(version)) throw new Error(`Unknown or corrupt policy ${version}`);
		this.config.activeVersion = version;
		this._saveConfig();
	}

	promote(version, { evaluation } = {}) {
		if (!this.policy(version)) throw new Error(`Unknown or corrupt policy ${version}`);
		if (version === this.config.championVersion) return;
		const oldChampion = this.config.championVersion;
		this.config.approvedArchives = [...new Set([oldChampion, this.config.previousVersion,
			...(this.config.approvedArchives || [])])].filter(value => value !== version).slice(0, 3);
		this.config.previousVersion = this.config.championVersion;
		this.config.championVersion = version;
		if (this.config.autoUpdate) this.config.activeVersion = version;
		if (evaluation) this.config.lastPromotion = evaluation;
		this._saveConfig();
	}

	rollback() {
		const previous = this.policy(this.config.previousVersion);
		if (!previous) throw new Error('No valid previous policy');
		const current = this.config.championVersion;
		this.config.championVersion = previous.version;
		this.config.previousVersion = current;
		this.config.activeVersion = previous.version;
		this._saveConfig();
	}

	policyForNewMatch() {
		const preferred = this.config.autoUpdate ? this.config.championVersion : this.config.activeVersion;
		const selected = this.policy(preferred) || this.policy(this.config.previousVersion) || BASELINE;
		return JSON.parse(JSON.stringify(selected));
	}
}

module.exports = { PolicyRegistry, BASELINE, validPolicy };
