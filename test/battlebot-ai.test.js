const test = require('node:test');
const assert = require('node:assert/strict');

global.IgeEntity = {
	extend(definition) {
		function Component() {}
		Component.prototype = definition;
		return Component;
	}
};
global.IgeEntityPhysics = global.IgeEntity;

const AIComponent = require('../src/gameClasses/components/unit/AIComponent').prototype;
const GameComponent = require('../src/gameClasses/components/GameComponent').prototype;
const Player = require('../src/gameClasses/Player').prototype;
const Unit = require('../src/gameClasses/Unit').prototype;

test('battle bots choose a different playable character from their last life and living teammate', () => {
	const roster = ['archmage', 'alchemist', 'slayer', 'commander', 'crackshot', 'berserker'];
	assert.equal(AIComponent.chooseBattleBotCharacter(roster, 'archmage', 'slayer', () => 0), 'alchemist');
	assert.equal(AIComponent.chooseBattleBotCharacter(roster, 'archmage', 'slayer', () => 0.99), 'berserker');
	assert.equal(AIComponent.chooseBattleBotCharacter(['archmage', 'slayer'], 'archmage', 'slayer', () => 0), undefined);
});

test('battle bot aim leads a moving target by the projectile travel time', () => {
	const aim = AIComponent.predictBattleBotAim(
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 0, y: 1 },
		2
	);
	assert.ok(aim);
	assert.ok(aim.y > 0);
	assert.ok(Math.abs(Math.hypot(aim.x, aim.y) - 2 * aim.time) < 1e-8);
});

test('battle bot converts gun bullet force to world pixels per second for aiming', () => {
	assert.equal(GameComponent._battleBotProjectileSpeed({ _stats: { bulletForce: 12 } }, { _scaleRatio: 30 }), 360);
});

test('battle bot uses projectile travel distance rather than short tactical spacing for attacks', () => {
	const ranged = { _stats: { bulletForce: 85, isGun: true }, projectileData: { lifeSpan: 1500 } };
	const slash = { _stats: { bulletForce: 14, isGun: true }, projectileData: null };
	assert.equal(GameComponent._battleBotWeaponRange(ranged, { _scaleRatio: 30 }), 3825);
	assert.ok(GameComponent._battleBotWeaponRange(slash, { _scaleRatio: 30 }) < 250);
});

test('battle bot switches to a ready long-range weapon when the current one cannot reach', () => {
	const items = [
		{ _stats: { isGun: true, bulletForce: 12, fireRate: 50, lastUsed: 0 }, projectileData: { lifeSpan: 1500 }, hasQuantityRemaining: () => true, canAffordItemCost: () => true },
		{ _stats: { isGun: true, bulletForce: 85, fireRate: 450, lastUsed: 0 }, projectileData: { lifeSpan: 1500 }, hasQuantityRemaining: () => true, canAffordItemCost: () => true },
		{ _stats: { isGun: true, bulletForce: 27, fireRate: 2500, lastUsed: 1900 }, projectileData: { lifeSpan: 1500 }, hasQuantityRemaining: () => true, canAffordItemCost: () => true }
	];
	const unit = { inventory: { getItemBySlotNumber: slot => items[slot - 1] } };
	assert.equal(GameComponent._selectBattleBotWeapon(unit, { slots: [0, 1, 2] }, 1000, true, 2000, 0, { _scaleRatio: 30 }).slot, 1);
	assert.equal(GameComponent._selectBattleBotWeapon(unit, { slots: [0, 1, 2] }, 1000, true, 2000, 1, { _scaleRatio: 30 }).slot, 1);
});

test('battle bot may target through a wall only with an existing cursor-placed attack', () => {
	const projectile = { _stats: { itemTypeId: 'EU42kdSjCF', bulletForce: 12, isGun: true }, projectileData: { lifeSpan: 1500 } };
	const callDown = { _stats: { itemTypeId: 'yjZur6OtA4', bulletForce: 22, isGun: true,
		scripts: require('../src/game.json').data.itemTypes.yjZur6OtA4.scripts }, projectileData: { lifeSpan: 1500 } };
	assert.equal(GameComponent._battleBotCanAttack(projectile, 300, false, { _scaleRatio: 30 }), false);
	assert.equal(GameComponent._battleBotCanAttack(callDown, 300, false, { _scaleRatio: 30 }), true);
	assert.equal(GameComponent._battleBotCanAttack(callDown, 300, true, { _scaleRatio: 30 }), true);
	const unit = { inventory: { getItemBySlotNumber: slot => [projectile, callDown][slot - 1] } };
	assert.equal(GameComponent._selectBattleBotWeapon(unit, { slots: [0, 1] }, 300, false, 10000, 0, { _scaleRatio: 30 }).slot, 1);
	assert.equal(GameComponent._battleBotCanAttack({ _stats: { itemTypeId: 'yjZur6OtA4', isGun: true } }, 300, false, { _scaleRatio: 30 }), false,
		'item ID alone does not bypass walls when its cursor-placed script is absent');
});

test('blocked shot is selectable only when a valid ricochet aim exists for that item', () => {
	const item = { _stats: { isGun: true, bulletForce: 20, fireRate: 100, lastUsed: 0 },
		projectileData: { lifeSpan: 5000 }, hasQuantityRemaining: () => true };
	const unit = { inventory: { getItemBySlotNumber: () => item } };
	const bounce = { aim: { x: 40, y: 50 }, flightMs: 1000 };
	assert.equal(GameComponent._selectBattleBotWeapon(unit, { slots: [0] }, 300, false, 1000, 0,
		{ _scaleRatio: 30 }, () => bounce)?.ricochet, bounce);
	assert.equal(GameComponent._selectBattleBotWeapon(unit, { slots: [0] }, 300, false, 1000, 0,
		{ _scaleRatio: 30 }, () => null), undefined);
});

test('battle bot line of sight rejects paths that cross a wall tile', () => {
	const map = {
		width: 3,
		height: 3,
		layers: [{ name: 'walls', data: [0, 0, 0, 0, 1, 0, 0, 0, 0] }]
	};
	assert.equal(AIComponent.battleBotHasLineOfSight(map, 1, 1, 64, { x: 32, y: 96 }, { x: 160, y: 96 }), false);
	assert.equal(AIComponent.battleBotHasLineOfSight(map, 1, 1, 64, { x: 32, y: 32 }, { x: 160, y: 32 }), true);
});

test('battle bot routes around a wall with space for its body', () => {
	const walls = new Array(35).fill(0);
	for (let y = 0; y < 4; y++) walls[3 + y * 7] = 1;
	const map = { width: 7, height: 5, layers: [{ name: 'walls', data: walls }] };
	const path = AIComponent.findBattleBotPath(map, 64, 64, { x: 96, y: 96 }, { x: 352, y: 96 }, 16);
	assert.ok(path.length > 0, 'path exists through the gap');
	assert.ok(path.some(point => point.y > 224), 'path detours through the opening');
	for (const point of path) assert.equal(walls[Math.floor(point.x / 64) + Math.floor(point.y / 64) * 7], 0);
});

test('battle bot chooses only a living human-controlled match opponent', () => {
	const self = { _stats: { isBattleBot: true }, isHostileTo: () => true };
	const ownUnit = { _translate: { x: 0, y: 0 } };
	function unit(x, owner) { return { _translate: { x, y: 0 }, _stats: { type: 'fighter', attributes: { health: { value: 100 } } }, getOwner: () => owner }; }
	const rivalBot = unit(20, { _stats: { isBattleBot: true, playerJoined: true, controlledBy: 'computer' } });
	const npc = unit(30, { _stats: { playerJoined: false, controlledBy: 'computer' } });
	const human = unit(100, { _stats: { playerJoined: true, controlledBy: 'human' }, getSelectedUnit: () => human });
	global.ige = { $$: () => [ownUnit, rivalBot, npc, human] };
	assert.equal(GameComponent._selectBattleBotTarget(self, ownUnit).unit, human);
	human._translate.x = 10000;
	assert.equal(GameComponent._selectBattleBotTarget(self, ownUnit).unit, human);
});

test('battle bots and humans are opponents regardless of team, while battle bots are allies', () => {
	global.ige = { game: { getAsset: () => ({ relationships: {} }) } };
	const botA = { _stats: { isBattleBot: true, playerTypeId: 'blue', controlledBy: 'computer' } };
	const botB = { _stats: { isBattleBot: true, playerTypeId: 'red', controlledBy: 'computer' } };
	const human = { _stats: { playerTypeId: 'blue', controlledBy: 'human' } };
	assert.equal(Player.isHostileTo.call(botA, human), true);
	assert.equal(Player.isHostileTo.call(human, botA), true);
	assert.equal(Player.isHostileTo.call(botA, botB), false);
});

test('battle bot splash damage cannot hurt another bot or an NPC', () => {
	const source = { _stats: { isBattleBot: true, controlledBy: 'computer' } };
	const otherBot = { _stats: { isBattleBot: true, controlledBy: 'computer' } };
	const npc = { _stats: { controlledBy: 'computer' } };
	global.ige = { isClient: false, game: {}, $: id => id === 'source' ? source : undefined };
	global._ = { forEach: (object, visit) => Object.entries(object).forEach(([key, value]) => visit(value, key)) };
	for (const owner of [otherBot, npc]) {
		const target = { id: () => 'victim', getOwner: () => owner, _stats: { attributes: { health: { value: 100 } } },
			attribute: { update(_, value) { target._stats.attributes.health.value = value; } } };
		assert.equal(Unit.inflictDamage.call(target, { sourcePlayerId: 'source', targetsAffected: ['everything'], unitAttributes: { health: 40 } }), false);
		assert.equal(target._stats.attributes.health.value, 100);
	}
});

test('battle bot picks a new clear spawn instead of its death location', () => {
	const map = { width: 8, height: 8, tilewidth: 64, tileheight: 64, layers: [{ name: 'walls', data: new Array(64).fill(0) }] };
	const tried = [{ x: 100, y: 100 }, { x: 128, y: 128 }, { x: 320, y: 320 }];
	let i = 0;
	global.ige = { map: { data: map }, scaleMapDetails: { tileWidth: 64, tileHeight: 64 }, variable: {
		getRandomPositionInRegion: () => tried[i++],
		isPositionInEntity: () => false
	} };
	map.layers[0].data[2 + 2 * 8] = 1;
	const spawn = GameComponent._pickBattleBotSpawn(false, { x: 100, y: 100 }, 16);
	assert.deepEqual(spawn, { x: 320, y: 320 });
});

test('battle bot can dodge an observed projectile trajectory toward an open side', () => {
	const map = { width: 5, height: 5, layers: [{ name: 'walls', data: new Array(25).fill(0) }] };
	const dodge = AIComponent.chooseBattleBotDodge(map, 64, 64, { x: 160, y: 160 }, { x: 160, y: 80 }, { x: 0, y: 200 }, 16);
	assert.ok(Number.isFinite(dodge));
	assert.ok(Math.abs(Math.sin(dodge)) < 0.5, 'dodge is lateral to the projectile');
});

test('normal unit movement loop preserves a battle bot walking command', () => {
	const owner = { _stats: { controlledBy: 'computer', isBattleBot: true } };
	let velocity, stopped = false;
	global.ige = { isServer: true, isClient: false, physics: null, unitBehaviourCount: 0, $: () => owner };
	global.Math.radians = degrees => degrees * Math.PI / 180;
	const unit = {
		_stats: { ownerId: 'bot', ai: { enabled: false }, isStunned: false,
			controls: { movementMethod: 'velocity', mouseBehaviour: { rotateToFaceMouseCursor: false, flipSpriteHorizontallyWRTMouse: false } },
			attributes: { speed: { value: 10 } } },
		_translate: { x: 0, y: 0 }, botAimPosition: { x: 100, y: 0 }, movementAngle: 0,
		isMoving: true, direction: { x: 0, y: 0 }, body: {},
		setLinearVelocity(x, y) { velocity = { x, y }; },
		stopMoving() { stopped = true; this.isMoving = false; }
	};
	Unit._behaviour.call(unit);
	assert.equal(stopped, false);
	assert.deepEqual(velocity, { x: 10, y: 0 });
});
