const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = '../src/gameClasses/components/unit/BattleBotDodge';
const dodge = fs.existsSync(path.resolve(__dirname, modulePath + '.js')) ? require(modulePath) : {};
const { planDodge, collisionTime, rankThreats, describeHazard } = dodge;
const zero = { x: 0, y: 0 };
const bullet = (id, x, y, vx, vy, extra = {}) => ({ id, position: { x, y }, velocity: { x: vx, y: vy }, radius: 2, damage: 10, lifeSeconds: 2, kind: 'projectile', ...extra });
const options = (hazards = [], extra = {}) => ({ position: zero, velocity: zero, speed: 100, radius: 5, hazards, isClear: () => true, now: 1000, horizon: 1, ...extra });

test('relative swept collision uses both velocities and actual combined radii', () => {
	assert.equal(typeof collisionTime, 'function');
	assert.ok(Math.abs(collisionTime(zero, { x: 20, y: 0 }, bullet('a', 100, 0, -80, 0), 8, 2) - .9) < 1e-9);
	assert.equal(collisionTime(zero, { x: -80, y: 0 }, bullet('a', 100, 0, -80, 0), 8, 2), Infinity);
	assert.equal(collisionTime(zero, zero, bullet('expired', 100, 0, -100, 0, { lifeSeconds: .5 }), 5, 2), Infinity);
	assert.equal(collisionTime(zero, zero, bullet('overlap', 0, 0, 0, 0), 5, 1), 0);
});

test('ranks imminent damaging bullets ahead of nearby departing bullets independent of array order', () => {
	assert.equal(typeof rankThreats, 'function');
	const hazards = [bullet('departing', 10, 0, 100, 0), bullet('low', 40, 0, -100, 0, { damage: 1 }), bullet('high', 80, 0, -200, 0, { damage: 60 })];
	const ranked = rankThreats(options(hazards));
	assert.deepEqual(ranked.map(h => h.id), ['high', 'low', 'departing']);
	assert.deepEqual(rankThreats(options(hazards.slice().reverse())).map(h => h.id), ranked.map(h => h.id));
});

test('compares all nine reachable whole paths against all bullets deterministically', () => {
	assert.equal(typeof planDodge, 'function');
	const hazards = [bullet('incoming', -70, 0, 140, 0), bullet('crossing', 0, 60, 0, -20)];
	const result = planDodge(options(hazards));
	assert.equal(result.candidates.length, 9);
	assert.deepEqual(result.candidates.map(c => c.direction), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
	assert.ok(result.currentRisk > 0);
	assert.equal(result.best.risk, 0);
	assert.equal(result.best.clear, true);
	assert.ok(result.candidates[2].risk > 0); // south collides with crossing at y=50.
	assert.deepEqual(planDodge(options(hazards.slice().reverse())), result);
});

test('rejects blocked interior path even when its far endpoint is clear', () => {
	const result = planDodge(options([bullet('a', -70, 0, 140, 0)], { isClear: (p, r) => !(p.y + r > 25 && p.y - r < 35) }));
	assert.equal(result.candidates[2].clear, false);
	assert.equal(result.best.clear, true);
	assert.notEqual(result.best.direction, 2);
});

test('stationary is preserved without threats and zero speed cannot invent reachable moving paths', () => {
	assert.equal(planDodge(options()).best.direction, 8);
	const result = planDodge(options([bullet('a', -70, 0, 140, 0)], { speed: 0 }));
	assert.equal(result.best.direction, 8);
	assert.ok(result.candidates.every(c => !c.moving));
	assert.equal(result.candidates[8].angle, null);
});

test('holds a safe previous direction briefly and overrides a newly unsafe commitment', () => {
	const previous = { direction: 6, until: 1200 };
	assert.equal(planDodge(options([bullet('a', -70, 0, 140, 0)], { previous })).best.direction, 6);
	const updated = planDodge(options([bullet('a', -70, 0, 140, 0), bullet('north', 0, -60, 0, 20)], { previous }));
	assert.notEqual(updated.best.direction, 6);
	assert.equal(updated.best.risk, 0);
});

test('predicts reflected wall bullet returning toward the stationary unit', () => {
	const result = planDodge(options([bullet('bounce', 20, 0, 100, 0, { bounce: true, restitution: 1 })], { horizon: 1.2, isClear: (p, r) => p.x + r <= 60 }));
	assert.ok(result.currentRisk > 0);
	assert.ok(result.candidates[8].collisionTime > .8 && result.candidates[8].collisionTime < 1.1);
	assert.equal(result.best.risk, 0);
	const noBounce = planDodge(options([bullet('stopped', 20, 0, 100, 0)], { horizon: 1.2, isClear: (p, r) => p.x + r <= 60 }));
	assert.equal(noBounce.currentRisk, 0);
});

test('wall-passing hazards are not removed at map walls', () => {
	const result = planDodge(options([bullet('ghost', -100, 0, 200, 0, { canIgnoreWalls: true })], { isClear: p => p.x > -60 }));
	assert.ok(result.currentRisk > 0);
});

test('actual sensor projectiles with no wall destruction remain damaging beyond a wall', () => {
	const game = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/game.json'))).data;
	for (const id of ['Hr97cgF9zq', 'fBJel9jyvz']) {
		const h = describeHazard({ _id: id, _translate: { x: -100, y: 0 }, _battleBotVelocity: { x: 200, y: 0 }, _stats: game.projectileTypes[id] }, id => game.projectileTypes[id], 0);
		assert.equal(h.bounce, false);
		assert.equal(h.canIgnoreWalls, true);
		assert.equal(h.destroysOnWall, false);
		const result = planDodge(options([h], { isClear: (p, r) => Math.abs(p.x + 50) > r + 2 }));
		assert.ok(result.currentRisk > 0);
	}
});

test('actual non-bouncing wall survivors remain dangerous after stopping at the wall', () => {
	const game = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/game.json'))).data;
	for (const id of ['PLAntPvbGv', 'bSAEL6fszb']) {
		const h = describeHazard({ _id: id, _translate: { x: 200, y: 0 }, _battleBotVelocity: { x: 400, y: 0 }, _stats: game.projectileTypes[id] }, id => game.projectileTypes[id], 0);
		assert.equal(h.bounce, false);
		assert.equal(h.canIgnoreWalls, false);
		assert.equal(h.destroysOnWall, false);
		const result = planDodge(options([h], { position: zero, speed: 200, horizon: 2.4, isClear: (p, r) => p.x + r <= 500 }));
		assert.ok(result.candidates[0].risk > 0);
		assert.ok(result.candidates[0].collisionTime > .8);
	}
});

test('enabled sensor wall destruction or motion scripts prevent an unconditional wall-passing profile', () => {
	const game = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/game.json'))).data;
	const stats = structuredClone(game.projectileTypes.Hr97cgF9zq);
	stats.scripts.wall = { triggers: [{ type: 'entityTouchesWall' }], actions: [{ type: 'destroyEntity', entity: { function: 'thisEntity' } }] };
	const entity = { _id: 'scripted', _translate: zero, _battleBotVelocity: { x: 200, y: 0 }, _stats: stats };
	assert.equal(describeHazard(entity).canIgnoreWalls, false);
	assert.equal(describeHazard(entity).destroysOnWall, true);
	stats.scripts.wall.actions = [{ type: 'setVelocityOfEntity', entity: { function: 'thisEntity' }, velocity: { x: 0, y: 0 } }];
	assert.equal(describeHazard(entity).canIgnoreWalls, false);
	stats.scripts.wall.disabled = true;
	assert.equal(describeHazard(entity).canIgnoreWalls, true);
});

test('a conditional wall destroy action cannot erase a surviving hazard from hidden script state', () => {
	const entity = { _id: 'conditional-wall', _translate: zero, _battleBotVelocity: { x: 200, y: 0 }, _stats: {
		currentBody: { width: 10, height: 10, collidesWith: { units: true, walls: true }, fixtures: [{ isSensor: true, restitution: 0 }] }, destroyOnContactWith: { walls: false },
		scripts: { wall: { triggers: [{ type: 'entityTouchesWall' }], conditions: [{ operator: '==' }, { function: 'getValueOfEntityVariable' }, true], actions: [{ type: 'destroyEntity', entity: { function: 'thisEntity' } }] } }
	} };
	assert.equal(describeHazard(entity).destroysOnWall, false);
	assert.equal(describeHazard(entity).canIgnoreWalls, false);
});

test('predicts future explosion at its own arrival time and allows an expired area to be crossed', () => {
	const bomb = bullet('bomb', 0, 0, 0, 0, { damage: 0, radius: 1, explosionRadius: 40, explosionDamage: 50, explosionAt: .6, lifeSeconds: .6 });
	const result = planDodge(options([bomb]));
	assert.ok(result.currentRisk > 0);
	assert.equal(result.best.risk, 0);
	const expired = bullet('area', 50, 0, 0, 0, { radius: 10, kind: 'area', lifeSeconds: .2 });
	assert.equal(planDodge(options([expired])).candidates[0].risk, 0);
	assert.ok(planDodge(options([{ ...expired, lifeSeconds: 1 }])).candidates[0].risk > 0);
});

test('explicit fixed blast center preserves an observed explosion independently of the moving parent', () => {
	const hazard = bullet('observed-blast', 200, 0, 200, 0, { damage: 0, explosions: [{ position: zero, radius: 40, damage: 50, at: .6, lifeSeconds: .2 }] });
	const result = planDodge(options([hazard]));
	assert.ok(result.currentRisk > 0);
	assert.equal(result.candidates[8].collisionTime, .6);
	assert.equal(result.candidates[0].risk, 0);
	const movingCenter = { ...hazard, explosions: [{ radius: 40, damage: 50, at: .6, lifeSeconds: .2 }] };
	assert.equal(planDodge(options([movingCenter])).currentRisk, 0);
});

test('already detonated fixed blast uses its remaining area lifetime and rewards a prompt exit', () => {
	const hazard = bullet('observed-active-blast', 200, 0, 200, 0, { damage: 0, explosions: [{ position: zero, radius: 40, damage: 50, at: 0, lifeSeconds: .6 }] });
	const result = planDodge(options([hazard]));
	assert.equal(result.candidates[8].collisionTime, 0);
	assert.ok(result.best.moving);
	assert.ok(result.best.risk < result.candidates[8].risk);
});

test('persistent area chooses faster exit from an unavoidable initial overlap', () => {
	const result = planDodge(options([bullet('pool', 0, 0, 0, 0, { radius: 30, damage: 20, kind: 'area' })]));
	assert.ok(result.best.moving);
	assert.ok(result.best.risk < result.candidates[8].risk);
});

test('hazard descriptor reads physical radius, health damage, physics velocity and remaining expiry', () => {
	const entity = { _id: 'physical', _translate: { x: 4, y: 8 }, _deathTime: 1500, _battleBotScaleRatio: 30, body: { getLinearVelocity: () => ({ x: 2, y: -3 }) }, _stats: {
		currentBody: { width: 6, height: 8, collidesWith: { units: true, walls: true }, fixtures: [{ restitution: .5, shape: { type: 'rectangle' } }] },
		destroyOnContactWith: { walls: false }, damageData: { unitAttributes: { health: 17, stamina: 999 } }
	} };
	const h = describeHazard(entity, () => null, 1000);
	assert.equal(h.radius, 5);
	assert.equal(h.damage, 17);
	assert.deepEqual(h.velocity, { x: 60, y: -90 });
	assert.equal(h.lifeSeconds, .5);
	assert.equal(h.bounce, true);
	assert.deepEqual(entity._translate, { x: 4, y: 8 });
});

test('live fixture dimensions and physical scale take precedence over sprite scale and base body dimensions', () => {
	const entity = { _id: 'scaled', _translate: zero, _battleBotVelocity: zero, _bounds2d: { x: 12, y: 16 }, _stats: { scale: 9, currentBody: { width: 6, height: 8, fixtures: [{ shape: { type: 'rectangle' } }] } } };
	assert.equal(describeHazard(entity).radius, 10);
	entity._stats.currentBody.fixtures[0].shape.data = { width: 3, height: 4, x: 0, y: 2 };
	assert.equal(describeHazard(entity).radius, 7);
	entity._stats.currentBody.fixtures[0].shape = { type: 'circle', data: { radius: 3 } };
	assert.equal(describeHazard(entity).radius, 3);
});

test('remaining lifespan fallback subtracts elapsed age when deathTime is missing', () => {
	const entity = { _id: 'aged', _translate: zero, _battleBotVelocity: zero, _bornTime: 100, _stats: { lifeSpan: 1000 } };
	assert.equal(describeHazard(entity, () => null, 600).lifeSeconds, .5);
	assert.equal(describeHazard(entity, () => null, 1200).lifeSeconds, 0);
});

test('descriptor infers only supported damaging stationary explosion children and skips disabled or visual children', () => {
	const body = { width: 60, height: 80, collidesWith: { units: true, walls: false }, fixtures: [{ shape: { type: 'rectangle' } }] };
	const types = { blast: { currentBody: body, damageData: { unitAttributes: { health: 30 } }, lifeSpan: 500 }, visual: { currentBody: { ...body, width: 1000, collidesWith: { units: false } }, damage: 999 } };
	const spawn = id => ({ type: 'createProjectileAtPosition', projectileType: id, force: 0, position: { function: 'getEntityPosition', entity: { function: 'thisEntity' } }, angle: 0 });
	const entity = { _id: 'bomb', _translate: zero, _bornTime: 0, _deathTime: 2000, _battleBotVelocity: zero, _stats: { currentBody: body, damageData: { unitAttributes: { health: 0 } }, scripts: {
		active: { triggers: [{ type: 'entityCreated' }], actions: [{ type: 'setTimeOut', duration: 1500, actions: [spawn('blast'), spawn('visual')] }] },
		disabled: { disabled: true, triggers: [{ type: 'entityDestroyed' }], actions: [spawn('visual')] }
	} } };
	const h = describeHazard(entity, id => types[id], 1000);
	assert.equal(h.explosionRadius, 50);
	assert.equal(h.explosionDamage, 30);
	assert.equal(h.explosionAt, .5);
	assert.equal(h.explosionLifeSeconds, .5);
	assert.equal(h.canIgnoreWalls, true);
});

test('descriptor exposes unsupported scripted motion instead of inventing target velocity', () => {
	const entity = { _id: 'dynamic', _translate: zero, _stats: { currentBody: { width: 10, height: 10, collidesWith: { units: true } }, damageData: { unitAttributes: { health: 5 } }, scripts: { steer: { triggers: [{ type: 'entityCreated' }], actions: [{ type: 'applyForceOnEntityAngle', angle: { function: 'getMouseCursorPosition' }, force: 600 }] } } } };
	const h = describeHazard(entity, () => null, 0);
	assert.deepEqual(h.velocity, zero);
	assert.ok(h.limitations.includes('dynamic-script'));
});

test('unknown script conditions do not invent a timed explosion from hidden state', () => {
	const entity = { _id: 'conditional', _translate: zero, _battleBotVelocity: zero, _bornTime: 0, _stats: { scripts: { conditional: {
		triggers: [{ type: 'entityCreated' }], conditions: [{ operator: '==' }, { function: 'getValueOfEntityVariable', variable: 'hidden' }, true],
		actions: [{ type: 'createProjectileAtPosition', projectileType: 'blast', force: 0, position: { function: 'getEntityPosition', entity: { function: 'thisEntity' } } }]
	} } } };
	const h = describeHazard(entity, () => ({ lifeSpan: 500, currentBody: { width: 10, height: 10 }, damageData: { unitAttributes: { health: 20 } } }), 0);
	assert.equal(h.explosionDamage, 0);
	assert.ok(h.limitations.includes('dynamic-script'));
});

test('actual game profiles retain damaging variable values and never treat render effects as damaging areas', () => {
	const game = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/game.json'))).data;
	const infer = id => describeHazard({ _id: id, _translate: zero, _battleBotVelocity: zero, _stats: game.projectileTypes[id] }, id => game.projectileTypes[id], 0);
	assert.equal(infer('2RorkyQ4ta').damage, 10);
	assert.equal(infer('YTdV4qju6b').damage, 0);
	assert.ok(infer('2RorkyQ4ta').radius > 40);
	const live = { _id: 'custom', _translate: zero, _battleBotVelocity: zero, variables: { '(Global Projectile) Projectile Damage': { value: 70, default: 10 } }, _stats: game.projectileTypes['2RorkyQ4ta'] };
	assert.equal(describeHazard(live).damage, 70);
});

test('contact explosion radius envelope catches a nearby passing explosive bullet', () => {
	const result = planDodge(options([bullet('touch-bomb', -70, 30, 140, 0, { damage: 0, explosionRadius: 40, explosionDamage: 50, explosionOnTouch: true })]));
	assert.ok(result.currentRisk > 0);
	assert.equal(result.best.risk, 0);
});

test('wall-triggered blast uses first impact even when its bouncing parent hits another wall later', () => {
	const result = planDodge(options([bullet('wall-bomb', 20, 0, 100, 0, { damage: 0, bounce: true, restitution: 1, explosionRadius: 20, explosionDamage: 50, explosionOnWall: true })], {
		position: { x: 45, y: 0 }, horizon: 1.7, isClear: (p, r) => p.x + r <= 60 && p.x - r >= -60
	}));
	assert.ok(result.currentRisk > 0);
	assert.ok(result.candidates[8].collisionTime < .5);
});

test('fixed collision and damage benchmark improves on original last-bullet perpendicular planner', () => {
	const benchmarkPath = path.resolve(__dirname, 'helpers/battlebot-dodge-benchmark.js');
	assert.ok(fs.existsSync(benchmarkPath), 'independent simulation benchmark exists');
	const report = require(benchmarkPath).benchmark();
	assert.equal(report.scenarios.length, 5);
	assert.equal(report.original.collisions, 5);
	assert.equal(report.original.damage, 190);
	assert.equal(report.planner.collisions, 0);
	assert.equal(report.planner.damage, 0);
});
