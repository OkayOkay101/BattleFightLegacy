const fs = require('node:fs');
const readline = require('node:readline');
async function main() {
	const input = fs.createReadStream('training-data/neural-state-v3/matches.jsonl');
	const lines = readline.createInterface({ input, crlfDelay: Infinity });
	const expected = [];
	for await (const line of lines) {
		if (!line.includes('"split":"selection"')) continue;
		const report = JSON.parse(line);
		if (report.evaluation?.candidateVersion === 'n-000043' && report.split === 'selection') {
			expected.push({ seed: report.seed, side: report.evaluation.candidateSide,
				opponent: report.evaluation.opponentVersion, result: report.result });
			if (expected.length === 60) break;
		}
	}
	lines.close(); input.destroy();
	const directory = 'training-data/diagnostics/transfer-042-043';
	fs.writeFileSync(directory + '/production-043-reference.json', JSON.stringify(expected, null, 2));
	const rows = fs.readdirSync(directory).filter(name => /^n-000043-/.test(name))
		.map(name => JSON.parse(fs.readFileSync(directory + '/' + name)));
	const mismatch = [];
	let matched = 0;
	for (const row of rows) {
		const reference = expected.find(entry => entry.opponent === 'n-000027' && entry.seed === row.seed && entry.side === row.side);
		if (reference && JSON.stringify(reference.result.scores) === JSON.stringify(row.result.scores) && reference.result.winner === row.result.winner) matched++;
		else mismatch.push({ seed: row.seed, side: row.side, reference: reference?.result, actual: row.result });
	}
	console.log(JSON.stringify({ productionCases: expected.length, replayed: rows.length, matched, mismatch }));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
