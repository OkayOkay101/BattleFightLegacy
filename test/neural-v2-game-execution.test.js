const test = require('node:test');
const assert = require('node:assert/strict');
global.IgeEntity = { extend(definition) { function Component() {} Component.prototype = definition; return Component; } };
const GameComponent = require('../src/gameClasses/components/GameComponent').prototype;

function fixture(action) {
	const calls = { start: 0, stop: 0, executions: [] };
	const player = { id: () => 'p1', _stats: { trainingTeamId: 'blue' },
		_battleBot: { thinkingAt: 0, dodgeAngle: 0, dodgeUntil: 2500 } };
	const item = { _stats: { fireRate: 1, lastUsed: 0 }, hasQuantityRemaining: () => true };
	const unit = { id: () => 'u1', _stats: { type: 'hero', currentItemIndex: 0,
		attributes: { health: { value: 100, max: 100 } }, controls: { movementMethod: 'velocity' } },
		_translate: { x: 100, y: 100 }, width: () => 40, height: () => 40,
		inventory: { getItemBySlotNumber: slot => slot === 1 ? item : null },
		ability: { startUsingItem: () => calls.start++, stopUsingItem: () => calls.stop++ },
		ai: { battleBotHasLineOfSight: () => true, battleBotPositionIsClear: () => true,
			predictBattleBotAim: (_origin, target) => target },
		startMoving() { this.isMoving = true; }, stopMoving() { this.isMoving = false; }, setLinearVelocity() {}, changeItem() {} };
	player.getSelectedUnit = () => unit;
	const target = { unit: { id: () => 'enemy', _translate: { x: 200, y: 100 } }, distance: 100 };
	const game = Object.assign(Object.create(GameComponent), { battleBotRoster: [{ id: 'hero', range: 350, slots: [0] }],
		_battleBotTargets: () => [target], _battleBotNeuralDecision: () => action, _battleBotCanAttack: () => true,
		_battleBotProjectileProfile: () => null, _battleBotIgnoresWalls: () => false,
		_battleBotProjectileSpeed: () => 200, _getBattleBotProjectiles: () => [] });
	global.ige = { now: 2000, physics: {}, map: { data: { width: 20, height: 20, tilewidth: 64, tileheight: 64 } },
		training: { isTrainingMode: true, clock: { now: () => 2000 }, policyForPlayer: () => ({ kind: 'neural' }),
			recordExecution: (_player, execution, reasons) => calls.executions.push({ execution, reasons }) } };
	Math.radians = value => value * Math.PI / 180;
	return { game, player, unit, calls };
}

test('v2 no-fire hold never falls back to shooting or forced heuristic dodge', () => {
	const { game, player, unit, calls } = fixture({ targetId: 'enemy', movement: 'hold', slot: null, aimMode: 'direct', fire: false });
	game._thinkBattleBot(player, unit);
	assert.equal(calls.start, 0);
	assert.equal(calls.stop, 1);
	assert.equal(unit.isMoving, false);
	assert.equal(calls.executions[0].execution.fire, false);
});

test('v2 selected firing slot cannot be substituted and invalid slot is recorded', () => {
	const { game, player, unit, calls } = fixture({ targetId: 'enemy', movement: 'approach', slot: 2, aimMode: 'direct', fire: true });
	game._thinkBattleBot(player, unit);
	assert.equal(calls.start, 0);
	assert.equal(calls.stop, 1);
	assert.ok(calls.executions[0].reasons.includes('weapon-unavailable'));
});

test('v1 null-slot fallback preserves old weapon and heuristic dodge behavior', () => {
	const { game, player, unit, calls } = fixture({ targetId: 'enemy', movement: 'hold', slot: null, aimMode: 'direct' });
	game._thinkBattleBot(player, unit);
	assert.equal(calls.start, 1);
	assert.equal(unit.isMoving, true);
});

test('v2 no-target interval still records its hold decision and execution', () => {
	const { game, player, unit, calls } = fixture({ targetId: null, movement: 'hold', slot: null, fire: false });
	game._battleBotTargets = () => [];
	ige.training.policyForPlayer = () => ({ kind: 'neural', weights: { schemaVersion: 2 } });
	let decisions = 0;
	game._battleBotNeuralDecision = () => { decisions++; return { targetId: null, movement: 'hold', slot: null, fire: false }; };
	game._thinkBattleBot(player, unit);
	assert.equal(decisions, 1);
	assert.equal(calls.executions.length, 1);
	assert.equal(calls.executions[0].execution.fire, false);
	assert.equal(unit.isMoving, false);
});

test('legacy controller obeys stationary escape when moving would collide', () => {
	const { game, player, unit, calls } = fixture({ targetId: 'enemy', movement: 'approach', slot: null, aimMode: 'direct' });
	game._updateBattleBotDodge = () => {
		Object.assign(player._battleBot, { dodgeUntil: 2500, dodgeDirection: 8, dodgeAngle: null, dodgeMoving: false });
		return { imminent: true };
	};
	game._thinkBattleBot(player, unit);
	assert.equal(unit.isMoving, false);
	assert.equal(calls.start, 1, 'a stationary escape can continue attacking');
});

test('legacy controller escapes lingering projectiles without any enemy target', () => {
	const { game, player, unit, calls } = fixture(null);
	game._battleBotTargets = () => [];
	game._updateBattleBotDodge = () => (player._battleBot.dodgePlan = { imminent: true,
		best: { clear: true, moving: true, direction: 6, angle: 6 * Math.PI / 4 } });
	game._thinkBattleBot(player, unit);
	assert.equal(unit.isMoving, true);
	assert.equal(unit.movementAngle, 6 * Math.PI / 4);
	assert.equal(calls.stop, 1);
});
