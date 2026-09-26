var TriggerComponent = IgeEntity.extend({
	classId: 'TriggerComponent',
	componentId: 'trigger',

	init: function () {
		var self = this;
		if (ige.isServer || (ige.isClient && ige.physics)) {
			self._enableContactListener();
		}

		this._registerTriggeredScripts();
	},

	// map trigger events, so we don't have to iterate through all scripts to find corresponding scripts
	_registerTriggeredScripts: function () {
		this.triggeredScripts = {};
		for (scriptId in ige.game.data.scripts) {
			var script = ige.game.data.scripts[scriptId];

			// look for matching trigger within the script's triggers

			if (script && script.triggers) {
				for (j = 0; j < script.triggers.length; j++) {
					var trigger = script.triggers[j];
					if (this.triggeredScripts[trigger.type] == undefined) {
						this.triggeredScripts[trigger.type] = [scriptId]
					} else {
						this.triggeredScripts[trigger.type].push(scriptId)
					}
				}
			}
		}
		// console.log("registered triggered scripts: ", this.triggeredScripts)
	},

	// Listen for when contact's begin
	_beginContactCallback: function (contact) {
		var entityA = contact.m_fixtureA.m_body._entity;
		var entityB = contact.m_fixtureB.m_body._entity;
		if (!entityA || !entityB)
			return;
		if (ige.training && ige.training.stats && ige.training.stats.trace) {
			var contactProjectile = entityA._category === 'projectile' ? entityA :
				entityB._category === 'projectile' ? entityB : null;
			var contactTarget = contactProjectile === entityA ? entityB : entityA;
			var contactCategory = contactTarget && (contactTarget._category || 'wall');
			if (contactProjectile && ['wall', 'unit', 'item', 'debris'].includes(contactCategory)) {
				var contactOwner = contactTarget.getOwner && contactTarget.getOwner();
				ige.training.stats.trace.recordContact({ projectileId: contactProjectile.id(),
					targetCategory: contactCategory, targetType: contactTarget._stats && contactTarget._stats.type,
					targetPlayerId: contactOwner && contactOwner.id() });
			}
		}

		if (entityA._stats && entityB._stats) {
			// a unit's sensor detected another unit

			if (entityB._category == 'sensor') {
				var tempEntity = entityA;
				entityA = entityB;
				entityB = tempEntity;
			}
			if (entityA._category == 'sensor') {
				var ownerUnit = entityA.getOwnerUnit();
				if (ownerUnit) {
					if (entityB._category == 'unit') {
						if (ownerUnit && ownerUnit != entityB) {
							ownerUnit.ai.registerSensorDetection(entityB);
						}
					} else if (entityB._category == 'item') {
						ige.trigger.fire('whenItemEntersSensor', {
							unitId: ownerUnit.id(),
							sensorId: entityA.id(),
							itemId: entityB.id()
						});
					}
				}
				return;
			}

			// ensure entityA is prioritized by this order: region, unit, item, projectile, wall
			// this is to ensure that contact event is fired once when two entities touch each other. instead of this event being called twice.
			if (
				entityB._category == 'region' || (
					entityA._category != 'region' && (
						entityB._category == 'unit' || (
							entityA._category != 'unit' && (
								entityB._category == 'item' || (
									entityA._category != 'item' && (
										entityB._category == 'projectile' ||
										entityB._category == undefined
									)
								)
							)
						)
					)
				)
			) {
				var entityA = contact.m_fixtureB.m_body._entity;
				var entityB = contact.m_fixtureA.m_body._entity;
			}
			// Dispatch both sides with the other body as the triggering entity.
			// This is where exported per-projectile damage scripts receive their victim.
			if (ige.isServer && ige.script && entityA._category !== 'region' && entityB._category !== 'region') {
				[ [entityA, entityB], [entityB, entityA] ].forEach(function (pair) {
					var subject = pair[0], other = pair[1];
					if (subject._alive === false || other._alive === false) return;
					if (subject._category === 'item' && subject._stats.ownerUnitId === other.id()) return;
					if (subject._category === 'projectile' && subject._stats.sourceUnitId === other.id()) return;
					if (other._category === 'projectile' && other._stats.sourceUnitId === subject.id()) return;
					var by = {};
					by[subject._category + 'Id'] = subject.id();
					by[(other._category || 'wall') + 'Id'] = other.id();
					by.collidingEntity = other.id();
					if (other._category === 'unit') ige.game.lastTouchedUnitId = other.id();
					if (other._category === 'projectile') ige.game.lastTouchedProjectileId = other.id();
					var category = other._category || 'wall';
					ige.script.triggerEntity(subject, 'entityTouches' + category[0].toUpperCase() + category.slice(1), by);
				});
			}

			switch (entityA._category) {
				case 'region':
					var region = ige.variable.getValue({
						function: 'getVariable',
						variableName: entityA._stats.id
					});

					switch (entityB._category) {
						case 'unit':
							ige.trigger.fire('unitEntersRegion', {
								unitId: entityB.id(),
								region: region
							});
							break;

						case 'item':
							ige.trigger.fire('itemEntersRegion', {
								itemId: entityB.id(),
								region: region
							});
							break;

						case 'debris':
							ige.trigger.fire('debrisEntersRegion', {
								debrisId: entityB.id(),
								region: region
							});
							break;
					}
					break;

				case 'unit':
					var triggeredBy = {
						unitId: entityA.id()
					};
					ige.game.lastTouchingUnitId = entityA.id();
					ige.game.lastTouchedUnitId = entityB.id();

					switch (entityB._category) {
						case 'unit':
							ige.trigger.fire('unitTouchesUnit', triggeredBy); // handle unitA touching unitB
							triggeredBy.unitId = entityB.id();
							ige.game.lastTouchingUnitId = entityB.id();
							ige.game.lastTouchedUnitId = entityA.id();
							ige.trigger.fire('unitTouchesUnit', triggeredBy); // handle unitB touching unitA
							break;

						case 'debris':
							triggeredBy.debrisId = entityB.id();
							ige.game.lastTouchedDebrisId = entityB.id();
							ige.trigger.fire('unitTouchesDebris', triggeredBy);
							break;

						case 'item':
							triggeredBy.itemId = entityB.id();
							ige.game.lastTouchedItemId = entityB.id();
							// don't trigger if item is owned by the unit
							if (entityB._stats.ownerUnitId == entityA.id())
								return;

							ige.trigger.fire('unitTouchesItem', triggeredBy);

							break;

						case 'projectile':
							if (entityB._stats.sourceUnitId == entityA.id())
								return;

							var pSourceUnit = entityB._stats.sourceUnitId && ige.$(entityB._stats.sourceUnitId);
							var pSourcePlayer = pSourceUnit && pSourceUnit.getOwner && pSourceUnit.getOwner();
							var pAttackedPlayer = entityA.getOwner && entityA.getOwner();
							var pIsFriendly = pSourcePlayer && pAttackedPlayer && (pSourcePlayer === pAttackedPlayer || (pSourcePlayer.isFriendlyTo && pSourcePlayer.isFriendlyTo(pAttackedPlayer)));
							if (pIsFriendly)
								return;

							triggeredBy.unitId = entityA.id();
							triggeredBy.projectileId = entityB.id();
							triggeredBy.collidingEntity = entityA.id();
							ige.game.lastTouchedProjectileId = entityB.id();
							ige.game.lastAttackingUnitId = entityB._stats.sourceUnitId;
							ige.game.lastAttackedUnitId = entityA.id();
							ige.trigger.fire('unitTouchesProjectile', triggeredBy);

							break;

						case undefined:
						case 'wall':
							ige.game.lastTouchingUnitId = entityA.id();
							var triggeredBy = { unitId: entityA.id() };
							ige.trigger.fire('unitTouchesWall', triggeredBy);
							break;
					}
					break;

				case 'item':
					switch (entityB._category) {
						case 'projectile':
							var triggeredBy = {
								projectileId: entityB.id(),
								itemId: entityA.id(),
								collidingEntity: entityA.id()
							};
							ige.trigger.fire('projectileTouchesItem', triggeredBy);
							break;
					}
					break;

				case 'projectile':
					switch (entityB._category) {
						case 'debris':
							var triggeredBy = {
								projectileId: entityA.id(),
								debrisId: entityB.id(),
								collidingEntity: entityB.id()
							};
							ige.trigger.fire('projectileTouchesDebris', triggeredBy);
							break;
						case undefined:
						case 'wall':
							var triggeredBy = {
								projectileId: entityA.id(),
								collidingEntity: entityB.id()
							};
							ige.trigger.fire('projectileTouchesWall', triggeredBy);
							break;
					}
					break;
				case undefined: // something touched wall
				case 'wall':
					switch (entityB._category) {
						case 'projectile':
							var triggeredBy = {
								projectileId: entityB.id(),
								collidingEntity: entityA.id()
							};
							ige.trigger.fire('projectileTouchesWall', triggeredBy);
							break;

						case 'item':
							var triggeredBy = { itemId: entityB.id() };
							ige.trigger.fire('itemTouchesWall', triggeredBy);
							break;
					}
					break;
			}
		}
	},

	_endContactCallback: function (contact) {
		var a = contact.m_fixtureA.m_body._entity;
		var b = contact.m_fixtureB.m_body._entity;
		if (!a || !b) return;
		var region = a._category === 'region' ? a : b._category === 'region' ? b : undefined;
		var entity = region === a ? b : a;
		if (region && entity._category === 'unit') {
			ige.trigger.fire('unitLeavesRegion', { unitId: entity.id(), region: ige.variable.getValue({ function: 'getVariable', variableName: region._stats.id }) });
		}
	},

	_enableContactListener: function () {
		// Set the contact listener methods to detect when
		// contacts (collisions) begin and end
		ige.physics.contactListener(this._beginContactCallback, this._endContactCallback);
	},

	/*
		fire trigger and run all of the corresponding script(s)
	*/
	fire: function (triggerName, triggeredBy) {
		// if (triggerName === 'projectileTouchesWall') console.log("trigger fire", triggerName, triggeredBy)

		if (ige.isServer && ige.script) {
			if (triggerName === 'frameTick' || triggerName === 'secondTick') {
				['unit', 'item', 'projectile'].forEach(function (category) {
					(ige.$$(category) || []).slice().forEach(function (entity) {
						var by = {}; by[category + 'Id'] = entity.id();
						ige.script.triggerEntity(entity, triggerName, by);
					});
				});
			} else if (triggeredBy) {
				var unit = ige.$(triggeredBy.unitId);
				if (triggerName === 'unitUsesItem') ige.script.triggerEntity(unit, 'thisUnitUsesItem', triggeredBy);
				if (triggerName === 'unitStartsUsingAnItem') ige.script.triggerEntity(unit, triggerName, triggeredBy);
				var attrMatch = /^(unit|item|projectile)AttributeBecomes(Zero|Full)$/.exec(triggerName);
				if (attrMatch) ige.script.triggerEntity(ige.$(triggeredBy[attrMatch[1] + 'Id']), 'entityAttributeBecomes' + attrMatch[2], triggeredBy);
			}
		}
		if (ige.isServer || (ige.isClient && ige.physics)) {
			var previousTrainingProjectileId = ige.training && ige.training.currentProjectileId;
			if (ige.training && ige.training.isTrainingMode && triggerName === 'unitTouchesProjectile') {
				ige.training.currentProjectileId = triggeredBy && triggeredBy.projectileId;
			}
			try {
			let scriptIds = this.triggeredScripts[triggerName]
			for (let i in scriptIds) {
				let scriptId = scriptIds[i]
				ige.script.scriptLog(`\ntrigger: ${triggerName}`);

				var localVariables = {
					triggeredBy: triggeredBy
				};
				ige.script.runScript(scriptId, localVariables);
			}
			} finally {
				if (ige.training && ige.training.isTrainingMode) ige.training.currentProjectileId = previousTrainingProjectileId;
			}
		}

		if (triggeredBy && triggeredBy.projectileId) {
			var projectile = ige.$(triggeredBy.projectileId);
			if (projectile) {
				switch (triggerName) {
					case 'unitTouchesProjectile':
						var attackedUnit = ige.$(triggeredBy.collidingEntity || ige.game.lastAttackedUnitId);
						if (attackedUnit) {
							if (ige.training && ige.training.isTrainingMode && projectile._stats.damageData) {
								projectile._stats.damageData.sourceProjectileId = projectile.id();
							}
							var damageHasBeenInflicted = attackedUnit.inflictDamage(projectile._stats.damageData);

							var sourceUnit = projectile._stats.sourceUnitId && ige.$(projectile._stats.sourceUnitId);
							var sourcePlayer = sourceUnit && sourceUnit.getOwner && sourceUnit.getOwner();
							var attackedPlayer = attackedUnit && attackedUnit.getOwner && attackedUnit.getOwner();
							var isFriendly = sourcePlayer && attackedPlayer && (sourcePlayer === attackedPlayer || (sourcePlayer.isFriendlyTo && sourcePlayer.isFriendlyTo(attackedPlayer)));
							if (!isFriendly && projectile._stats.destroyOnContactWith && projectile._stats.destroyOnContactWith.units) {
								projectile.destroy();
							}
						}
						break;
					case 'projectileTouchesDebris':
						if (projectile._stats.destroyOnContactWith && projectile._stats.destroyOnContactWith.debris) {
							projectile.destroy();
						}
						break;
					case 'projectileTouchesItem':
						if (projectile._stats.destroyOnContactWith && projectile._stats.destroyOnContactWith.items) {
							projectile.destroy();
						}
						break;
					case 'projectileTouchesWall':
						var projectileType = ige.game.getAsset('projectileTypes', projectile._stats.type);
						var body = projectileType && projectileType.bodies && Object.values(projectileType.bodies)[0];
						var fixture = body && body.fixtures && body.fixtures[0];
						var restitution = Number(fixture && fixture.restitution) || 0;
						var canBounce = restitution > 0 && body && body.collidesWith && body.collidesWith.walls;

						if (ige.training && ige.training.isTrainingMode && ige.training.stats &&
							projectile._alive !== false && projectile._stats.destroyOnContactWith &&
							projectile._stats.destroyOnContactWith.walls === false) {
							if (restitution > 0) {
								var sourceUnit = ige.$(projectile._stats.sourceUnitId);
								var sourceOwner = sourceUnit && sourceUnit.getOwner && sourceUnit.getOwner();
								var sourceItem = ige.$(projectile._stats.sourceItemId);
								ige.training.stats.recordWallBounce({
									eventId: `${projectile.id()}:${triggeredBy.collidingEntity}:${ige.now}`,
									projectileId: projectile.id(), sourceId: sourceOwner && sourceOwner.id(),
									itemTypeId: sourceItem && sourceItem._stats && sourceItem._stats.itemTypeId
								});
							}
						}
						if (!canBounce && projectile._stats.destroyOnContactWith && projectile._stats.destroyOnContactWith.walls) {
							projectile.destroy();
						}
						break;
				}
			}
		}
	}
});

if (typeof (module) !== 'undefined' && typeof (module.exports) !== 'undefined') { module.exports = TriggerComponent; }
