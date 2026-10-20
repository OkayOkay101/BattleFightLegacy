// Isolated fixed-policy evaluation; never feeds the optimizer or promotion registry.
const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const { PolicyRegistry } = require('../server/training/PolicyRegistry');
const { environmentHash, buildEnvironmentDefinition } = require('../server/training/TrainingProtocol');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'training-data', 'diagnostics', 'transfer-042-043');
fs.mkdirSync(directory, { recursive: true });
const registry = new PolicyRegistry(path.join(root, 'training-data'));
const hash = environmentHash(buildEnvironmentDefinition());
const policies = ['n-000042', 'n-000043'].map(version => registry.policy(version));
const opponent = registry.policy('n-000027');
if (policies.some(policy => policy?.weights?.environmentHash !== hash) || !opponent) throw new Error('Frozen policy/environment mismatch');
const jobs = [];
for (let index = 0; index < 10; index++) for (const side of ['blue', 'red']) for (const policy of policies)
	jobs.push({ policy, seed: 1000000090 + index, side });
const results = [];
let cursor = 0;
function compact(report, job) {
	const own = Object.values(report.stats.players).filter(player => player.teamId === job.side);
	const sum = key => own.reduce((total, player) => total + player[key], 0);
	return { version: job.policy.version, opponent: opponent.version, side: job.side, seed: job.seed,
		result: report.result, stats: { kills: sum('kills'), deaths: sum('deaths'), assists: sum('assists'),
			damageDealt: sum('damageDealt'), damageTaken: sum('damageTaken') },
		probe: report.transferProbe?.[job.policy.version], environmentHash: report.environmentHash,
		wallMs: report.wallMs, neuralError: report.neuralError };
}
function run(job) {
	return new Promise((resolve, reject) => {
		const child = fork(path.join(root, 'server/training/MatchWorker.js'), [], {
			execArgv: ['-r', path.join(__dirname, 'neural-transfer-probe.js')],
			cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
		let error = '', received = false;
		const timer = setTimeout(() => { child.kill(); reject(new Error('Diagnostic match timed out')); }, 600000);
		child.stderr.on('data', value => { error = (error + value).slice(-4000); });
		child.on('error', reject);
		child.on('message', message => {
			if (message?.type !== 'result') return;
			const report = message.report;
			if (report.neuralError || report.result.status !== 'complete' || report.environmentHash !== hash)
				return reject(new Error(report.neuralError || 'Incomplete or mismatched diagnostic'));
			received = true;
			const value = compact(report, job);
			fs.writeFileSync(path.join(directory, `${job.policy.version}-${job.seed}-${job.side}.json`), JSON.stringify(value));
			results.push(value);
			console.log(JSON.stringify({ completed: results.length, total: jobs.length, version: value.version,
				seed: value.seed, side: value.side, winner: report.result.winner, scores: report.result.scores }));
		});
		child.on('exit', code => { clearTimeout(timer); received && code === 0 ? resolve() : reject(new Error(error || `Worker exit ${code}`)); });
		child.send({ type: 'run', matchId: `diagnostic-transfer-${job.policy.version}-${job.seed}-${job.side}`,
			seed: job.seed, maxDurationMs: 300000, speedMode: 'max', parityStatus: 'passed', split: 'selection',
			phase: 'selection', candidateVersion: job.policy.version, learnerSide: job.side,
			bluePolicy: job.side === 'blue' ? job.policy : opponent, redPolicy: job.side === 'red' ? job.policy : opponent,
			schemaVersion: 3, schemaHash: job.policy.weights.schemaHash, environmentHash: hash,
			trainingProtocolVersion: 2, opponentVersion: opponent.version });
	});
}
async function main() {
	await Promise.all([0, 1].map(async () => { while (cursor < jobs.length) await run(jobs[cursor++]); }));
	fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({ scope: 'diagnostic only; no promotion or optimizer rows',
		environmentHash: hash, durationMs: 300000, opponent: opponent.version, results }, null, 2));
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
