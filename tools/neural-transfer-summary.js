const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../training-data/diagnostics/transfer-042-043');
const rows = fs.readdirSync(directory).filter(name => /^n-00004[23]-\d+-(blue|red)\.json$/.test(name))
	.map(name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
const summary = {};
for (const version of ['n-000042', 'n-000043']) {
	const selected = rows.filter(row => row.version === version);
	const sum = (key, object) => selected.reduce((total, row) => total + (row[object]?.[key] || 0), 0);
	const counts = {};
	const movements = {};
	for (const row of selected) for (const [direction, count] of Object.entries(row.probe.directions))
		counts[direction] = (counts[direction] || 0) + count;
	for (const row of selected) for (const [movement, count] of Object.entries(row.probe.movements))
		movements[movement] = (movements[movement] || 0) + count;
	const wins = selected.filter(row => row.result.winner === row.side).length;
	const draws = selected.filter(row => !row.result.winner).length;
	const ownScores = selected.reduce((total, row) => total + row.result.scores[row.side], 0);
	const enemyScores = selected.reduce((total, row) => total + row.result.scores[row.side === 'blue' ? 'red' : 'blue'], 0);
	summary[version] = { matches: selected.length, wins, draws, losses: selected.length - wins - draws,
		winRate: selected.length ? wins / selected.length : null,
		averageScore: selected.length ? ownScores / selected.length : null,
		averageOpponentScore: selected.length ? enemyScores / selected.length : null,
		kills: sum('kills', 'stats'), deaths: sum('deaths', 'stats'), assists: sum('assists', 'stats'),
		damageDealt: sum('damageDealt', 'stats'), damageTaken: sum('damageTaken', 'stats'),
		decisions: sum('decisions', 'probe'), shootable: sum('shootable', 'probe'), fired: sum('fired', 'probe'),
		dangerDecisions: sum('dangerDecisions', 'probe'), explicitEscapes: sum('explicitEscapes', 'probe'),
		escapesAboveBestRisk: sum('unsafeEscapes', 'probe'), directions: counts, movements };
	const value = summary[version];
	value.kda = value.deaths ? (value.kills + value.assists) / value.deaths : null;
	value.meanDamageDealt = selected.length ? value.damageDealt / selected.length : null;
	value.meanDamageTaken = selected.length ? value.damageTaken / selected.length : null;
	value.leftStrafeFraction = value.decisions ? (movements.strafe_left || 0) / value.decisions : null;
}
const comparisons = [];
for (const before of rows.filter(row => row.version === 'n-000042')) {
	const after = rows.find(row => row.version === 'n-000043' && row.seed === before.seed && row.side === before.side);
	if (after) comparisons.push({ seed: before.seed, side: before.side,
		scoreMarginBefore: before.result.scores[before.side] - before.result.scores[before.side === 'blue' ? 'red' : 'blue'],
		scoreMarginAfter: after.result.scores[after.side] - after.result.scores[after.side === 'blue' ? 'red' : 'blue'],
		damageBefore: before.stats.damageDealt, damageAfter: after.stats.damageDealt });
}
const output = { totalCompleted: rows.length, expected: 40, durationMs: 300000, opponent: 'n-000027',
	scope: 'diagnostic fixed-policy evaluation only; no optimizer or promotion use', summary, comparisons };
const pairedSeeds = [...new Set(comparisons.map(row => row.seed))].map(seed => comparisons.filter(row => row.seed === seed))
	.filter(pair => pair.length === 2);
if (pairedSeeds.length) {
	const changes = pairedSeeds.map(pair => pair.reduce((total, row) => total + row.scoreMarginAfter - row.scoreMarginBefore, 0) / 2);
	let state = 7;
	const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
	const samples = Array.from({ length: 2000 }, () => changes.reduce(total => total + changes[Math.floor(random() * changes.length)], 0) / changes.length)
		.sort((a, b) => a - b);
	output.scoreMarginChange = { completeSideSwappedSeedPairs: changes.length,
		meanAfterMinusBefore: changes.reduce((sum, value) => sum + value, 0) / changes.length,
		bootstrap90PercentInterval: [samples[100], samples[1899]], resamples: 2000,
		scope: 'seed-cluster bootstrap; small diagnostic sample, not a promotion gate' };
}
fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output));
