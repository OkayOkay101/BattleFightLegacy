const fs = require('node:fs');
const path = require('node:path');
const { buildTrainingRoster } = require('./TrainingRoster');
const { chooseNeuralAction } = require('./NeuralController');

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
	const runtime = {
		isExhibitionMode: true,
		policy,
		neuralError: null,
		policyForPlayer() { return policy; },
		isOpponent: demoIsOpponent,
		decideNeural(player, snapshot, simulatedAt) {
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
				}
			}
		}
	};
	ige.training = runtime;
	return runtime;
}

module.exports = { resolveDemoPolicy, demoIsOpponent, installDemo };
