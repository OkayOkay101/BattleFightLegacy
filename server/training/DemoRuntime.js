const fs = require('node:fs');
const path = require('node:path');
const { buildTrainingRoster } = require('./TrainingRoster');
const { chooseNeuralAction } = require('./NeuralController');
const { TrainingMatch } = require('./TrainingMatch');
const { TrainingStats } = require('./TrainingStats');

const MATCH_DURATION_MS = 300000;

function resolveDemoPolicy(registry, requested = 'latest') {
	let versions = [];
	if (requested === 'latest') {
		try { versions = fs.readdirSync(path.join(registry.directory, 'policies'))
			.filter(name => /^n-\d+\.json$/.test(name))
			.map(name => name.slice(0, -5)).sort().reverse(); }
		catch (error) { /* A fresh install may not have any trained policy. */ }
	} else versions = [requested];
	for (const version of versions) {
		const policy = registry.policy(version);
		if (policy) return policy;
	}
	throw new Error(`Unknown demo policy: ${requested}`);
}

function demoIsOpponent(a, b) {
	return !!(a && b && a !== b && a._stats && b._stats &&
		a._stats.playerJoined && b._stats.playerJoined &&
		(a._stats.isBattleBot || a._stats.controlledBy === 'human') &&
		(b._stats.isBattleBot || b._stats.controlledBy === 'human') &&
		!a._stats.isSpectator && !b._stats.isSpectator &&
		a._stats.trainingTeamId && b._stats.trainingTeamId &&
		a._stats.trainingTeamId !== b._stats.trainingTeamId);
}

function installDemo(ige, policy) {
	if (ige.training) throw new Error('Cannot run exhibition and training in the same process');
	let roundNumber = 0;
	let roundStartedAt = Date.now();
	let round = new TrainingMatch({ matchId: `demo-${++roundNumber}`, startedAt: roundStartedAt,
		maxDurationMs: MATCH_DURATION_MS });
	let results = { blue: 0, red: 0, draws: 0 };
	function advance(now = Date.now()) {
		while (now - roundStartedAt >= MATCH_DURATION_MS) {
			const result = round.finish(roundStartedAt + MATCH_DURATION_MS);
			if (result.winner) results[result.winner]++;
			else results.draws++;
			roundStartedAt += MATCH_DURATION_MS;
			round = new TrainingMatch({ matchId: `demo-${++roundNumber}`, startedAt: roundStartedAt,
				maxDurationMs: MATCH_DURATION_MS });
		}
	}
	function registerCurrentBots() {
		for (const player of ige.$$('player')) {
			if (!player?._stats?.isBattleBot || !['blue', 'red'].includes(player._stats.trainingTeamId)) continue;
			runtime.stats.registerPlayer({ playerId: player.id(), teamId: player._stats.trainingTeamId,
				characterId: player._battleBot?.previousCharacter || null });
			const unit = player.getSelectedUnit && player.getSelectedUnit();
			if (unit && unit._stats?.attributes?.health?.value > 0 && player._battleBot?.previousCharacter) {
				runtime.stats.startLife({ playerId: player.id(), lifeId: unit.id(),
					characterId: player._battleBot.previousCharacter });
			}
		}
	}
	const runtime = {
		isExhibitionMode: true,
		policy,
		policies: { blue: policy, red: policy },
		stats: new TrainingStats(),
		neuralError: null,
		policyForPlayer(player) { return runtime.policies[player?._stats?.trainingTeamId] || runtime.policies.blue; },
		setPolicies(blue, red) {
			if (!blue || !red) throw new TypeError('Both demo policies are required');
			if (runtime.policies.blue.version !== blue.version || runtime.policies.red.version !== red.version) {
				runtime.policies = { blue, red };
				runtime.policy = blue;
				runtime.stats = new TrainingStats();
				registerCurrentBots();
				roundStartedAt = Date.now();
				roundNumber = 0;
				round = new TrainingMatch({ matchId: `demo-${++roundNumber}`, startedAt: roundStartedAt,
					maxDurationMs: MATCH_DURATION_MS });
				results = { blue: 0, red: 0, draws: 0 };
			}
			return runtime.status();
		},
		recordBotDeath({ lifeId, victimId, victimTeamId, killerId, killerTeamId, at = Date.now() }) {
			advance(at);
			runtime.stats.recordDeath({ lifeId, victimId, killerId, at });
			round.recordDeath({ lifeId, victimTeamId, killerTeamId });
		},
		status() {
			const now = Date.now();
			advance(now);
			const players = runtime.stats.finish().players;
			const teams = {};
			for (const teamId of ['blue', 'red']) {
				const teamPlayers = Object.values(players).filter(player => player.teamId === teamId);
				const totals = { kills: 0, deaths: 0, assists: 0, damageDealt: 0, damageTaken: 0 };
				for (const player of teamPlayers) for (const key of Object.keys(totals)) totals[key] += player[key] || 0;
				const games = results.blue + results.red + results.draws;
				teams[teamId] = { model: runtime.policies[teamId].version,
					wins: results[teamId], losses: results[teamId === 'blue' ? 'red' : 'blue'],
					draws: results.draws, games, winRate: games ? (results[teamId] + results.draws * 0.5) / games : null,
					...totals, kda: (totals.kills + totals.assists) / Math.max(1, totals.deaths),
					players: teamPlayers.map(player => {
						const entity = ige.$(player.playerId);
						return { ...player, name: entity?._stats?.name || player.playerId,
							character: ige.game?.data?.unitTypes?.[entity?._battleBot?.previousCharacter]?.name || null };
					}) };
			}
			const humanPresent = ige.$$('player').some(player => player?._stats?.controlledBy === 'human' &&
				player._stats.playerJoined && !player._stats.isSpectator);
			return { models: { blue: runtime.policies.blue.version, red: runtime.policies.red.version },
				teams, round: { number: roundNumber, scores: { ...round.scores },
					remainingMs: Math.max(0, MATCH_DURATION_MS - (now - roundStartedAt)), durationMs: MATCH_DURATION_MS },
				humanPresent, neuralError: runtime.neuralError };
		},
		isOpponent: demoIsOpponent,
		decideNeural(player, snapshot, simulatedAt) {
			const policy = runtime.policyForPlayer(player);
			if (policy.kind !== 'neural' || !policy.weights) return null;
			try { return chooseNeuralAction({ weights: policy.weights, policyVersion: policy.version,
				playerId: player.id(), simulatedAt, snapshot, training: false }).action; }
			catch (error) { runtime.neuralError = error.message; return null; }
		},
		spawnBots(game) {
			const roster = buildTrainingRoster(ige.game.data);
			if (!roster.eligible.length) throw new Error('No playable demo characters');
			game.battleBotRoster = roster.eligible;
			for (const teamId of ['blue', 'red']) {
				const leftSide = teamId === 'blue';
				const playerTypeId = leftSide ? 'NZRmXbrEjA' : 'A6C0imglP3';
				for (let slot = 0; slot < 3; slot++) {
					const position = game._pickBattleBotSpawn(leftSide, null, 20);
					if (!position) throw new Error(`No clear demo spawn for ${teamId} ${slot + 1}`);
					const bot = game.createPlayer({ name: `${teamId === 'blue' ? 'Blue' : 'Red'} AI ${slot + 1}`,
						controlledBy: 'computer', playerTypeId, isBattleBot: true,
						playerJoined: true, trainingTeamId: teamId, unitIds: [] });
					bot._battleBot = { leftSide, previousCharacter: null, respawnTimer: null,
						thinkingAt: 0, lastPosition: null, stuckAt: 0 };
					const type = ige.game.getAsset('playerTypes', playerTypeId);
					if (type?.attributes) bot.updatePlayerType({ attributes: JSON.parse(JSON.stringify(type.attributes)),
						variables: type.variables || {} });
					game._spawnBattleBotUnit(bot, position, leftSide ? 0 : Math.PI);
					runtime.stats.registerPlayer({ playerId: bot.id(), teamId,
						characterId: bot._battleBot.previousCharacter });
					const selected = bot.getSelectedUnit && bot.getSelectedUnit();
					if (selected) runtime.stats.startLife({ playerId: bot.id(), lifeId: selected.id(),
						characterId: bot._battleBot.previousCharacter });
				}
			}
		}
	};
	ige.training = runtime;
	return runtime;
}

module.exports = { resolveDemoPolicy, demoIsOpponent, installDemo };
