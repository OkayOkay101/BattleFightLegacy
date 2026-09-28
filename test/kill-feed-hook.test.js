const test = require('node:test');
const assert = require('node:assert/strict');
const { KillFeed } = require('../server/KillFeed');

global.IgeEntity = { extend(definition) { function Entity() {} Entity.prototype = definition; return Entity; } };
const GameComponent = require('../src/gameClasses/components/GameComponent').prototype;

function participant(id, name, teamId) {
  return { id: () => id, _stats: { name, trainingTeamId: teamId, type: 'player', playerJoined: true },
    isHostileTo(other) { return !!other && this._stats.trainingTeamId !== other._stats.trainingTeamId; } };
}
function makeGame() {
  const sent = [];
  const players = { red: participant('red-player', 'Red', 'red'), blue: participant('blue-player', 'Blue', 'blue') };
  const units = { victim: { id: () => 'life-red-1', _category: 'unit', _stats: { type: 'ranger' }, getOwner: () => players.red },
    attacker: { id: () => 'life-blue-1', getOwner: () => players.blue } };
  const game = Object.create(GameComponent);
  game.killFeed = new KillFeed();
  global.ige = { isServer: true, $(id) { return units[id] || null; }, network: { send(event, payload) { sent.push({ event, payload }); } } };
  return { game, sent, players, units };
}

test('broadcasts one normalized elimination with hostile killer credit', () => {
  const { game, sent, units } = makeGame();
  const event = game.recordKillFeedDeath(units.victim, { attackingUnitId: 'attacker' });
  assert.equal(event.killer.id, 'blue-player');
  assert.equal(event.victim.id, 'red-player');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].event, 'battleKillFeed');
  assert.equal(sent[0].payload.eventId, 'life-red-1');
});

test('broadcasts an unattributed elimination for friendly or missing attacker', () => {
  const { game, sent, units } = makeGame();
  units.attacker.getOwner = () => participant('red-friend', 'Friend', 'red');
  game.recordKillFeedDeath(units.victim, { attackingUnitId: 'attacker' });
  units.victim.id = () => 'life-red-2';
  game.recordKillFeedDeath(units.victim, {});
  assert.equal(sent.length, 2);
  assert.equal(sent[0].payload.killer, null);
  assert.equal(sent[1].payload.killer, null);
});

test('ignores summons without a player owner and does not broadcast twice', () => {
  const { game, sent, units } = makeGame();
  const summon = { id: () => 'summon', _category: 'unit', _stats: { type: 'summon' }, getOwner: () => null };
  assert.equal(game.recordKillFeedDeath(summon, { attackingUnitId: 'attacker' }), null);
  game.recordKillFeedDeath(units.victim, { attackingUnitId: 'attacker' });
  assert.equal(game.recordKillFeedDeath(units.victim, { attackingUnitId: 'attacker' }), null);
  assert.equal(sent.length, 1);
});

test('records the feed on the server health-zero edge and keeps the bot death hook', () => {
  const AttributeComponent = require('../src/gameClasses/components/unit/AttributeComponent').prototype;
  const calls = { feed: [], botDeath: 0, trigger: 0, announced: 0 };
  global.ige = {
    isServer: true,
    training: null,
    network: { send() {} },
    game: {
      data: { settings: { scoreAttributeId: 'points' } },
      recordKillFeedDeath(unit, context) { calls.feed.push({ unit, context }); },
      handleBattleBotDeath() { calls.botDeath++; }
    },
    trigger: { fire() { calls.trigger++; } }
  };
  const unit = {
    id: () => 'life-1', _category: 'unit', _stats: { highscore: 0, attributes: { health: { value: 10, min: 0, max: 10 } } },
    ai: { announceDeath() { calls.announced++; } }, streamUpdateData() {}, cleanUpProjectiles() {}
  };
  const component = Object.create(AttributeComponent);
  component._entity = unit;
  component.now = Date.now();
  component.update('health', 0);
  component.update('health', 0);
  assert.equal(calls.feed.length, 1);
  assert.equal(calls.feed[0].context.attackingUnitId, null);
  assert.equal(calls.botDeath, 1);
  assert.equal(calls.trigger, 1);
  assert.equal(calls.announced, 1);
});
