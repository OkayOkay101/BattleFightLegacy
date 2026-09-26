var AIComponent = IgeEntity.extend({
	classId: 'AIComponent',
	componentId: 'ai',

	chooseBattleBotCharacter: function (roster, previousUnitTypeId, otherAliveUnitTypeId, random) {
		var candidates = (roster || []).filter(function (entry) {
			var unitTypeId = typeof entry === 'string' ? entry : entry && entry.unitTypeId;
			return unitTypeId && unitTypeId !== previousUnitTypeId && unitTypeId !== otherAliveUnitTypeId;
		});
		if (!candidates.length) return undefined;
		var index = Math.floor((random || Math.random)() * candidates.length);
		index = Math.max(0, Math.min(candidates.length - 1, index));
		var choice = candidates[index];
		return typeof choice === 'string' ? choice : choice.unitTypeId;
	},

	predictBattleBotAim: function (origin, target, targetVelocity, projectileSpeed) {
		if (!origin || !target || !Number.isFinite(projectileSpeed) || projectileSpeed <= 0) return undefined;
		var velocity = targetVelocity || { x: 0, y: 0 };
		var dx = target.x - origin.x;
		var dy = target.y - origin.y;
		var a = velocity.x * velocity.x + velocity.y * velocity.y - projectileSpeed * projectileSpeed;
		var b = 2 * (dx * velocity.x + dy * velocity.y);
		var c = dx * dx + dy * dy;
		var times = [];

		if (Math.abs(a) < 1e-8) {
			if (Math.abs(b) > 1e-8) times.push(-c / b);
		} else {
			var discriminant = b * b - 4 * a * c;
			if (discriminant >= 0) {
				var root = Math.sqrt(discriminant);
				times.push((-b - root) / (2 * a), (-b + root) / (2 * a));
			}
		}

		var time = times.filter(function (value) { return Number.isFinite(value) && value > 0; })
			.sort(function (left, right) { return left - right; })[0];
		if (time === undefined) time = Math.sqrt(c) / projectileSpeed;
		return { x: target.x + velocity.x * time, y: target.y + velocity.y * time, time: time };
	},

	battleBotHasLineOfSight: function (map, scaleX, scaleY, tileSize, start, end) {
		if (!map || !start || !end || !tileSize) return true;
		var wallLayer = (map.layers || []).find(function (layer) { return layer.name === 'walls'; });
		if (!wallLayer || !wallLayer.data) return true;
		var x0 = Math.floor(start.x / scaleX / tileSize);
		var y0 = Math.floor(start.y / scaleY / tileSize);
		var x1 = Math.floor(end.x / scaleX / tileSize);
		var y1 = Math.floor(end.y / scaleY / tileSize);
		var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
		var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
		var error = dx + dy;

		while (x0 !== x1 || y0 !== y1) {
			var twiceError = 2 * error;
			if (twiceError >= dy) { error += dy; x0 += sx; }
			if (twiceError <= dx) { error += dx; y0 += sy; }
			if (x0 === x1 && y0 === y1) break;
			if (x0 < 0 || y0 < 0 || x0 >= map.width || y0 >= map.height || wallLayer.data[x0 + y0 * map.width]) return false;
		}
		return true;
	},

	battleBotPositionIsClear: function (map, tileWidth, tileHeight, position, radius, wallLayer) {
		if (!map || !position || !tileWidth || !tileHeight) return false;
		var margin = Math.max(0, radius || 0);
		if (position.x - margin < 0 || position.y - margin < 0 ||
			position.x + margin >= map.width * tileWidth || position.y + margin >= map.height * tileHeight) return false;
		var walls = wallLayer === undefined ? (map.layers || []).find(function (layer) { return layer.name === 'walls'; }) : wallLayer;
		if (!walls || !walls.data) return true;
		var minX = Math.floor((position.x - margin) / tileWidth), maxX = Math.floor((position.x + margin) / tileWidth);
		var minY = Math.floor((position.y - margin) / tileHeight), maxY = Math.floor((position.y + margin) / tileHeight);
		for (var y = minY; y <= maxY; y++) {
			for (var x = minX; x <= maxX; x++) {
				if (!walls.data[x + y * map.width]) continue;
				var closestX = Math.max(x * tileWidth, Math.min(position.x, (x + 1) * tileWidth));
				var closestY = Math.max(y * tileHeight, Math.min(position.y, (y + 1) * tileHeight));
				if (Math.hypot(position.x - closestX, position.y - closestY) <= margin + 2) return false;
			}
		}
		return true;
	},

	findBattleBotPath: function (map, tileWidth, tileHeight, start, end, radius) {
		if (!map || !start || !end || !tileWidth || !tileHeight) return [];
		var self = this;
		var width = map.width, height = map.height;
		var wallLayer = (map.layers || []).find(function (layer) { return layer.name === 'walls'; });
		function index(point) { return Math.floor(point.x / tileWidth) + Math.floor(point.y / tileHeight) * width; }
		function center(cell) { return { x: (cell % width + 0.5) * tileWidth, y: (Math.floor(cell / width) + 0.5) * tileHeight }; }
		function clear(cell) { return cell >= 0 && cell < width * height && self.battleBotPositionIsClear(map, tileWidth, tileHeight, center(cell), radius, wallLayer); }
		var startCell = index(start), endCell = index(end);
		if (!clear(startCell)) return [];
		if (!clear(endCell)) {
			var nearest = -1, bestDistance = Infinity;
			for (var oy = -2; oy <= 2; oy++) for (var ox = -2; ox <= 2; ox++) {
				var gx = Math.floor(end.x / tileWidth) + ox, gy = Math.floor(end.y / tileHeight) + oy;
				if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
				var cell = gx + gy * width, distance = Math.hypot(ox, oy);
				if (clear(cell) && distance < bestDistance) { nearest = cell; bestDistance = distance; }
			}
			endCell = nearest;
		}
		if (endCell < 0 || startCell === endCell) return [];
		var queue = [startCell], head = 0, previous = new Int32Array(width * height);
		previous.fill(-1);
		previous[startCell] = startCell;
		while (head < queue.length && previous[endCell] === -1) {
			var current = queue[head++], cx = current % width, cy = Math.floor(current / width);
			for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				var nx = cx + dx, ny = cy + dy;
				if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
				var next = nx + ny * width;
				if (previous[next] !== -1 || !clear(next)) continue;
				if (dx && dy && (!clear(cx + dx + cy * width) || !clear(cx + (cy + dy) * width))) continue;
				previous[next] = current;
				queue.push(next);
			}
		}
		if (previous[endCell] === -1) return [];
		var reversed = [];
		for (var at = endCell; at !== startCell; at = previous[at]) reversed.push(center(at));
		return reversed.reverse();
	},

	chooseBattleBotDodge: function (map, tileWidth, tileHeight, position, projectilePosition, projectileVelocity, radius) {
		if (!projectileVelocity) return undefined;
		var speedSquared = projectileVelocity.x * projectileVelocity.x + projectileVelocity.y * projectileVelocity.y;
		if (speedSquared < 1) return undefined;
		var relativeX = position.x - projectilePosition.x, relativeY = position.y - projectilePosition.y;
		var time = (relativeX * projectileVelocity.x + relativeY * projectileVelocity.y) / speedSquared;
		if (time < 0 || time > 0.9) return undefined;
		if (Math.hypot(relativeX - projectileVelocity.x * time, relativeY - projectileVelocity.y * time) > Math.max(28, radius * 2)) return undefined;
		var base = Math.atan2(projectileVelocity.y, projectileVelocity.x);
		var choices = [base + Math.PI / 2, base - Math.PI / 2];
		var self = this;
		return choices.find(function (angle) {
			return [72, 112].every(function (distance) {
				return self.battleBotPositionIsClear(map, tileWidth, tileHeight,
					{ x: position.x + Math.cos(angle) * distance, y: position.y + Math.sin(angle) * distance }, radius);
			});
		});
	},

	init: function (unit) {
		var self = this;

		self._entity = unit;
		self.targetUnitId = undefined;
		self.targetPosition = undefined;
		self.unitsTargetingMe = []; // unit IDs of units attacking/fleeing away from this unit
		self.debugEnabled = true;
		// AI settings

		if (unit._stats.ai) {
			if (unit._stats.ai.enabled) {
				self.pathFindingMethod = unit._stats.ai.pathFindingMethod; // options: simple/a* (coming soon)
				self.idleBehaviour = unit._stats.ai.idleBehaviour; // options: wander/stay
				self.sensorResponse = unit._stats.ai.sensorResponse; // options: none/flee/none (default)
				self.attackResponse = unit._stats.ai.attackResponse; // options: fight/flee/none (default)
				self.maxTravelDistance = unit._stats.ai.maxTravelDistance; // how far unit's willing to flee/chase target until returning to its spawn position - options: undefined value for infinite distance
				self.letGoDistance = unit._stats.ai.letGoDistance; // options: undefined value for infinite distance
				self.maxAttackRange = unit._stats.ai.maxAttackRange;
				self.previousPosition = { x: unit._translate.x, y: unit._translate.y }; // last position recorded before fleeing
				self.nextMoveAt = ige._currentTime;
				self.currentAction = 'idle'; // options: idle/move/flee/fight
				self.isAttacking = false;
			}

			if (unit._stats.ai.sensorRadius > 0) {
				unit.sensor = new Sensor(unit, unit._stats.ai.sensorRadius);
			}
		}
	},

	registerAttack: function (unit) {
		var self = this;
		// only response to hostile/neutral units
		var ownerPlayer = self._entity.getOwner();
		if (unit) {
			var ownerPlayerOfTargetUnit = ige.$(unit._stats.ownerId);
			if (ownerPlayer && ownerPlayer.isHostileTo(ownerPlayerOfTargetUnit)) {
				// if I already have a target, re-target if new target unit is closer
				var targetUnit = this.getTargetUnit();
				if (targetUnit == undefined || (targetUnit && self.getDistanceToUnit(unit)) < self.getDistanceToUnit(targetUnit)) {
					switch (self.attackResponse) {
						case 'fight':
							self.attackUnit(unit);
							break;
						case 'flee':
							self.fleeFromUnit(unit);
							break;
					}
				}
			}
		}
	},

	registerSensorDetection: function (unit) {
		var self = this;
		// only response to hostile/neutral units
		var ownerPlayer = self._entity.getOwner();
		if (unit) {
			ige.trigger && ige.trigger.fire('whenUnitEntersSensor', {
				unitId: unit.id(),
				sensorId: self._entity.sensor.id()
			});

			var ownerPlayerOfTargetUnit = ige.$(unit._stats.ownerId);
			if (ownerPlayer && ownerPlayer.isHostileTo(ownerPlayerOfTargetUnit) && unit._stats.isUnTargetable != true) {
				// if I already have a target, re-target if new target unit is closer
				var targetUnit = this.getTargetUnit();
				if (targetUnit == undefined || (self.maxAttackRange < this.getDistanceToTarget())) {
					switch (self.sensorResponse) {
						case 'fight':
							// if (self.currentAction != 'fight') {
							self.attackUnit(unit);
							// }
							break;
						case 'flee':
							self.fleeFromUnit(unit);
							break;
					}
				}
			}
		}
	},

	// all units that were targeting this unit will no longer target this unit
	announceDeath: function () {
		var unitIds = this.unitsTargetingMe;
		for (var i = 0; i < unitIds.length; i++) {
			var attackingUnit = ige.$(unitIds[i]);
			if (attackingUnit && attackingUnit.ai.getTargetUnit() == this._entity && attackingUnit.sensor && attackingUnit._stats.ai && attackingUnit._stats.ai.enabled) {
				attackingUnit.ai.goIdle();
				attackingUnit.sensor.updateBody(); // re-detect nearby units
			}
		}
		this.targetUnitId = undefined;
		this.targetPosition = undefined;
		this.unitsTargetingMe = [];
	},

	getTargetUnit: function () {
		return ige.$(this.targetUnitId);
	},

	getAngleToTarget: function () {
		var unit = this._entity;
		var targetPosition = this.getTargetPosition();
		if (targetPosition) {
			return Math.atan2(targetPosition.y - unit._translate.y, targetPosition.x - unit._translate.x) + Math.radians(90);
		}

		return undefined;
	},

	// return distance to target position or target unit (if this.targetUnit is set)
	getDistanceToTarget: function () {
		var unit = this._entity;
		var distance = 99999999999; // set distance as infinite by default

		// if target is a unit, then consider the radius of the both this unit and target unit
		var targetUnit = this.getTargetUnit();
		if (targetUnit) {
			distance = this.getDistanceToUnit(targetUnit);
		} else {
			var targetPosition = this.getTargetPosition();
			if (targetPosition) {
				var a = unit._translate.x - targetPosition.x;
				var b = unit._translate.y - targetPosition.y;
				var distance = Math.sqrt(a * a + b * b);
			}
		}

		return distance;
	},

	// return distance with consideration of both units body radius
	getDistanceToUnit: function (targetUnit) {
		var myUnit = this._entity;
		if (targetUnit) {
			var a = Math.abs(myUnit._translate.x - targetUnit._translate.x);
			var b = Math.abs(myUnit._translate.y - targetUnit._translate.y);
			var distanceFromCenter = Math.sqrt(a * a + b * b);
		}

		var myUnitReach = myUnit.height() / 2;
		var targetUnitRadius = targetUnit.width() / 2;

		return distanceFromCenter - targetUnitRadius - myUnitReach;
	},

	// return target position whether it's a unit or a position.
	getTargetPosition: function () {
		var targetUnit = this.getTargetUnit();
		if (targetUnit) {
			return { x: targetUnit._translate.x, y: targetUnit._translate.y };
		}
		if (this.targetPosition) {
			return this.targetPosition;
		}
		return undefined;
	},

	goIdle: function () {
		var unit = this._entity;
		var currentItem = unit.getCurrentItem();
		if (currentItem) {
			currentItem.stopUsing();
		}
		unit.stopMoving();
		this.targetUnitId = undefined;
		this.targetPosition = undefined;
		this.currentAction = 'idle';
		this.nextMoveAt = ige._currentTime + 2000 + Math.floor(Math.random() * 2000);
	},

	fleeFromUnit: function (unit) {
		this.setTargetUnit(unit);
		this.targetPosition = undefined;
		// only update its return position if unit was provked while in idle state
		if (this.currentAction == 'idle') {
			this.previousPosition = { x: this._entity._translate.x, y: this._entity._translate.y };
		}
		this.currentAction = 'flee';
		this._entity.startMoving();
		this.nextMoveAt = ige._currentTime + 5000 + Math.floor(Math.random() * 5000);
	},

	attackUnit: function (unit) {
		this.setTargetUnit(unit);
		// only update its return position if unit was provked while in idle state
		if (this.currentAction == 'idle') {
			this.previousPosition = { x: this._entity._translate.x, y: this._entity._translate.y };
		}
		this.currentAction = 'fight';
		this._entity.startMoving();
	},

	moveToTargetPosition: function (x, y) {
		this.setTargetPosition(x, y);
		this.currentAction = 'move';
		this.targetUnitId = undefined;
		this._entity.isMoving = true;
	},

	setTargetUnit: function (unit) {
		var previousTargetUnit = this.getTargetUnit();
		// remove this unit from currently targeted unit's unitsTargetingMe array.
		if (previousTargetUnit && unit != previousTargetUnit) {
			for (var i = 0; i < previousTargetUnit.ai.unitsTargetingMe.length; i++) {
				if (previousTargetUnit.ai.unitsTargetingMe[i] == this._entity.id()) {
					previousTargetUnit.ai.unitsTargetingMe.splice(i, 1);
				}
			}
		}

		if (unit) {
			// register this unit into new target unit's unitsTargetingMe array.
			if (!unit.ai.unitsTargetingMe.includes(this._entity.id())) {
				unit.ai.unitsTargetingMe.push(this._entity.id());
			}
			this.targetUnitId = unit.id();
		}
	},

	setTargetPosition: function (x, y) {
		this.targetPosition = { x: x, y: y };
	},

	update: function () {
		var self = this;
		var unit = self._entity;
		var targetUnit = this.getTargetUnit();
		// update unit's directino toward its target
		var targetPosition = self.getTargetPosition();
		// wandering units should move in straight direction. no need to re-assign angleToTarget
		if (targetPosition && self.currentAction != 'wander') {
			unit.angleToTarget = self.getAngleToTarget();
		}

		// if fleeing, then move to opposite direction from its target
		if (self.currentAction == 'flee') {
			if (unit.angleToTarget)
				unit.angleToTarget += Math.PI;
		}

		switch (self.currentAction) {
			case 'idle':
				// wandering unit will repeat between moving to a random position every 2~4 seconds, then stop for 2~4 seconds
				if (self.idleBehaviour == 'wander' && ige._currentTime > self.nextMoveAt) {
					// assign a random destination within 25px radius
					if (unit.isMoving == false) {
						unit.angleToTarget = Math.random() * Math.PI * 2;
						unit.startMoving();
						self.nextMoveAt = ige._currentTime + 1500 + Math.floor(Math.random() * 1500);
					} else {
						unit.stopMoving();
						self.nextMoveAt = ige._currentTime + 2000 + Math.floor(Math.random() * 2000);
					}
				}
				break;

			case 'move':
				if (this.getDistanceToTarget() < 10) {
					self.goIdle();
				}
				break;

			case 'fight':
				if (targetUnit && unit) {
					var a = self.previousPosition.x - unit._translate.x;
					var b = self.previousPosition.y - unit._translate.y;
					var distanceTravelled = Math.sqrt(a * a + b * b);
					// we've chased far enough. stop fighting and return to where i was before
					if (!isNaN(parseInt(self.maxTravelDistance)) && distanceTravelled > self.maxTravelDistance) {
						self.moveToTargetPosition(self.previousPosition.x, self.previousPosition.y);
					} else if (!isNaN(parseInt(self.letGoDistance)) && this.getDistanceToTarget() > self.letGoDistance) { // if the target is far away from the unit, stop the chase
						self.goIdle();
					} else {
						// stop moving, start attacking if my attack can reach the target
						if (self.maxAttackRange > this.getDistanceToTarget() && unit._stats.isStunned != true) {
							unit.isMoving = false;
							unit.ability.startUsingItem();
						} else if (!unit.isMoving) {
							// target's too far. stop firing, and start chasing
							unit.ability.stopUsingItem();
							unit.startMoving();
							if (unit.sensor) {
								unit.sensor.updateBody(); // re-detect nearby units
							}
						}
					}
				} else { // target unit doesn't exist. go back to what I was doing before
					// if I previously had a destination I was heading, then continue the journey
					if (self.targetPosition) {
						self.moveToTargetPosition(self.targetPosition.x, self.targetPosition.y);
					} else { // otherwise go idle
						self.goIdle();
					}
				}
				break;

			case 'flee':
				if (targetUnit) {
					var a = self.previousPosition.x - targetUnit._translate.x;
					var b = self.previousPosition.y - targetUnit._translate.y;
					var distanceTravelled = Math.sqrt(a * a + b * b);
					// we've ran far enough OR we've been running for long enough (5-10s) let's stop running
					if (distanceTravelled > self.maxTravelDistance || ige._currentTime > self.nextMoveAt) {
						self.goIdle();
					}
				} else { // target unit doesn't exist. stop fleeing.
					self.goIdle();
				}
				break;
		}
	}

});

if (typeof (module) !== 'undefined' && typeof (module.exports) !== 'undefined') {
	module.exports = AIComponent;
}
