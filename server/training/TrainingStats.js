class TrainingStats {
	constructor() {
		this.players = new Map();
		this.weapons = new Map();
		this.seenEvents = new Set();
		this.deadLives = new Set();
		this.recentDamage = new Map();
		this.characters = new Map();
		this.activeLives = new Map();
		this.seenLives = new Set();
		this.projectiles = new Map();
	}

	registerPlayer({ playerId, teamId, characterId = null }) {
		if (!playerId || !['blue', 'red'].includes(teamId)) throw new TypeError('Invalid training participant');
		this.players.set(playerId, { playerId, teamId, characterId, kills: 0, deaths: 0, assists: 0, damageDealt: 0, damageTaken: 0 });
	}

	startLife({ playerId, lifeId, characterId }) {
		const player = this.players.get(playerId);
		if (!player || !lifeId || !characterId || this.seenLives.has(lifeId)) return false;
		this.seenLives.add(lifeId);
		player.characterId = characterId;
		this.activeLives.set(playerId, { lifeId, characterId });
		const key = `${playerId}:${characterId}`;
		if (!this.characters.has(key)) this.characters.set(key, {
			playerId, teamId: player.teamId, characterId, lives: 0, kills: 0, deaths: 0,
			assists: 0, damageDealt: 0, damageTaken: 0
		});
		this.characters.get(key).lives++;
		return true;
	}

	activeCharacter(playerId) {
		const life = this.activeLives.get(playerId);
		return life && this.characters.get(`${playerId}:${life.characterId}`);
	}

	weapon(actorId, itemTypeId) {
		const key = `${actorId}:${itemTypeId}`;
		if (!this.weapons.has(key)) this.weapons.set(key, { actorId, itemTypeId, uses: 0, hits: 0,
			damage: 0, wallBounces: 0, ricochetHits: 0, ricochetDamage: 0 });
		return this.weapons.get(key);
	}

	recordWallBounce({ eventId, projectileId, sourceId, itemTypeId }) {
		if (!eventId || !projectileId || !this.players.has(sourceId) || this.seenEvents.has(`bounce:${eventId}`)) return false;
		this.seenEvents.add(`bounce:${eventId}`);
		const projectile = this.projectiles.get(projectileId) || { sourceId, itemTypeId, wallBounces: 0 };
		projectile.wallBounces++;
		this.projectiles.set(projectileId, projectile);
		if (itemTypeId) this.weapon(sourceId, itemTypeId).wallBounces++;
		if (this.trace) this.trace.recordWallBounce({ projectileId, sourceId, itemTypeId });
		return true;
	}

	recordItemUse({ eventId, actorId, itemTypeId }) {
		if (!eventId || !this.players.has(actorId) || !itemTypeId || this.seenEvents.has(`use:${eventId}`)) return false;
		this.seenEvents.add(`use:${eventId}`);
		this.weapon(actorId, itemTypeId).uses++;
		if (this.trace) this.trace.recordItemUse({ actorId, itemTypeId });
		return true;
	}

	recordHealthChange({ eventId, projectileId, sourceId, targetId, itemTypeId, before, after, at }) {
		if (!eventId || this.seenEvents.has(`health:${eventId}`)) return 0;
		this.seenEvents.add(`health:${eventId}`);
		const target = this.players.get(targetId);
		const source = this.players.get(sourceId);
		const damage = Math.max(0, Number(before) - Number(after));
		if (!target || !Number.isFinite(damage) || damage <= 0) return 0;
		if (this.trace) this.trace.recordHealthChange({ projectileId, sourceId, targetId, itemTypeId, before, after });
		target.damageTaken += damage;
		const targetCharacter = this.activeCharacter(targetId);
		if (targetCharacter) targetCharacter.damageTaken += damage;
		if (source && source !== target && source.teamId !== target.teamId) {
			source.damageDealt += damage;
			const sourceCharacter = this.activeCharacter(sourceId);
			if (sourceCharacter) sourceCharacter.damageDealt += damage;
			const projectile = this.projectiles.get(projectileId);
			const effectiveItemTypeId = itemTypeId || projectile?.itemTypeId;
			if (effectiveItemTypeId) {
				const weapon = this.weapon(sourceId, effectiveItemTypeId);
				weapon.hits++;
				weapon.damage += damage;
				if (projectile?.wallBounces && projectile.sourceId === sourceId) {
					weapon.ricochetHits++;
					weapon.ricochetDamage += damage;
				}
			}
			const recent = this.recentDamage.get(targetId) || new Map();
			recent.set(sourceId, { at, characterId: this.activeLives.get(sourceId)?.characterId });
			this.recentDamage.set(targetId, recent);
		}
		return damage;
	}

	recordDeath({ lifeId, victimId, killerId, at }) {
		const victim = this.players.get(victimId);
		if (!lifeId || !victim || this.deadLives.has(lifeId)) return false;
		this.deadLives.add(lifeId);
		victim.deaths++;
		const victimLife = this.activeLives.get(victimId);
		if (victimLife?.lifeId === lifeId) {
			const character = this.activeCharacter(victimId);
			if (character) character.deaths++;
			this.activeLives.delete(victimId);
		}
		const killer = this.players.get(killerId);
		if (killer && killer !== victim && killer.teamId !== victim.teamId) {
			killer.kills++;
			const character = this.activeCharacter(killerId);
			if (character) character.kills++;
		}
		const recent = this.recentDamage.get(victimId);
		if (recent) {
			for (const [sourceId, damageEvent] of recent) {
				const damageAt = typeof damageEvent === 'number' ? damageEvent : damageEvent.at;
				const source = this.players.get(sourceId);
				if (source && source !== killer && source.teamId !== victim.teamId && at - damageAt <= 10000 && at >= damageAt) {
					source.assists++;
					const characterId = damageEvent.characterId;
					const character = characterId && this.characters.get(`${sourceId}:${characterId}`);
					if (character) character.assists++;
				}
			}
		}
		this.recentDamage.delete(victimId);
		if (this.trace) this.trace.recordDeath({ victimId, killerId });
		return true;
	}

	finish() {
		return { players: Object.fromEntries(this.players), characters: Object.fromEntries(this.characters),
			weapons: Object.fromEntries(this.weapons) };
	}
}

module.exports = { TrainingStats };
