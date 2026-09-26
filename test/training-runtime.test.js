const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingStats } = require('../server/training/TrainingStats');
const { ROSTER_IDS } = require('../server/training/NeuralObservation');

test('training runtime creates three joined combat bots per team using the normal unit spawn path', () => {
	const { install } = require('../server/training/TrainingRuntime');
	const created = [];
	const spawned = [];
	const game = {
		createPlayer(data) {
			created.push(data);
			return { _stats: { ...data }, updatePlayerType() {} };
		},
		_pickBattleBotSpawn(leftSide) { return { x: leftSide ? 100 : 900, y: 200 }; },
		_spawnBattleBotUnit(player, position) { spawned.push({ player, position }); }
	};
	const ige = { game: { getAsset: () => ({ attributes: {}, variables: {} }) }, map: { data: {} }, variable: {} };
	const runtime = install(ige, { seed: 7 });
	runtime.spawnBots(game);
	assert.equal(created.length, 6);
	assert.deepEqual(created.map(bot => bot.trainingTeamId), ['blue', 'blue', 'blue', 'red', 'red', 'red']);
	assert.ok(created.every(bot => bot.isBattleBot && bot.playerJoined && bot.controlledBy === 'computer'));
	assert.equal(spawned.length, 6);
	assert.ok(spawned.every(({ player }) => player._battleBot && player._battleBot.trainingTeamId));
});

test('training runtime registers the six participants for per-character statistics', () => {
	const { install } = require('../server/training/TrainingRuntime');
	const stats = new TrainingStats();
	let nextId = 0;
	const game = {
		createPlayer(data) { return { id: () => `p${++nextId}`, _stats: { ...data }, updatePlayerType() {} }; },
		_pickBattleBotSpawn(leftSide) { return { x: leftSide ? 100 : 900, y: 200 }; },
		_spawnBattleBotUnit(player) { player._battleBot.previousCharacter = 'archmage'; }
	};
	const ige = { game: { getAsset: () => ({ attributes: {}, variables: {} }) } };
	install(ige, { stats }).spawnBots(game);
	const players = stats.finish().players;
	assert.equal(Object.keys(players).length, 6);
	assert.deepEqual(Object.values(players).map(player => player.teamId), ['blue', 'blue', 'blue', 'red', 'red', 'red']);
	assert.ok(Object.values(players).every(player => player.characterId === 'archmage'));
});

test('training runtime gives its bots the expanded playable roster', () => {
	const { install } = require('../server/training/TrainingRuntime');
	const gameData = require('../src/game.json').data;
	const game = {
		battleBotRoster: [{ id: 'r3dZTAf1qa' }],
		createPlayer(data) { return { id: () => data.name, _stats: { ...data }, updatePlayerType() {} }; },
		_pickBattleBotSpawn(leftSide) { return { x: leftSide ? 100 : 900, y: 200 }; },
		_spawnBattleBotUnit() {}
	};
	const ige = { game: { data: gameData, getAsset: () => ({ attributes: {}, variables: {} }) } };
	install(ige).spawnBots(game);
	assert.equal(game.battleBotRoster.length, 40);
	assert.ok(game.battleBotRoster.every(entry => !['McZTj7oVZ1', 'BUcKqXTF16', 'H6K6gpqlPE', '2GjTUKR9Bz'].includes(entry.id)));
});

test('neural match collects only candidate transitions when both teams use different neural versions', () => {
	const { install } = require('../server/training/TrainingRuntime');
	const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });
	const weights = { actor: [layer(64, 95), layer(64, 64), layer(1, 64)],
		critic: [layer(64, 82), layer(1, 64)] };
	const ige = {};
	const runtime = install(ige, { candidateVersion: 'n2',
		bluePolicy: { kind: 'neural', version: 'n2', weights },
		redPolicy: { kind: 'neural', version: 'n1', weights } });
	const snapshot = { self: { health: 1, characterId: ROSTER_IDS[0] }, allies: [], enemies: [],
		projectiles: [], weaponReady: [0, 0, 0, 0], targets: [], weapons: [] };
	runtime.decideNeural({ id: () => 'blue-1', _stats: { trainingTeamId: 'blue' } }, snapshot, 100);
	runtime.decideNeural({ id: () => 'red-1', _stats: { trainingTeamId: 'red' } }, snapshot, 100);
	assert.equal(runtime.neuralError, null);
	assert.deepEqual(runtime.trajectory.rows.map(row => row.policyVersion), ['n2']);
});
