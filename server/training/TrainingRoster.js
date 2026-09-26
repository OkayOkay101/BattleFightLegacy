const MAIN_DIALOGUES = [
	'WGLrmBwn2T', 'k96sFK3LHq', '7pfCK59OBW', 'D2HqGt1xhx',
	'MQOk6ssi3h', 'cH7x5cF5DS', 'nd4Fd6NfCQ'
];
const UNFINISHED_DIALOGUE = '2MTBou7Q3R';
const REQUESTED_UNFINISHED_UNITS = new Set([
	'xHn8XJz8XB', // Rhythm Assassin
	'h6HHaafNct', // Engineer
	'JZaENvn4qJ' // Casker
]);
const UNSCRIPTED_UNFINISHED_NAMES = ['Fleeting Dream', 'Team Spirit Breaker', 'Collective Company'];

const EXCLUDED_UNITS = new Map([
	['sarLaTkdF2', 'custom unit'],
	['McZTj7oVZ1', 'removed from training by request'], // Roboto
	['BUcKqXTF16', 'removed from training by request'], // Zaprytos
	['H6K6gpqlPE', 'removed from training by request'], // Sixth Diva
	['2GjTUKR9Bz', 'removed from training by request'] // Emo & Sky
]);

const EXISTING_PROFILES = {
	r3dZTAf1qa: { role: 'control', range: 430, slots: [1, 0, 2, 3] },
	hlnCxD3Epn: { role: 'zone', range: 330, slots: [1, 0, 2, 3] },
	Pko4SCDSlz: { role: 'melee', range: 100, slots: [0, 1, 2, 3] },
	Z60xDr0g4n: { role: 'support', range: 380, slots: [1, 0, 2, 3] },
	TRneecJl6K: { role: 'ranged', range: 500, slots: [0, 1, 2, 3] },
	AuD3DjTn9B: { role: 'melee', range: 120, slots: [0, 1, 2, 3] }
};

function createdUnitTypes(script) {
	const found = [];
	function visit(value) {
		if (!value || typeof value !== 'object') return;
		if (value.type === 'createUnitAtPosition' && value.disabled !== true && typeof value.unitType === 'string') {
			found.push(value.unitType);
		}
		for (const child of Object.values(value)) visit(child);
	}
	if (script && script.disabled !== true) visit(script.actions);
	return found;
}

function buildTrainingRoster(gameData) {
	const scripts = gameData.scripts || {};
	const dialogues = gameData.dialogues || {};
	const unitTypes = gameData.unitTypes || {};
	const excludedIds = new Map(EXCLUDED_UNITS);
	for (const option of dialogues[UNFINISHED_DIALOGUE]?.options || []) {
		for (const id of createdUnitTypes(scripts[option.scriptName])) {
			if (!REQUESTED_UNFINISHED_UNITS.has(id) && !excludedIds.has(id)) excludedIds.set(id, 'unfinished page');
		}
	}
	const eligible = [];
	const excluded = [];
	const seen = new Set();
	for (const dialogueId of MAIN_DIALOGUES) {
		for (const option of dialogues[dialogueId]?.options || []) {
			for (const id of createdUnitTypes(scripts[option.scriptName])) {
				if (seen.has(id)) continue;
				seen.add(id);
				const unit = unitTypes[id];
				const reason = excludedIds.get(id) || (!unit ? 'unit type missing' :
					!unit.attributes?.health ? 'no health attribute' :
					!Array.isArray(unit.defaultItems) || unit.defaultItems.length === 0 ? 'no starting items' : null);
				if (reason) {
					excluded.push({ id, name: unit?.name || option.name, reason });
					continue;
				}
				const existing = EXISTING_PROFILES[id];
				const weaponTypes = unit.defaultItems.map(item => gameData.itemTypes?.[item.key]).filter(Boolean);
				const ranged = weaponTypes.some(item => item.isGun && Number(item.bulletForce) > 18);
				eligible.push({
					id,
					name: unit.name,
					role: existing?.role || (ranged ? 'ranged' : 'melee'),
					range: existing?.range || (ranged ? 400 : 120),
					slots: existing?.slots || unit.defaultItems.map((_, index) => index).slice(0, 4)
				});
			}
		}
	}
	for (const [id, reason] of excludedIds) {
		if (!seen.has(id) && unitTypes[id]) excluded.push({ id, name: unitTypes[id].name, reason });
	}
	for (const name of UNSCRIPTED_UNFINISHED_NAMES) excluded.push({ id: null, name, reason: 'no selection script' });
	return { eligible, excluded };
}

module.exports = { buildTrainingRoster, EXCLUDED_UNITS };
