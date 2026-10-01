const crypto = require('node:crypto');
const { buildTrainingRoster, EXCLUDED_UNITS } = require('./TrainingRoster');
const { getSchema } = require('./NeuralSchema');

const ROSTER_IDS = Object.freeze(buildTrainingRoster(require('../../src/game.json').data).eligible.map(entry => entry.id));
// Exactly 40 eligible characters (excluded characters completely removed)
const FEATURE_ROSTER_IDS = ROSTER_IDS;
const FEATURE_COUNT = 86; // self (5) + allies (6) + enemies (15) + projectiles 4*4 (16) + weaponReady (4) + roster (40)
const rosterHash = crypto.createHash('sha256').update(FEATURE_ROSTER_IDS.join('\n')).digest('hex');

function ordered(values) {
	if (!values || values.length <= 1) return values || [];
	return [...values].sort((a, b) => (Number(a.distance) || 0) - (Number(b.distance) || 0) ||
		String(a.id || '').localeCompare(String(b.id || '')));
}

function appendValues(output, offset, values, length) {
	for (let index = 0; index < length; index++) {
		const value = Number(values?.[index] ?? 0);
		output[offset++] = Number.isFinite(value) ? value : 0;
	}
	return offset;
}

function buildObservation(snapshot, schemaVersion = 1) {
	const output = new Float32Array(getSchema(schemaVersion).observationCount);
	const self = snapshot.self || {};
	let offset = appendValues(output, 0, [self.health, self.x, self.y, self.vx, self.vy], 5);
	const allies = ordered(snapshot.allies);
	for (let index = 0; index < 2; index++) offset = appendValues(output, offset, allies[index]?.features, 3);
	const enemies = ordered(snapshot.enemies);
	for (let index = 0; index < 3; index++) offset = appendValues(output, offset, enemies[index]?.features, 5);
	const projectiles = schemaVersion >= 3 ? (snapshot.projectiles || []) : ordered(snapshot.projectiles);
	for (let index = 0; index < 4; index++) offset = appendValues(output, offset, projectiles[index]?.features, 4);
	offset = appendValues(output, offset, snapshot.weaponReady, 4);
	const characterIndex = FEATURE_ROSTER_IDS.indexOf(self.characterId);
	for (let index = 0; index < FEATURE_ROSTER_IDS.length; index++) output[offset++] = index === characterIndex ? 1 : 0;
	if (schemaVersion >= 2) {
		const bounded = (value, minimum = 0) => Number.isFinite(Number(value)) ? Math.max(minimum, Math.min(1, Number(value))) : 0;
		for (let slot = 0; slot < 4; slot++) {
			const weapon = snapshot.weaponState?.[slot];
			for (const key of ['present', 'cooldown', 'ammoRatio', 'unlimited', 'affordability', 'range', 'speed', 'damage'])
				output[offset++] = weapon?.present ? bounded(weapon[key]) : 0;
		}
		for (let slot = 0; slot < 4; slot++) output[offset++] = snapshot.activeSlot === slot ? 1 : 0;
		for (let ray = 0; ray < 8; ray++) output[offset++] = bounded(snapshot.terrain?.[ray]);
		for (let index = 0; index < 3; index++) output[offset++] = bounded(enemies[index]?.visible ?? snapshot.enemyVisible?.[index]);
		for (const [entities, size] of [[allies, 2], [enemies, 3], [projectiles, 4]])
			for (let index = 0; index < size; index++) output[offset++] = entities[index] ? 1 : 0;
		for (const key of ['dx', 'dy', 'stuck', 'dodging']) output[offset++] = bounded(snapshot.navigation?.[key], key === 'dx' || key === 'dy' ? -1 : 0);
		for (const key of ['remaining', 'ownScore', 'enemyScore']) output[offset++] = bounded(snapshot.match?.[key]);
		if (schemaVersion >= 3) {
			for (let index = 0; index < 4; index++) {
				const threat = snapshot.dodge?.threats?.[index];
				output[offset++] = threat ? bounded(Number.isFinite(threat.collisionTime) ? threat.collisionTime / .8 : 1) : 0;
				output[offset++] = threat ? bounded(Math.max(threat.damage || 0, threat.explosionDamage || 0) / 1000) : 0;
				output[offset++] = threat ? bounded(Math.max(threat.radius || 0, threat.explosionRadius || 0) / 256) : 0;
				output[offset++] = threat ? bounded(Math.hypot(threat.velocity?.x || 0, threat.velocity?.y || 0) / 1000) : 0;
			}
			for (let direction = 0; direction < 9; direction++) output[offset++] = bounded((snapshot.dodge?.risks?.[direction] || 0) / 1000);
			for (let direction = 0; direction < 9; direction++) output[offset++] = snapshot.dodge?.candidates?.find(c => c.direction === direction)?.clear ? 1 : 0;
			output[offset++] = bounded(self.moveSpeed / 1000);
		}
	}
	return output;
}

function isAllowedTrainingDecision(decision) {
	const obs = decision?.observation || decision?.observation86 || decision?.observation82;
	let schema;
	try { schema = getSchema(decision?.schemaVersion || 1); } catch { return false; }
	if (!Array.isArray(obs) || obs.length !== schema.observationCount || !obs.every(Number.isFinite)) return false;
	if (schema.version >= 2 && (decision.schemaHash !== schema.schemaHash || !decision.environmentHash || decision.trainingProtocolVersion !== 2)) return false;
	// The character must be an eligible character (one of the 40 slots must be 1)
	const characterSlice = obs.slice(46, 46 + FEATURE_ROSTER_IDS.length);
	return characterSlice.some(val => val > 0.5);
}

module.exports = { buildObservation, FEATURE_COUNT, ROSTER_IDS, FEATURE_ROSTER_IDS, rosterHash, isAllowedTrainingDecision, ordered };
