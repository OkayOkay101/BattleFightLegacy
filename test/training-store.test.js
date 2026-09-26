const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TrainingStore } = require('../server/training/TrainingStore');
const { exportTierStats } = require('../server/training/TrainingExport');

test('persistent match store ignores a duplicate match id after reopening', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-training-'));
	try {
		const report = { result: { matchId: 'm1', winner: 'blue', scores: { blue: 1, red: 0 }, status: 'complete' }, stats: { players: {} } };
		const store = new TrainingStore(dir);
		assert.equal(await store.appendMatch(report), true);
		assert.equal(await store.appendMatch(report), false);
		const reopened = new TrainingStore(dir);
		assert.equal(await reopened.appendMatch(report), false);
		assert.equal((await reopened.readMatches()).length, 1);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a crash-truncated final JSONL row is repaired before the next append', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-training-'));
	try {
		const store = new TrainingStore(dir);
		await store.appendMatch({ result: { matchId: 'm1', status: 'complete' }, stats: {} });
		fs.appendFileSync(path.join(dir, 'matches.jsonl'), '{partial');
		const reopened = new TrainingStore(dir);
		await reopened.appendMatch({ result: { matchId: 'm2', status: 'complete' }, stats: {} });
		assert.deepEqual((await new TrainingStore(dir).readMatches()).map(row => row.result.matchId), ['m1', 'm2']);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('match scan processes complete rows and ignores an interrupted final row', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-training-scan-'));
	try {
		fs.writeFileSync(path.join(dir, 'matches.jsonl'),
			'{"result":{"matchId":"m1"}}\n{"result":{"matchId":"m2"}}\n{"result":');
		const ids = [];
		await new TrainingStore(dir).scanMatches(report => ids.push(report.result.matchId));
		assert.deepEqual(ids, ['m1', 'm2']);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checkpoint replacement is validated and the previous valid checkpoint survives a corrupt current file', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-training-'));
	try {
		const store = new TrainingStore(dir);
		await store.saveCheckpoint({ version: 'v1', weights: [1] });
		await store.saveCheckpoint({ version: 'v2', weights: [2] });
		fs.writeFileSync(path.join(dir, 'checkpoint.json'), '{broken');
		assert.deepEqual(await store.loadCheckpoint(), { version: 'v1', weights: [1] });
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('tier export separates policy, character and team side', () => {
	const matches = [{
		result: { matchId: 'm1', winner: 'blue', status: 'complete' }, policyVersion: 'v1', split: 'train',
		stats: { players: {
			p1: { teamId: 'blue', characterId: 'mage', damageDealt: 10, damageTaken: 5, kills: 1, deaths: 0, assists: 0 },
			p2: { teamId: 'red', characterId: 'mage', damageDealt: 3, damageTaken: 10, kills: 0, deaths: 1, assists: 0 }
		} }
	}];
	const rows = exportTierStats(matches);
	assert.equal(rows.length, 2);
	assert.deepEqual(rows.map(row => [row.side, row.games, row.wins, row.losses]), [['blue', 1, 1, 0], ['red', 1, 0, 1]]);
	assert.ok(Object.keys(rows[0]).includes('damageDealt'));
});

test('unverified accelerated match is neither stored as complete nor exported', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-unverified-'));
	const report = { speedMode: 'max', parityStatus: 'failed',
		result: { matchId: 'bad-max', status: 'complete', winner: 'blue' },
		stats: { players: { bot: { teamId: 'blue', characterId: 'mage' } } } };
	try {
		const store = new TrainingStore(dir);
		await assert.rejects(store.appendMatch(report), /parity/i);
		assert.deepEqual(await store.readMatches(), []);
		assert.deepEqual(exportTierStats([report]), []);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('tier export separates neural and heuristic policy kinds even with the same character', () => {
	const base = { result: { status: 'complete', winner: 'blue' }, split: 'train',
		stats: { players: { p1: { teamId: 'blue', characterId: 'mage', damageDealt: 10 } } } };
	const rows = exportTierStats([
		{ ...base, result: { ...base.result, matchId: 'm1' }, policyVersions: { blue: 'n-000001' },
			policyKinds: { blue: 'neural' } },
		{ ...base, result: { ...base.result, matchId: 'm2' }, policyVersions: { blue: 'n-000001' },
			policyKinds: { blue: 'heuristic' } }
	]);
	assert.equal(rows.length, 2);
	assert.deepEqual(rows.map(row => row.policyKind).sort(), ['heuristic', 'neural']);
});
