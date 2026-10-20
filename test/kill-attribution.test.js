const test = require('node:test');
const assert = require('node:assert/strict');
const { KillFeed } = require('../server/KillFeed');
const { TrainingStats } = require('../server/training/TrainingStats');
global.IgeEntity = { extend(definition) { function Entity() {} Entity.prototype = definition; return Entity; } };
global.IgeEntityPhysics = global.IgeEntity;
const Game = require('../src/gameClasses/components/GameComponent').prototype;
const Attribute = require('../src/gameClasses/components/unit/AttributeComponent').prototype;
const Trigger = require('../src/gameClasses/components/script/TriggerComponent').prototype;
const Action = require('../src/gameClasses/components/script/ActionComponent').prototype;

function fixture() {
  const players = {};
  for (const team of ['blue', 'red']) players[team] = {
    id: () => team, _stats: { name: team, trainingTeamId: team, isBattleBot: true },
    isHostileTo: other => other !== players[team], getSelectedUnit() { return this.unit; }
  };
  const entities = { ...players };
  for (const team of ['blue', 'red']) {
    const unit = { id: () => `${team}-unit`, _category: 'unit', getOwner: () => players[team],
      _stats: { type: `${team}-character`, attributes: { health: { value: 100, min: 0, max: 100 } } },
      ai: { announceDeath() {} }, streamUpdateData() {}, cleanUpProjectiles() {} };
    unit.attribute = { update: (...args) => Attribute.update.call({ _entity: unit, now: 1000 }, ...args) };
    players[team].unit = entities[unit.id()] = unit;
  }
  const stats = new TrainingStats();
  for (const team of ['blue', 'red']) {
    stats.registerPlayer({ playerId: team, teamId: team });
    stats.startLife({ playerId: team, lifeId: `${team}-unit`, characterId: `${team}-character` });
  }
  const game = Object.create(Game);
  game.killFeed = new KillFeed();
  game.data = { settings: { scoreAttributeId: 'points' } };
  game.handleBattleBotDeath = () => {};
  const trigger = Object.create(Trigger);
  trigger.triggeredScripts = { unitTouchesProjectile: [] };
  const sent = [];
  global.ige = { isServer: true, isClient: false, game, $: id => entities[id],
    network: { send: (name, event) => sent.push({ name, event }) }, trigger,
    training: { isTrainingMode: true, stats, clock: { now: () => 1000 }, isOpponent: (a, b) => a !== b },
    script: { triggerEntity() {}, scriptLog() {}, runScript() {}, recordLast50Action() {} },
    variable: { getValue: value => value }, devLog() {} };
  return { players, entities, stats, game, trigger, sent, blue: players.blue.unit, red: players.red.unit };
}

test('entity-script projectile lethal hit credits the actual source in feed and damage stats', () => {
  const f = fixture();
  const projectile = f.entities.shot = { id: () => 'shot', _category: 'projectile',
    _stats: { sourceUnitId: 'blue-unit', sourcePlayerId: 'blue', sourceItemId: 'wand', damageData: {} } };
  f.red.inflictDamage = () => false; // Damage is applied by the entity script before generic damage.
  ige.script.triggerEntity = (entity, name) => {
    if (entity === projectile && name === 'entityTouchesUnit') f.red.attribute.update('health', 0);
  };
  f.trigger.fire('unitTouchesProjectile', { unitId: 'red-unit', collidingEntity: 'red-unit', projectileId: 'shot' });
  assert.equal(f.game.killFeed.recent()[0].killer?.id, 'blue');
  assert.equal(f.stats.finish().players.blue.damageDealt, 100);
  assert.equal(ige.training.currentProjectileId, undefined, 'contact context must be restored');
});

test('zero-damage contact does not steal an environmental death from the last attacker', () => {
  const f = fixture();
  f.red.lastAttackedBy = f.blue;
  f.red.lastAttackedAt = 900;
  f.red.attribute.update('health', 0);
  assert.equal(f.game.killFeed.recent()[0].killer, null);
});

test('a summon with the same player owner does not count as a player elimination', () => {
  const f = fixture();
  const summon = { ...f.red, id: () => 'summon', _stats: { type: 'summon' } };
  assert.equal(f.game.recordKillFeedDeath(summon, { attackingUnitId: 'blue-unit' }), null);
  assert.equal(f.sent.length, 0);
});

test('scripted health change carries the caster rather than the victim as damage source', () => {
  const f = fixture();
  const action = Object.create(Action);
  action.entityCategories = ['unit', 'player', 'item', 'projectile'];
  action.run([{ type: 'setEntityAttribute', entity: f.red, attribute: 'health', value: 0 }],
    { thisEntity: f.blue, triggeredBy: { unitId: 'blue-unit' } });
  assert.equal(f.game.killFeed.recent()[0].killer?.id, 'blue');
  assert.equal(f.stats.finish().players.blue.damageDealt, 100);
});

test('posthumous kills are credited to the character that fired, after a character change', () => {
  const stats = new TrainingStats();
  stats.registerPlayer({ playerId: 'a', teamId: 'blue' });
  stats.registerPlayer({ playerId: 'b', teamId: 'red' });
  stats.startLife({ playerId: 'a', lifeId: 'old', characterId: 'mage' });
  stats.startLife({ playerId: 'b', lifeId: 'victim', characterId: 'ranger' });
  stats.startLife({ playerId: 'a', lifeId: 'new', characterId: 'tank' });
  stats.recordHealthChange({ eventId: 'hit', sourceId: 'a', sourceCharacterId: 'mage', targetId: 'b',
    before: 100, after: 0, at: 10 });
  stats.recordDeath({ lifeId: 'victim', victimId: 'b', killerId: 'a', killerCharacterId: 'mage', at: 10 });
  assert.equal(stats.finish().characters['a:mage'].kills, 1);
  assert.equal(stats.finish().characters['a:mage'].damageDealt, 100);
  assert.equal(stats.finish().characters['a:tank'].kills, 0);
});

test('reflected projectile changes kill credit to the reflector', () => {
  const f = fixture();
  const attribution = require('../src/gameClasses/components/CombatAttribution');
  const projectile = f.entities.shot = { id: () => 'shot', _category: 'projectile',
    _stats: { sourceUnitId: 'blue-unit', sourceItemId: 'wand' },
    _combatSource: attribution.fromEntity(ige, f.blue) };
  const action = Object.create(Action);
  action.run([{ type: 'setOwnerUnitOfProjectile', projectile, unit: f.red }]);
  f.blue._combatDamageContext = attribution.fromEntity(ige, projectile);
  f.blue.attribute.update('health', 0);
  assert.equal(f.game.killFeed.recent()[0].killer?.id, 'red');
});

test('depleting speed does not trigger a bot death', () => {
  const f = fixture();
  f.red._stats.attributes.speed = { value: 10, min: 0, max: 10 };
  let deaths = 0;
  f.game.handleBattleBotDeath = () => deaths++;
  f.red.attribute.update('speed', 0);
  assert.equal(deaths, 0);
  assert.deepEqual(f.game.killFeed.recent(), []);
});

test('projectile contact source is restored when a nested entity script fails', () => {
  const f = fixture();
  ige.game.currentProjectileId = 'outer-shot';
  ige.training.currentProjectileId = 'outer-shot';
  ige.script.triggerEntity = () => { throw new Error('script failed'); };
  assert.throws(() => f.trigger.fire('unitTouchesProjectile', { projectileId: 'inner-shot' }), /script failed/);
  assert.equal(ige.game.currentProjectileId, 'outer-shot');
  assert.equal(ige.training.currentProjectileId, 'outer-shot');
});

test('environmental death after earlier damage does not grant an assist', () => {
  const f = fixture();
  f.stats.recordHealthChange({ eventId: 'earlier', sourceId: 'blue', targetId: 'red', before: 100, after: 90, at: 900 });
  f.stats.recordDeath({ lifeId: 'red-unit', victimId: 'red', killerId: null, at: 1000 });
  assert.equal(f.stats.finish().players.blue.assists, 0);
});
