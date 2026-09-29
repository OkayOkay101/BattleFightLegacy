const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingMatch } = require('../server/training/TrainingMatch');
const { TrainingStats } = require('../server/training/TrainingStats');

global.IgeEntity = { extend(definition) { function Entity() {} Entity.prototype = definition; return Entity; } };
const GameComponent = require('../src/gameClasses/components/GameComponent').prototype;

test('bot death records team score and player stats exactly once from the same killer context', () => {
	const match = new TrainingMatch({ matchId: 'death-hook', startedAt: 0 });
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'victim', teamId: 'red' });
	stats.registerPlayer({ playerId: 'killer', teamId: 'blue' });
	const victim = { id: () => 'victim', _stats: { trainingTeamId: 'red' },
		_battleBot: { leftSide: false, respawnTimer: null } };
	const killer = { id: () => 'killer', _stats: { trainingTeamId: 'blue' } };
	const unit = { id: () => 'life-1', getOwner: () => victim, _translate: { x: 1, y: 2 },
		_stats: { controls: {} }, stopMoving() {}, ability: { stopUsingItem() {} } };
	global.ige = { training: { isTrainingMode: true, match, stats },
		$: id => id === 'killer-unit' ? { getOwner: () => killer } : null };
	GameComponent.handleBattleBotDeath.call({}, unit, { attackingUnitId: 'killer-unit' });
	GameComponent.handleBattleBotDeath.call({}, unit, { attackingUnitId: 'killer-unit' });
	assert.deepEqual(match.scores, { blue: 1, red: 0 });
	assert.equal(stats.finish().players.killer.kills, 1);
	assert.equal(stats.finish().players.victim.deaths, 1);
	clearTimeout(victim._battleBot.respawnTimer);
});

test('death of a summoned unit does not score or respawn its owner', () => {
	const match = new TrainingMatch({ matchId: 'summon', startedAt: 0 });
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'victim', teamId: 'red' });
	const owner = { id: () => 'victim', _stats: { trainingTeamId: 'red' },
		_battleBot: { leftSide: false }, getSelectedUnit: () => ({ id: () => 'actual-combat-unit' }) };
	const summon = { id: () => 'summon', getOwner: () => owner };
	global.ige = { training: { isTrainingMode: true, match, stats } };
	GameComponent.handleBattleBotDeath.call({}, summon, {});
	assert.deepEqual(match.scores, { blue: 0, red: 0 });
	assert.equal(stats.finish().players.victim.deaths, 0);
	assert.equal(owner._battleBot.respawnTimer, undefined);
});

test('exhibition bot waits through permadeath and respawns when the next round begins', () => {
	const scheduled = [];
	const player = { _stats: { trainingTeamId: 'blue' },
		_battleBot: { leftSide: true, respawnTimer: null }, disownUnit() {} };
	const unit = { id: () => 'old-life', getOwner: () => player, _translate: { x: 10, y: 20 },
		_stats: { controls: {} }, stopMoving() {}, ability: { stopUsingItem() {} } };
	let spawns = 0;
	let gameState = 'Ongoing';
	const game = { isGameStarted: true, _pickBattleBotSpawn: () => ({ x: 30, y: 40 }),
		_spawnBattleBotUnit() { spawns++; } };
	global.ige = { game, training: { isExhibitionMode: true, clock: {
		now() { return Date.now(); },
		schedule(callback) { scheduled.push(callback); return scheduled.length; }
	} }, variable: { getVariable: name => name === 'Current Game State' ? gameState : 3 }, $: () => null };
	GameComponent.handleBattleBotDeath.call(game, unit, {});
	scheduled.shift()();
	assert.equal(spawns, 0);
	gameState = 'Waiting';
	scheduled.shift()();
	gameState = 'Ongoing';
	scheduled.shift()();
	assert.equal(spawns, 1);
});
