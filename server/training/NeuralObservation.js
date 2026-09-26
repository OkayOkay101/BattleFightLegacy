const crypto = require('node:crypto');
const { buildTrainingRoster, EXCLUDED_UNITS } = require('./TrainingRoster');

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

function buildObservation(snapshot) {
	const output = new Float32Array(FEATURE_COUNT);
	const self = snapshot.self || {};
	let offset = appendValues(output, 0, [self.health, self.x, self.y, self.vx, self.vy], 5);
	const allies = ordered(snapshot.allies);
	for (let index = 0; index < 2; index++) offset = appendValues(output, offset, allies[index]?.features, 3);
	const enemies = ordered(snapshot.enemies);
	for (let index = 0; index < 3; index++) offset = appendValues(output, offset, enemies[index]?.features, 5);
	const projectiles = ordered(snapshot.projectiles);
	for (let index = 0; index < 4; index++) offset = appendValues(output, offset, projectiles[index]?.features, 4);
	offset = appendValues(output, offset, snapshot.weaponReady, 4);
	const characterIndex = FEATURE_ROSTER_IDS.indexOf(self.characterId);
	for (let index = 0; index < FEATURE_ROSTER_IDS.length; index++) output[offset++] = index === characterIndex ? 1 : 0;
	return output;
}

function isAllowedTrainingDecision(decision) {
	const obs = decision?.observation || decision?.observation86 || decision?.observation82;
	if (!Array.isArray(obs) || obs.length !== FEATURE_COUNT) return false;
	// The character must be an eligible character (one of the 40 slots must be 1)
	const characterSlice = obs.slice(46, 46 + FEATURE_ROSTER_IDS.length);
	return characterSlice.some(val => val > 0.5);
}

module.exports = { buildObservation, FEATURE_COUNT, ROSTER_IDS, FEATURE_ROSTER_IDS, rosterHash, isAllowedTrainingDecision };
