const MOVEMENTS = ['hold', 'approach', 'strafe_left', 'strafe_right', 'retreat', 'dodge', 'kite'];
const AIM_MODES = ['direct', 'lead', 'ricochet'];
const { ordered } = require('./NeuralObservation');
const { getSchema } = require('./NeuralSchema');

function actionFeatures(targetIndex, movementIndex, slot, aimMode, schemaVersion = 1, fire = false) {
	const features = new Float32Array(getSchema(schemaVersion).actionCount);
	if (targetIndex >= 0 && targetIndex < 3) features[targetIndex] = 1;
	if (movementIndex >= 0 && movementIndex < MOVEMENTS.length) features[3 + movementIndex] = 1;
	if (slot !== null && slot >= 0 && slot < 4) features[10 + slot] = 1;
	const aimIndex = AIM_MODES.indexOf(aimMode);
	if (aimIndex >= 0) features[14 + aimIndex] = 1;
	if (schemaVersion >= 2) features[17] = fire ? 1 : 0;
	return features;
}

function enumerateLegalActions(snapshot, schemaVersion = 1) {
	if (schemaVersion === 3) return enumerateV3(snapshot);
	if (schemaVersion === 2) return enumerateV2(snapshot);
	getSchema(schemaVersion);
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

function enumerateV2(snapshot) {
	const targets = ordered((snapshot.targets || []).filter(target => target.hostile !== false)).slice(0, 3);
	const threatening = (snapshot.projectiles || []).some(projectile => projectile.threat !== false && projectile.threatening !== false);
	const movements = ['hold', 'approach', 'strafe_left', 'strafe_right', 'retreat', 'kite'];
	if (threatening) movements.push('dodge');
	const option = (targetIndex, movement, slot, aimMode, fire) => ({ legal: true,
		action: { targetId: targets[targetIndex]?.id ?? null, movement, slot, aimMode, fire },
		features: actionFeatures(targetIndex, MOVEMENTS.indexOf(movement), slot, aimMode, 2, fire), heuristicScore: 0 });
	if (!targets.length) return [option(-1, 'hold', null, 'direct', false)];
	const groups = [];
	for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
		const target = targets[targetIndex];
		for (const weapon of [...(snapshot.weapons || [])].filter(Boolean).sort((a, b) => a.slot - b.slot)) {
			if (!weapon.ready || !Number.isInteger(weapon.slot) || weapon.slot < 0 || weapon.slot > 3) continue;
			const aims = [];
			if (target.distance <= weapon.range && (target.visible || weapon.canIgnoreWalls)) aims.push('direct', 'lead');
			if (target.ricochetAims ? target.ricochetAims[weapon.slot] : weapon.ricochetAim) aims.push('ricochet');
			for (const aim of aims) groups.push(movements.map(movement => option(targetIndex, movement, weapon.slot, aim, true)));
		}
	}
	// Movement remains independent of attack availability. A ready legal shot accompanies
	// every movement; cooldown, ammo/cost and aim legality still decide when firing is possible.
	if (!groups.length) return movements.map(movement => option(0, movement, null, 'direct', false));
	const preferred = groups.find(group => group[0].action.slot === snapshot.activeSlot) || groups[0];
	const options = [...preferred];
	const key = entry => JSON.stringify(entry.action);
	const seen = new Set(options.map(key));
	for (let turn = 0; turn < movements.length && options.length < 32; turn++)
		for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
			if (options.length === 32) break;
			// Rotate movement per group so the cap preserves both group and movement coverage.
			const entry = groups[groupIndex][(turn + groupIndex) % movements.length];
			const entryKey = key(entry);
			if (!seen.has(entryKey)) { seen.add(entryKey); options.push(entry); }
		}
	return options;
}

function enumerateV3(snapshot) {
	const base = enumerateV2(snapshot);
	const upgrade = (entry, candidate) => {
		const features = new Float32Array(getSchema(3).actionCount);
		features.set(entry.features);
		const action = { ...entry.action };
		if (candidate) {
			action.movement = candidate.moving ? 'dodge' : 'hold';
			action.dodgeDirection = candidate.direction;
			features.fill(0, 3, 10);
			features[3 + MOVEMENTS.indexOf(action.movement)] = 1;
			features[18 + candidate.direction] = 1;
		}
		return { ...entry, action, features };
	};
	const danger = snapshot.dodge?.imminent || snapshot.dodge?.currentRisk > 0;
	const candidates = danger ? (snapshot.dodge?.candidates || []).filter(c => c.clear && Number.isInteger(c.direction) && c.direction >= 0 && c.direction <= 8) : [];
	const preferred = base.find(entry => entry.action.fire && entry.action.slot === snapshot.activeSlot) || base[0];
	// Explicit escape headings have reserved capacity; firing continues through the same legal shot.
	const options = candidates.map(candidate => upgrade(preferred, candidate));
	const seen = new Set(options.map(entry => JSON.stringify(entry.action)));
	for (const entry of base) {
		if (options.length >= 32) break;
		if (entry.action.movement === 'dodge' && candidates.length) continue;
		const value = upgrade(entry), key = JSON.stringify(value.action);
		if (!seen.has(key)) { seen.add(key); options.push(value); }
	}
	return options;
}

module.exports = { enumerateLegalActions, actionFeatures, MOVEMENTS, AIM_MODES };
