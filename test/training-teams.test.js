const test = require('node:test');
const assert = require('node:assert/strict');

global.IgeEntity = { extend(definition) { function Entity() {} Entity.prototype = definition; return Entity; } };
global.IgeEntityPhysics = global.IgeEntity;
const Player = require('../src/gameClasses/Player').prototype;
const Unit = require('../src/gameClasses/Unit').prototype;
const { install } = require('../server/training/TrainingRuntime');

function bot(team) {
	return { _stats: { isBattleBot: true, playerJoined: true, controlledBy: 'computer', trainingTeamId: team, playerTypeId: team },
		isHostileTo: Player.isHostileTo, isFriendlyTo: Player.isFriendlyTo, isNeutralTo: Player.isNeutralTo };
}

test('training team relation allows opposing bots while preserving friendly teammates', () => {
	global.ige = { game: { getAsset: () => ({ relationships: {} }) } };
	install(global.ige);
	const blue = bot('blue');
	const red = bot('red');
	const ally = bot('blue');
	assert.equal(blue.isHostileTo(red), true);
	assert.equal(red.isHostileTo(blue), true);
	assert.equal(blue.isFriendlyTo(ally), true);
	assert.equal(blue.isHostileTo(ally), false);
	assert.equal(blue.isFriendlyTo(red), false);
});

test('training damage reaches an opposing bot but cannot hurt a teammate', () => {
	const blue = bot('blue');
	const red = bot('red');
	global.ige = { isClient: false, game: { getAsset: () => ({ relationships: {} }) }, $: id => id === 'source' ? blue : undefined };
	install(global.ige);
	global._ = { forEach: (entries, fn) => Object.entries(entries).forEach(([key, value]) => fn(value, key)) };
	function victim(owner) {
		return { _stats: { type: 'fighter', attributes: { health: { value: 100 } } }, getOwner: () => owner,
			id: () => 'victim', attribute: { update(_, value) { target._stats.attributes.health.value = value; } } };
	}
	let target = victim(red);
	assert.equal(Unit.inflictDamage.call(target, { sourcePlayerId: 'source', targetsAffected: ['everything'], unitAttributes: { health: 40 } }), true);
	assert.equal(target._stats.attributes.health.value, 60);
	target = victim(bot('blue'));
	assert.equal(Unit.inflictDamage.call(target, { sourcePlayerId: 'source', targetsAffected: ['everything'], unitAttributes: { health: 40 } }), false);
	assert.equal(target._stats.attributes.health.value, 100);
});

test('damage context covers health changes made by an on-hit script', () => {
	const blue = bot('blue');
	const red = bot('red');
	const sourceUnit = { getBaseDamage: () => 0 };
	let target;
	global.ige = { isClient: false, game: { getAsset: () => ({ relationships: {} }) },
		$: id => ({ source: blue, sourceUnit })[id],
		trigger: { fire(name) { if (name === 'unitAttacksUnit') target.attribute.update('health', 90); } } };
	install(global.ige);
	global._ = { forEach: (entries, fn) => Object.entries(entries).forEach(([key, value]) => fn(value, key)) };
	target = { _stats: { type: 'fighter', attributes: { health: { value: 100 } } }, getOwner: () => red,
		id: () => 'victim', attribute: { update(_, value) {
			assert.equal(target._trainingDamageContext?.sourceId, 'source');
			target._stats.attributes.health.value = value;
		} } };
	assert.equal(Unit.inflictDamage.call(target, { sourcePlayerId: 'source', sourceUnitId: 'sourceUnit',
		targetsAffected: ['everything'], unitAttributes: {} }), true);
	assert.equal(target._stats.attributes.health.value, 90);
});
