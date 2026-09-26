const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingMatch } = require('../server/training/TrainingMatch');

test('one death awards the opposing team once even when the event repeats', () => {
	const match = new TrainingMatch({ matchId: 'm1', startedAt: 0 });
	assert.equal(match.recordDeath({ lifeId: 'u1', victimTeamId: 'red', killerTeamId: 'blue', at: 100 }), true);
	assert.equal(match.recordDeath({ lifeId: 'u1', victimTeamId: 'red', killerTeamId: 'blue', at: 101 }), false);
	assert.deepEqual(match.scores, { blue: 1, red: 0 });
});

test('suicide and environment deaths never award the other team', () => {
	const match = new TrainingMatch({ matchId: 'm2', startedAt: 0 });
	match.recordDeath({ lifeId: 'u1', victimTeamId: 'red', killerTeamId: 'red', at: 100 });
	match.recordDeath({ lifeId: 'u2', victimTeamId: 'blue', killerTeamId: null, at: 100 });
	assert.deepEqual(match.scores, { blue: 0, red: 0 });
});

test('match finishes at five minutes from one team score source', () => {
	const match = new TrainingMatch({ matchId: 'm3', startedAt: 0 });
	match.recordDeath({ lifeId: 'u1', victimTeamId: 'red', killerTeamId: 'blue', at: 100 });
	match.recordDeath({ lifeId: 'u2', victimTeamId: 'red', killerTeamId: 'blue', at: 200 });
	match.recordDeath({ lifeId: 'u3', victimTeamId: 'blue', killerTeamId: 'red', at: 300 });
	assert.equal(match.finish(299999), null);
	assert.deepEqual(match.finish(300000), { matchId: 'm3', winner: 'blue', scores: { blue: 2, red: 1 }, status: 'complete', durationMs: 300000 });
});

test('a tie is a draw and unknown participants cannot score', () => {
	const match = new TrainingMatch({ matchId: 'm4', startedAt: 0 });
	assert.equal(match.recordDeath({ lifeId: 'ghost', victimTeamId: undefined, killerTeamId: 'blue', at: 10 }), false);
	assert.deepEqual(match.finish(300000), { matchId: 'm4', winner: null, scores: { blue: 0, red: 0 }, status: 'complete', durationMs: 300000 });
});
