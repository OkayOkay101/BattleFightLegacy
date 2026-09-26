/* Run from taro-engine: node test/battlefight-smoke.js (ports 80/2001 must be free). */
const assert = require('node:assert/strict');
const testRoster = process.argv.includes('--roster');
process.env.ENV = 'standalone';
process.argv = [process.argv[0], require.resolve('../server/ige'), '-g', './src'];
require('../server/ige');
const deadline = Date.now() + 30000;
const poll = setInterval(async () => {
	if (!global.ige || !ige.server || !ige.server.gameLoaded || !ige.now) {
		if (Date.now() > deadline) { console.error('FAIL: startup timeout'); process.exit(1); }
		return;
	}
	clearInterval(poll);
	try {
		assert.ok(ige.game.isGameStarted);
		const battleBots = ige.$$('player').filter(candidate => candidate._stats.isBattleBot === true);
		assert.equal(battleBots.length, 2, 'exactly two dedicated battle bots join the match');
		const battleRoster = new Set(['r3dZTAf1qa', 'hlnCxD3Epn', 'Pko4SCDSlz', 'Z60xDr0g4n', 'TRneecJl6K', 'AuD3DjTn9B']);
		for (const bot of battleBots) {
			const botUnit = bot.getSelectedUnit();
			assert.ok(botUnit && battleRoster.has(botUnit._stats.type), 'bot uses one of the six normal player characters');
			assert.notEqual(botUnit._stats.type, 'sloYT4ajGr', 'battle bot is not the legacy AI unit');
			assert.equal(bot._stats.controlledBy, 'computer', 'bots are not masquerading as humans');
		}
		const player = ige.game.createPlayer({ name: 'Smoke test', controlledBy: 'human', clientId: 'smoke-test' });
		ige.server.clients['smoke-test'] = { receivedJoinGame: Date.now() };
		player.joinGame();
		ige.game.lastPlayerSelectingDialogueOption = player.id();
		ige.script.runScript('Hh4HA0x3G8', { triggeredBy: { playerId: player.id() } });
		const unit = ige.$(player._stats.selectedUnitId);
		console.log('SMOKE PLAYER', player.id(), 'UNIT', unit && unit._stats.name);
		console.log('SMOKE ENTITIES', ['unit', 'item', 'projectile'].map(c => [c, (ige.$$(c) || []).length]));
		console.log('SMOKE SCRIPT ERRORS', ige.script.errorLogs);
		assert.ok(unit, 'joining creates and selects a playable unit');
		for (const bot of battleBots) {
			assert.equal(ige.game._selectBattleBotTarget(bot, bot.getSelectedUnit()).unit, unit,
				'bot targets the human player rather than the other battle bot');
		}
		unit.translateTo(1000, 1000, 0);
		player.control.input.mouse.x = 1400;
		player.control.input.mouse.y = 1000;
		const item = ige.$(unit._stats.itemIds[0]);
		assert.equal(item._stats.itemTypeId, 'EU42kdSjCF');
		item._stats.lastUsed = ige.now - item._stats.fireRate - 1;
		const before = ige.server.totalProjectilesCreated;
		item.use();
		assert.equal(ige.server.totalProjectilesCreated - before, 1, 'one Arcane Inferno shot, no fallback duplicate');
		const shot = ige.$(ige.game.lastCreatedProjectileId);
		assert.equal(shot._stats.type, '2RorkyQ4ta');
		assert.equal(shot._stats.sourceUnitId, unit.id());
		assert.ok(Math.abs(shot._translate.x - 1080) < 0.01, 'muzzle points towards mouse');
		assert.ok(Math.abs(shot._translate.y - 1000) < 0.01);
		assert.ok(shot._stats.defaultData.velocity.x > 0);
		assert.ok(Math.abs(shot._stats.defaultData.velocity.y) < 0.01);
		const targetPlayer = ige.game.createPlayer({ name: 'Target', controlledBy: 'computer' });
		targetPlayer.streamUpdateData([{ playerTypeId: 'A6C0imglP3' }]);
		player.streamUpdateData([{ playerTypeId: 'NZRmXbrEjA' }]);
		const target = targetPlayer.createUnit(Object.assign(ige.game.getAsset('unitTypes', 'r3dZTAf1qa'), {
			type: 'r3dZTAf1qa', defaultData: { translate: { x: 1400, y: 1000 }, rotate: 0 }
		}));
		const health = target._stats.attributes.health.value;
		ige.trigger._beginContactCallback({ m_fixtureA: { m_body: { _entity: target } }, m_fixtureB: { m_body: { _entity: shot } } });
		assert.equal(target._stats.attributes.health.value, health - 10, 'scoped collision script damages hostile target exactly once');
		assert.equal(shot._alive, false, 'projectile destroyed after hit');
		await new Promise(resolve => setTimeout(resolve, 100));
		const physicalHealth = target._stats.attributes.health.value;
		item._stats.lastUsed = ige.now - item._stats.fireRate - 1;
		item.use();
		const physicalShot = ige.$(ige.game.lastCreatedProjectileId);
		await new Promise(resolve => setTimeout(resolve, 1500));
		assert.ok(target._stats.attributes.health.value < physicalHealth, 'real PLANCK physics delivers projectile hit');
		assert.equal(physicalShot._alive, false);
		const attackerUnit = player.getSelectedUnit();
		player.streamUpdateData([{ playerTypeId: 'A6C0imglP3' }]);
		const victim = battleBots.find(candidate => candidate._stats.playerTypeId === 'NZRmXbrEjA');
		const victimUnit = victim.getSelectedUnit();
		const previousCharacter = victimUnit._stats.type;
		const deathPosition = { x: victimUnit._translate.x, y: victimUnit._translate.y };
		ige.game.data.variables['Gamemode Random'].value = 1; // verify the normal 3-second respawn path, not Permadeath.
		ige.game.lastAttackingUnitId = attackerUnit.id();
		victimUnit.lastAttackedBy = attackerUnit;
		victimUnit.lastAttackedAt = Date.now();
		victimUnit.attribute.update('health', 0, true);
		assert.equal(victim.getSelectedUnit()._stats.type, 'hLrbyj6dKv', 'bot death enters the shared ghost/death flow');
		await new Promise(resolve => setTimeout(resolve, 3200));
		const respawnedUnit = victim.getSelectedUnit();
		assert.ok(respawnedUnit && battleRoster.has(respawnedUnit._stats.type), 'bot respawns as a normal playable character');
		assert.notEqual(respawnedUnit._stats.type, previousCharacter, 'respawn picks a different character');
		assert.ok(Math.hypot(respawnedUnit._translate.x - deathPosition.x, respawnedUnit._translate.y - deathPosition.y) >= 64,
			'respawn uses a new position away from the death location');
		assert.equal(victim._stats.unitIds.filter(id => { const owned = ige.$(id); return owned && owned._stats.type !== 'hLrbyj6dKv'; }).length, 1, 'bot has one active combat unit');
		assert.deepEqual(ige.script.errorLogs, {});
		console.log('PASS: startup, selection, single scripted shot, direction, ownership, collision damage, real physics hit, destruction');
		if (testRoster) {
			let checked = 0;
			for (const option of ige.game.data.dialogues.WGLrmBwn2T.options) {
				const script = ige.game.data.scripts[option.scriptName];
				if (!script || !JSON.stringify(script.actions).includes('"type":"createUnitAtPosition"')) continue;
				const rosterPlayer = ige.game.createPlayer({ name: 'Roster ' + checked, controlledBy: 'computer' });
				rosterPlayer.streamUpdateData([{ playerTypeId: 'humanPlayer' }]);
				ige.game.lastPlayerSelectingDialogueOption = rosterPlayer.id();
				ige.script.runScript(option.scriptName, { triggeredBy: { playerId: rosterPlayer.id() } });
				const selected = rosterPlayer.getSelectedUnit();
				assert.ok(selected, 'roster selection: ' + option.name);
				checked++;
				await new Promise(resolve => setTimeout(resolve, 60));
			}
			await new Promise(resolve => setTimeout(resolve, 2000));
			console.log('ROSTER CHECKED', checked);
			assert.deepEqual(ige.script.errorLogs, {});
		}
		setTimeout(() => process.exit(0), 2000);
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
}, 100);
