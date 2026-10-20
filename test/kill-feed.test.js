const test = require('node:test');
const assert = require('node:assert/strict');
const { KillFeed } = require('../server/KillFeed');

const red = { id: 'red-player', name: 'Red', teamId: 'red', characterId: 'ranger' };
const blue = { id: 'blue-player', name: 'Blue', teamId: 'blue', characterId: 'knight' };

test('credits a hostile opposing player and normalizes the event', () => {
  const feed = new KillFeed();
  const event = feed.recordDeath({ lifeId: 'life-1', victim: red, attacker: blue, hostile: true, at: 10 });
  assert.deepEqual(event, {
    eventId: 'life-1',
    killer: { id: 'blue-player', name: 'Blue', teamId: 'blue', characterId: 'knight' },
    victim: { id: 'red-player', name: 'Red', teamId: 'red', characterId: 'ranger' },
    at: 10
  });
});

test('keeps self, friendly, environmental, and non-hostile deaths as unattributed eliminations', () => {
  const feed = new KillFeed();
  const friendly = { id: 'red-2', name: 'Friend', teamId: 'red' };
  assert.equal(feed.recordDeath({ lifeId: 'self', victim: red, attacker: red, hostile: true }).killer, null);
  assert.equal(feed.recordDeath({ lifeId: 'friendly', victim: red, attacker: friendly, hostile: false }).killer, null);
  assert.equal(feed.recordDeath({ lifeId: 'environment', victim: red, attacker: null, hostile: false }).killer, null);
  assert.equal(feed.recordDeath({ lifeId: 'unknown-team', victim: red, attacker: { id: 'other', name: 'Other' }, hostile: true }).killer, null);
});

test('rejects deaths without a life or victim identity', () => {
  const feed = new KillFeed();
  assert.equal(feed.recordDeath({ lifeId: '', victim: red, attacker: blue, hostile: true }), null);
  assert.equal(feed.recordDeath({ lifeId: 'missing-victim', victim: null, attacker: blue, hostile: true }), null);
  assert.equal(feed.recordDeath({ lifeId: 'missing-id', victim: { name: 'No id' }, attacker: blue, hostile: true }), null);
});

test('deduplicates repeated death transitions by unit life ID', () => {
  const feed = new KillFeed();
  assert.ok(feed.recordDeath({ lifeId: 'life-1', victim: red }));
  assert.equal(feed.recordDeath({ lifeId: 'life-1', victim: red, at: 11 }), null);
});

test('returns newest first and retains only the latest twelve events', () => {
  const feed = new KillFeed();
  for (let index = 1; index <= 14; index++) {
    feed.recordDeath({ lifeId: `life-${index}`, victim: { id: `p-${index}` }, at: index });
  }
  assert.equal(feed.recent().length, 12);
  assert.equal(feed.recent()[0].eventId, 'life-14');
  assert.equal(feed.recent()[11].eventId, 'life-3');
});

test('returns defensive event data', () => {
  const feed = new KillFeed();
  const event = feed.recordDeath({ lifeId: 'life-1', victim: red, attacker: blue, hostile: true });
  event.victim.name = 'changed';
  const history = feed.recent();
  history.length = 0;
  history[0] = { eventId: 'fake' };
  assert.equal(feed.recent()[0].victim.name, 'Red');
  assert.equal(feed.recent().length, 1);
});
