const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { TrainingStore } = require('./TrainingStore');
const { isAllowedTrainingDecision } = require('./NeuralObservation');
const { PolicyRegistry } = require('./PolicyRegistry');
const { mutatePolicy, pairedLowerBound, candidateScore } = require('./HeuristicPolicy');
const { NeuralTrainer } = require('./NeuralTrainer');
const { canPromoteNeural } = require('./NeuralPromotion');

function workerCount(requested, available = os.availableParallelism()) {
	const count = requested === undefined ? Math.min(4, Math.max(1, available - 1)) : Number(requested);
	if (!Number.isInteger(count) || count < 1 || count > 8) throw new RangeError('workers must be 1..8');
	return count;
}

class TrainingSupervisor {
	constructor({ dataDir, workers, maxMatches = Infinity, maxDurationMs = 300000,
		runId = crypto.randomUUID(), workerFactory = fork, speedMode = 'realtime', parityStatus = 'not-required',
		mode = 'heuristic', neuralMinimumDecisions = 8192, pythonExecutable } = {}) {
		if (!['realtime', 'max'].includes(speedMode)) throw new RangeError('Invalid training speed mode');
		if (!['heuristic', 'neural'].includes(mode)) throw new RangeError('Invalid training mode');
		if (speedMode === 'max' && parityStatus !== 'passed') throw new Error('Accelerated training requires passed parity');
		this.store = new TrainingStore(dataDir || path.resolve(__dirname, '../../training-data'));
		this.registry = new PolicyRegistry(this.store.directory);
		this.mode = mode;
		if (mode === 'neural') {
			this.neuralStore = new TrainingStore(path.join(this.store.directory, 'neural-state'));
			this.trainer = new NeuralTrainer({ dataDir: this.store.directory, minimumDecisions: neuralMinimumDecisions,
				pythonExecutable });
			this.phase = 'train';
			this.phaseIndex = 0;
			this.neuralPending = [];
			this.transitioning = false;
		}
		this.workers = workerCount(workers);
		this.maxMatches = maxMatches;
		this.maxDurationMs = maxDurationMs;
		this.runId = runId;
		this.workerFactory = workerFactory;
		this.speedMode = speedMode;
		this.parityStatus = parityStatus;
		this.nextIndex = 0;
		this.dispatched = 0;
		this.outcomes = {};
		this.persisting = Promise.resolve();
		this.completed = 0;
		this.completedSimulatedMs = 0;
		this.failed = 0;
		this.active = new Map();
		this.retries = [];
		this.stopRequested = false;
		this.startedAt = null;
	}

	status() {
		const elapsedMs = this.startedAt === null ? 0 : Date.now() - this.startedAt;
		const completedPairs = Object.values(this.outcomes).filter(pair => 0 in pair && 1 in pair &&
			pair.every(Number.isFinite));
		const candidateValidationGames = completedPairs.length * 2;
		const candidateValidationWinRate = candidateValidationGames ?
			completedPairs.reduce((sum, pair) => sum + pair[0] + pair[1], 0) / candidateValidationGames : null;
		return { runId: this.runId, workers: this.workers, active: this.active.size,
			mode: this.mode, phase: this.phase || null, pendingDecisions: this.neuralPending?.length || 0,
			speedMode: this.speedMode, parityStatus: this.parityStatus,
			completed: this.completed, failed: this.failed, stopRequested: this.stopRequested,
			simulatedMs: this.completedSimulatedMs,
			simulatedSecondsPerWallSecond: elapsedMs > 0 ? this.completedSimulatedMs / elapsedMs : 0,
			championVersion: this.champion?.version || 'baseline', candidateVersion: this.candidate?.version || null,
			validationPairs: completedPairs.length, candidateValidationGames, candidateValidationWinRate,
			elapsedMs };
	}

	async _initialize() {
		if (this.mode === 'neural') return this._initializeNeural();
		this.champion = this.registry.policy(this.registry.status().championVersion) || this.registry.policy('baseline');
		const checkpoint = await this.store.loadCheckpoint();
		if (checkpoint?.kind === 'heuristic-evaluation' && checkpoint.championVersion === this.champion.version &&
			Number.isInteger(checkpoint.nextIndex) && checkpoint.nextIndex >= 0) {
			this.candidate = this.registry.policy(checkpoint.candidateVersion);
			if (this.candidate) {
				this.nextIndex = checkpoint.nextIndex;
				this.outcomes = checkpoint.outcomes || {};
			}
		}
		if (!this.candidate) this._newCandidate();
		await this._saveEvaluation();
	}

	async _initializeNeural() {
		this.champion = this.registry.policy(this.registry.status().championVersion) || this.registry.policy('baseline');
		this.candidate = await this.trainer.initialize();
		const checkpoint = await this.neuralStore.loadCheckpoint();
		if (checkpoint?.kind === 'neural-evaluation' && checkpoint.candidateVersion === this.candidate.version) {
			this.phase = checkpoint.phase === 'validation' ? 'validation' : 'train';
			this.phaseIndex = Number.isInteger(checkpoint.phaseIndex) ? checkpoint.phaseIndex : 0;
			this.outcomes = checkpoint.outcomes || {};
		}
		if (this.phase === 'validation') this.outcomes = {};
		await this.store.scanMatches(report => {
			if (report.evaluation?.candidateVersion !== this.candidate.version ||
				(report.speedMode === 'max' && report.parityStatus !== 'passed')) return;
			if (this.phase === 'train' && report.split === 'train') {
				this.neuralPending.push(...(report.trajectory || []).filter(isAllowedTrainingDecision));
			} else if (this.phase === 'validation' && report.split === 'validation') {
				const pair = this.outcomes[report.evaluation.pairIndex] ||
					(this.outcomes[report.evaluation.pairIndex] = []);
				pair[report.evaluation.candidateSide === 'blue' ? 0 : 1] =
					candidateScore(report.result.winner, report.evaluation.candidateSide);
			}
		});
		if (this.phase === 'validation') {
			const limit = (this.champion.version === 'baseline' ? 30 : 60) * 2;
			this.phaseIndex = Array.from({ length: limit }, (_, index) => index)
				.find(index => !Number.isFinite(this.outcomes[Math.floor(index / 2)]?.[index % 2])) ?? limit;
		}
		await this._saveEvaluation();
	}

	_newCandidate() {
		const version = `h-${crypto.randomUUID().slice(0, 12)}`;
		this.candidate = mutatePolicy(this.champion, this.nextIndex + 7, version);
		this.registry.savePolicy(this.candidate);
		this.outcomes = {};
	}

	_saveEvaluation() {
		if (this.mode === 'neural') return this.neuralStore.saveCheckpoint({ kind: 'neural-evaluation',
			championVersion: this.champion.version, candidateVersion: this.candidate.version,
			phase: this.phase, phaseIndex: this.phaseIndex, outcomes: this.outcomes });
		return this.store.saveCheckpoint({ kind: 'heuristic-evaluation', championVersion: this.champion.version,
			candidateVersion: this.candidate.version, nextIndex: this.nextIndex, outcomes: this.outcomes });
	}

	_nextJob() {
		if (this.retries.length) return this.retries.shift();
		if (this.stopRequested || this.dispatched >= this.maxMatches) return null;
		if (this.mode === 'neural') return this._nextNeuralJob();
		const index = this.nextIndex++;
		this.dispatched++;
		const pair = Math.floor(index / 2);
		const sideSwap = index % 2 === 1;
		return { type: 'run', matchId: `${this.runId}-${index}`, seed: pair + 1,
			speedMode: this.speedMode, parityStatus: this.parityStatus,
			sideSwap, split: pair % 5 === 4 ? 'validation' : 'train',
			bluePolicy: sideSwap ? this.champion : this.candidate,
			redPolicy: sideSwap ? this.candidate : this.champion,
			candidateVersion: this.candidate.version, pairIndex: pair,
			maxDurationMs: this.maxDurationMs, attempts: 0 };
	}

	_nextNeuralJob() {
		if (this.phase === 'train' && this.neuralPending.length >= this.trainer.minimumDecisions) return null;
		const validationPairs = this.champion.version === 'baseline' ? 30 : 60;
		while (this.phase === 'validation' && this.phaseIndex < validationPairs * 2 &&
			Number.isFinite(this.outcomes[Math.floor(this.phaseIndex / 2)]?.[this.phaseIndex % 2])) this.phaseIndex++;
		const pairIndex = Math.floor(this.phaseIndex / 2);
		if (this.phase === 'validation' && pairIndex >= validationPairs) return null;
		const sideSwap = this.phaseIndex % 2 === 1;
		const opponentVersion = this.phase === 'validation' && pairIndex >= 30 ?
			(this.registry.status().previousVersion || 'baseline') : this.champion.version;
		const opponent = this.registry.policy(opponentVersion) || this.registry.policy('baseline');
		const index = this.phaseIndex++;
		this.dispatched++;
		return { type: 'run', matchId: `neural-${this.candidate.version}-${this.phase}-${index}`, seed: pairIndex + 1,
			speedMode: this.speedMode, parityStatus: this.parityStatus, sideSwap,
			split: this.phase === 'validation' ? 'validation' : 'train',
			bluePolicy: sideSwap ? opponent : this.candidate,
			redPolicy: sideSwap ? this.candidate : opponent,
			candidateVersion: this.candidate.version, opponentVersion: opponent.version,
			pairIndex, maxDurationMs: this.maxDurationMs, attempts: 0 };
	}

	async start({ onReady } = {}) {
		if (this.startedAt !== null) throw new Error('Training supervisor is already running');
		await this._initialize();
		this.startedAt = Date.now();
		if (onReady) await onReady(this.status());
		return new Promise((resolve, reject) => {
			this._resolve = resolve;
			this._reject = reject;
			this._pump();
		});
	}

	stop({ abortActive = false } = {}) {
		this.stopRequested = true;
		if (abortActive) for (const { child } of this.active.values()) child.kill();
		this._pump();
	}

	_pump() {
		if (!this._resolve) return;
		if (this.mode === 'neural' && !this.transitioning && !this.stopRequested && this.active.size === 0) {
			const batchReady = this.phase === 'train' && this.neuralPending.length >= this.trainer.minimumDecisions;
			const validationReady = this.phase === 'validation' && this._neuralValidationComplete();
			if (batchReady || validationReady) {
				this.transitioning = true;
				this._advanceNeural().then(() => { this.transitioning = false; this._pump(); }, error => this._fail(error));
				return;
			}
		}
		while (!this.stopRequested && this.active.size < this.workers) {
			const job = this._nextJob();
			if (!job) break;
			this._launch(job);
		}
		if (this.active.size === 0 && !this.transitioning &&
			(this.stopRequested || this.dispatched >= this.maxMatches) && this.retries.length === 0) {
			const resolve = this._resolve;
			this._resolve = null;
			resolve(this.status());
		}
	}

	_neuralValidationComplete() {
		const required = this.champion.version === 'baseline' ? 30 : 60;
		return Array.from({ length: required }, (_, index) => this.outcomes[index])
			.every(pair => pair && 0 in pair && 1 in pair);
	}

	async _advanceNeural() {
		if (this.phase === 'train') {
			this.candidate = await this.trainer.train(this.neuralPending);
			this.neuralPending = [];
			this.phase = 'validation';
			this.phaseIndex = 0;
			this.outcomes = {};
		} else {
			const championPairs = Array.from({ length: 30 }, (_, index) => this.outcomes[index]);
			const archivedPairs = this.champion.version === 'baseline' ? null :
				Array.from({ length: 30 }, (_, index) => this.outcomes[index + 30]);
			if (this.registry.policy(this.candidate.version) && canPromoteNeural({ championPairs,
				archivedPairs, parityPassed: this.speedMode !== 'max' || this.parityStatus === 'passed' })) {
				this.registry.promote(this.candidate.version);
				this.champion = this.candidate;
			}
			this.phase = 'train';
			this.phaseIndex = 0;
			this.outcomes = {};
		}
		await this._saveEvaluation();
	}

	_launch(job) {
		const child = this.workerFactory(path.join(__dirname, 'MatchWorker.js'), [], {
			stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true
		});
		this.active.set(child.pid, { child, job });
		let settled = false;
		let errorText = '';
		child.stderr?.on('data', chunk => { errorText = (errorText + chunk).slice(-4000); });
		child.on('message', async message => {
			if (settled || message?.type !== 'result' || message.report?.result?.matchId !== job.matchId) return;
			settled = true;
			try {
				const report = { ...message.report, evaluation: {
					candidateVersion: job.candidateVersion, candidateSide: job.sideSwap ? 'red' : 'blue', pairIndex: job.pairIndex
				} };
				this.persisting = this.persisting.then(async () => {
					if (await this.store.appendMatch(report)) {
						this.completed++;
						if (Number.isFinite(report.simulatedMs) && report.simulatedMs > 0) this.completedSimulatedMs += report.simulatedMs;
						await this._recordResult(report);
						await this._saveEvaluation();
					}
				});
				await this.persisting;
				this.active.delete(child.pid);
				if (child.connected) child.disconnect();
				this._pump();
			} catch (error) {
				this._fail(error);
			}
		});
		child.on('exit', code => {
			if (settled || !this._resolve) return;
			settled = true;
			this.active.delete(child.pid);
			if (job.attempts < 2 && !this.stopRequested) this.retries.push({ ...job, attempts: job.attempts + 1 });
			else {
				this.failed++;
				if (!this.stopRequested) return this._fail(new Error(`Training worker ${job.matchId} exited ${code}: ${errorText}`));
			}
			this._pump();
		});
		child.send(job);
	}

	async _recordResult(report) {
		if (report.speedMode === 'max' && report.parityStatus !== 'passed') return;
		if (this.mode === 'neural') {
			if (report.neuralError) throw new Error(`Neural worker inference failed: ${report.neuralError}`);
			if (report.evaluation.candidateVersion !== this.candidate.version) return;
			if (report.split === 'train') this.neuralPending.push(...(report.trajectory || []).filter(isAllowedTrainingDecision));
			else if (report.split === 'validation') {
				const key = String(report.evaluation.pairIndex);
				const pair = this.outcomes[key] || (this.outcomes[key] = []);
				pair[report.evaluation.candidateSide === 'blue' ? 0 : 1] = candidateScore(report.result.winner,
					report.evaluation.candidateSide);
			}
			return;
		}
		if (report.split !== 'validation' || report.evaluation.candidateVersion !== this.candidate.version) return;
		const pairId = String(report.evaluation.pairIndex);
		const pair = this.outcomes[pairId] || (this.outcomes[pairId] = []);
		const side = report.evaluation.candidateSide;
		pair[side === 'blue' ? 0 : 1] = candidateScore(report.result.winner, side);
		const completedPairs = Object.values(this.outcomes).filter(scores => 0 in scores && 1 in scores && scores.every(Number.isFinite));
		if (completedPairs.length < 30) return;
		const lower = pairedLowerBound(completedPairs.map(scores => (scores[0] + scores[1]) / 2));
		if (lower > 0.5) {
			this.registry.promote(this.candidate.version);
			this.champion = this.candidate;
		}
		this._newCandidate();
	}

	_fail(error) {
		if (!this._reject) return;
		const reject = this._reject;
		this._reject = null;
		this._resolve = null;
		this.stopRequested = true;
		for (const { child } of this.active.values()) child.kill();
		this.active.clear();
		reject(error);
	}
}

module.exports = { TrainingSupervisor, workerCount };
