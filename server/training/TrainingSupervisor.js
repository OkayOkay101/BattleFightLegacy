const path = require('node:path');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { TrainingStore } = require('./TrainingStore');
const { isAllowedTrainingDecision } = require('./NeuralObservation');
const { PolicyRegistry } = require('./PolicyRegistry');
const { mutatePolicy, pairedLowerBound, candidateScore } = require('./HeuristicPolicy');
const { NeuralTrainer } = require('./NeuralTrainer');
const { canPromoteNeural } = require('./NeuralPromotion');
const { TRAINING_PROTOCOL_VERSION, environmentHash: hashEnvironment, buildEnvironmentDefinition,
	createSeedCounters, allocateSeeds, leagueOpponent, evaluationOpponents, evaluationSummary } = require('./TrainingProtocol');

function workerCount(requested) {
	const count = requested === undefined ? 4 : Number(requested);
	if (!Number.isInteger(count) || count < 1 || count > 8) throw new RangeError('workers must be 1..8');
	return count;
}

class TrainingSupervisor {
	constructor({ dataDir, workers, maxMatches = Infinity, maxDurationMs = 300000,
		runId = crypto.randomUUID(), workerFactory = fork, speedMode = 'realtime', parityStatus = 'not-required',
		mode = 'heuristic', neuralMinimumDecisions = 8192, pythonExecutable, schemaVersion = 1,
		environmentHash, trainingProtocolVersion = TRAINING_PROTOCOL_VERSION, parentVersion } = {}) {
		if (!['realtime', 'max'].includes(speedMode)) throw new RangeError('Invalid training speed mode');
		if (!['heuristic', 'neural'].includes(mode)) throw new RangeError('Invalid training mode');
		if (speedMode === 'max' && parityStatus !== 'passed') throw new Error('Accelerated training requires passed parity');
		this.store = new TrainingStore(dataDir || path.resolve(__dirname, '../../training-data'));
		this.registry = new PolicyRegistry(this.store.directory);
		this.mode = mode;
		this.schemaVersion = schemaVersion;
		this.trainingProtocolVersion = trainingProtocolVersion;
		this.environmentHash = environmentHash;
		if (mode === 'neural') {
			if (schemaVersion >= 2) this.environmentHash ||= hashEnvironment(buildEnvironmentDefinition(undefined,{maxDurationMs}));
			this.neuralStore = new TrainingStore(path.join(this.store.directory, schemaVersion >= 2 ? `neural-state-v${schemaVersion}` : 'neural-state'));
			this.trainer = new NeuralTrainer({ dataDir: this.store.directory, minimumDecisions: neuralMinimumDecisions,
				pythonExecutable, schemaVersion, environmentHash: this.environmentHash, trainingProtocolVersion, parentVersion });
			this.phase = 'train';
			this.phaseIndex = 0;
			this.neuralPending = [];
			this.transitioning = false;
			this.seedCounters = createSeedCounters();
			this.trainingMatches = 0;
			this.pendingMatchIds = [];
			this.inFlightJobs = {};
			this.evaluationSeeds = [];
			this.evaluationOpponents = [];
			this.lastEvaluation = null;
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
			schemaVersion: this.schemaVersion, schemaHash: this.mode === 'neural' ? require('./NeuralSchema').getSchema(this.schemaVersion).schemaHash : null,
			environmentHash: this.environmentHash,
			trainingProtocolVersion: this.trainingProtocolVersion, trainingMatches: this.trainingMatches || 0,
			pendingMultiOptionDecisions: (this.neuralPending || []).filter(row => row.options?.length > 1).length,
			opponentMetrics: this.schemaVersion >= 2 ? this._evaluationMetrics() : null, lastEvaluation: this.lastEvaluation,
			perOpponent: this.schemaVersion >= 2 ? this._evaluationMetrics() : null,
			updateMetrics: this.trainer?.manifest?.metrics || null,
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
		if (this.schemaVersion >= 2) return this._initializeNeuralV2();
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

	async _initializeNeuralV2() {
		this.champion = this.registry.policy(this.registry.status().championVersion) || this.registry.policy('baseline');
		this.candidate = await this.trainer.initialize();
		const checkpoint = await this.neuralStore.loadCheckpoint();
		if (checkpoint?.kind === 'neural-evaluation-v2') {
			// Seed counters survive optimizer/environment changes, so heldout seeds are never reused.
			this.seedCounters = checkpoint.seedCounters || this.seedCounters;
			if (checkpoint.schemaVersion !== this.schemaVersion || checkpoint.schemaHash !== require('./NeuralSchema').getSchema(this.schemaVersion).schemaHash) {
				throw new Error('Persisted neural schema mismatch; use a new state namespace');
			}
			if (checkpoint.environmentHash !== this.environmentHash || checkpoint.trainingProtocolVersion !== this.trainingProtocolVersion) {
				throw new Error('Neural persisted environment/protocol changed; use a new state namespace');
			}
			if (checkpoint.candidateVersion === this.candidate.version) {
				for (const key of ['phase','phaseIndex','outcomes','trainingMatches','pendingMatchIds','inFlightJobs',
					'trainPairSeed','evaluationSeeds','lastEvaluation','selectionSummary','completed','failed']) if (checkpoint[key] !== undefined) this[key]=checkpoint[key];
				this.completedSimulatedMs=checkpoint.simulatedMs||0;
				this.evaluationOpponents=(checkpoint.evaluationOpponents||[]).map(({role,version})=>{
					const policy=this.registry.policy(version);if(!policy)throw new Error(`Missing frozen evaluation policy ${version}`);return {role,policy};});
			} else if (checkpoint.phase === 'train' && this.trainer.manifest?.trainedFromVersion === checkpoint.candidateVersion) {
				// Python published an update before the scheduler's selection checkpoint was durable.
				this.lastEvaluation=checkpoint.lastEvaluation||null;
				this._beginEvaluation('selection');
			} else {
				throw new Error('Neural optimizer/checkpoint transition mismatch; refusing to skip evaluation');
			}
		}
		const completedIds = new Set();
		this.neuralPending=[];this.pendingMatchIds=[];this.trainingMatches=0;
		this.completed=0;this.completedSimulatedMs=0;
		await this.neuralStore.scanMatches(report=>{
			completedIds.add(report.result.matchId);
			this.completed++;if(Number.isFinite(report.simulatedMs))this.completedSimulatedMs+=report.simulatedMs;
			if(report.evaluation?.candidateVersion===this.candidate.version) this._recordResultV2(report);
		});
		this.retries=Object.values(this.inFlightJobs).filter(job=>!completedIds.has(job.matchId)).map(reference=>{
			const {blueVersion,redVersion,...job}=reference;
			const bluePolicy=this.registry.policy(blueVersion),redPolicy=this.registry.policy(redVersion);
			if(!bluePolicy||!redPolicy)throw new Error('Missing frozen pending policy');return {...job,bluePolicy,redPolicy};});
		for(const id of completedIds)delete this.inFlightJobs[id];
		await this._saveEvaluation();
	}

	_batchReady() {
		if(this.phase!=='train')return false;
		if(this.schemaVersion<2)return this.neuralPending.length>=this.trainer.minimumDecisions;
		return this.trainingMatches>=8&&this.neuralPending.filter(row=>row.options?.length>1).length>=this.trainer.minimumDecisions;
	}

	_beginEvaluation(phase) {
		this.phase=phase;this.phaseIndex=0;this.outcomes={};
		if(phase==='selection') this.evaluationOpponents=evaluationOpponents(this.registry,this.champion);
		this.evaluationSeeds=allocateSeeds(this.seedCounters,phase,phase==='selection'?10:30);
	}

	_evaluationMetrics() {
		const count=this.phase==='selection'?10:30;
		return Object.fromEntries((this.evaluationOpponents||[]).map(({role,policy})=>[role,{version:policy.version,
			...evaluationSummary(Array.from({length:count},(_,i)=>this.outcomes[`${role}:${i}`]))}]));
	}

	_nextNeuralJobV2() {
		if(this._batchReady())return null;
		const pairedIndex=Math.floor(this.phaseIndex/2),sideSwap=this.phaseIndex%2===1;
		let seed,opponent,opponentRole,leagueRole,pairIndex;
		if(this.phase==='train') {
			if(!sideSwap)this.trainPairSeed=allocateSeeds(this.seedCounters,'train',1)[0];
			seed=this.trainPairSeed;pairIndex=pairedIndex;
			const archiveVersions=[...new Set([this.registry.status().previousVersion,...(this.registry.status().approvedArchives||[])])];
			const archives=archiveVersions.map(version=>this.registry.policy(version)).filter(Boolean).slice(0,3);
			const selected=leagueOpponent(pairIndex,this.champion,archives,this.registry.policy('baseline'));
			opponent=selected.policy;leagueRole=selected.role;opponentRole=selected.role;
		} else {
			const count=this.phase==='selection'?10:30,limit=count*this.evaluationOpponents.length*2;
			while(this.phaseIndex<limit) {
				const p=Math.floor(this.phaseIndex/2)%count,role=this.evaluationOpponents[Math.floor(this.phaseIndex/(count*2))].role;
				if(!Number.isFinite(this.outcomes[`${role}:${p}`]?.[this.phaseIndex%2]))break;
				this.phaseIndex++;
			}
			if(this.phaseIndex>=limit)return null;
			pairIndex=Math.floor(this.phaseIndex/2)%count;seed=this.evaluationSeeds[pairIndex];
			({role:opponentRole,policy:opponent}=this.evaluationOpponents[Math.floor(this.phaseIndex/(count*2))]);
		}
		const index=this.phaseIndex++,swap=index%2===1;this.dispatched++;
		return {type:'run',matchId:`neural-v${this.schemaVersion}-${this.candidate.version}-${this.phase}-${index}`,seed,
			schemaVersion:this.schemaVersion,schemaHash:require('./NeuralSchema').getSchema(this.schemaVersion).schemaHash,
			environmentHash:this.environmentHash,trainingProtocolVersion:this.trainingProtocolVersion,
			speedMode:this.speedMode,parityStatus:this.parityStatus,phase:this.phase,split:this.phase,sideSwap:swap,learnerSide:swap?'red':'blue',
			bluePolicy:swap?opponent:this.candidate,redPolicy:swap?this.candidate:opponent,
			candidateVersion:this.candidate.version,opponentVersion:opponent.version,opponentRole,leagueRole,pairIndex,
			maxDurationMs:this.maxDurationMs,attempts:0};
	}

	_recordResultV2(report) {
		this._validateResultV2(report);
		if(report.evaluation.candidateVersion!==this.candidate.version)return;
		if(report.split==='train') {
			if(this.pendingMatchIds.includes(report.result.matchId))return;
			this.pendingMatchIds.push(report.result.matchId);this.trainingMatches++;this.neuralPending.push(...(report.trajectory||[]));
		} else if(report.split===this.phase) {
			const role=report.evaluation.opponentRole;
			const pair=this.outcomes[`${role}:${report.evaluation.pairIndex}`]||(this.outcomes[`${role}:${report.evaluation.pairIndex}`]=[]);
			pair[report.evaluation.candidateSide==='blue'?0:1]=candidateScore(report.result.winner,report.evaluation.candidateSide);
		}
	}

	_validateResultV2(report) {
		if(report.neuralError)throw new Error(`Neural worker inference failed: ${report.neuralError}`);
		if(report.schemaVersion!==this.schemaVersion||report.schemaHash!==require('./NeuralSchema').getSchema(this.schemaVersion).schemaHash||
			report.environmentHash!==this.environmentHash||report.trainingProtocolVersion!==this.trainingProtocolVersion||
			(report.speedMode==='max'&&report.parityStatus!=='passed'))throw new Error('Neural match metadata mismatch');
		if(report.result?.status!=='complete')throw new Error('Neural match is incomplete');
		if(report.evaluation.candidateVersion!==this.candidate.version)return;
		if(report.split==='train') {
			if(this.pendingMatchIds.includes(report.result.matchId))return;
			const rows=report.trajectory||[];
			if(rows.some(row=>row.policyVersion!==this.candidate.version||row.schemaVersion!==this.schemaVersion||
				row.schemaHash!==report.schemaHash||row.environmentHash!==this.environmentHash||
				row.trainingProtocolVersion!==this.trainingProtocolVersion||!isAllowedTrainingDecision(row))) {
				throw new Error('Neural trajectory metadata or learner policy mismatch');
			}
		} else if(report.split===this.phase) {
			const role=report.evaluation.opponentRole;
			const expected=this.evaluationOpponents.find(entry=>entry.role===role);
			if(!expected||expected.policy.version!==report.evaluation.opponentVersion)throw new Error('Neural evaluation opponent changed');
		}
	}

	async _advanceNeuralV2() {
		if(this.phase==='train') {
			this.candidate=await this.trainer.train(this.neuralPending);this.neuralPending=[];this.trainingMatches=0;this.pendingMatchIds=[];
			this._beginEvaluation('selection');
		} else if(this.phase==='selection'&&this._evaluationMetrics().champion.score>0.5) {
			this.selectionSummary={phase:'selection',opponents:this._evaluationMetrics(),seeds:[...this.evaluationSeeds]};
			this._beginEvaluation('final-test');
		} else {
			const phase=this.phase,opponents=this._evaluationMetrics(),count=phase==='selection'?10:30;
			const pairs=role=>Array.from({length:count},(_,i)=>this.outcomes[`${role}:${i}`]);
			this.lastEvaluation={phase,candidateVersion:this.candidate.version,parentVersion:this.candidate.weights?.parentVersion,
				schemaVersion:this.schemaVersion,schemaHash:require('./NeuralSchema').getSchema(this.schemaVersion).schemaHash,environmentHash:this.environmentHash,
				trainingProtocolVersion:this.trainingProtocolVersion,opponents,seeds:[...this.evaluationSeeds],selection:this.selectionSummary||null,
				promoted:false,parityStatus:this.parityStatus};
			if(phase==='final-test'&&canPromoteNeural({championPairs:pairs('champion'),archivedPairs:pairs('archive'),
				heuristicPairs:pairs('heuristic'),parityPassed:this.parityStatus==='passed'})) {
				this.lastEvaluation.promoted=true;this.registry.promote(this.candidate.version,{evaluation:this.lastEvaluation});this.champion=this.candidate;
			}
			this.phase='train';this.phaseIndex=0;this.outcomes={};this.evaluationSeeds=[];this.evaluationOpponents=[];this.selectionSummary=null;
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
		if (this.mode === 'neural' && this.schemaVersion >= 2) return this.neuralStore.saveCheckpoint({
			kind: 'neural-evaluation-v2', runId: this.runId, schemaVersion: this.schemaVersion, schemaHash: require('./NeuralSchema').getSchema(this.schemaVersion).schemaHash,
			environmentHash: this.environmentHash, trainingProtocolVersion: this.trainingProtocolVersion,
			championVersion: this.champion.version, candidateVersion: this.candidate.version,
			phase: this.phase, phaseIndex: this.phaseIndex, outcomes: this.outcomes, seedCounters: this.seedCounters,
			trainingMatches: this.trainingMatches, pendingMatchIds: this.pendingMatchIds, inFlightJobs: this.inFlightJobs,
			trainPairSeed: this.trainPairSeed, evaluationSeeds: this.evaluationSeeds,
			evaluationOpponents: this.evaluationOpponents.map(({role,policy})=>({role,version:policy.version})),
			lastEvaluation: this.lastEvaluation, selectionSummary: this.selectionSummary,
			completed: this.completed, failed: this.failed, simulatedMs: this.completedSimulatedMs });
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
		if (this.schemaVersion >= 2) return this._nextNeuralJobV2();
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

	setWorkers(count) {
		this.workers = workerCount(count);
		this._pump();
		return this.workers;
	}

	stop({ abortActive = false } = {}) {
		this.stopRequested = true;
		if (abortActive) for (const { child } of this.active.values()) child.kill();
		this._pump();
	}

	_pump() {
		if (!this._resolve) return;
		if (this.mode === 'neural' && !this.transitioning && !this.stopRequested && this.active.size === 0) {
			const batchReady = this._batchReady();
			const validationReady = this.schemaVersion >= 2 ? this.phase !== 'train' && this._neuralValidationComplete() :
				this.phase === 'validation' && this._neuralValidationComplete();
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
		if (this.schemaVersion >= 2) { const required = this.phase === 'selection' ? 10 : 30;
			return this.evaluationOpponents.every(({role}) => Array.from({length:required},(_,i)=>this.outcomes[`${role}:${i}`])
				.every(pair=>pair?.length===2&&pair.every(Number.isFinite))); }
		const required = this.champion.version === 'baseline' ? 30 : 60;
		return Array.from({ length: required }, (_, index) => this.outcomes[index])
			.every(pair => pair && 0 in pair && 1 in pair);
	}

	async _advanceNeural() {
		if (this.schemaVersion >= 2) return this._advanceNeuralV2();
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
			stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
			execArgv: ['--max-old-space-size=1024']
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
					candidateVersion: job.candidateVersion, candidateSide: job.sideSwap ? 'red' : 'blue', pairIndex: job.pairIndex,
					opponentVersion: job.opponentVersion, opponentRole: job.opponentRole, phase: job.phase
				} };
				this.persisting = this.persisting.then(async () => {
					if(this.schemaVersion>=2&&this.mode==='neural')this._validateResultV2(report);
					if (await (this.schemaVersion >= 2 && this.mode === 'neural' ? this.neuralStore : this.store).appendMatch(report)) {
						this.completed++;
						if (Number.isFinite(report.simulatedMs) && report.simulatedMs > 0) this.completedSimulatedMs += report.simulatedMs;
						await this._recordResult(report);
						if (this.schemaVersion >= 2) delete this.inFlightJobs[job.matchId];
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
		if (this.schemaVersion >= 2 && this.mode === 'neural') {
			const {bluePolicy,redPolicy,...reference}=job;
			this.inFlightJobs[job.matchId]={...reference,blueVersion:bluePolicy.version,redVersion:redPolicy.version};
			this.persisting=this.persisting.then(()=>this._saveEvaluation());
			this.persisting.then(()=>child.send(job),error=>this._fail(error));
		} else child.send(job);
	}

	async _recordResult(report) {
		if (this.mode === 'neural' && this.schemaVersion >= 2) return this._recordResultV2(report);
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
