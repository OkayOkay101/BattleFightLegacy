var GameComponent = IgeEntity.extend({
	classId: 'GameComponent',
	componentId: 'game',

	init: function () {
		var self = this;

		this.units = {};
		this.players = {};
		this.items = {};
		this.food = {};
		this.joints = {};
		this.highlights = {};
		this.debris = {};
		this.createdEntities = [];
		this.gameOverModalIsShowing = false;
		this.isGameStarted = false;
		this.killFeed = ige.isServer ? new (require('../../../server/KillFeed').KillFeed)() : null;
		this.battleBotRoster = [
			{ id: 'r3dZTAf1qa', role: 'control', range: 430, slots: [1, 0, 2, 3] },
			{ id: 'hlnCxD3Epn', role: 'zone', range: 330, slots: [1, 0, 2, 3] },
			{ id: 'Pko4SCDSlz', role: 'melee', range: 100, slots: [0, 1, 2, 3] },
			{ id: 'Z60xDr0g4n', role: 'support', range: 380, slots: [1, 0, 2, 3] },
			{ id: 'TRneecJl6K', role: 'ranged', range: 500, slots: [0, 1, 2, 3] },
			{ id: 'AuD3DjTn9B', role: 'melee', range: 120, slots: [0, 1, 2, 3] }
		];
	},

	recordKillFeedDeath: function (unit, eventContext) {
		if (!ige.isServer || !this.killFeed || !unit || unit._category !== 'unit') return null;
		var victimPlayer = unit.getOwner && unit.getOwner();
		if (!victimPlayer || !victimPlayer.id || !victimPlayer._stats || victimPlayer._stats.isSpectator) return null;

		function participant(player, ownedUnit) {
			if (!player || !player.id || !player._stats) return null;
			return {
				id: player.id(),
				name: player._stats.name,
				teamId: player._stats.trainingTeamId || player._stats.teamId,
				characterId: ownedUnit && ownedUnit._stats && ownedUnit._stats.type || null
			};
		}

		var attackerUnit = eventContext && eventContext.attackingUnitId && ige.$(eventContext.attackingUnitId);
		var attackerPlayer = attackerUnit && attackerUnit.getOwner && attackerUnit.getOwner();
		var hostile = false;
		if (attackerPlayer && attackerPlayer !== victimPlayer) {
			try {
				hostile = !!((victimPlayer.isHostileTo && victimPlayer.isHostileTo(attackerPlayer)) ||
					(attackerPlayer.isHostileTo && attackerPlayer.isHostileTo(victimPlayer)));
			} catch (_) { hostile = false; }
		}

		var event = this.killFeed.recordDeath({
			lifeId: unit.id(),
			victim: participant(victimPlayer, unit),
			attacker: participant(attackerPlayer, attackerUnit),
			hostile: hostile,
			at: ige.training && ige.training.clock ? ige.training.clock.now() : Date.now()
		});
		if (event && ige.network && ige.network.send) ige.network.send('battleKillFeed', event);
		return event;
	},

	start: function () {
		var self = this;
		GameComponent.prototype.log('Game component started');
		if (ige.isServer) {
			ige.chat.createRoom('lobby', {}, '1');

			// by default, create 5 computer players
			var aiCount = 10;
			// if (global.isDev) {
			// 	var aiCount = 50 // create 50 ai players if dev env
			// }

			for (var i = 1; i <= aiCount; i++) {
				this[`computer${i}`] = this.createPlayer({
					name: `AI ${i}`,
					controlledBy: 'computer',
					unitIds: [] // all units owned by player
				});

				// GameComponent.prototype.log("computerPlayer created " + this['computer' + i].id())
				// if (global.isDev) {
				// 	ige.trigger.fire("playerJoinsGame", { playerId: this['computer'+i].id() })
				// }
			}
			ige.trigger.fire('gameStart');
			this._enableBattleBotDeathScript();
			if (ige.training && (ige.training.isTrainingMode || ige.training.isExhibitionMode)) ige.training.spawnBots(this);
			else this._spawnBattleBots();
		} else if (ige.isClient) {
			// determine which attribute will be used for scoreboard
			var attr = 'points';
			if (
				ige.game.data.settings &&
        ige.game.data.settings.constants &&
        ige.game.data.settings.constants.currency != undefined
			) {
				attr = ige.game.data.settings.constants.currency;
			}
			$('.game-currency').html(attr);
		}

		self.isGameStarted = true;
		ige.timer.startGameClock();
	},

	_spawnBattleBots: function () {
		var game = this;
		var map = ige.map && ige.map.data;
		if (!map || !ige.variable) return;
		var botConfigs = [
			{ name: 'Battle Bot Blue', playerTypeId: 'NZRmXbrEjA', leftSide: true },
			{ name: 'Battle Bot Red', playerTypeId: 'A6C0imglP3', leftSide: false }
		];

		botConfigs.forEach(function (config) {
			var position = game._pickBattleBotSpawn(config.leftSide, null, 20);
			if (!position) {
				GameComponent.prototype.log('Could not find a clear spawn position for ' + config.name);
				return;
			}

			var bot = game.createPlayer({
				name: config.name,
				controlledBy: 'computer',
				playerTypeId: config.playerTypeId,
				isBattleBot: true,
				playerJoined: true,
				unitIds: []
			});
			bot._battleBot = { previousCharacter: null, respawnTimer: null, thinkingAt: 0, lastPosition: null, stuckAt: 0 };
			var playerType = ige.game.getAsset('playerTypes', config.playerTypeId);
			if (playerType && playerType.attributes) bot.updatePlayerType({ attributes: JSON.parse(JSON.stringify(playerType.attributes)), variables: playerType.variables || {} });
			bot._battleBot.leftSide = config.leftSide;
			game._spawnBattleBotUnit(bot, position, config.leftSide ? 0 : Math.PI);
		});
	},

	_battleBotClearPosition: function (position, radius) {
		var map = ige.map && ige.map.data;
		if (!map || !position) return false;
		var tileWidth = ige.scaleMapDetails && ige.scaleMapDetails.tileWidth || map.tilewidth;
		var tileHeight = ige.scaleMapDetails && ige.scaleMapDetails.tileHeight || map.tileheight;
		var margin = Math.max(0, radius || 0);
		if (position.x - margin < 0 || position.y - margin < 0 ||
			position.x + margin >= map.width * tileWidth || position.y + margin >= map.height * tileHeight) return false;
		var walls = (map.layers || []).find(function (layer) { return layer.name === 'walls'; });
		if (!walls || !walls.data) return true;
		for (var y = Math.floor((position.y - margin) / tileHeight); y <= Math.floor((position.y + margin) / tileHeight); y++) {
			for (var x = Math.floor((position.x - margin) / tileWidth); x <= Math.floor((position.x + margin) / tileWidth); x++) {
				if (!walls.data[x + y * map.width]) continue;
				var px = Math.max(x * tileWidth, Math.min(position.x, (x + 1) * tileWidth));
				var py = Math.max(y * tileHeight, Math.min(position.y, (y + 1) * tileHeight));
				if (Math.hypot(position.x - px, position.y - py) <= margin + 2) return false;
			}
		}
		return true;
	},

	_pickBattleBotSpawn: function (leftSide, previousPosition, radius) {
		var map = ige.map && ige.map.data;
		if (!map || !ige.variable) return undefined;
		var tileWidth = ige.scaleMapDetails && ige.scaleMapDetails.tileWidth || map.tilewidth;
		var tileHeight = ige.scaleMapDetails && ige.scaleMapDetails.tileHeight || map.tileheight;
		var half = map.width * tileWidth / 2;
		var region = {
			x: leftSide ? 2 * tileWidth : half,
			y: 2 * tileHeight,
			width: half - 2 * tileWidth,
			height: (map.height - 4) * tileHeight
		};
		var self = this;
		function valid(position, minDistance) {
			return position && position.x >= region.x && position.x < region.x + region.width &&
				position.y >= region.y && position.y < region.y + region.height &&
				(!previousPosition || Math.hypot(position.x - previousPosition.x, position.y - previousPosition.y) >= minDistance) &&
				self._battleBotClearPosition(position, radius) && !ige.variable.isPositionInEntity(position);
		}
		for (var attempt = 0; attempt < 80; attempt++) {
			var candidate = ige.variable.getRandomPositionInRegion(region);
			if (valid(candidate, Math.max(4 * tileWidth, 4 * tileHeight))) return candidate;
		}
		for (var retry = 0; retry < 80; retry++) {
			var fallback = ige.variable.getRandomPositionInRegion(region);
			if (valid(fallback, Math.max(tileWidth, tileHeight))) return fallback;
		}
		return undefined;
	},

	_enableBattleBotDeathScript: function () {
		var script = ige.game.data.scripts && ige.game.data.scripts.hRwdzzEwgW;
		if (!script || script._battleBotDeathEnabled) return;
		function visit(value) {
			if (!value || typeof value !== 'object') return;
			if (value.function === 'playerIsControlledByHuman') value.function = 'playerIsMatchParticipant';
			Object.keys(value).forEach(function (key) { visit(value[key]); });
		}
		visit(script);
		script._battleBotDeathEnabled = true;
		if (ige.script && ige.script.scriptCache) delete ige.script.scriptCache.hRwdzzEwgW;
	},

	_spawnBattleBotUnit: function (player, position, rotation) {
		if (!player || !player._battleBot) return;
		var roster = this.battleBotRoster;
		var other = ige.$$('player').find(function (candidate) {
			var selected = candidate.getSelectedUnit && candidate.getSelectedUnit();
			return candidate !== player && candidate._stats.isBattleBot && candidate._stats.playerJoined && selected && selected._stats.type !== 'hLrbyj6dKv' && selected._stats.attributes.health.value > 0;
		});
		var otherType = other && other.getSelectedUnit() && other.getSelectedUnit()._stats.type;
		var candidates = roster.filter(function (entry) { return entry.id !== player._battleBot.previousCharacter && entry.id !== otherType; });
		var selected = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)].id : roster.find(function (entry) { return entry.id !== player._battleBot.previousCharacter; }).id;
		if (!selected) return;
		var unitType = ige.game.getAsset('unitTypes', selected);
		if (!unitType) return;
		var unitData = JSON.parse(JSON.stringify(unitType));
		unitData.type = selected;
		unitData.defaultData = Object.assign({}, unitData.defaultData, { translate: position, rotate: rotation });
		player._battleBot.previousCharacter = selected;
		var unit = player.createUnit(unitData);
		if (unit) {
			player.selectUnit(unit.id());
			if (ige.training && (ige.training.isTrainingMode || ige.training.isExhibitionMode) && ige.training.stats) {
				ige.training.stats.startLife({ playerId: player.id(), lifeId: unit.id(), characterId: selected });
			}
			unit.addBehaviour('battleBotBrain', function () { ige.game._thinkBattleBot(player, unit); });
		}
	},

	_getBattleBotUnits: function (now) {
		if (ige.training && ige._trainingCachedUnitsAt === now && ige._trainingCachedUnits) {
			return ige._trainingCachedUnits;
		}
		var units = ige.$$('unit');
		if (ige.training) {
			ige._trainingCachedUnits = units;
			ige._trainingCachedUnitsAt = now;
		}
		return units;
	},

	_getBattleBotProjectiles: function (now) {
		if (ige.training && ige._trainingCachedProjectilesAt === now && ige._trainingCachedProjectiles) {
			return ige._trainingCachedProjectiles;
		}
		var projectiles = ige.$$('projectile');
		if (ige.training) {
			ige._trainingCachedProjectiles = projectiles;
			ige._trainingCachedProjectilesAt = now;
		}
		return projectiles;
	},

	_selectBattleBotTarget: function (player, unit) {
		return this._battleBotTargets(player, unit)[0];
	},

	_battleBotTargets: function (player, unit, now) {
		now = now || (ige.training && ige.training.clock ? ige.training.clock.now() : Date.now());
		return this._getBattleBotUnits(now).filter(function (candidate) {
			var owner = candidate.getOwner && candidate.getOwner();
			return candidate !== unit && candidate._stats && candidate._stats.type !== 'hLrbyj6dKv' &&
				candidate._stats.attributes && candidate._stats.attributes.health && candidate._stats.attributes.health.value > 0 &&
				owner && owner._stats && owner._stats.playerJoined &&
				(ige.training && (ige.training.isTrainingMode || ige.training.isExhibitionMode) ? ige.training.isOpponent(player, owner) : owner._stats.controlledBy === 'human') &&
				owner.getSelectedUnit && owner.getSelectedUnit() === candidate && player.isHostileTo(owner);
		}).map(function (enemy) {
			return { unit: enemy, distance: Math.hypot(enemy._translate.x - unit._translate.x, enemy._translate.y - unit._translate.y) };
		}).sort(function (a, b) { return a.distance - b.distance; });
	},

	_battleBotProjectileSpeed: function (item, physics) {
		var projectile = this._battleBotProjectileProfile(item, physics);
		if (projectile && projectile.speedPxPerSecond > 0) return projectile.speedPxPerSecond;
		var stats = item && item._stats || {};
		var force = Number(stats.bulletForce);
		if (force > 0) return force * (physics && physics._scaleRatio || 30);
		return Number(stats.projectileSpeed) || 360;
	},

	_battleBotProjectileProfile: function (item, physics) {
		if (!item || !item._stats || !item._stats.scripts || typeof ige === 'undefined' || !ige.game || !ige.game.getAsset) return null;
		if (!item._battleBotProjectileProfile) {
			item._battleBotProjectileProfile = require('./unit/BattleBotProjectileProfile').resolveProjectileProfile(
				item._stats, function (id) { return ige.game.getAsset('projectileTypes', id); },
				physics && physics._scaleRatio || 30);
		}
		return item._battleBotProjectileProfile;
	},

	_battleBotIgnoresWalls: function (item) {
		var stats = item && item._stats || {};
		// Call Down places its effect at the cursor; ordinary projectiles collide with walls.
		if (stats.itemTypeId !== 'yjZur6OtA4') return false;
		return Object.values(stats.scripts || {}).some(function (script) {
			return script && !script.disabled && (script.triggers || []).some(function (trigger) { return trigger.type === 'itemIsUsed'; }) &&
				(script.actions || []).some(function (action) {
					return action.type === 'createProjectileAtPosition' && action.force === 0 &&
						action.position && action.position.function === 'getMouseCursorPosition';
				});
		});
	},

	_battleBotWeaponRange: function (item, physics) {
		if (this._battleBotIgnoresWalls(item)) return Infinity;
		var stats = item && item._stats || {};
		var projectile = this._battleBotProjectileProfile(item, physics);
		var lifeSpan = projectile && projectile.lifeSpanMs || Number(item && item.projectileData && item.projectileData.lifeSpan);
		if (!stats.isGun || !lifeSpan || lifeSpan <= 0) return 180;
		return this._battleBotProjectileSpeed(item, physics) * lifeSpan / 1000;
	},

	_battleBotCanAttack: function (item, distance, visible, physics) {
		return !!item && distance <= this._battleBotWeaponRange(item, physics) &&
			(visible || this._battleBotIgnoresWalls(item));
	},

	_selectBattleBotWeapon: function (unit, profile, distance, visible, now, preferredSlot, physics, ricochetForItem) {
		var self = this;
		var slots = profile.slots || [0, 1, 2, 3];
		var start = Math.max(0, slots.indexOf(preferredSlot));
		for (var offset = 0; offset < slots.length; offset++) {
			var slot = slots[(start + offset) % slots.length];
			var item = unit.inventory && unit.inventory.getItemBySlotNumber(slot + 1);
			if (!item) continue;
			var ricochet = !visible && ricochetForItem && ricochetForItem(item);
			if (!ricochet && !self._battleBotCanAttack(item, distance, visible, physics)) continue;
			if (item.hasQuantityRemaining && !item.hasQuantityRemaining()) continue;
			var stats = item._stats || {};
			if (Number(stats.lastUsed || 0) + Number(stats.fireRate || 0) >= now) continue;
			var cost = stats.cost || {};
			var owner = unit.getOwner && unit.getOwner();
			var unitAttributes = unit._stats && unit._stats.attributes || {};
			var playerAttributes = owner && owner._stats && owner._stats.attributes || {};
			if (Object.keys(cost.unitAttributes || {}).some(function (key) { return !unitAttributes[key] || unitAttributes[key].value < cost.unitAttributes[key]; })) continue;
			if (Object.keys(cost.playerAttributes || {}).some(function (key) { return !playerAttributes[key] || playerAttributes[key].value < cost.playerAttributes[key]; })) continue;
			return { slot: slot, item: item, ricochet: ricochet || null };
		}
	},

	_battleBotNeuralDecision: function (player, unit, targets, map, tileWidth, tileHeight, now, profile) {
		if (!ige.training?.decideNeural) return null;
		var policy = ige.training.policyForPlayer(player);
		if (policy?.kind !== 'neural' || !policy.weights) return null;
		var self = this, state = player._battleBot;
		var mapWidth = Math.max(1, Number(map.width) * tileWidth);
		var mapHeight = Math.max(1, Number(map.height) * tileHeight);
		var health = unit._stats.attributes.health;
		var selfDt = state.lastPosition && state.lastPositionAt && now > state.lastPositionAt ?
			(now - state.lastPositionAt) / 1000 : 0;
		var observed = state.neuralObserved || (state.neuralObserved = new Map());
		var enemies = targets.slice(0, 3).map(function (entry) {
			var enemy = entry.unit, id = enemy.id(), previous = observed.get(id);
			var dt = previous && now > previous.at ? (now - previous.at) / 1000 : 0;
			var vx = dt ? (enemy._translate.x - previous.x) / dt : 0;
			var vy = dt ? (enemy._translate.y - previous.y) / dt : 0;
			observed.set(id, { x: enemy._translate.x, y: enemy._translate.y, at: now });
			var enemyHealth = enemy._stats.attributes.health;
			return { id: id, distance: entry.distance,
				visible: unit.ai.battleBotHasLineOfSight(map, 1, 1, tileWidth, unit._translate, enemy._translate),
				lowHealth: enemyHealth.value <= enemyHealth.max * 0.3,
				features: [(enemy._translate.x - unit._translate.x) / mapWidth,
					(enemy._translate.y - unit._translate.y) / mapHeight, vx / 1000, vy / 1000,
					enemyHealth.value / Math.max(1, enemyHealth.max)], ricochetAims: {} };
		});
		var allUnits = this._getBattleBotUnits(now);
		var allProjectiles = this._getBattleBotProjectiles(now);
		var allies = allUnits.filter(function (candidate) {
			var owner = candidate.getOwner && candidate.getOwner();
			return candidate !== unit && owner && owner._stats?.trainingTeamId === player._stats.trainingTeamId &&
				owner.getSelectedUnit?.() === candidate && candidate._stats.attributes?.health?.value > 0;
		}).map(function (candidate) {
			return { id: candidate.id(), distance: Math.hypot(candidate._translate.x - unit._translate.x,
				candidate._translate.y - unit._translate.y),
				features: [(candidate._translate.x - unit._translate.x) / mapWidth,
					(candidate._translate.y - unit._translate.y) / mapHeight,
					candidate._stats.attributes.health.value / Math.max(1, candidate._stats.attributes.health.max)] };
		});
		var projectiles = allProjectiles.filter(function (projectile) {
			var source = projectile._stats && ige.$(projectile._stats.sourceUnitId);
			var owner = source && source.getOwner && source.getOwner();
			return owner && ige.training.isOpponent(player, owner) &&
				unit.ai.battleBotHasLineOfSight(map, 1, 1, tileWidth, unit._translate, projectile._translate);
		}).map(function (projectile) {
			var previous = state.projectiles?.get(projectile.id());
			var dt = previous && now > previous.at ? (now - previous.at) / 1000 : 0;
			return { id: projectile.id(), distance: Math.hypot(projectile._translate.x - unit._translate.x,
				projectile._translate.y - unit._translate.y),
				features: [(projectile._translate.x - unit._translate.x) / mapWidth,
					(projectile._translate.y - unit._translate.y) / mapHeight,
					dt ? (projectile._translate.x - previous.x) / dt / 1000 : 0,
					dt ? (projectile._translate.y - previous.y) / dt / 1000 : 0] };
		}).sort(function (a, b) { return a.distance - b.distance; }).slice(0, 4);
		var weapons = [], weaponReady = [0, 0, 0, 0];
		for (var slot of profile.slots || [0, 1, 2, 3]) {
			if (slot < 0 || slot > 3) continue;
			var usable = self._selectBattleBotWeapon(unit, { slots: [slot] }, 0, true, ige.now || now,
				slot, ige.physics);
			if (!usable) continue;
			weaponReady[slot] = 1;
			var projectileProfile = self._battleBotProjectileProfile(usable.item, ige.physics);
			weapons.push({ slot: slot, ready: true, range: self._battleBotWeaponRange(usable.item, ige.physics),
				canIgnoreWalls: self._battleBotIgnoresWalls(usable.item) });
			if (!projectileProfile?.canBounceWall) continue;
			for (var entry of enemies) {
				if (entry.visible) continue;
				var targetUnit = targets.find(function (target) { return target.unit.id() === entry.id; })?.unit;
				var options = require('./unit/BattleBotRicochet').findRicochetOptions({
					map: map, origin: unit._translate, target: targetUnit._translate,
					targetVelocity: { x: entry.features[2] * 1000, y: entry.features[3] * 1000 },
					speed: projectileProfile.speedPxPerSecond, lifeSpanMs: projectileProfile.lifeSpanMs,
					restitution: projectileProfile.wallBounceRestitution, radius: 8
				});
				if (options[0]) entry.ricochetAims[slot] = options[0].aim;
			}
		}
		return ige.training.decideNeural(player, { self: { health: health.value / Math.max(1, health.max),
			x: unit._translate.x / mapWidth, y: unit._translate.y / mapHeight,
			vx: selfDt ? (unit._translate.x - state.lastPosition.x) / selfDt / 1000 : 0,
			vy: selfDt ? (unit._translate.y - state.lastPosition.y) / selfDt / 1000 : 0,
			attackRange: profile.range,
			characterId: unit._stats.type }, allies, enemies, projectiles,
			weaponReady, targets: enemies, weapons }, now);
	},

	_thinkBattleBot: function (player, unit) {
		var state = player && player._battleBot;
		if (!state || !unit || unit._stats.attributes.health.value <= 0 || player.getSelectedUnit() !== unit) return;
		var now = ige.training && ige.training.clock ? ige.training.clock.now() : Date.now();
		if (now - state.thinkingAt < 100) return;
		state.thinkingAt = now;
		var targets = this._battleBotTargets(player, unit, now);
		var target = targets[0];
		if (!target) {
			unit.stopMoving();
			if (unit._stats.controls && unit._stats.controls.movementMethod === 'velocity') unit.setLinearVelocity(0, 0);
			unit.ability.stopUsingItem();
			return;
		}
		var map = ige.map && ige.map.data;
		var tileWidth = ige.scaleMapDetails && ige.scaleMapDetails.tileWidth || map.tilewidth;
		var tileHeight = ige.scaleMapDetails && ige.scaleMapDetails.tileHeight || map.tileheight;
		var radius = Math.max(12, Math.min(unit.width() || 40, unit.height() || 40) * 0.35);
		var visible = unit.ai.battleBotHasLineOfSight(map, 1, 1, tileWidth, unit._translate, target.unit._translate);
		var profile = this.battleBotRoster.find(function (entry) { return entry.id === unit._stats.type; }) || { range: 350, slots: [0, 1, 2, 3] };
		var policy = ige.training && (ige.training.isTrainingMode || ige.training.isExhibitionMode) ? ige.training.policyForPlayer(player) : ige.trainingPolicy;
		var neuralAction = this._battleBotNeuralDecision(player, unit, targets, map, tileWidth, tileHeight, now, profile);
		if (neuralAction && neuralAction.targetId === null) {
			unit.stopMoving();
			unit.ability.stopUsingItem();
			return;
		}
		if (neuralAction?.targetId) target = targets.find(function (entry) { return entry.unit.id() === neuralAction.targetId; }) || target;
		var params = policy && policy.params || {};
		var tacticalRange = profile.range * (params.rangeScale || 1);
		var weaponSwitchMs = 900 * (params.switchScale || 1);
		var dodgeScale = params.dodgeScale || 1;
		var currentSlot = unit._stats.currentItemIndex || 0;
		var preferredSlot = currentSlot;
		if (state.weaponSwitchAt && now >= state.weaponSwitchAt) {
			var orderIndex = profile.slots.indexOf(currentSlot);
			preferredSlot = profile.slots[(orderIndex + 1) % profile.slots.length];
		}
		var observedTargetVelocity = { x: 0, y: 0 };
		if (state.lastTarget && state.lastTarget.id === target.unit.id() && now > state.lastTarget.at) {
			var elapsed = (now - state.lastTarget.at) / 1000;
			observedTargetVelocity.x = (target.unit._translate.x - state.lastTarget.x) / elapsed;
			observedTargetVelocity.y = (target.unit._translate.y - state.lastTarget.y) / elapsed;
		}
		state.lastTarget = { id: target.unit.id(), x: target.unit._translate.x, y: target.unit._translate.y, at: now };
		var self = this;
		var ricochetForItem = function (item) {
			var projectile = self._battleBotProjectileProfile(item, ige.physics);
			if (!projectile || !projectile.canBounceWall) return null;
			return require('./unit/BattleBotRicochet').findRicochetOptions({
				map: map, origin: unit._translate, target: target.unit._translate,
				targetVelocity: observedTargetVelocity, speed: projectile.speedPxPerSecond,
				lifeSpanMs: projectile.lifeSpanMs, restitution: projectile.wallBounceRestitution,
				radius: Math.max(1, Math.min(radius, 8))
			})[0] || null;
		};
		var weapon = this._selectBattleBotWeapon(unit,
			neuralAction?.slot !== null && neuralAction?.slot !== undefined ? { slots: [neuralAction.slot] } : profile,
			target.distance, visible, ige.now || now,
			neuralAction?.slot !== null && neuralAction?.slot !== undefined ? neuralAction.slot : preferredSlot,
			ige.physics, neuralAction?.aimMode === 'direct' ? null : ricochetForItem);
		if (weapon && neuralAction?.aimMode === 'ricochet' && !weapon.ricochet) weapon.ricochet = ricochetForItem(weapon.item);
		var projectileSpeed = weapon ? this._battleBotProjectileSpeed(weapon.item, ige.physics) : 360;
		var aim = weapon && weapon.ricochet ? weapon.ricochet.aim :
			weapon && this._battleBotIgnoresWalls(weapon.item) ? target.unit._translate :
			neuralAction?.aimMode === 'direct' ? target.unit._translate :
			unit.ai.predictBattleBotAim(unit._translate, target.unit._translate, observedTargetVelocity, projectileSpeed);
		unit.botAimPosition = aim || target.unit._translate;
		unit.angleToTarget = Math.atan2(unit.botAimPosition.y - unit._translate.y, unit.botAimPosition.x - unit._translate.x) + Math.radians(90);
		player.absoluteAngle = unit.angleToTarget;
		var dx = target.unit._translate.x - unit._translate.x, dy = target.unit._translate.y - unit._translate.y;
		var baseAngle = Math.atan2(dy, dx);
		var moving = true;
		if (neuralAction) {
			if (neuralAction.movement === 'approach') {
				unit.movementAngle = baseAngle;
			} else if (neuralAction.movement === 'retreat') {
				unit.movementAngle = baseAngle + Math.PI;
			} else if (neuralAction.movement === 'strafe_left' || neuralAction.movement === 'strafe') {
				unit.movementAngle = baseAngle + Math.PI / 2;
			} else if (neuralAction.movement === 'strafe_right') {
				unit.movementAngle = baseAngle - Math.PI / 2;
			} else if (neuralAction.movement === 'kite') {
				if (target.distance < tacticalRange * 0.8) unit.movementAngle = baseAngle + Math.PI;
				else if (target.distance > tacticalRange * 1.1) unit.movementAngle = baseAngle;
				else unit.movementAngle = baseAngle + Math.PI / 2;
			} else if (neuralAction.movement === 'dodge') {
				unit.movementAngle = state.dodgeAngle !== undefined ? state.dodgeAngle : (baseAngle + Math.PI / 2);
			} else if (neuralAction.movement === 'hold') {
				moving = false;
			}
		} else {
			var desired = target.distance > tacticalRange ? 1 : (target.distance < tacticalRange * 0.55 && profile.role !== 'melee' ? -1 : 0);
			unit.movementAngle = baseAngle + (desired < 0 ? Math.PI : 0) + (desired === 0 ? Math.PI / 2 : 0);
			moving = desired !== 0 || !visible || profile.role !== 'melee';
		}
		var lookAhead = { x: unit._translate.x + Math.cos(unit.movementAngle) * 96, y: unit._translate.y + Math.sin(unit.movementAngle) * 96 };
		var directIsClear = unit.ai.battleBotPositionIsClear(map, tileWidth, tileHeight, lookAhead, radius);
		if ((!neuralAction || moving) && (!visible || moving && !directIsClear || state.path && state.path.length)) {
			if (!state.path || state.pathTargetId !== target.unit.id() || now - state.lastPathAt > 750) {
				state.path = unit.ai.findBattleBotPath(map, tileWidth, tileHeight, unit._translate, target.unit._translate, radius);
				state.pathTargetId = target.unit.id();
				state.lastPathAt = now;
			}
			while (state.path && state.path.length && Math.hypot(state.path[0].x - unit._translate.x, state.path[0].y - unit._translate.y) < Math.min(tileWidth, tileHeight) * 0.35) state.path.shift();
			if (state.path && state.path.length) {
				unit.movementAngle = Math.atan2(state.path[0].y - unit._translate.y, state.path[0].x - unit._translate.x);
				moving = true;
			} else if (!directIsClear) moving = false;
		} else state.path = null;
		if (!state.projectiles) state.projectiles = new Map();
		var seen = new Set(), dodgeAngle;
		this._getBattleBotProjectiles(now).forEach(function (projectile) {
			var source = projectile._stats && ige.$(projectile._stats.sourceUnitId);
			var owner = source && source.getOwner && source.getOwner();
			if (!owner || !player.isHostileTo(owner) ||
				(!(ige.training?.isTrainingMode || ige.training?.isExhibitionMode) && owner._stats.controlledBy !== 'human')) return;
			if (Math.hypot(projectile._translate.x - unit._translate.x, projectile._translate.y - unit._translate.y) > 650 * dodgeScale ||
				!unit.ai.battleBotHasLineOfSight(map, 1, 1, tileWidth, unit._translate, projectile._translate)) return;
			var id = projectile.id(), previous = state.projectiles.get(id);
			seen.add(id);
			state.projectiles.set(id, { x: projectile._translate.x, y: projectile._translate.y, at: now, firstSeen: previous ? previous.firstSeen : now });
			if (!previous || now - previous.firstSeen < 50 || now <= previous.at) return;
			var delta = (now - previous.at) / 1000;
			var velocity = { x: (projectile._translate.x - previous.x) / delta, y: (projectile._translate.y - previous.y) / delta };
			var candidate = unit.ai.chooseBattleBotDodge(map, tileWidth, tileHeight, unit._translate, projectile._translate, velocity, radius);
			if (candidate !== undefined) dodgeAngle = candidate;
		});
		state.projectiles.forEach(function (_, id) { if (!seen.has(id)) state.projectiles.delete(id); });
		if (dodgeAngle !== undefined) { state.dodgeAngle = dodgeAngle; state.dodgeUntil = now + 350 * dodgeScale; }
		if (state.dodgeUntil > now && state.dodgeAngle !== undefined) {
			unit.movementAngle = state.dodgeAngle;
			moving = true;
		}
		if (state.lastPosition && Math.hypot(unit._translate.x - state.lastPosition.x, unit._translate.y - state.lastPosition.y) < 3 && moving) {
			state.stuckAt = state.stuckAt || now;
			if (now - state.stuckAt > 600) {
				state.path = null;
				state.lastPathAt = 0;
				var sidestep = unit.movementAngle + Math.PI / 2;
				var sidestepPoint = { x: unit._translate.x + Math.cos(sidestep) * 96, y: unit._translate.y + Math.sin(sidestep) * 96 };
				if (!unit.ai.battleBotPositionIsClear(map, tileWidth, tileHeight, sidestepPoint, radius)) sidestep -= Math.PI;
				unit.movementAngle = sidestep;
				state.stuckAt = now;
			}
		} else state.stuckAt = 0;
		state.lastPosition = { x: unit._translate.x, y: unit._translate.y };
		state.lastPositionAt = now;
		if (moving) unit.startMoving();
		else {
			unit.stopMoving();
			if (unit._stats.controls && unit._stats.controls.movementMethod === 'velocity') unit.setLinearVelocity(0, 0);
		}
		if (weapon) {
			if (currentSlot !== weapon.slot) {
				unit.changeItem(weapon.slot);
				state.weaponSwitchAt = now + weaponSwitchMs;
			} else if (!state.weaponSwitchAt) state.weaponSwitchAt = now + weaponSwitchMs;
			if (!weapon.item._stats.isBeingUsed) unit.ability.startUsingItem();
		} else unit.ability.stopUsingItem();
	},

	handleBattleBotDeath: function (unit, eventContext) {
		var player = unit && unit.getOwner();
		var state = player && player._battleBot;
		if (ige.training && (ige.training.isTrainingMode || ige.training.isExhibitionMode) && player && player.getSelectedUnit && player.getSelectedUnit() !== unit) return;
		if (!state || state.respawnTimer || state.deadUnitId === unit.id()) return;
		if (ige.training && (ige.training.isTrainingMode || ige.training.isExhibitionMode)) {
			var killerUnit = eventContext && eventContext.attackingUnitId && ige.$(eventContext.attackingUnitId);
			var killerPlayer = killerUnit && killerUnit.getOwner && killerUnit.getOwner();
			var death = {
				lifeId: unit.id(),
				victimTeamId: player._stats.trainingTeamId,
				killerTeamId: killerPlayer &&
					(!ige.training.isExhibitionMode || killerPlayer._stats.isBattleBot) &&
					killerPlayer._stats.trainingTeamId || null,
				at: ige.training.clock ? ige.training.clock.now() : Date.now()
			};
			if (ige.training.isExhibitionMode && ige.training.recordBotDeath) {
				ige.training.recordBotDeath({ ...death, victimId: player.id(),
					killerId: killerPlayer && killerPlayer._stats.isBattleBot ? killerPlayer.id() : null });
			} else {
				if (ige.training.match) ige.training.match.recordDeath(death);
				if (ige.training.stats) ige.training.stats.recordDeath({
					lifeId: death.lifeId,
					victimId: player.id(),
					killerId: killerPlayer && killerPlayer.id(),
					at: death.at
				});
			}
		}
		state.deadUnitId = unit.id();
		state.deathPosition = { x: unit._translate.x, y: unit._translate.y };
		state.waitingAtDeath = !!(ige.training && ige.training.isExhibitionMode &&
			ige.variable.getVariable('Current Game State') === 'Waiting');
		state.path = null;
		state.projectiles = null;
		unit.stopMoving();
		if (unit._stats.controls && unit._stats.controls.movementMethod === 'velocity') unit.setLinearVelocity(0, 0);
		unit.ability.stopUsingItem();
		if (unit.cleanUpProjectiles) unit.cleanUpProjectiles();
		var trainingClock = ige.training && ige.training.clock;
		function scheduleRespawn(delay) {
			if (trainingClock) return trainingClock.schedule(attemptRespawn, delay);
			var timer = setTimeout(attemptRespawn, delay);
			if (timer.unref) timer.unref();
			return timer;
		}
		function attemptRespawn() {
			state.respawnTimer = null;
			if (ige.training && ige.training.isExhibitionMode) {
				var gameState = ige.variable.getVariable('Current Game State');
				var waitingBeforeMatch = state.waitingAtDeath && gameState === 'Waiting';
				if (gameState && gameState !== 'Ongoing' && !state.waitingAtDeath) state.sawRoundEnd = true;
				if (!ige.game.isGameStarted || (gameState && gameState !== 'Ongoing' && !waitingBeforeMatch) ||
					(ige.variable.getVariable('Gamemode Random') === 3 && !state.sawRoundEnd && !state.waitingAtDeath)) {
					state.respawnTimer = scheduleRespawn(1000);
					return;
				}
			} else if (!ige.game.isGameStarted || ige.variable.getVariable('Gamemode Random') === 3) {
				return;
			}
			var position = ige.game._pickBattleBotSpawn(state.leftSide, state.deathPosition, 20);
			if (!position) {
				state.respawnTimer = scheduleRespawn(1000);
				return;
			}
			var oldUnit = ige.$(state.deadUnitId);
			if (oldUnit) {
				player.disownUnit(oldUnit);
				oldUnit.destroy();
			}
			state.deadUnitId = null;
			state.sawRoundEnd = false;
			state.waitingAtDeath = false;
			ige.game._spawnBattleBotUnit(player, position, Math.random() * Math.PI * 2);
		}
		state.respawnTimer = scheduleRespawn(3000);
	},

	createPlayer: function (data, persistedData) {
		var self = this;

		/* removing unnecessary purchases keys */
		var purchases = [];
		if (data.purchasables) {
			for (var i = 0; i < data.purchasables.length; i++) {
				var purchasable = data.purchasables[i];
				purchasable = _.pick(purchasable, ['_id', 'image', 'owner', 'target']);
				purchases.push(purchasable);
			}
		}

		var playerData = {
			controlledBy: data.controlledBy,
			name: data.name,
			playerTypeId: data.playerTypeId,
			isBattleBot: data.isBattleBot === true,
			isSpectator: data.isSpectator === true,
			playerJoined: data.playerJoined === true,
			trainingTeamId: data.trainingTeamId,
			coins: data.coins,
			points: data.points || 0,
			clientId: data.clientId,
			purchasables: purchases,
			attributes: data.attributes,
			highscore: data.highscore,
			lastPlayed: data.lastPlayed,
			userId: data._id,
			isAdBlockEnabled: data.isAdBlockEnabled,
			unitIds: [], // all units owned by player,
			jointsOn: Date.now(), // use for calculating session,
			totalTime: data.totalTime,
			// ipAddress: data.ipAddress,
			email: data.email,
			isEmailVerified: data.isEmailVerified,
			banChat: data.banChat,
			mutedUsers: data.mutedUsers,
			isUserVerified: data.isUserVerified
		};

		var player = new Player(playerData);

		if (ige.isServer) {
			var logInfo = {
				name: playerData.name,
				clientId: playerData.clientId
			};

			if (playerData.userId) {
				logInfo.userId = playerData.userId;
			}

			// console.log(playerData.clientId + ': creating player for ', logInfo)
		}

		if (persistedData) {
			player.persistedData = persistedData;
		}

		if (ige.isServer) {
			ige.gameText.sendLatestText(data.clientId); // send latest ui information to the client
			// ige.shopkeeper.updateShopInventory(ige.shopkeeper.inventory, data.clientId) // send latest ui information to the client

			var isOwner = ige.server.owner == data._id;
			var isInvitedUser = false;
			if (ige.game.data.defaultData && ige.game.data.defaultData.invitedUsers) {
				isInvitedUser = ige.game.data.defaultData.invitedUsers.includes(
					data._id
				);
			}
			var isUserAdmin = false;
			var isUserMod = false;
			if (data.permissions) {
				isUserAdmin = data.permissions.includes('admin');
				isUserMod = data.permissions.includes('mod');
			}
			player._stats.isUserAdmin = isUserAdmin;
			player._stats.isUserMod = isUserMod;
			// if User/Admin has access to game then show developer logs
			if (isOwner || isInvitedUser || isUserAdmin) {
				GameComponent.prototype.log(`owner connected. _id: ${data._id}`);
				ige.server.developerClientId = data.clientId;
			}
		}

		return player;
	},

	// get client with ip
	getPlayerByIp: function (ip, currentUserId, all = false) {
		var clientIds = [];
		for (let clientId in ige.server.clients) {
			const clientObj = ige.server.clients[clientId];

			if (clientObj.ip === ip) {
				clientIds.push(clientId);
				if (!all) {
					break;
				}
			}
		}

		if (clientIds.length > 0) {
			var method = all ? 'filter' : 'find';
			return ige.$$('player')[method](player => {
				// var clientId = player && player._stats && player._stats.clientId;
				// added currentUserId check to confirm it is logged in user and not add-instance bot.
				return (
					player._stats &&
          clientIds.includes(player._stats.clientId) &&
          (all || (currentUserId && player._stats.userId != currentUserId))
				);
			});
		}
	},

	// not in use;
	getUnitsByClientId: function (clientId) {
		return ige
			.$$('unit')
			.filter(function (unit) {
				return unit._stats && unit._stats.clientId == clientId;
			})
			.reduce(function (partialUnits, unit) {
				partialUnits[unit._id] = unit;
				return partialUnits;
			}, {});
	},

	getPlayerByUserId: function (userId) {
		return ige.$$('player').find(function (player) {
			return player._stats && player._stats.userId == userId;
		});
	},

	getPlayerByClientId: function (clientId) {
		return ige.$$('player').find(function (player) {
			return player._stats && player._stats.clientId == clientId;
		});
	},

	getAsset: function (assetType, assetId) {
		try {
			var asset = this.data[assetType][assetId];
			return JSON.parse(JSON.stringify(asset));
		} catch (e) {
			GameComponent.prototype.log(
				`getAsset ${assetType} ${assetId} ${e}`
			);
		}
	},
	secondsToHms: function (seconds) {
		seconds = Number(seconds);
		var h = Math.floor(seconds / 3600);
		var m = Math.floor((seconds % 3600) / 60);
		var s = Math.floor((seconds % 3600) % 60);

		var hDisplay = h > 0 ? `${h}h ` : '';
		var mDisplay = m > 0 ? `${m}m ` : '';
		var sDisplay = s > 0 ? `${s}s` : '';
		return hDisplay + mDisplay + sDisplay;
	}
});

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports = GameComponent;
}
