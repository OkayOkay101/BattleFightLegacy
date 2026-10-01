class TrainingTrajectory {
	constructor() {
		this.rows = [];
		this.policyVersion = null;
		this.rosterHash = null;
		this.metadata = null;
		this.lastByPlayer = new Map();
	}

	record(decision) {
		const obs = decision?.observation || decision?.observation86 || decision?.observation82;
		const opts = decision?.options || decision?.options17 || decision?.options13;
		const version = decision?.schemaVersion || 1;
		const schema = require('./NeuralSchema').getSchema(version);
		if (!decision || typeof decision.playerId !== 'string' || typeof decision.policyVersion !== 'string' ||
			!decision.policyVersion || typeof decision.rosterHash !== 'string' ||
			obs?.length !== schema.observationCount || !Array.isArray(opts) ||
			!opts.length || opts.length > schema.maxOptions ||
			!obs.every(Number.isFinite) || !opts.every(option => option.length === schema.actionCount && option.every(Number.isFinite)) ||
			!Number.isInteger(decision.chosenIndex) || decision.chosenIndex < 0 ||
			decision.chosenIndex >= opts.length ||
			![decision.logProb, decision.value, decision.simulatedAt].every(Number.isFinite)) {
			throw new TypeError('Invalid neural training decision');
		}
		if (version >= 2 && (!['matchId', 'lifeId', 'schemaHash', 'environmentHash'].every(key =>
			typeof decision[key] === 'string' && decision[key]) || !['blue', 'red'].includes(decision.teamId) ||
			decision.trainingProtocolVersion !== 2 || !Number.isFinite(decision.potential))) {
			throw new TypeError('Invalid neural neural training decision schema/environment/protocol metadata');
		}
		if (version >= 2 && decision.schemaHash !== schema.schemaHash) throw new Error('Trajectory schema hash is unsupported');
		const metadata = JSON.stringify([version, decision.schemaHash, decision.environmentHash, decision.trainingProtocolVersion, decision.matchId]);
		if (this.metadata && this.metadata !== metadata) throw new Error('Trajectory schema, environment, protocol or match changed');
		if (this.policyVersion && this.policyVersion !== decision.policyVersion) throw new Error('Trajectory policy version changed mid-match');
		if (this.rosterHash && this.rosterHash !== decision.rosterHash) throw new Error('Trajectory roster hash changed mid-match');
		const priorIndex = this.lastByPlayer.get(decision.playerId);
		if (priorIndex !== undefined && decision.simulatedAt <= this.rows[priorIndex].simulatedAt) throw new Error('Trajectory time must increase per player');
		this.metadata = metadata;
		this.policyVersion = decision.policyVersion;
		this.rosterHash = decision.rosterHash;
		const row = {
			...decision,
			observation: [...obs],
			options: opts.map(option => [...option]),
			requestedAction: decision.requestedAction && { ...decision.requestedAction },
			executedAction: decision.executedAction && { ...decision.executedAction },
			overrideReasons: [...(decision.overrideReasons || [])],
			reward: 0,
			done: false
		};
		if (version === 1) Object.assign(row, { observation86: [...obs], observation82: [...obs],
			options17: opts.map(option => [...option]), options13: opts.map(option => [...option]) });
		this.lastByPlayer.set(decision.playerId, this.rows.length);
		this.rows.push(row);
	}

	recordExecution(playerId, executedAction, overrideReasons = []) {
		const index = this.lastByPlayer.get(playerId);
		if (index === undefined) return;
		this.rows[index].executedAction = { ...executedAction };
		this.rows[index].overrideReasons = [...overrideReasons];
	}

	finish(result, stats, { split = 'train', speedMode = 'realtime', parityStatus = 'not-required', endedAt } = {}) {
		if (result?.status !== 'complete' || split !== 'train' ||
			(speedMode === 'max' && parityStatus !== 'passed')) return [];
		if (this.rows[0]?.schemaVersion >= 2) return this._finishV2(result, endedAt);
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

	_finishV2(result, endedAt) {
		if (!Number.isFinite(endedAt)) throw new TypeError('Neural trajectory needs a finite match end time');
		const output = this.rows.map(row => ({ ...row }));
		const players = new Map();
		for (let index = 0; index < output.length; index++) {
			const row = output[index];
			const prior = players.get(row.playerId);
			if (prior !== undefined) {
				const previous = output[prior];
				previous.nextSimulatedAt = row.simulatedAt;
				previous.reward = Math.pow(0.999, (row.simulatedAt - previous.simulatedAt) / 100) * row.potential - previous.potential;
				previous.rewardComponents = { terminal: 0, potential: previous.reward };
			}
			players.set(row.playerId, index);
		}
		for (const index of players.values()) {
			const row = output[index];
			if (endedAt < row.simulatedAt) throw new RangeError('Match end time precedes final decision');
			const terminal = result.winner === null ? 0 : result.winner === row.teamId ? 1 : -1;
			row.nextSimulatedAt = endedAt;
			row.reward = terminal - row.potential;
			row.rewardComponents = { terminal, potential: -row.potential };
			row.done = true;
		}
		return output;
	}
}

module.exports = { TrainingTrajectory };
