const FIELDS = ['policyKind', 'policyVersion', 'split', 'characterId', 'side', 'composition', 'games', 'wins', 'losses', 'draws',
	'damageDealt', 'damageTaken', 'kills', 'deaths', 'assists'];

function exportTierStats(matches) {
	const groups = new Map();
	for (const report of matches) {
		if (report?.result?.status !== 'complete' || (report.speedMode === 'max' && report.parityStatus !== 'passed')) continue;
		const players = Object.values(report.stats?.players || {});
		const characters = Object.values(report.stats?.characters || {});
		for (const player of characters.length ? characters : players) {
			if (!player.characterId || !['blue', 'red'].includes(player.teamId)) continue;
			const composition = players.filter(other => other.teamId === player.teamId).map(other => other.characterId).sort().join('+');
			const policyVersion = report.policyVersions?.[player.teamId] || report.policyVersion || 'baseline';
			const policyKind = report.policyKinds?.[player.teamId] || 'heuristic';
			const key = JSON.stringify([policyKind, policyVersion, report.split || 'train', player.characterId, player.teamId, composition]);
			if (!groups.has(key)) groups.set(key, {
				policyKind, policyVersion, split: report.split || 'train', characterId: player.characterId,
				side: player.teamId, composition, games: 0, wins: 0, losses: 0, draws: 0,
				damageDealt: 0, damageTaken: 0, kills: 0, deaths: 0, assists: 0
			});
			const row = groups.get(key);
			row.games++;
			if (!report.result.winner) row.draws++;
			else if (report.result.winner === player.teamId) row.wins++;
			else row.losses++;
			for (const field of ['damageDealt', 'damageTaken', 'kills', 'deaths', 'assists']) row[field] += Number(player[field]) || 0;
		}
	}
	return [...groups.values()].sort((a, b) =>
		[a.policyKind, a.policyVersion, a.split, a.characterId, a.side, a.composition].join(':').localeCompare(
			[b.policyKind, b.policyVersion, b.split, b.characterId, b.side, b.composition].join(':')));
}

function toCsv(rows) {
	const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
	return [FIELDS.join(','), ...rows.map(row => FIELDS.map(field => quote(row[field])).join(','))].join('\n') + '\n';
}

module.exports = { exportTierStats, toCsv, FIELDS };
