const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('a short headless 3v3 match completes and emits a result with per-player statistics', () => {
	const result = spawnSync(process.execPath, [path.resolve(__dirname, '../server/training/MatchWorker.js'), '--run-once', '--duration-ms', '500'], {
		cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('TRAINING_RESULT '));
	assert.ok(line, result.stdout);
	const report = JSON.parse(line.slice('TRAINING_RESULT '.length));
	assert.equal(report.result.status, 'complete');
	assert.equal(Object.keys(report.stats.players).length, 6);
	assert.ok(report.result.durationMs >= 500);
	assert.equal(report.speedMode, 'realtime');
	assert.equal(report.simulatedMs, report.result.durationMs);
	assert.ok(report.wallMs >= 500);
});
