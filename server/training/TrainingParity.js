const { isDeepStrictEqual } = require('node:util');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const EVENT_FIELDS = ['itemUses', 'neuralActions', 'contacts', 'healthChanges', 'deaths', 'scores'];
const POSITION_TOLERANCE = 1e-4;

function positionsMatch(left, right) {
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
	return left.every((position, index) => {
		const other = right[index];
		return other && position.tick === other.tick && position.participant === other.participant &&
			Number.isFinite(position.x) && Number.isFinite(position.y) &&
			Number.isFinite(other.x) && Number.isFinite(other.y) &&
			Math.abs(position.x - other.x) <= POSITION_TOLERANCE &&
			Math.abs(position.y - other.y) <= POSITION_TOLERANCE;
	});
}

function compareTrace(realtimeTrace, acceleratedTrace) {
	if (!realtimeTrace || !acceleratedTrace) throw new TypeError('Both training traces are required');
	const differences = EVENT_FIELDS.filter(field => !Array.isArray(realtimeTrace[field]) ||
		!Array.isArray(acceleratedTrace[field]) || !isDeepStrictEqual(realtimeTrace[field], acceleratedTrace[field]));
	if (!isDeepStrictEqual(realtimeTrace.winner, acceleratedTrace.winner) ||
		!Object.hasOwn(realtimeTrace, 'winner') || !Object.hasOwn(acceleratedTrace, 'winner')) differences.push('winner');
	if (!positionsMatch(realtimeTrace.positions, acceleratedTrace.positions)) differences.push('positions');
	return { ok: differences.length === 0, differences };
}

function runParitySuite(seedSet, { durationMs = 1000, policies = null } = {}) {
	if (!Array.isArray(seedSet) || !seedSet.length || seedSet.some(seed => !Number.isInteger(seed)) ||
		!Number.isFinite(durationMs) || durationMs <= 0) throw new TypeError('Invalid parity seed set or duration');
	const workerFile = path.join(__dirname, 'MatchWorker.js');
	let temporaryDir = null, policyFile = null;
	if (policies) {
		temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-parity-'));
		policyFile = path.join(temporaryDir, 'policies.json');
		fs.writeFileSync(policyFile, JSON.stringify(policies));
	}
	function run(seed, paced) {
		const args = [workerFile, '--fixed-step-run-once', '--duration-ms', String(durationMs), '--seed', String(seed)];
		if (paced) args.push('--pace-realtime');
		if (policyFile) args.push('--policy-file', policyFile);
		const child = spawnSync(process.execPath, args, { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
			timeout: Math.max(30000, durationMs * 3), maxBuffer: 64 * 1024 * 1024 });
		if (child.status !== 0) throw new Error(`Parity worker failed: ${child.stderr || child.stdout}`);
		const line = child.stdout.split(/\r?\n/).find(value => value.startsWith('TRAINING_FIXED_MATCH '));
		if (!line) throw new Error('Parity worker did not return a match trace');
		return JSON.parse(line.slice('TRAINING_FIXED_MATCH '.length));
	}
	try {
		const cases = seedSet.map(seed => {
			const realtime = run(seed, true);
			const accelerated = run(seed, false);
			const comparison = compareTrace(realtime.trace, accelerated.trace);
			return { seed, ok: comparison.ok, differences: comparison.differences,
				realtimeWallMs: realtime.wallMs, maxWallMs: accelerated.wallMs,
				simulatedMs: accelerated.simulatedMs,
				neuralDecisions: accelerated.trace.neuralActions.length };
		});
		return { ok: cases.every(result => result.ok), cases };
	} finally {
		if (policyFile) fs.unlinkSync(policyFile);
		if (temporaryDir) fs.rmdirSync(temporaryDir);
	}
}

module.exports = { compareTrace, runParitySuite };
