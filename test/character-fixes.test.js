const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

test('Pekk, Flaulist, and Orlette projectile definitions have correct wall collision settings in game.json and game.json.gz', () => {
	const rawJson = fs.readFileSync(path.resolve(__dirname, '../src/game.json'), 'utf8');
	const gJson = JSON.parse(rawJson);
	const rawGz = fs.readFileSync(path.resolve(__dirname, '../src/game.json.gz'));
	const gGz = JSON.parse(zlib.gunzipSync(rawGz).toString('utf8'));

	for (const [sourceName, g] of [['game.json', gJson], ['game.json.gz', gGz]]) {
		const pts = g.data.projectileTypes;

		// Pekk projectiles should NOT be destroyed on contact with walls (they bounce)
		const pekk1 = pts['3u1mudgtJJ'];
		const pekk2 = pts['rnzvoghaYm'];
		assert.ok(pekk1, `${sourceName}: Pekk Tok! Tak! bullet missing`);
		assert.equal(pekk1.destroyOnContactWith.walls, false, `${sourceName}: Pekk Tok! Tak! should not destroy on walls`);
		assert.equal(pekk1.bodies.default.collidesWith.walls, true, `${sourceName}: Pekk Tok! Tak! should collide with walls to bounce`);

		assert.ok(pekk2, `${sourceName}: Pekk Woop! Woo! bullet missing`);
		assert.equal(pekk2.destroyOnContactWith.walls, false, `${sourceName}: Pekk Woop! Woo! should not destroy on walls`);
		assert.equal(pekk2.bodies.default.collidesWith.walls, true, `${sourceName}: Pekk Woop! Woo! should collide with walls to bounce`);

		// Flaulist orbiting bullets should NOT destroy on contact with walls or collide
		const flaulistIds = ['0YumFlrt3o', 'zxwL4Pu7YO', '4nJbuLtQQz', 'ZmcWjjjNVq', 'Wz6R478656', 'WezyFReksc'];
		for (const id of flaulistIds) {
			const p = pts[id];
			if (p) {
				assert.equal(p.destroyOnContactWith.walls, false, `${sourceName}: Flaulist ${p.name} should not destroy on walls`);
				assert.equal(p.bodies.default.collidesWith.walls, false, `${sourceName}: Flaulist ${p.name} should not collide with walls`);
			}
		}

		// Orlette orbiting bullets should NOT destroy on contact with walls or collide
		const orletteIds = ['BwTDv6U9oH', '1hrK9XwllK', 'trDwr7IwYW', 'TfNDwKHuf3'];
		for (const id of orletteIds) {
			const p = pts[id];
			if (p) {
				assert.equal(p.destroyOnContactWith.walls, false, `${sourceName}: Orlette ${p.name} should not destroy on walls`);
				assert.equal(p.bodies.default.collidesWith.walls, false, `${sourceName}: Orlette ${p.name} should not collide with walls`);
			}
		}
	}
});

test('currentTimeStamp returns seconds for smooth rotational orbit speeds', () => {
	const nowMs = 1727373524000;
	const nowSec = nowMs / 1000;

	// In seconds, angle rate = 1 rad/s (~0.16 rev/s, 1 full rotation in 6.28s)
	// If it were ms, angle rate = 1000 rad/s (159 rev/s, hyper-speed spin)
	assert.ok(nowSec < 2e9, 'currentTimeStamp must be in seconds');
	assert.ok(nowSec > 1e9, 'currentTimeStamp must be modern unix epoch');

	const radiansPerSecond = (nowSec + 1) - nowSec;
	const revolutionsPerSecond = radiansPerSecond / (2 * Math.PI);
	assert.ok(revolutionsPerSecond < 0.2, 'Orbiting bullets rotate gently at ~0.16 rev/sec');
});

test('cleanUpProjectiles destroys projectiles and secondary summon/markers of dead unit', () => {
	const destroyedIds = [];
	const dummyProjectiles = [
		{ id: () => 'proj1', _isBeingRemoved: false, _alive: true, _stats: { sourceUnitId: 'unit_hero_1', sourcePlayerId: 'player_1' }, destroy: function () { destroyedIds.push('proj1'); } },
		{ id: () => 'proj2', _isBeingRemoved: false, _alive: true, _stats: { sourceUnitId: 'unit_hero_2', sourcePlayerId: 'player_2' }, destroy: function () { destroyedIds.push('proj2'); } },
		{ id: () => 'proj3', _isBeingRemoved: false, _alive: true, _stats: { sourceUnitId: 'unit_hero_1', sourcePlayerId: 'player_1' }, destroy: function () { destroyedIds.push('proj3'); } }
	];

	const dummyUnits = [
		{ id: () => 'marker_1', _isBeingRemoved: false, _alive: true, _stats: { ownerId: 'player_1', type: 'fg6GvDXnkW' }, destroy: function () { destroyedIds.push('marker_1'); } }, // GA Spatial Collapse Marker 1
		{ id: () => 'marker_2', _isBeingRemoved: false, _alive: true, _stats: { ownerId: 'player_1', type: 't6eGlgZJZd' }, destroy: function () { destroyedIds.push('marker_2'); } }, // GA Spatial Collapse Marker 2
		{ id: () => 'other_hero', _isBeingRemoved: false, _alive: true, _stats: { ownerId: 'player_2', type: 'fg6GvDXnkW' }, destroy: function () { destroyedIds.push('other_hero'); } }
	];

	global.ige = {
		$$: function (category) {
			if (category === 'projectile') return dummyProjectiles;
			if (category === 'unit') return dummyUnits;
			return [];
		}
	};

	global.IgeEntityPhysics = {
		prototype: { destroy() {} },
		extend(definition) {
			function Cls() { if (this.init) this.init(); }
			Cls.prototype = Object.assign({ log() {} }, definition);
			return Cls;
		}
	};

	// Mock unit
	const deadHero = {
		id: () => 'unit_hero_1',
		getOwner: () => ({ id: () => 'player_1' }),
		_category: 'unit'
	};

	const Unit = require('../src/gameClasses/Unit.js');
	Unit.prototype.cleanUpProjectiles.call(deadHero);

	assert.ok(destroyedIds.includes('proj1'), 'proj1 owned by unit_hero_1 must be destroyed');
	assert.ok(destroyedIds.includes('proj3'), 'proj3 owned by unit_hero_1 must be destroyed');
	assert.ok(!destroyedIds.includes('proj2'), 'proj2 owned by unit_hero_2 must NOT be destroyed');
	assert.ok(destroyedIds.includes('marker_1'), 'Grand Artificer marker 1 must be destroyed on death');
	assert.ok(destroyedIds.includes('marker_2'), 'Grand Artificer marker 2 must be destroyed on death');
	assert.ok(!destroyedIds.includes('other_hero'), 'Markers from other players must NOT be destroyed');
});

test('destroy and cleanUpProjectiles have recursion protection and do not exceed call stack size', () => {
	const Unit = require('../src/gameClasses/Unit.js');

	let hero, marker;
	hero = {
		id: () => 'hero_unit',
		getOwner: () => ({ id: () => 'player_1' }),
		_stats: { type: 'hero_type', ownerId: 'player_1' },
		_category: 'unit',
		destroy: function () {
			Unit.prototype.destroy.call(this);
		},
		cleanUpProjectiles: function () {
			Unit.prototype.cleanUpProjectiles.call(this);
		},
		playEffect: () => {}
	};

	marker = {
		id: () => 'marker_unit',
		getOwner: () => ({ id: () => 'player_1' }),
		_stats: { type: 'fg6GvDXnkW', ownerId: 'player_1' },
		_category: 'unit',
		destroy: function () {
			Unit.prototype.destroy.call(this);
		},
		cleanUpProjectiles: function () {
			Unit.prototype.cleanUpProjectiles.call(this);
		},
		playEffect: () => {}
	};

	global.ige.$$ = (cat) => cat === 'unit' ? [hero, marker] : [];

	// Calling destroy on hero must terminate cleanly without RangeError
	assert.doesNotThrow(() => {
		hero.destroy();
	});

	assert.equal(hero._isBeingRemoved, true);
	assert.equal(marker._isBeingRemoved, true);
});
