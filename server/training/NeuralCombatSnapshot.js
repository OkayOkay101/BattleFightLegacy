const { ordered } = require('./NeuralObservation');

function bounded(value, minimum = 0) {
	return Number.isFinite(Number(value)) ? Math.max(minimum, Math.min(1, Number(value))) : 0;
}

function teamPotential(ige, teamId) {
	const otherTeam = teamId === 'blue' ? 'red' : 'blue';
	const hp = { blue: 0, red: 0 };
	for (const unit of ige.$$ ? ige.$$('unit') : []) {
		const owner = unit.getOwner && unit.getOwner();
		const team = owner?._stats?.trainingTeamId;
		if (!['blue', 'red'].includes(team) || owner.getSelectedUnit?.() !== unit || unit._stats?.type === 'hLrbyj6dKv') continue;
		const health = unit._stats?.attributes?.health;
		if (health && health.value > 0) hp[team] += bounded(health.value / Math.max(1, health.max));
	}
	const scores = ige.training?.match?.scores || {};
	const scoreDifference = Number(scores[teamId] || 0) - Number(scores[otherTeam] || 0);
	return 0.25 * bounded(scoreDifference / 20, -1) + 0.1 * (Math.min(3, hp[teamId]) / 3 - Math.min(3, hp[otherTeam]) / 3);
}

function extendSnapshot({ ige, game, player, unit, map, tileWidth, tileHeight, now, snapshot }) {
	const state = player._battleBot || {};
	const diagonal = Math.max(1, Math.hypot(map.width * tileWidth, map.height * tileHeight));
	const weaponState = [], weapons = [];
	for (let slot = 0; slot < 4; slot++) {
		const item = unit.inventory?.getItemBySlotNumber(slot + 1);
		if (!item) { weaponState.push({ present: 0 }); continue; }
		const stats = item._stats || {};
		const unlimited = stats.quantity === null || stats.quantity === undefined;
		if (!unlimited && item._neuralInitialQuantity === undefined) item._neuralInitialQuantity = Math.max(1, Number(stats.quantity) || 0);
		const ammoRatio = unlimited ? 1 : bounded(Number(stats.quantity) / Math.max(1, Number(stats.maxQuantity) || item._neuralInitialQuantity));
		const remaining = Math.max(0, Number(stats.lastUsed || 0) + Number(stats.fireRate || 0) - now);
		let affordability = 1;
		for (const [costs, attributes] of [[stats.cost?.unitAttributes, unit._stats?.attributes],
			[stats.cost?.playerAttributes, player._stats?.attributes]]) {
			for (const [key, cost] of Object.entries(costs || {})) {
				if (Number(cost) > 0) affordability = Math.min(affordability, bounded(Number(attributes?.[key]?.value || 0) / Number(cost)));
			}
		}
		const range = game._battleBotWeaponRange(item, ige.physics);
		const speed = game._battleBotProjectileSpeed(item, ige.physics);
		const damage = Math.abs(Number(stats.damage?.unitAttributes?.health ?? item.projectileData?.damage?.unitAttributes?.health) || 0);
		weaponState.push({ present: 1, cooldown: bounded(remaining / Math.max(1, Number(stats.fireRate) || 0)),
			ammoRatio, unlimited: unlimited ? 1 : 0, affordability, range: bounded(range / diagonal),
			speed: bounded(speed / 1000), damage: bounded(damage / 1000) });
		weapons.push({ slot, ready: !!game._selectBattleBotWeapon(unit, { slots: [slot] }, 0, true, now, slot, ige.physics),
			range, canIgnoreWalls: game._battleBotIgnoresWalls(item) });
	}
	const radius = Math.max(12, Math.min(unit.width?.() || 40, unit.height?.() || 40) * 0.35);
	const terrain = Array.from({ length: 8 }, (_, index) => {
		const angle = index * Math.PI / 4;
		let clear = 0;
		for (let distance = 16; distance <= 256; distance += 16) {
			const point = { x: unit._translate.x + Math.cos(angle) * distance, y: unit._translate.y + Math.sin(angle) * distance };
			if (!unit.ai.battleBotPositionIsClear(map, tileWidth, tileHeight, point, radius)) break;
			clear = distance;
		}
		return clear / 256;
	});
	const match = ige.training?.match;
	const team = player._stats?.trainingTeamId;
	const otherTeam = team === 'blue' ? 'red' : 'blue';
	const waypoint = state.path?.[0];
	const enemies = ordered(snapshot.enemies).slice(0, 3);
	return { ...snapshot, enemies, targets: enemies, weapons, weaponState, activeSlot: unit._stats.currentItemIndex || 0, terrain,
		navigation: { dx: waypoint ? bounded((waypoint.x - unit._translate.x) / Math.max(1, map.width * tileWidth), -1) : 0,
			dy: waypoint ? bounded((waypoint.y - unit._translate.y) / Math.max(1, map.height * tileHeight), -1) : 0,
			stuck: state.stuckAt ? 1 : 0, dodging: state.dodgeUntil > now ? 1 : 0 },
		match: { remaining: match ? bounded((match.startedAt + match.maxDurationMs - now) / match.maxDurationMs) : 0,
			ownScore: bounded(Number(match?.scores?.[team] || 0) / 20), enemyScore: bounded(Number(match?.scores?.[otherTeam] || 0) / 20) } };
}

module.exports = { extendSnapshot, teamPotential };
