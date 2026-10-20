'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initializeUserPolicyData } = require('../desktop/policy-data');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');

function fixture () {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-desktop-policy-'));
	return {
		directory,
		root: path.join(directory, 'runtime'),
		userData: path.join(directory, 'user-data'),
		cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
	};
}

test('approved manifest seeds champion registry while preserving fixed user selection and registry', () => {
	const f = fixture();
	try {
		const registry = new PolicyRegistry(path.join(f.root, 'training-data'));
		registry.savePolicy({ version: 'n-000002', params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } });
		const manifest = { autoUpdate: true, championVersion: 'n-000002', previousVersion: 'baseline', activeVersion: 'n-000002' };
		fs.writeFileSync(path.join(f.root, 'training-data', 'approved-seed-manifest.json'), JSON.stringify(manifest));
		const result = initializeUserPolicyData(f.root, f.userData);
		assert.equal(new PolicyRegistry(result.trainingDirectory).status().championVersion, 'n-000002');
		fs.writeFileSync(result.selectionFile, JSON.stringify({ blue: 'n-000002', red: 'baseline' }));
		new PolicyRegistry(result.trainingDirectory).activate('baseline');
		initializeUserPolicyData(f.root, f.userData);
		assert.equal(new PolicyRegistry(result.trainingDirectory).status().activeVersion, 'baseline');
		assert.deepEqual(JSON.parse(fs.readFileSync(result.selectionFile)), { blue: 'n-000002', red: 'baseline' });
	} finally { f.cleanup(); }
});

test('copies numbered policy seeds and returns persistent user paths', () => {
	const f = fixture();
	try {
		const seeds = path.join(f.root, 'training-data', 'policies');
		fs.mkdirSync(seeds, { recursive: true });
		fs.writeFileSync(path.join(seeds, 'n-24.json'), '{"version":"n-24"}');
		fs.writeFileSync(path.join(seeds, 'notes.json'), '{}');

		const result = initializeUserPolicyData(f.root, f.userData);

		assert.deepEqual(result, {
			trainingDirectory: path.join(f.userData, 'training-data'),
			selectionFile: path.join(f.userData, 'desktop-selection.json')
		});
		assert.equal(fs.readFileSync(path.join(result.trainingDirectory, 'policies', 'n-24.json'), 'utf8'), '{"version":"n-24"}');
		assert.equal(fs.existsSync(path.join(result.trainingDirectory, 'policies', 'notes.json')), false);
	} finally { f.cleanup(); }
});

test('keeps an existing user policy when seeding again', () => {
	const f = fixture();
	try {
		const seeds = path.join(f.root, 'training-data', 'policies');
		const userPolicies = path.join(f.userData, 'training-data', 'policies');
		fs.mkdirSync(seeds, { recursive: true });
		fs.mkdirSync(userPolicies, { recursive: true });
		fs.writeFileSync(path.join(seeds, 'n-24.json'), 'seed');
		fs.writeFileSync(path.join(userPolicies, 'n-24.json'), 'user-edited');

		initializeUserPolicyData(f.root, f.userData);

		assert.equal(fs.readFileSync(path.join(userPolicies, 'n-24.json'), 'utf8'), 'user-edited');
	} finally { f.cleanup(); }
});

test('fails clearly when seed directory is missing or has no numbered policies', () => {
	const f = fixture();
	try {
		assert.throws(() => initializeUserPolicyData(f.root, f.userData), /Desktop policy seeds are missing/);
		const seeds = path.join(f.root, 'training-data', 'policies');
		fs.mkdirSync(seeds, { recursive: true });
		fs.writeFileSync(path.join(seeds, 'readme.json'), '{}');
		assert.throws(() => initializeUserPolicyData(f.root, f.userData), /No desktop policy seeds were found/);
	} finally { f.cleanup(); }
});
