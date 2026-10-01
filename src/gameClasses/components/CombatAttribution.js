// Server-only combat identity snapshots survive entity removal and character changes.
function participant(player, unit) {
	if (!player || !player.id || !player._stats) return null;
	return { id: player.id(), name: player._stats.name,
		teamId: player._stats.trainingTeamId || player._stats.teamId,
		characterId: unit && unit._stats && unit._stats.type || null };
}

function fromEntity(ige, entity, itemId) {
	if (!entity) return null;
	if (entity._category === 'projectile') {
		if (entity._combatSource) return { ...entity._combatSource, projectileId: entity.id() };
		const source = fromEntity(ige, ige.$(entity._stats.sourceUnitId), entity._stats.sourceItemId);
		return source && { ...source, projectileId: entity.id() };
	}
	if (entity._category === 'item') return fromEntity(ige, entity.getOwnerUnit && entity.getOwnerUnit(), entity.id());
	const owner = entity.getOwner && entity.getOwner();
	const person = participant(owner, entity);
	if (!person) return null;
	const item = itemId && ige.$(itemId);
	return { unitId: entity.id(), participant: person, itemId,
		itemTypeId: item && item._stats && item._stats.itemTypeId };
}

function forScript(ige, vars) {
	const by = vars && vars.triggeredBy || {};
	const projectile = by.projectileId && ige.$(by.projectileId);
	return fromEntity(ige, projectile || vars && vars.thisEntity || ige.$(by.attackingUnitId || by.unitId), by.itemId);
}

function forHealthChange(ige, unit) {
	if (unit._combatDamageContext) return unit._combatDamageContext;
	const projectileId = ige.game && ige.game.currentProjectileId || ige.training && ige.training.currentProjectileId;
	return projectileId && fromEntity(ige, ige.$(projectileId)) || null;
}

module.exports = { participant, fromEntity, forScript, forHealthChange };
