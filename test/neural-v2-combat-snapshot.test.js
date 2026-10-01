const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.resolve(__dirname, '../server/training/NeuralCombatSnapshot.js');
const helper = fs.existsSync(modulePath) ? require(modulePath) : {};

function fixture() {
	const player = { _stats: { trainingTeamId: 'blue', attributes: { mana: { value: 2 } } }, _battleBot: {} };
	const item = { _stats: { fireRate: 1000, lastUsed: 500, quantity: 3, maxQuantity: 10,
		cost: { unitAttributes: { energy: 4 }, playerAttributes: { mana: 4 } }, damage: { unitAttributes: { health: 50 } } } };
	const unit = { _stats: { currentItemIndex: 0, attributes: { energy: { value: 2 } } }, _translate: { x: 32, y: 32 },
		inventory: { getItemBySlotNumber: slot => slot === 1 ? item : null }, width: () => 40, height: () => 40,
		ai: { battleBotPositionIsClear: (_map, _tw, _th, point) => point.x < 96 } };
	const game = { _battleBotWeaponRange: () => 500, _battleBotProjectileSpeed: () => 200,
		_battleBotProjectileProfile: () => ({ speedPxPerSecond: 200 }), _battleBotIgnoresWalls: () => false,
		_selectBattleBotWeapon: () => undefined };
	const ige = { training: { match: { startedAt: 0, maxDurationMs: 5000, scores: { blue: 4, red: 2 } } } };
	return { ige, game, player, unit, map: { width: 10, height: 10 }, tileWidth: 64, tileHeight: 64, now: 1000,
		snapshot: { self: {}, enemies: [{ id: 'b', distance: 100 }, { id: 'a', distance: 100 }], weapons: [] } };
}

test('v2 snapshot reports a cooling weapon, ammo and resource affordability independently of ready weapons', () => {
	assert.equal(typeof helper.extendSnapshot, 'function');
	const snapshot = helper.extendSnapshot(fixture());
	assert.equal(snapshot.weaponState[0].present, 1);
	assert.equal(snapshot.weaponState[0].cooldown, 0.5);
	assert.equal(snapshot.weaponState[0].ammoRatio, 0.3);
	assert.equal(snapshot.weaponState[0].affordability, 0.5);
	assert.equal(snapshot.weaponState[0].damage, 0.05);
	assert.equal(snapshot.weaponState[1].present, 0);
	assert.equal(snapshot.weapons[0].ready, false);
	assert.equal(snapshot.activeSlot, 0);
});

test('v2 target ordering, terrain and match time are finite and follow the same feature order', () => {
	assert.equal(typeof helper.extendSnapshot, 'function');
	const snapshot = helper.extendSnapshot(fixture());
	assert.deepEqual(snapshot.enemies.map(enemy => enemy.id), ['a', 'b']);
	assert.deepEqual(snapshot.targets.map(enemy => enemy.id), ['a', 'b']);
	assert.equal(snapshot.terrain.length, 8);
	assert.ok(snapshot.terrain[0] < 1, 'east ray finds the wall');
	assert.ok(snapshot.terrain.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
	assert.equal(snapshot.match.remaining, 0.8);
	assert.equal(snapshot.match.ownScore, 0.2);
	assert.equal(snapshot.match.enemyScore, 0.1);
});

test('team potential excludes summons and uses dead teammates as zero HP', () => {
	assert.equal(typeof helper.teamPotential, 'function');
	const units = [];
	function add(team, hp, selected = true) {
		const unit = { _stats: { attributes: { health: { value: hp, max: 100 } } } };
		const owner = { _stats: { trainingTeamId: team }, getSelectedUnit: () => selected ? unit : null };
		unit.getOwner = () => owner; units.push(unit);
	}
	add('blue', 100); add('blue', 100); add('blue', 0); add('blue', 100, false); add('red', 100);
	const ige = { $$: () => units, training: { match: { scores: { blue: 4, red: 2 } } } };
	const expected = 0.25 * (2 / 20) + 0.1 * (2 / 3 - 1 / 3);
	assert.ok(Math.abs(helper.teamPotential(ige, 'blue') - expected) < 1e-10);
	assert.ok(Math.abs(helper.teamPotential(ige, 'red') + expected) < 1e-10);
});
