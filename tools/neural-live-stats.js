// Read-only aggregate of complete side-swapped production evaluation pairs.
const fs = require('node:fs');
const readline = require('node:readline');
async function main() {
	const status = JSON.parse(fs.readFileSync('training-data/status.json'));
	const version = process.argv[2] || status.candidateVersion;
	const file = 'training-data/neural-state-v3/matches.jsonl';
	const size = fs.statSync(file).size;
	const input = fs.createReadStream(file, { end: size - 1 });
	const lines = readline.createInterface({ input, crlfDelay: Infinity });
	const pairs = new Map();
	for await (const line of lines) {
		if (!line.includes('"split":"selection"')) continue;
		let report; try { report = JSON.parse(line); } catch { continue; }
		if (report.evaluation?.candidateVersion !== version || report.split !== 'selection' || report.result?.status !== 'complete') continue;
		const key = report.evaluation.opponentVersion + ':' + report.evaluation.pairIndex;
		const pair = pairs.get(key) || new Map();
		pair.set(report.evaluation.candidateSide, report); pairs.set(key, pair);
	}
	const groups = {};
	function empty() { return { games: 0, wins: 0, draws: 0, losses: 0, kills: 0, deaths: 0, assists: 0,
		damageDealt: 0, damageTaken: 0, opponentDamageDealt: 0, opponentDamageTaken: 0,
		opponentKills: 0, opponentDeaths: 0, opponentAssists: 0, itemUses: 0, healthHits: 0 }; }
	for (const pair of pairs.values()) {
		if (pair.size !== 2) continue;
		for (const report of pair.values()) {
			const group = groups[report.evaluation.opponentVersion] ||= empty();
			group.games++;
			const side = report.evaluation.candidateSide;
			if (!report.result.winner) group.draws++; else if (report.result.winner === side) group.wins++; else group.losses++;
			const own = new Set();
			for (const player of Object.values(report.stats.players)) {
				if (player.teamId === side) {
					own.add(player.playerId);
					for (const key of ['kills', 'deaths', 'assists', 'damageDealt', 'damageTaken']) group[key] += player[key] || 0;
				} else for (const key of ['kills', 'deaths', 'assists', 'damageDealt', 'damageTaken'])
					group['opponent' + key[0].toUpperCase() + key.slice(1)] += player[key] || 0;
			}
			for (const weapon of Object.values(report.stats.weapons || {})) if (own.has(weapon.actorId)) {
				group.itemUses += weapon.uses || 0; group.healthHits += weapon.hits || 0;
			}
		}
	}
	const total = empty();
	for (const group of Object.values(groups)) for (const key of Object.keys(total)) total[key] += group[key];
	for (const group of [...Object.values(groups), total]) {
		group.winRate = group.games ? group.wins / group.games : null;
		group.kda = group.deaths ? (group.kills + group.assists) / group.deaths : null;
		group.opponentKda = group.opponentDeaths ? (group.opponentKills + group.opponentAssists) / group.opponentDeaths : null;
		group.damageRatio = group.damageTaken ? group.damageDealt / group.damageTaken : null;
	}
	console.log(JSON.stringify({ version, checkedAt: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false }),
		scope: 'production selection only, completed side-swapped pairs; no training or diagnostic matches', groups, total }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
