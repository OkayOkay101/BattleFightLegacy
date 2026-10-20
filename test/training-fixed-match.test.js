const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('manual fixed steps can complete a short 3v3 match on simulated time', () => {
	// With contact dispatch fixed, seed 1 has no hostile HP loss in its
	// first 5 seconds. Ten seconds reaches combat without relying on the
	// former duplicate/misaddressed script contacts; all assertions remain.
	const result = spawnSync(process.execPath, [path.resolve(__dirname, '../server/training/MatchWorker.js'),
		'--fixed-step-run-once', '--duration-ms', '10000'], {
		cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('TRAINING_FIXED_MATCH '));
	assert.ok(line, result.stdout);
	const report = JSON.parse(line.slice('TRAINING_FIXED_MATCH '.length));
	assert.equal(report.result.status, 'complete');
	assert.equal(report.result.durationMs, 10000);
	assert.equal(report.steps, 600);
	assert.equal(Object.keys(report.stats.players).length, 6);
	assert.equal(report.trace.winner, report.result.winner);
	assert.ok(report.trace.positions.length > 0 && report.trace.positions.length <= report.steps);
	assert.ok(report.trace.positions.every(position => Number.isFinite(position.x) && Number.isFinite(position.y) && position.tick > 0 && position.tick <= report.steps));
	assert.equal(new Set(report.trace.positions.map(position => `${position.tick}:${position.participant}`)).size, report.trace.positions.length);
	if (report.trace.positions.length < report.steps) assert.ok(report.trace.deaths.length > 0, 'a dead sampled participant has no position until respawn');
	assert.equal(report.trace.positions[0].participant, 'blue-1');
	assert.ok(report.trace.itemUses.length > 0);
	assert.ok(report.trace.healthChanges.length > 0);
	assert.ok(report.trace.contacts.some(contact => contact.kind === 'beginContact'));
	assert.ok(Number.isFinite(report.wallMs) && report.wallMs >= 0);
});

test('the same fixed-step seed reproduces the same roster and combat outcome', () => {
	function run() {
		const processResult = spawnSync(process.execPath, [path.resolve(__dirname, '../server/training/MatchWorker.js'),
			'--fixed-step-run-once', '--duration-ms', '3000'], {
			cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000
		});
		assert.equal(processResult.status, 0, processResult.stderr || processResult.stdout);
		const line = processResult.stdout.split(/\r?\n/).find(value => value.startsWith('TRAINING_FIXED_MATCH '));
		assert.ok(line, processResult.stdout);
		const report = JSON.parse(line.slice('TRAINING_FIXED_MATCH '.length));
		return {
			winner: report.result.winner,
			scores: report.result.scores,
			trace: report.trace,
			players: Object.values(report.stats.players).map(player => ({
				teamId: player.teamId, characterId: player.characterId,
				kills: player.kills, deaths: player.deaths,
				damageDealt: player.damageDealt, damageTaken: player.damageTaken
			})).sort((a, b) => `${a.teamId}:${a.characterId}`.localeCompare(`${b.teamId}:${b.characterId}`))
		};
	}
	const first = run(), second = run();
	assert.deepEqual(first, second);
});
