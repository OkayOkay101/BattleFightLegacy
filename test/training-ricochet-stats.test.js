const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingStats } = require('../server/training/TrainingStats');
global.IgeEntity = { extend(definition) { function Entity() {} Entity.prototype = definition; return Entity; } };
const TriggerComponent = require('../src/gameClasses/components/script/TriggerComponent').prototype;
const AttributeComponent = require('../src/gameClasses/components/unit/AttributeComponent').prototype;

test('wall rebounds count only when a later hit really lowers opposing health', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'a', teamId: 'blue' });
	stats.registerPlayer({ playerId: 'b', teamId: 'red' });
	stats.recordWallBounce({ eventId: 'wall-1', projectileId: 'shot-1', sourceId: 'a', itemTypeId: 'bounce' });
	stats.recordWallBounce({ eventId: 'wall-1', projectileId: 'shot-1', sourceId: 'a', itemTypeId: 'bounce' });
	stats.recordWallBounce({ eventId: 'wall-2', projectileId: 'shot-1', sourceId: 'a', itemTypeId: 'bounce' });
	stats.recordHealthChange({ eventId: 'touch-wall', projectileId: 'shot-1', sourceId: 'a', targetId: 'b',
		itemTypeId: 'bounce', before: 100, after: 100, at: 1 });
	stats.recordHealthChange({ eventId: 'hit', projectileId: 'shot-1', sourceId: 'a', targetId: 'b',
		itemTypeId: 'bounce', before: 100, after: 92, at: 2 });
	const weapon = stats.finish().weapons['a:bounce'];
	assert.equal(weapon.wallBounces, 2);
	assert.equal(weapon.ricochetHits, 1);
	assert.equal(weapon.ricochetDamage, 8);
	assert.equal(weapon.damage, 8);
});

test('projectile wall trigger counts a living physical bounce but not a destroyed projectile', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'a', teamId: 'blue' });
	const owner = { id: () => 'a' };
	const unit = { getOwner: () => owner };
	const item = { _stats: { itemTypeId: 'bounce' } };
	const projectile = { id: () => 'shot', destroy() { this._alive = false; }, _stats: { type: 'bouncy', sourceUnitId: 'unit', sourceItemId: 'item',
		destroyOnContactWith: { walls: false } } };
	global.ige = { isServer: true, isClient: false, now: 1000, script: { scriptLog() {} },
		game: { getAsset: () => ({ bodies: { default: { fixtures: [{ restitution: 0.5 }] } } }) },
		training: { isTrainingMode: true, stats },
		$: id => ({ shot: projectile, unit, item })[id] };
	const trigger = { triggeredScripts: { projectileTouchesWall: [] } };
	TriggerComponent.fire.call(trigger, 'projectileTouchesWall', { projectileId: 'shot', collidingEntity: 'wall' });
	TriggerComponent.fire.call(trigger, 'projectileTouchesWall', { projectileId: 'shot', collidingEntity: 'wall' });
	assert.equal(stats.finish().weapons['a:bounce'].wallBounces, 1);
	projectile._stats.destroyOnContactWith.walls = true;
	TriggerComponent.fire.call(trigger, 'projectileTouchesWall', { projectileId: 'shot', collidingEntity: 'wall' });
	assert.equal(stats.finish().weapons['a:bounce'].wallBounces, 1);
});

test('scripted projectile hit after rebound uses the actual health delta', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'a', teamId: 'blue' });
	stats.registerPlayer({ playerId: 'b', teamId: 'red' });
	stats.recordWallBounce({ eventId: 'wall', projectileId: 'shot', sourceId: 'a', itemTypeId: 'bounce' });
	const attacker = { id: () => 'a' }, victim = { id: () => 'b' };
	const sourceUnit = { getOwner: () => attacker };
	const projectile = { _stats: { sourceUnitId: 'unit-a', sourceItemId: 'item-a' } };
	const entity = { _category: 'unit', id: () => 'unit-b', getOwner: () => victim,
		_stats: { attributes: { health: { value: 100, min: 0, max: 100 } } }, streamUpdateData() {} };
	global.ige = { isServer: true, game: { data: { settings: { scoreAttributeId: 'points' } } },
		$: id => ({ shot: projectile, 'unit-a': sourceUnit, 'item-a': { _stats: { itemTypeId: 'bounce' } } })[id],
		training: { isTrainingMode: true, currentProjectileId: 'shot', stats, isOpponent: (a, b) => a !== b },
		trigger: { fire() {} } };
	AttributeComponent.update.call({ _entity: entity, now: Date.now() }, 'health', 92, true);
	assert.equal(stats.finish().weapons['a:bounce'].ricochetDamage, 8);
});
