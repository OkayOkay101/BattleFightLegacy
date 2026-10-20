'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { copyRuntime, copyPolicies } = require('../tools/prepare-desktop-package');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');

test('package seeds approved pointers rather than latest candidate', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-approved-package-'));
	try {
		const root = path.join(directory, 'source'), stage = path.join(directory, 'stage');
		const registry = new PolicyRegistry(path.join(root, 'training-data'));
		for (const version of ['n-000001', 'n-000002']) registry.savePolicy({ version, params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } });
		registry.promote('n-000001');
		copyPolicies(root, stage, {});
		const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'training-data', 'approved-seed-manifest.json')));
		assert.equal(manifest.championVersion, 'n-000001');
		assert.equal(manifest.activeVersion, 'n-000001');
		assert.equal(manifest.previousVersion, 'baseline');
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('package includes server configuration and model selection without the trainer', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-package-test-'));
	try {
		const root = path.join(directory, 'source');
		const stage = path.join(directory, 'stage');
		for (const name of ['server/training', 'engine', 'src', 'config']) {
			fs.mkdirSync(path.join(root, name), { recursive: true });
		}
		fs.writeFileSync(path.join(root, 'config/index.js'), 'module.exports = {};');
		fs.writeFileSync(path.join(root, 'server/training/DesktopSelection.js'), 'module.exports = {};');
		fs.writeFileSync(path.join(root, 'server/training/TrainingCli.js'), 'not shipped');
		copyRuntime(root, stage);
		assert.equal(fs.existsSync(path.join(stage, 'config/index.js')), true, 'server configuration must be shipped');
		assert.equal(fs.existsSync(path.join(stage, 'server/training/DesktopSelection.js')), true, 'model selection must be shipped');
		assert.equal(fs.existsSync(path.join(stage, 'server/training/TrainingCli.js')), false, 'trainer must be excluded');
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

for (const count of [1, 28]) {
	test('package accepts ' + count + ' available neural policies', () => {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-policies-test-'));
		try {
			const root = path.join(directory, 'source');
			const stage = path.join(directory, 'stage');
			const policies = path.join(root, 'training-data', 'policies');
			fs.mkdirSync(policies, { recursive: true });
			for (let index = 0; index < count; index++) {
				fs.writeFileSync(path.join(policies, 'n-' + String(index).padStart(6, '0') + '.json'), '{}');
			}
			fs.writeFileSync(path.join(policies, 'n-000099.json.tmp'), 'incomplete write');
			fs.writeFileSync(path.join(policies, 'manifest.json'), '{}');
			const stats = {};
			copyPolicies(root, stage, stats);
			assert.equal(stats.policyFileCount, count);
			assert.equal(stats.policyBytes, count * 2);
			assert.equal(fs.readdirSync(path.join(stage, 'training-data', 'policies')).length, count);
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
}

test('package rejects a directory with no completed neural policy', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-policies-test-'));
	try {
		const root = path.join(directory, 'source');
		fs.mkdirSync(path.join(root, 'training-data', 'policies'), { recursive: true });
		assert.throws(() => copyPolicies(root, path.join(directory, 'stage'), {}), /No seed policies found/);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
