class TrainingTrajectory {
	constructor() {
		this.rows = [];
		this.policyVersion = null;
		this.rosterHash = null;
	}

	record(decision) {
		const obs = decision?.observation || decision?.observation86 || decision?.observation82;
		const opts = decision?.options || decision?.options17 || decision?.options13;
		if (!decision || typeof decision.playerId !== 'string' || typeof decision.policyVersion !== 'string' ||
			!decision.policyVersion || typeof decision.rosterHash !== 'string' ||
			obs?.length !== 86 || !Array.isArray(opts) ||
			!opts.length || opts.length > 16 ||
			!opts.every(option => option.length === 17) ||
			!Number.isInteger(decision.chosenIndex) || decision.chosenIndex < 0 ||
			decision.chosenIndex >= opts.length ||
			![decision.logProb, decision.value, decision.simulatedAt].every(Number.isFinite)) {
			throw new TypeError('Invalid neural training decision');
		}
		if (this.policyVersion && this.policyVersion !== decision.policyVersion) throw new Error('Trajectory policy version changed mid-match');
		if (this.rosterHash && this.rosterHash !== decision.rosterHash) throw new Error('Trajectory roster hash changed mid-match');
		this.policyVersion = decision.policyVersion;
		this.rosterHash = decision.rosterHash;
		this.rows.push({
			...decision,
			observation: [...obs],
			observation86: [...obs],
			observation82: [...obs],
			options: opts.map(option => [...option]),
			options17: opts.map(option => [...option]),
			options13: opts.map(option => [...option]),
			reward: 0,
			done: false
		});
	}

	finish(result, stats, { split = 'train', speedMode = 'realtime', parityStatus = 'not-required' } = {}) {
		if (result?.status !== 'complete' || split !== 'train' ||
			(speedMode === 'max' && parityStatus !== 'passed')) return [];
		const lastByPlayer = new Map();
		for (let index = 0; index < this.rows.length; index++) lastByPlayer.set(this.rows[index].playerId, index);
		const output = this.rows.map(row => ({ ...row }));
		for (const [playerId, index] of lastByPlayer) {
			const player = stats?.players?.[playerId];
			if (!player) continue;
			const outcome = result.winner === null ? 0 : result.winner === player.teamId ? 1 : -1;
			const shaping = Math.max(-0.1, Math.min(0.1,
				(Number(player.damageDealt || 0) - Number(player.damageTaken || 0)) / 1000 + Number(player.assists || 0) * 0.01));
			output[index].reward = outcome + shaping;
			output[index].done = true;
		}
		return output;
	}
}

module.exports = { TrainingTrajectory };
