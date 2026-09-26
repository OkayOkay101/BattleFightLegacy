const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveProjectileProfile } = require('../src/gameClasses/components/unit/BattleBotProjectileProfile');
const game = require('../src/game.json').data;

test('scripted bouncing bullet uses its real projectile rather than the non-bouncing default', () => {
	const profile = resolveProjectileProfile(game.itemTypes.LaeedATycr, id => game.projectileTypes[id]);
	assert.equal(profile.typeId, 'ICKyoWSGCI');
	assert.equal(profile.lifeSpanMs, 12000);
	assert.equal(profile.canBounceWall, true);
});

test('scripted Arcane Inferno cannot bounce even when fired near a wall', () => {
	const profile = resolveProjectileProfile(game.itemTypes.EU42kdSjCF, id => game.projectileTypes[id]);
	assert.equal(profile.typeId, '2RorkyQ4ta');
	assert.equal(profile.canBounceWall, false);
});
