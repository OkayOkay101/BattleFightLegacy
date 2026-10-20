const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');
const { resolveDemoPolicy, demoIsOpponent, installDemo } = require('../server/training/DemoRuntime');
const { ROSTER_IDS } = require('../server/training/NeuralObservation');

test('new exhibition spectator keeps spectator state when player is created', () => {
	global.IgeEntity = { extend(definition) { function Component() {} Component.prototype = definition; return Component; } };
	global.IgeEntityPhysics = global.IgeEntity;
	const createPlayer = require('../src/gameClasses/components/GameComponent').prototype.createPlayer;
	const originalPlayer = global.Player;
	const originalIge = global.ige;
	let created;
	global.Player = function (data) { created = data; return { _stats: data }; };
	global.ige = { isServer: false };
	try {
		createPlayer.call({}, { controlledBy: 'human', name: 'viewer', isSpectator: true, trainingTeamId: null });
		assert.equal(created.isSpectator, true);
	} finally {
		global.Player = originalPlayer;
		global.ige = originalIge;
	}
});

test('demo aliases choose approved champion and never the newest unapproved candidate', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-demo-'));
	try {
		const registry = new PolicyRegistry(directory);
		registry.savePolicy({ version: 'n-000002', params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } });
		registry.savePolicy({ version: 'n-000010', params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } });
		registry.promote('n-000002');
		fs.writeFileSync(path.join(directory, 'policies', 'n-000011.json'), 'corrupt');
		const policy = resolveDemoPolicy(registry, 'latest');
		assert.equal(policy.version, 'n-000002');
		assert.equal(resolveDemoPolicy(registry, 'champion').version, 'n-000002');
		assert.equal(resolveDemoPolicy(registry, 'n-000010').version, 'n-000010');
		assert.equal(registry.status().activeVersion, 'baseline');
		assert.equal(registry.status().championVersion, 'n-000002');
		assert.throws(() => resolveDemoPolicy(registry, '../secret'), /Unknown demo policy/);
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('champion follows only at round boundary while fixed team remains pinned', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-round-'));
	const realNow = Date.now;
	let now = 1000;
	Date.now = () => now;
	try {
		const registry = new PolicyRegistry(directory);
		for (const version of ['n-000001', 'n-000002']) registry.savePolicy({ version, params: { rangeScale: 1, dodgeScale: 1, switchScale: 1 } });
		registry.promote('n-000001');
		const ige = { $$: () => [], $: () => null };
		const demo = installDemo(ige, registry.policy('n-000001'), { registry, selections: { blue: 'champion', red: 'n-000001' } });
		new PolicyRegistry(directory).promote('n-000002');
		now += 299999;
		assert.deepEqual(demo.status().models, { blue: 'n-000001', red: 'n-000001' });
		now++;
		assert.equal(demo.policyForPlayer({ _stats: { trainingTeamId: 'blue' } }).version, 'n-000002');
		const status = demo.status();
		assert.deepEqual(status.models, { blue: 'n-000002', red: 'n-000001' });
		assert.deepEqual(status.requestedModels, { blue: 'champion', red: 'n-000001' });
		assert.deepEqual(status.resolvedModels, status.models);
		assert.equal(status.round.number, 2);
		assert.equal(demo.match.startedAt, 301000);
		demo.recordExecution({ id: () => 'blue-player' }, { fire: false }, ['wall']);
		assert.deepEqual(demo.status().executionTelemetry, { decisions: 1, overriddenDecisions: 1, overrideReasons: { wall: 1 } });
		assert.equal(demo.trajectory, undefined);
	} finally { Date.now = realNow; fs.rmSync(directory, { recursive: true, force: true }); }
});

test('demo opposition includes fight players but excludes spectators and allies', () => {
	const blue = { _stats: { isBattleBot: true, trainingTeamId: 'blue', playerJoined: true } };
	const red = { _stats: { isBattleBot: true, trainingTeamId: 'red', playerJoined: true } };
	const fighter = { _stats: { controlledBy: 'human', trainingTeamId: 'blue', playerJoined: true } };
	const spectator = { _stats: { controlledBy: 'human', isSpectator: true, playerJoined: true } };
	assert.equal(demoIsOpponent(blue, red), true);
	assert.equal(demoIsOpponent(red, fighter), true);
	assert.equal(demoIsOpponent(blue, fighter), false);
	assert.equal(demoIsOpponent(red, spectator), false);
});

test('demo spawns six combatants and collects exhibition stats without training samples', () => {
	const created = [], spawned = [];
	const game = {
		battleBotRoster: [],
		createPlayer(data) {
			created.push(data);
			const botId = `bot-${created.length}`;
			return { _stats: { ...data }, id: () => botId,
				getSelectedUnit() { return this.selectedUnit; }, updatePlayerType() {} };
		},
		_pickBattleBotSpawn(leftSide) { return { x: leftSide ? 100 : 900, y: 200 }; },
		_spawnBattleBotUnit(player) {
			spawned.push(player);
			player._battleBot.previousCharacter = ROSTER_IDS[0];
			player.selectedUnit = { id: () => `unit-${spawned.length}` };
		}
	};
	const ige = { game: { data: require('../src/game.json').data,
		getAsset: () => ({ attributes: {}, variables: {} }) } };
	const demo = installDemo(ige, { version: 'baseline', kind: 'heuristic', params: {} });
	demo.spawnBots(game);
	assert.equal(created.length, 6);
	assert.deepEqual(created.map(player => player.trainingTeamId), ['blue', 'blue', 'blue', 'red', 'red', 'red']);
	assert.equal(spawned.length, 6);
	assert.equal(game.battleBotRoster.length, ROSTER_IDS.length);
	assert.equal(demo.trajectory, undefined);
	assert.equal(Object.keys(demo.stats.finish().players).length, 6);
	assert.equal(Object.keys(demo.stats.finish().characters).length, 6);
});
