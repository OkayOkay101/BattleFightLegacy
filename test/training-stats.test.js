const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingStats } = require('../server/training/TrainingStats');

global.IgeEntity = { extend(definition) { function Entity() {} Entity.prototype = definition; return Entity; } };
global.IgeEntityPhysics = global.IgeEntity;
const AttributeComponent = require('../src/gameClasses/components/unit/AttributeComponent').prototype;
const Item = require('../src/gameClasses/Item').prototype;

test('weapon use is one event and damage requires a real health reduction', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'a', teamId: 'blue', characterId: 'archmage' });
	stats.registerPlayer({ playerId: 'b', teamId: 'red', characterId: 'slayer' });
	stats.registerPlayer({ playerId: 'c', teamId: 'red', characterId: 'berserker' });
	stats.recordItemUse({ eventId: 'shot', actorId: 'a', itemTypeId: 'wand' });
	stats.recordItemUse({ eventId: 'shot', actorId: 'a', itemTypeId: 'wand' });
	stats.recordHealthChange({ eventId: 'wall', sourceId: 'a', targetId: 'b', itemTypeId: 'wand', before: 100, after: 100, at: 1 });
	stats.recordHealthChange({ eventId: 'hit1', sourceId: 'a', targetId: 'b', itemTypeId: 'wand', before: 100, after: 92, at: 2 });
	stats.recordHealthChange({ eventId: 'hit2', sourceId: 'a', targetId: 'c', itemTypeId: 'wand', before: 100, after: 95, at: 3 });
	stats.recordHealthChange({ eventId: 'hit2', sourceId: 'a', targetId: 'c', itemTypeId: 'wand', before: 100, after: 95, at: 3 });
	const result = stats.finish();
	assert.deepEqual(result.players.a, { playerId: 'a', teamId: 'blue', characterId: 'archmage', kills: 0, deaths: 0, assists: 0, damageDealt: 13, damageTaken: 0 });
	assert.deepEqual(result.weapons['a:wand'], { actorId: 'a', itemTypeId: 'wand', uses: 1, hits: 2, damage: 13,
		wallBounces: 0, ricochetHits: 0, ricochetDamage: 0 });
});

test('assist requires actual damage within ten seconds before one death', () => {
	const stats = new TrainingStats();
	for (const [playerId, teamId] of [['a', 'blue'], ['b', 'blue'], ['c', 'red']]) stats.registerPlayer({ playerId, teamId });
	stats.recordHealthChange({ eventId: 'h1', sourceId: 'a', targetId: 'c', before: 100, after: 90, at: 1000 });
	stats.recordHealthChange({ eventId: 'h2', sourceId: 'b', targetId: 'c', before: 90, after: 0, at: 9000 });
	stats.recordDeath({ lifeId: 'c-unit-1', victimId: 'c', killerId: 'b', at: 9000 });
	stats.recordDeath({ lifeId: 'c-unit-1', victimId: 'c', killerId: 'b', at: 9001 });
	const result = stats.finish();
	assert.equal(result.players.a.assists, 1);
	assert.equal(result.players.b.kills, 1);
	assert.equal(result.players.c.deaths, 1);
});

test('a player changing character on respawn attributes combat stats to each life', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'a', teamId: 'blue' });
	stats.registerPlayer({ playerId: 'b', teamId: 'red' });
	stats.startLife({ playerId: 'a', lifeId: 'a-1', characterId: 'mage' });
	stats.startLife({ playerId: 'b', lifeId: 'b-1', characterId: 'slayer' });
	stats.recordHealthChange({ eventId: 'hit-1', sourceId: 'a', targetId: 'b', before: 100, after: 90, at: 1 });
	stats.recordDeath({ lifeId: 'a-1', victimId: 'a', killerId: 'b', at: 2 });
	stats.startLife({ playerId: 'a', lifeId: 'a-2', characterId: 'casker' });
	stats.recordHealthChange({ eventId: 'hit-2', sourceId: 'a', targetId: 'b', before: 90, after: 80, at: 3 });
	stats.recordDeath({ lifeId: 'b-1', victimId: 'b', killerId: 'a', at: 4 });
	const result = stats.finish();
	assert.equal(result.characters['a:mage'].damageDealt, 10);
	assert.equal(result.characters['a:mage'].deaths, 1);
	assert.equal(result.characters['a:casker'].damageDealt, 10);
	assert.equal(result.characters['a:casker'].kills, 1);
	assert.equal(result.characters['a:casker'].lives, 1);
});

test('attribute update records clamped health loss from a scripted change', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'a', teamId: 'blue' });
	stats.registerPlayer({ playerId: 'b', teamId: 'red' });
	const entity = {
		_category: 'unit', _stats: { attributes: { health: { value: 100, min: 0, max: 100 } } },
		id: () => 'unit-b', getOwner: () => ({ id: () => 'b' }), streamUpdateData() {},
		ai: { announceDeath() {} },
		_trainingDamageContext: { sourceId: 'a', itemTypeId: 'wand' }
	};
	global.ige = { isServer: true, game: { data: { settings: { scoreAttributeId: 'points' } } },
		training: { isTrainingMode: true, stats }, trigger: { fire() {} } };
	AttributeComponent.update.call({ _entity: entity, now: Date.now() }, 'health', -10, true);
	const result = stats.finish();
	assert.equal(entity._stats.attributes.health.value, 0);
	assert.equal(result.players.a.damageDealt, 100);
	assert.equal(result.players.b.damageTaken, 100);
});

test('immediate scripted health loss is attributed to the recent opposing hit and weapon', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'a', teamId: 'blue' });
	stats.registerPlayer({ playerId: 'b', teamId: 'red' });
	const attacker = { id: () => 'a' };
	const victim = { id: () => 'b' };
	const entity = {
		_category: 'unit', _stats: { attributes: { health: { value: 100, min: 0, max: 100 } } },
		id: () => 'unit-b', getOwner: () => victim, streamUpdateData() {},
		lastAttackedAt: Date.now(), lastAttackedBy: { id: () => 'unit-a', getOwner: () => attacker }, lastAttackedItemId: 'item-a',
		ai: { announceDeath() {} }
	};
	global.ige = { isServer: true, $: id => id === 'item-a' ? { _stats: { itemTypeId: 'wand' } } : null,
		game: { data: { settings: { scoreAttributeId: 'points' } } },
		training: { isTrainingMode: true, stats, isOpponent: (a, b) => a !== b }, trigger: { fire() {} } };
	AttributeComponent.update.call({ _entity: entity, now: Date.now() }, 'health', 90, true);
	assert.equal(stats.finish().players.a.damageDealt, 10);
	assert.equal(stats.finish().weapons['a:wand'].hits, 1);
});

test('item use records a shot only after cooldown and cost checks pass', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'a', teamId: 'blue' });
	const player = { id: () => 'a' };
	const owner = { id: () => 'unit-a', _stats: { type: 'archmage' }, getOwner: () => player };
	const item = { id: () => 'item-1', getOwnerUnit: () => owner,
		_stats: { type: 'weapon', itemTypeId: 'wand', isGun: true, fireRate: 100, lastUsed: 0 },
		hasQuantityRemaining: () => true, canAffordItemCost: () => true };
	global.ige = { isServer: true, isClient: false, now: 1000, game: {}, physics: null,
		training: { isTrainingMode: true, stats } };
	Item.use.call(item);
	global.ige.now = 1050;
	Item.use.call(item);
	assert.equal(stats.finish().weapons['a:wand'].uses, 1);
});
