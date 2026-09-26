const MOVEMENTS = ['hold', 'approach', 'strafe_left', 'strafe_right', 'retreat', 'dodge', 'kite'];
const AIM_MODES = ['direct', 'lead', 'ricochet'];

function actionFeatures(targetIndex, movementIndex, slot, aimMode) {
	const features = new Float32Array(17);
	if (targetIndex >= 0 && targetIndex < 3) features[targetIndex] = 1;
	if (movementIndex >= 0 && movementIndex < MOVEMENTS.length) features[3 + movementIndex] = 1;
	if (slot !== null && slot >= 0 && slot < 4) features[10 + slot] = 1;
	const aimIndex = AIM_MODES.indexOf(aimMode);
	if (aimIndex >= 0) features[14 + aimIndex] = 1;
	return features;
}

function enumerateLegalActions(snapshot) {
	const options = [];
	const targets = (snapshot.targets || []).filter(target => target.hostile !== false).slice(0, 3);
	const hasProjectiles = Array.isArray(snapshot.projectiles) && snapshot.projectiles.length > 0;

	for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
		const target = targets[targetIndex];
		for (const weapon of (snapshot.weapons || []).slice(0, 4)) {
			if (!weapon || !weapon.ready || !Number.isInteger(weapon.slot) || weapon.slot < 0 || weapon.slot > 3) continue;
			const aimModes = [];
			if (target.distance <= weapon.range && (target.visible || weapon.canIgnoreWalls)) {
				aimModes.push('direct');
				aimModes.push('lead');
			}
			if (target.ricochetAims ? target.ricochetAims[weapon.slot] : weapon.ricochetAim) {
				aimModes.push('ricochet');
			}

			// Generate candidate movements based on situation
			const movementIndices = [1, 2, 3]; // approach, strafe_left, strafe_right
			if (target.lowHealth || target.distance < 150) movementIndices.push(4); // retreat
			if (hasProjectiles) movementIndices.push(5); // dodge
			if (weapon.range > 200) movementIndices.push(6); // kite

			for (const aimMode of aimModes) {
				for (const movementIndex of movementIndices) {
					options.push({
						legal: true,
						action: {
							targetId: target.id,
							movement: MOVEMENTS[movementIndex],
							slot: weapon.slot,
							aimMode
						},
						features: actionFeatures(targetIndex, movementIndex, weapon.slot, aimMode),
						heuristicScore: (target.lowHealth ? 2 : 0) + 1 / (1 + target.distance) +
							(aimMode === 'lead' ? 0.3 : aimMode === 'direct' ? 0.2 : 0) +
							(movementIndex === 5 ? 0.25 : 0) + (movementIndex === 6 ? 0.15 : 0)
					});
				}
			}
		}
	}

	if (!options.length) {
		const target = targets[0];
		if (!target) {
			options.push({
				legal: true,
				action: { targetId: null, movement: 'hold', slot: null, aimMode: 'direct' },
				features: actionFeatures(-1, 0, null, 'direct'),
				heuristicScore: -1
			});
		} else {
			const attackRange = Number(snapshot.self?.attackRange) || 0;
			const weaponRange = Math.max(0, ...(snapshot.weapons || []).filter(weapon => weapon?.ready)
				.map(weapon => Number(weapon.range) || 0));
			const movement = !target.visible || target.distance > Math.max(attackRange, weaponRange) ? 'approach' : 'strafe_left';
			const movementIndex = MOVEMENTS.indexOf(movement);
			options.push({
				legal: true,
				action: { targetId: target.id, movement, slot: null, aimMode: 'direct' },
				features: actionFeatures(0, movementIndex, null, 'direct'),
				heuristicScore: 0
			});
		}
	}
	return options.sort((a, b) => b.heuristicScore - a.heuristicScore).slice(0, 16);
}

module.exports = { enumerateLegalActions, actionFeatures, MOVEMENTS, AIM_MODES };
