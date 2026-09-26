class TrainingMatch {
	constructor({ matchId, startedAt, maxDurationMs = 300000, trace = null }) {
		if (!matchId || !Number.isFinite(startedAt) || !Number.isFinite(maxDurationMs) || maxDurationMs <= 0) {
			throw new TypeError('Invalid training match configuration');
		}
		this.matchId = matchId;
		this.startedAt = startedAt;
		this.maxDurationMs = maxDurationMs;
		this.scores = { blue: 0, red: 0 };
		this.deadLives = new Set();
		this.result = null;
		this.trace = trace;
	}

	recordDeath({ lifeId, victimTeamId, killerTeamId }) {
		if (this.result || !lifeId || !Object.prototype.hasOwnProperty.call(this.scores, victimTeamId) || this.deadLives.has(lifeId)) return false;
		this.deadLives.add(lifeId);
		if (killerTeamId !== victimTeamId && Object.prototype.hasOwnProperty.call(this.scores, killerTeamId)) {
			this.scores[killerTeamId]++;
		}
		if (this.trace) this.trace.recordScore(this.scores);
		return true;
	}

	finish(now) {
		if (this.result) return this.result;
		if (!Number.isFinite(now) || now - this.startedAt < this.maxDurationMs) return null;
		const winner = this.scores.blue === this.scores.red ? null : (this.scores.blue > this.scores.red ? 'blue' : 'red');
		this.result = {
			matchId: this.matchId,
			winner,
			scores: { ...this.scores },
			status: 'complete',
			durationMs: now - this.startedAt
		};
		return this.result;
	}
}

module.exports = { TrainingMatch };
