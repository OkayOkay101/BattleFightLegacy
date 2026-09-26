const { buildTrainingRoster } = require('./TrainingRoster');
const { TrainingTrajectory } = require('./TrainingTrajectory');
const { chooseNeuralAction } = require('./NeuralController');

const TEAM_CONFIG = {
	blue: { playerTypeId: 'NZRmXbrEjA', leftSide: true },
	red: { playerTypeId: 'A6C0imglP3', leftSide: false }
};

function install(ige, config = {}) {
	if (ige.training) throw new Error('Training runtime is already installed');
	const runtime = {
		isTrainingMode: true,
		config,
		clock: config.clock || null,
		match: config.match || null,
		stats: config.stats || null,
		trajectory: new TrainingTrajectory(),
		neuralError: null,
		policyForPlayer(player) {
			return player?._stats?.trainingTeamId === 'blue' ? config.bluePolicy : config.redPolicy;
		},
		decideNeural(player, snapshot, simulatedAt) {
			const policy = runtime.policyForPlayer(player);
			if (policy?.kind !== 'neural' || !policy.weights) return null;
			try {
				const choice = chooseNeuralAction({ weights: policy.weights, policyVersion: policy.version,
					playerId: player.id(), simulatedAt, snapshot, training: config.split !== 'validation' });
				if (runtime.stats?.trace) runtime.stats.trace.recordNeuralAction({ actorId: player.id(),
					chosenIndex: choice.record.chosenIndex, action: choice.action });
				if (config.split !== 'validation' &&
					(!config.candidateVersion || policy.version === config.candidateVersion)) runtime.trajectory.record(choice.record);
				return choice.action;
			} catch (error) {
				runtime.neuralError = error.message;
				return null;
			}
		},
		isOpponent(a, b) {
			return !!(a && b && a !== b && a._stats && b._stats &&
				a._stats.isBattleBot && b._stats.isBattleBot &&
				a._stats.playerJoined && b._stats.playerJoined &&
				a._stats.trainingTeamId && b._stats.trainingTeamId &&
				a._stats.trainingTeamId !== b._stats.trainingTeamId);
		},
		spawnBots(game) {
			if (ige.game.data && ige.game.data.dialogues) {
				const roster = buildTrainingRoster(ige.game.data);
				if (!roster.eligible.length) throw new Error('No playable training characters');
				game.battleBotRoster = roster.eligible;
				runtime.excludedUnits = roster.excluded;
			}
			for (const [teamId, team] of Object.entries(TEAM_CONFIG)) {
				for (let slot = 0; slot < 3; slot++) {
					const position = game._pickBattleBotSpawn(team.leftSide, null, 20);
					if (!position) throw new Error(`No clear spawn for training ${teamId} ${slot + 1}`);
					const player = game.createPlayer({
						name: `Training ${teamId} ${slot + 1}`,
						controlledBy: 'computer',
						playerTypeId: team.playerTypeId,
						isBattleBot: true,
						playerJoined: true,
						trainingTeamId: teamId,
						unitIds: []
					});
					player._battleBot = {
						trainingTeamId: teamId,
						leftSide: team.leftSide,
						previousCharacter: null,
						respawnTimer: null,
						thinkingAt: 0,
						lastPosition: null,
						stuckAt: 0
					};
					const playerType = ige.game.getAsset('playerTypes', team.playerTypeId);
					if (playerType && playerType.attributes) {
						player.updatePlayerType({
							attributes: JSON.parse(JSON.stringify(playerType.attributes)),
							variables: playerType.variables || {}
						});
					}
					game._spawnBattleBotUnit(player, position, team.leftSide ? 0 : Math.PI);
					if (runtime.stats) {
						runtime.stats.registerPlayer({ playerId: player.id(), teamId,
							characterId: player._battleBot.previousCharacter });
						const selected = player.getSelectedUnit && player.getSelectedUnit();
						if (selected) runtime.stats.startLife({ playerId: player.id(), lifeId: selected.id(),
							characterId: player._battleBot.previousCharacter });
					}
				}
			}
		}
	};
	ige.training = runtime;
	return runtime;
}

module.exports = { install };
