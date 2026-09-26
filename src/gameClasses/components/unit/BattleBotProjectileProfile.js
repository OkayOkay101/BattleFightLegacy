function scriptedProjectile(item) {
	const found = [];
	function visit(value) {
		if (!value || typeof value !== 'object') return;
		if (value.type === 'createProjectileAtPosition' && typeof value.projectileType === 'string') found.push(value);
		for (const child of Object.values(value)) visit(child);
	}
	for (const script of Object.values(item.scripts || {})) {
		if (script.disabled || !(script.triggers || []).some(trigger => trigger.type === 'itemIsUsed')) continue;
		visit(script.actions);
	}
	return found[0] || null;
}

function resolveProjectileProfile(item, getProjectileType, scaleRatio = 30) {
	if (!item) return null;
	const action = scriptedProjectile(item);
	const typeId = action?.projectileType || item.projectileType || null;
	const projectile = typeId ? getProjectileType(typeId) : item.defaultProjectile;
	if (!projectile) return null;
	const body = projectile.bodies && Object.values(projectile.bodies)[0];
	const fixture = body?.fixtures?.[0];
	const restitution = Number(fixture?.restitution) || 0;
	const canBounceWall = !!(body?.collidesWith?.walls && projectile.destroyOnContactWith?.walls === false && restitution > 0);
	const force = Number(action?.force ?? item.bulletForce);
	return { typeId, lifeSpanMs: Number(projectile.lifeSpan) || 0, wallBounceRestitution: restitution,
		canBounceWall, speedPxPerSecond: force > 0 ? force * scaleRatio : 0 };
}

module.exports = { resolveProjectileProfile };
