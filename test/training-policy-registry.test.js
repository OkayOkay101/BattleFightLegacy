const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');
const { rosterHash } = require('../server/training/NeuralObservation');

test('auto-update defaults off and activation changes only new-match policy snapshots', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-policy-'));
	try {
		const registry = new PolicyRegistry(dir);
		const current = registry.policyForNewMatch();
		assert.equal(registry.status().autoUpdate, false);
		registry.savePolicy({ version: 'candidate-1', params: { rangeScale: 1.15, dodgeScale: 1.1, switchScale: 0.9 } });
		registry.promote('candidate-1');
		assert.equal(registry.policyForNewMatch().version, 'baseline');
		registry.setAutoUpdate(true);
		assert.equal(registry.policyForNewMatch().version, 'candidate-1');
		assert.equal(current.version, 'baseline');
		registry.rollback();
		assert.equal(registry.policyForNewMatch().version, 'baseline');
		assert.equal(new PolicyRegistry(dir).status().autoUpdate, true);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('corrupt or invalid policy files fall back to baseline without crashing', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-policy-'));
	try {
		const registry = new PolicyRegistry(dir);
		registry.savePolicy({ version: 'valid', params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } });
		registry.activate('valid');
		fs.writeFileSync(path.join(dir, 'policies', 'valid.json'), '{bad');
		assert.equal(new PolicyRegistry(dir).policyForNewMatch().version, 'baseline');
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a checksum-validated neural policy survives restart and corrupt weights fall back safely', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-neural-policy-'));
	try {
		const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });
		const payload = JSON.stringify({ schemaVersion: 1, observationSchemaVersion: 1, rosterHash,
			actor: [layer(64, 103), layer(64, 64), layer(1, 64)],
			critic: [layer(64, 86), layer(1, 64)] });
		const weightsEnvelope = { payload, checksum: crypto.createHash('sha256').update(payload).digest('hex') };
		const registry = new PolicyRegistry(dir);
		registry.savePolicy({ kind: 'neural', version: 'n-000001', weightsEnvelope });
		registry.activate('n-000001');
		const restored = new PolicyRegistry(dir).policyForNewMatch();
		assert.equal(restored.kind, 'neural');
		assert.equal(restored.weights.actor.length, 3);
		fs.writeFileSync(path.join(dir, 'policies', 'n-000001.json'), '{bad');
		assert.equal(new PolicyRegistry(dir).policyForNewMatch().version, 'baseline');
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
