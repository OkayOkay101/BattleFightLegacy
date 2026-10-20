const test = require('node:test');
const assert = require('node:assert/strict');
global.IgeEntity = { extend(definition) { function Component() {} Component.prototype = definition; return Component; } };
const Game = require('../src/gameClasses/components/GameComponent').prototype;

function fixture() {
	const player = { _stats: { trainingTeamId: 'blue' }, _battleBot: {}, isHostileTo: owner => owner._stats.trainingTeamId === 'red' };
	const enemy = { _stats: { trainingTeamId: 'red' } };
	const unit = { _translate: { x: 200, y: 200 }, _stats: { attributes: { speed: { value: 10 }, health: { value: 100 } } },
		body: { getLinearVelocity: () => ({ x: 0, y: 0 }) }, width: () => 40, height: () => 40,
		ai: { battleBotPositionIsClear: () => true, battleBotHasLineOfSight: () => true } };
	const bullet = { id: () => 'bullet', _translate: { x: 100, y: 200 }, _category: 'projectile',
		_stats: { type: 'bolt', sourceUnitId: 'enemy', damage: { unitAttributes: { health: 100 } }, currentBody: { width: 10, height: 10 } },
		body: { getLinearVelocity: () => ({ x: 10, y: 0 }) }, width: () => 10, height: () => 10 };
	const game = Object.assign(Object.create(Game), { _getBattleBotProjectiles: () => [bullet], _getBattleBotUnits: () => [] });
	global.ige = { physics: { _scaleRatio: 30 }, game: { data: { projectileTypes: {} } },
		$: id => id === 'enemy' ? { getOwner: () => enemy } : null,
		training: { isTrainingMode: true, isOpponent: (_a, b) => b === enemy } };
	return { game, player, unit, bullet, map: { width: 20, height: 20, tilewidth: 64, tileheight: 64 } };
}
test('game observes actual projectile velocity immediately and plans from all known hostile hazards', () => {
	const { game, player, unit, bullet, map } = fixture();
	const plan = game._updateBattleBotDodge(player, unit, map, 64, 64, 1000);
	assert.ok(plan.imminent);
	assert.equal(plan.threats[0].velocity.x, 300);
	assert.equal(bullet._battleBotVelocity.x, 300);
	assert.equal(player._battleBot.dodgeMoveSpeed, 300);
	assert.ok(plan.best.clear && plan.best.risk < plan.currentRisk);
});
test('explicit Neural dodge uses validated planner direction instead of any supplied angle', () => {
	const { game, player, unit, map } = fixture();
	game._updateBattleBotDodge(player, unit, map, 64, 64, 1000);
	const reasons = [];
	const result = game._executeBattleBotDodge(player._battleBot,
		{ dodgeDirection: 6, movementAngle: 999 }, reasons);
	assert.equal(result.angle, 6 * Math.PI / 4);
	assert.equal(result.moving, true);
	const stopped = game._executeBattleBotDodge(player._battleBot, { dodgeDirection: 8 }, []);
	assert.equal(stopped.moving, false);
	const bad = [];
	game._executeBattleBotDodge(player._battleBot, { dodgeDirection: 100 }, bad);
	assert.ok(bad.includes('dodge-route-unavailable'));
});

test('occluded known wall-passing bullets use last observed motion and never new hidden velocity', () => {
	const { game, player, unit, bullet, map } = fixture();
	bullet._stats.currentBody.collidesWith = { walls: false, units: true };
	bullet._deathTime = 4000;
	game._updateBattleBotDodge(player, unit, map, 64, 64, 1000);
	unit.ai.battleBotHasLineOfSight = () => false;
	bullet._translate = { x: 999, y: 999 };
	bullet.body.getLinearVelocity = () => ({ x: 999, y: 999 });
	const plan = game._updateBattleBotDodge(player, unit, map, 64, 64, 1100);
	assert.equal(plan.threats[0].position.x, 130);
	assert.equal(plan.threats[0].position.y, 200);
	assert.equal(plan.threats[0].velocity.x, 300);
	player._battleBot.projectiles.clear();
	const unseen = game._updateBattleBotDodge(player, unit, map, 64, 64, 1200);
	assert.equal(unseen.threats.length, 0);
});

test('last observed explosions age with the projectile and keep active blast at its detonation point', () => {
	const { game } = fixture();
	const known = { x: 100, y: 200, at: 1000, hazard: { position: { x: 100, y: 200 }, velocity: { x: 300, y: 0 },
		damage: 10, lifeSeconds: .7, explosionAt: .6, explosionRadius: 80, explosionDamage: 100, explosionLifeSeconds: .5,
		explosions: [{ at: .6, radius: 80, damage: 100, lifeSeconds: .5 }] } };
	const future = game._forecastBattleBotHazard(known, 1200, true);
	assert.ok(Math.abs(future.explosionAt - .4) < 1e-10);
	assert.ok(Math.abs(future.explosions[0].at - .4) < 1e-10);
	assert.equal(game._forecastBattleBotHazard(known, 1600, false).explosions[0].lifeSeconds, .5);
	assert.ok(Math.abs(game._forecastBattleBotHazard(known, 1650, true).lifeSeconds - .05) < 1e-10);
	const active = game._forecastBattleBotHazard(known, 1800, false);
	assert.equal(active.damage, 0);
	assert.equal(active.explosions[0].at, 0);
	assert.deepEqual(active.explosions[0].position, { x: 280, y: 200 });
	assert.ok(Math.abs(active.explosions[0].lifeSeconds - .3) < 1e-10);
	assert.equal(game._forecastBattleBotHazard(known, 2200, false), null);
	assert.equal(game._forecastBattleBotHazard(known, 1200, false), null);
});
