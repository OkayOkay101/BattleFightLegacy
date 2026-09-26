const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingStats } = require('../server/training/TrainingStats');
const { TrainingMatch } = require('../server/training/TrainingMatch');
const { TrainingTrace } = require('../server/training/TrainingTrace');

test('real training events become an ordered trace with stable participant and projectile labels', () => {
	const stats = new TrainingStats();
	stats.registerPlayer({ playerId: 'b', teamId: 'blue', characterId: 'mage' });
	stats.registerPlayer({ playerId: 'r', teamId: 'red', characterId: 'archer' });
	stats.startLife({ playerId: 'b', lifeId: 'b-life', characterId: 'mage' });
	stats.startLife({ playerId: 'r', lifeId: 'r-life', characterId: 'archer' });
	const trace = new TrainingTrace(stats);
	stats.trace = trace;
	const match = new TrainingMatch({ matchId: 'm', startedAt: 0, trace });
	trace.beginStep(6);
	stats.recordItemUse({ eventId: 'use-1', actorId: 'b', itemTypeId: 'wand' });
	trace.recordContact({ projectileId: 'physical-id', targetCategory: 'wall', targetType: 'stone' });
	stats.recordWallBounce({ eventId: 'bounce-1', projectileId: 'physical-id', sourceId: 'b', itemTypeId: 'wand' });
	stats.recordHealthChange({ eventId: 'hit-1', projectileId: 'physical-id', sourceId: 'b', targetId: 'r',
		itemTypeId: 'wand', before: 100, after: 90, at: 100 });
	match.recordDeath({ lifeId: 'r-life', victimTeamId: 'red', killerTeamId: 'blue' });
	stats.recordDeath({ lifeId: 'r-life', victimId: 'r', killerId: 'b', at: 100 });
	stats.recordDeath({ lifeId: 'r-life', victimId: 'r', killerId: 'b', at: 100 });
	trace.capturePositions([{ playerId: 'b', x: 1, y: 2 }, { playerId: 'r', x: 3, y: 4 }]);
	const result = trace.finish('blue');
	assert.deepEqual(result, {
		itemUses: [{ tick: 6, actor: 'blue-1', itemTypeId: 'wand' }],
		neuralActions: [],
		contacts: [{ tick: 6, kind: 'beginContact', projectile: 'p1', target: 'wall:stone' },
			{ tick: 6, kind: 'wallBounce', projectile: 'p1', source: 'blue-1', itemTypeId: 'wand' },
			{ tick: 6, kind: 'healthHit', projectile: 'p1', target: 'red-1' }],
		healthChanges: [{ tick: 6, source: 'blue-1', target: 'red-1', before: 100, after: 90,
			itemTypeId: 'wand', projectile: 'p1' }],
		deaths: [{ tick: 6, victim: 'red-1', killer: 'blue-1' }],
		scores: [{ tick: 6, blue: 1, red: 0 }],
		winner: 'blue',
		positions: [{ tick: 6, participant: 'blue-1', x: 1, y: 2 },
			{ tick: 6, participant: 'red-1', x: 3, y: 4 }]
	});
});
