class TrainingTrace {
	constructor(stats) {
		this.participants = new Map();
		this.projectiles = new Map();
		this.teamCounts = { blue: 0, red: 0 };
		for (const player of stats.players.values()) {
			this.participants.set(player.playerId, `${player.teamId}-${++this.teamCounts[player.teamId]}`);
		}
		this.tick = 0;
		this.itemUses = [];
		this.neuralActions = [];
		this.contacts = [];
		this.healthChanges = [];
		this.deaths = [];
		this.scores = [];
		this.positions = [];
	}

	beginStep(tick) { this.tick = tick; }
	participant(id) { return this.participants.get(id) || null; }
	projectile(id) {
		if (!id) return null;
		if (!this.projectiles.has(id)) this.projectiles.set(id, `p${this.projectiles.size + 1}`);
		return this.projectiles.get(id);
	}

	recordItemUse({ actorId, itemTypeId }) {
		this.itemUses.push({ tick: this.tick, actor: this.participant(actorId), itemTypeId });
	}

	recordNeuralAction({ actorId, chosenIndex, action }) {
		this.neuralActions.push({ tick: this.tick, actor: this.participant(actorId), choice: chosenIndex,
			slot: action.slot, movement: action.movement, aimMode: action.aimMode,
			...(typeof action.fire === 'boolean' ? { fire: action.fire } : {}),
			...(Number.isInteger(action.dodgeDirection) ? { dodgeDirection: action.dodgeDirection } : {}) });
	}

	recordContact({ projectileId, targetCategory, targetType, targetPlayerId }) {
		const participant = this.participant(targetPlayerId);
		this.contacts.push({ tick: this.tick, kind: 'beginContact', projectile: this.projectile(projectileId),
			target: participant || `${targetCategory}:${targetType || 'unknown'}` });
	}

	recordWallBounce({ projectileId, sourceId, itemTypeId }) {
		this.contacts.push({ tick: this.tick, kind: 'wallBounce', projectile: this.projectile(projectileId),
			source: this.participant(sourceId), itemTypeId });
	}

	recordHealthChange({ projectileId, sourceId, targetId, itemTypeId, before, after }) {
		const projectile = this.projectile(projectileId);
		if (projectile) this.contacts.push({ tick: this.tick, kind: 'healthHit', projectile, target: this.participant(targetId) });
		this.healthChanges.push({ tick: this.tick, source: this.participant(sourceId), target: this.participant(targetId),
			before, after, itemTypeId, projectile });
	}

	recordDeath({ victimId, killerId }) {
		this.deaths.push({ tick: this.tick, victim: this.participant(victimId), killer: this.participant(killerId) });
	}

	recordScore(scores) {
		this.scores.push({ tick: this.tick, blue: scores.blue, red: scores.red });
	}

	capturePositions(entries) {
		for (const { playerId, x, y } of entries) {
			this.positions.push({ tick: this.tick, participant: this.participant(playerId), x, y });
		}
	}

	finish(winner) {
		return { itemUses: this.itemUses, neuralActions: this.neuralActions,
			contacts: this.contacts, healthChanges: this.healthChanges,
			deaths: this.deaths, scores: this.scores, winner, positions: this.positions };
	}
}

module.exports = { TrainingTrace };
