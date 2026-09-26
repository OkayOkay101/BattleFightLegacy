const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('headless training worker boots six combat bots without starting a game listener', () => {
	const result = spawnSync(process.execPath, [path.resolve(__dirname, '../server/training/MatchWorker.js'), '--smoke'], {
		cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 30000
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('TRAINING_SMOKE '));
	assert.ok(line, result.stdout);
	const report = JSON.parse(line.slice('TRAINING_SMOKE '.length));
	assert.equal(report.players, 6);
	assert.deepEqual(report.teams, { blue: 3, red: 3 });
	assert.equal(report.portBound, false);
});

test('manual training frames use simulation time rather than elapsed wall time', () => {
	const result = spawnSync(process.execPath, [path.resolve(__dirname, '../server/training/MatchWorker.js'), '--fixed-step-smoke'], {
		cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('TRAINING_FIXED_STEP '));
	assert.ok(line, result.stdout);
	const report = JSON.parse(line.slice('TRAINING_FIXED_STEP '.length));
	assert.equal(report.steps, 60);
	assert.equal(report.simulatedMs, 1000);
	assert.ok(Number.isFinite(report.wallMs) && report.wallMs >= 0);
	assert.equal(report.physicsSteps, 60);
	assert.equal(report.seconds, 1);
	assert.equal(report.scriptTimerMs, 250);
	assert.ok(report.regenerationMs >= 500, `regeneration advanced only ${report.regenerationMs}ms`);
	assert.equal(report.buffExpired, true);
	assert.equal(report.scriptTimestampMs, 1000);
});

test('dead training bot respawns after three simulated seconds, not wall time', () => {
	const result = spawnSync(process.execPath, [path.resolve(__dirname, '../server/training/MatchWorker.js'), '--fixed-step-respawn-smoke'], {
		cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('TRAINING_RESPAWN '));
	assert.ok(line, result.stdout);
	const report = JSON.parse(line.slice('TRAINING_RESPAWN '.length));
	assert.equal(report.respawnAtMs, 3000);
	assert.ok(report.wallMs < 3000, `respawn took ${report.wallMs}ms`);
});
