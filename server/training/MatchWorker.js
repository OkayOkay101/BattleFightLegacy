const path = require('node:path');
const fs = require('node:fs');
const { TrainingMatch } = require('./TrainingMatch');
const { TrainingStats } = require('./TrainingStats');
const TrainingRuntime = require('./TrainingRuntime');
const { TrainingClock } = require('./TrainingClock');
const { TrainingStepper } = require('./TrainingStepper');
const { TrainingTrace } = require('./TrainingTrace');

function seedRandom(seed) {
	let state = Number(seed) >>> 0;
	Math.random = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ state >>> 15, 1 | state);
		value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
		return ((value ^ value >>> 14) >>> 0) / 4294967296;
	};
}

function loadEngineClasses() {
	const engineRoot = path.resolve(__dirname, '../../engine');
	for (const [flags, name, relativePath, exportName] of require('../../engine/CoreConfig').include) {
		if (!flags.includes('s')) continue;
		const loaded = require(path.resolve(engineRoot, relativePath));
		global[name] = exportName ? loaded[exportName] : loaded;
	}
	const serverRoot = path.resolve(__dirname, '..');
	for (const { name, path: relativePath } of require('../ServerConfig').include) {
		global[name] = require(path.resolve(serverRoot, `${relativePath}.js`));
	}
}

function bootTrainingGame({ matchId = 'training-smoke', seed = 1, maxDurationMs = 300000, bluePolicy, redPolicy,
	split = 'train', candidateVersion = null, manualSteps = false, schemaVersion, schemaHash,
	environmentHash, trainingProtocolVersion, phase = split, opponentVersion, learnerSide, sideSwap } = {}) {
	process.env.ENV = 'standalone';
	if (require.main === module) seedRandom(seed);
	loadEngineClasses();
	global._ = require('lodash');
	global.isDev = false;
	global.mode = 'training';
	global.ige = new IgeEngine();
	const clock = manualSteps ? new TrainingClock(1700000000000) : null;
	if (clock) {
		ige.useManualTicks(true);
		ige._currentTime = ige.now = clock.now();
		ige._lastPhysicsTickAt = ige._lastGameLoopTickAt = ige.lastTick = clock.now();
	}
	const raw = require('../../src/game.json');
	const gameData = Object.assign({}, raw, raw.data, { defaultData: raw });
	ige.env = 'training';
	ige.server = {
		clients: {}, owner: null, startedOn: Date.now(), lifeSpan: 6 * 60 * 60 * 1000,
		keysToRemoveBeforeSend: [],
		bandwidthUsage: { unit: 0, player: 0, item: 0, projectile: 0, debris: 0, region: 0, sensor: 0 },
		totalUnitsCreated: 0, totalPlayersCreated: 0, totalItemsCreated: 0, totalProjectilesCreated: 0,
		totalWallsCreated: 0, totalDebrisCreated: 0, totalRegionsCreated: 0,
		getStatus: () => ({}), kill: () => { throw new Error('Training worker was stopped by game server logic'); }
	};
	ige.addComponent(IgeNetIoComponent);
	ige.network._io = { send() {} };
	ige.network.clientIds = [];
	ige.network.sendQueue = {};
	ige.network.snapshot = [];
	ige.network.define('_snapshot');
	ige.network.define('_igeStreamTime');
	ige.addComponent(GameComponent);
	ige.game.data = gameData;
	ige.game.cspEnabled = !!gameData.defaultData.clientSidePredictionEnabled;
	global.standaloneGame = gameData;
	const frameRate = Math.max(15, Math.min(Number(gameData.defaultData.frameRate) || 60, 60));
	ige._physicsTickRate = frameRate;
	ige.addComponent(PhysicsComponent).physics.sleep(true).physics.tilesizeRatio(64 / gameData.map.tilewidth);
	if (gameData.settings?.gravity) ige.physics.gravity(gameData.settings.gravity.x, gameData.settings.gravity.y);
	ige.physics.createWorld();
	ige.physics.start();
	const match = new TrainingMatch({ matchId, startedAt: clock ? clock.now() : Date.now(), maxDurationMs });
	const stats = new TrainingStats();
	const learner = [bluePolicy, redPolicy].find(policy => policy?.version === candidateVersion) ||
		[bluePolicy, redPolicy].find(policy => policy?.kind === 'neural');
	const metadata = { schemaVersion: schemaVersion || learner?.weights?.schemaVersion || 1,
		schemaHash: schemaHash || learner?.weights?.schemaHash,
		environmentHash: environmentHash || learner?.weights?.environmentHash,
		trainingProtocolVersion: trainingProtocolVersion || learner?.weights?.trainingProtocolVersion };
	TrainingRuntime.install(ige, { seed, matchId, match, stats, bluePolicy, redPolicy, clock, split,
		candidateVersion, phase, opponentVersion, learnerSide, sideSwap, ...metadata });
	return new Promise((resolve, reject) => {
		ige.start(success => {
			if (!success) return reject(new Error('Taro engine did not start'));
			try {
				ige.network.addComponent(IgeStreamComponent).stream.sendInterval(1000 / frameRate).stream.start();
				ige.addGraph('IgeBaseScene');
				for (const component of [MapComponent, ShopComponent, IgeChatComponent, ItemComponent,
					TimerComponent, TriggerComponent, VariableComponent, GameTextComponent,
					ScriptComponent, ConditionComponent, ActionComponent, AdComponent,
					SoundComponent, RegionManager]) ige.addComponent(component);
				const map = ige.scaleMap(_.cloneDeep(gameData.map));
				ige.map.load(map);
				ige.game.start();
				resolve({ ige, match, stats, clock });
			} catch (error) { reject(error); }
		});
	});
}

function runMatch(options, onResult) {
	bootTrainingGame({ ...options, manualSteps: true }).then(async ({ ige, match, stats, clock }) => {
		const stepper = new TrainingStepper({ ige, clock });
		const started = Date.now();
		let result;
		while (!result) {
			if (ige.training.neuralError) throw new Error(`Neural worker inference failed: ${ige.training.neuralError}`);
			if (options.speedMode !== 'max') {
				const delay = started + (stepper.steps + 1) * 1000 / 60 - Date.now();
				if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
			}
			stepper.step();
			if (ige.training.neuralError) throw new Error(`Neural worker inference failed: ${ige.training.neuralError}`);
			result = match.finish(clock.now());
			if (options.speedMode === 'max' && stepper.steps % 60 === 0) await new Promise(resolve => setImmediate(resolve));
		}
		stepper.dispose();
		const finalStats = stats.finish();
		const trajectory = ige.training.trajectory.finish(result, finalStats, {
			split: options.split, speedMode: options.speedMode, parityStatus: options.parityStatus,
			endedAt: match.startedAt + result.durationMs
		});
		onResult({ result, stats: finalStats, trajectory, neuralError: ige.training.neuralError,
			schemaVersion: ige.training.config.schemaVersion, schemaHash: ige.training.config.schemaHash,
			environmentHash: ige.training.config.environmentHash, trainingProtocolVersion: ige.training.config.trainingProtocolVersion,
			phase: options.phase || options.split || 'train', opponentVersion: options.opponentVersion,
			speedMode: options.speedMode || 'realtime',
			simulatedMs: result.durationMs, wallMs: Date.now() - started,
			parityStatus: options.parityStatus || 'not-required', policyVersion: options.policyVersion || 'baseline',
			policyVersions: { blue: options.bluePolicy?.version || 'baseline', red: options.redPolicy?.version || 'baseline' },
			policyKinds: { blue: options.bluePolicy?.kind || 'heuristic', red: options.redPolicy?.kind || 'heuristic' },
			split: options.split || 'train', seed: options.seed });
	}).catch(error => { console.error(error.stack || error); process.exit(1); });
}

if (require.main === module && process.send) {
	process.once('message', message => {
		if (message?.type !== 'run') return process.exit(1);
		runMatch(message, report => {
			process.send({ type: 'result', report }, () => process.exit(0));
		});
	});
} else if (require.main === module) {
	const durationArg = process.argv.indexOf('--duration-ms');
	const maxDurationMs = durationArg < 0 ? 300000 : Number(process.argv[durationArg + 1]);
	const seedArg = process.argv.indexOf('--seed');
	const seed = seedArg < 0 ? 1 : Number(process.argv[seedArg + 1]);
	const policyArg = process.argv.indexOf('--policy-file');
	const diagnosticPolicies = policyArg < 0 ? {} : JSON.parse(fs.readFileSync(process.argv[policyArg + 1], 'utf8'));
	for (const side of ['bluePolicy', 'redPolicy']) {
		if (diagnosticPolicies[side]?.kind === 'neural') {
			diagnosticPolicies[side].weights = require('./NeuralInference').loadWeights(diagnosticPolicies[side].weightsEnvelope);
		}
	}
	bootTrainingGame({ maxDurationMs, seed, manualSteps: process.argv.includes('--fixed-step-smoke') ||
		process.argv.includes('--fixed-step-respawn-smoke') || process.argv.includes('--fixed-step-run-once'),
		...diagnosticPolicies }).then(async ({ ige, match, stats, clock }) => {
		if (process.argv.includes('--fixed-step-run-once')) {
			const stepper = new TrainingStepper({ ige, clock });
			const trace = new TrainingTrace(stats);
			stats.trace = match.trace = trace;
			const started = Date.now();
			const paceRealtime = process.argv.includes('--pace-realtime');
			let result;
			while (!result) {
				if (ige.training.neuralError) throw new Error(`Neural parity inference failed: ${ige.training.neuralError}`);
				if (paceRealtime) {
					const delay = started + (stepper.steps + 1) * 1000 / 60 - Date.now();
					if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
				}
				trace.beginStep(stepper.steps + 1);
				stepper.step();
				if (ige.training.neuralError) throw new Error(`Neural parity inference failed: ${ige.training.neuralError}`);
				if (stepper.steps % 6 === 0) trace.capturePositions(ige.$$('player').filter(player => player._stats.isBattleBot)
					.map(player => ({ playerId: player.id(), unit: player.getSelectedUnit() }))
					.filter(entry => entry.unit && entry.unit._stats.attributes.health.value > 0)
					.map(entry => ({ playerId: entry.playerId, x: entry.unit._translate.x, y: entry.unit._translate.y })));
				result = match.finish(clock.now());
			}
			console.log('TRAINING_FIXED_MATCH ' + JSON.stringify({ result, stats: stats.finish(), trace: trace.finish(result.winner),
				steps: stepper.steps, seed, speedMode: paceRealtime ? 'realtime' : 'max',
				simulatedMs: result.durationMs, wallMs: Date.now() - started, parityStatus: 'unverified' }));
			stepper.dispose();
			return process.exit(0);
		}
		if (process.argv.includes('--fixed-step-respawn-smoke')) {
			const player = ige.$$('player').find(candidate => candidate._stats.isBattleBot);
			const oldUnit = player.getSelectedUnit();
			const startedAt = clock.now(), started = Date.now();
			oldUnit._stats.attributes.health.value = 0;
			ige.game.handleBattleBotDeath(oldUnit, {});
			const stepper = new TrainingStepper({ ige, clock });
			let respawnAtMs = null;
			for (let i = 0; i < 180; i++) {
				stepper.step();
				if (respawnAtMs === null && player.getSelectedUnit()?.id() !== oldUnit.id()) respawnAtMs = clock.now() - startedAt;
			}
			console.log('TRAINING_RESPAWN ' + JSON.stringify({ respawnAtMs, wallMs: Date.now() - started }));
			stepper.dispose();
			return process.exit(0);
		}
		if (process.argv.includes('--fixed-step-smoke')) {
			let physicsSteps = 0, seconds = 0;
			const probeUnit = ige.$$('player').find(player => player._stats.isBattleBot)?.getSelectedUnit();
			let scriptTimerMs = null;
			const scriptRun = ige.action.run.bind(ige.action);
			ige.action.run = function (actions, vars) {
				if (actions?.[0]?.type === 'trainingTimerProbe') {
					scriptTimerMs = clock.now() - startedAt;
					return;
				}
				return scriptRun(actions, vars);
			};
			const update = ige.physics.update.bind(ige.physics);
			ige.physics.update = function (elapsed) { physicsSteps++; return update(elapsed); };
			const fire = ige.trigger.fire.bind(ige.trigger);
			ige.trigger.fire = function (name, ...args) { if (name === 'secondTick') seconds++; return fire(name, ...args); };
			const stepper = new TrainingStepper({ ige, clock });
			const startedAt = clock.now();
			if (probeUnit?.attribute) probeUnit.attribute.lastRegenerated = startedAt;
			if (probeUnit) probeUnit.addAttributeBuff('health', 1, 250, false);
			ige.action.run([{ type: 'setTimeOut', duration: 250, actions: [{ type: 'trainingTimerProbe' }] }], { triggeredBy: {} });
			const started = Date.now();
			for (let i = 0; i < 60; i++) stepper.step();
			console.log('TRAINING_FIXED_STEP ' + JSON.stringify({ steps: stepper.steps, simulatedMs: clock.now() - stepper.startedAt,
				wallMs: Date.now() - started, physicsSteps, seconds, scriptTimerMs,
				regenerationMs: probeUnit?.attribute?.lastRegenerated - startedAt,
				buffExpired: probeUnit?._stats.buffs?.length === 0,
				scriptTimestampMs: Math.round(ige.variable.getValue({ function: 'currentTimeStamp' }, {}) * 1000 - startedAt) }));
			stepper.dispose();
			return process.exit(0);
		}
		if (process.argv.includes('--smoke')) {
			const bots = ige.$$('player').filter(player => player._stats.isBattleBot && player._stats.playerJoined);
			const teams = { blue: 0, red: 0 };
			for (const player of bots) teams[player._stats.trainingTeamId]++;
			console.log('TRAINING_SMOKE ' + JSON.stringify({ players: bots.length, teams, portBound: false }));
			process.exit(0);
		}
		if (process.argv.includes('--run-once')) {
			const interval = setInterval(() => {
				const result = match.finish(Date.now());
				if (!result) return;
				clearInterval(interval);
				console.log('TRAINING_RESULT ' + JSON.stringify({ result, stats: stats.finish(),
					speedMode: 'realtime', simulatedMs: result.durationMs, wallMs: Date.now() - match.startedAt,
					parityStatus: 'not-required' }));
				process.exit(0);
			}, 50);
		}
	}).catch(error => { console.error(error.stack || error); process.exit(1); });
}

module.exports = { bootTrainingGame };
