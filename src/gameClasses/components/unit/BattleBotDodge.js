'use strict';

// All positions/radii are pixels, velocities pixels/second, prediction times seconds.
// now/previous.until and engine _bornTime/_deathTime are milliseconds on the same clock.
const EPSILON = 1e-8;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positive = (value, fallback = 0) => Math.max(0, number(value, fallback));
const point = value => ({ x: number(value && value.x), y: number(value && value.y) });
const advance = (p, v, t) => ({ x: p.x + v.x * t, y: p.y + v.y * t });

function overlapInterval(position, velocity, hazard, radius, duration) {
	const dx = hazard.position.x - position.x, dy = hazard.position.y - position.y;
	const vx = hazard.velocity.x - velocity.x, vy = hazard.velocity.y - velocity.y;
	const size = positive(radius) + positive(hazard.radius);
	const a = vx * vx + vy * vy, b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy - size * size;
	if (a < EPSILON) return c <= 0 ? [0, duration] : null;
	const discriminant = b * b - 4 * a * c;
	if (discriminant < 0) return null;
	const root = Math.sqrt(discriminant), entry = Math.max(0, (-b - root) / (2 * a)), exit = Math.min(duration, (-b + root) / (2 * a));
	return entry <= exit + EPSILON && exit >= 0 && entry <= duration + EPSILON ? [entry, Math.max(entry, exit)] : null;
}

function collisionTime(position, velocity, hazard, radius = 0, horizon = .8) {
	if (!hazard || !hazard.position) return Infinity;
	const duration = Math.min(positive(horizon), positive(hazard.lifeSeconds, Infinity));
	if (duration <= 0) return Infinity;
	const interval = overlapInterval(point(position), point(velocity), { position: point(hazard.position), velocity: point(hazard.velocity), radius: positive(hazard.radius) }, radius, duration);
	return interval ? interval[0] : Infinity;
}

// Spatial wall checks are at most 8 pixels apart; analytic swept circles between
// checks prevent fast bullets from tunnelling through a unit. Reflections use the
// queried wall axes and restitution, including values >1 present in game data.
function trajectory(hazard, horizon, isClear) {
	let p = point(hazard.position), v = point(hazard.velocity), t = 0, impact = null, stopped = false;
	const life = positive(hazard.lifeSeconds, Infinity), end = Math.min(horizon, life), segments = [];
	const clear = hazard.canIgnoreWalls ? () => true : isClear;
	let reflections = 0;
	function appendSegment(start, end) {
		const previous = segments[segments.length - 1];
		if (previous && previous.velocity.x === v.x && previous.velocity.y === v.y && Math.abs(previous.end - start) < EPSILON) previous.end = end;
		else segments.push({ position: p, velocity: v, start, end });
	}
	while (t < end - EPSILON) {
		const speed = Math.hypot(v.x, v.y);
		const dt = Math.min(end - t, speed > 0 ? Math.min(1 / 30, Math.max(1, Math.min(8, positive(hazard.radius, 2) / 2)) / speed) : end - t);
		const next = advance(p, v, dt);
		if (speed === 0 || clear(next, hazard.radius)) {
			appendSegment(t, t + dt);
			p = next; t += dt; continue;
		}
		let low = 0, high = dt;
		for (let i = 0; i < 12; i++) { const middle = (low + high) / 2; if (clear(advance(p, v, middle), hazard.radius)) low = middle; else high = middle; }
		if (low > EPSILON) appendSegment(t, t + low);
		p = advance(p, v, low); t += low;
		if (!impact) impact = { position: p, at: t };
		if (!hazard.bounce || !(hazard.restitution > 0) || ++reflections > 16) {
			if (hazard.destroysOnWall === false) {
				// A physical wall stops the normal component, but surviving traps
				// stay hazardous. Stationary remainder is a conservative slide approximation.
				v = { x: 0, y: 0 }; appendSegment(t, end); t = end; stopped = true;
			}
			break;
		}
		const probe = advance(p, v, Math.max(high - low, .00001));
		const blockedX = !clear({ x: probe.x, y: p.y }, hazard.radius);
		const blockedY = !clear({ x: p.x, y: probe.y }, hazard.radius);
		v = { x: v.x * (blockedX || !blockedY ? -hazard.restitution : 1), y: v.y * (blockedY || !blockedX ? -hazard.restitution : 1) };
		// Move a tiny amount inward to avoid repeated contacts at a floating point boundary.
		const inward = advance(p, v, .000001);
		if (clear(inward, hazard.radius)) p = inward;
	}
	return { segments, endpoint: p, endTime: t, impact, life, stopped };
}

function positionAt(path, time) {
	for (const segment of path.segments) if (time <= segment.end + EPSILON && time >= segment.start - EPSILON) return advance(segment.position, segment.velocity, time - segment.start);
	return path.endpoint;
}

function pathRisk(position, velocity, radius, hazard, path, horizon) {
	let hitAt = Infinity, exposure = 0;
	const damage = positive(hazard.damage);
	if (damage > 0) for (const segment of path.segments) {
		const interval = overlapInterval(advance(position, velocity, segment.start), velocity, segment, radius + positive(hazard.radius), segment.end - segment.start);
		if (!interval) continue;
		hitAt = Math.min(hitAt, segment.start + interval[0]);
		exposure += interval[1] - interval[0];
	}
	let risk = Number.isFinite(hitAt) ? damage * (1 + (horizon - hitAt) / horizon) : 0;
	if ((hazard.kind === 'area' || path.stopped) && risk > 0) risk += damage * exposure / horizon;
	const explosions = hazard.explosions || ((hazard.explosionRadius > 0 && hazard.explosionDamage > 0) ? [{ radius: hazard.explosionRadius, damage: hazard.explosionDamage, at: hazard.explosionAt, lifeSeconds: hazard.explosionLifeSeconds, onTouch: hazard.explosionOnTouch, onWall: hazard.explosionOnWall }] : []);
	for (const explosion of explosions) {
		let at = Number.isFinite(explosion.at) ? explosion.at : Infinity;
		// An observed detonation keeps its recorded center even after the parent
		// moves or expires; callers age its at/lifeSeconds on the observation clock.
		let center = explosion.position ? point(explosion.position) : undefined;
		if (!center && explosion.onWall && path.impact && path.impact.at < at) { at = path.impact.at; center = path.impact.position; }
		// Unknown unit contact may detonate anywhere along the observed path. Use
		// its known blast radius as a conservative envelope, never invent a victim.
		if (explosion.onTouch && !explosion.position) {
			for (const segment of path.segments) {
				const interval = overlapInterval(advance(position, velocity, segment.start), velocity, { ...segment, radius: positive(explosion.radius) }, radius, segment.end - segment.start);
				if (!interval) continue;
				const contact = segment.start + interval[0];
				risk += positive(explosion.damage) * (1 + (horizon - contact) / horizon);
				hitAt = Math.min(hitAt, contact); break;
			}
		}
		if (!(at >= 0 && at <= horizon + EPSILON) || !explosion.position && at > path.endTime + EPSILON) continue;
		center = center || positionAt(path, at);
		const duration = Math.min(horizon - at, positive(explosion.lifeSeconds));
		const interval = overlapInterval(advance(position, velocity, at), velocity, { position: center, velocity: { x: 0, y: 0 }, radius: positive(explosion.radius) }, radius, duration);
		if (interval) {
			const contact = at + interval[0];
			risk += positive(explosion.damage) * (1 + (horizon - contact) / horizon + (interval[1] - interval[0]) / horizon);
			hitAt = Math.min(hitAt, contact);
		}
	}
	return { risk, collisionTime: hitAt };
}

function prepared(options) {
	const horizon = Math.max(.001, positive(options.horizon, .8));
	const isClear = typeof options.isClear === 'function' ? options.isClear : () => true;
	const hazards = (options.hazards || []).filter(h => h && h.position && positive(h.lifeSeconds, Infinity) > 0)
		.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
	return { horizon, isClear, hazards, paths: hazards.map(h => trajectory(h, horizon, isClear)), position: point(options.position), velocity: point(options.velocity), radius: positive(options.radius) };
}

function ranked(prep) {
	return prep.hazards.map((hazard, i) => ({ ...hazard, ...pathRisk(prep.position, prep.velocity, prep.radius, hazard, prep.paths[i], prep.horizon) }))
		.sort((a, b) => b.risk - a.risk || a.collisionTime - b.collisionTime || String(a.id).localeCompare(String(b.id)));
}

function rankThreats(options) { return ranked(prepared(options)); }

function routeClear(position, velocity, radius, horizon, isClear) {
	const distance = Math.hypot(velocity.x, velocity.y) * horizon;
	const steps = Math.max(1, Math.ceil(distance / Math.max(1, Math.min(8, radius / 2 || 2))));
	for (let i = 0; i <= steps; i++) if (!isClear(advance(position, velocity, horizon * i / steps), radius)) return false;
	return true;
}

function planDodge(options) {
	const prep = prepared(options), threats = ranked(prep), speed = positive(options.speed);
	const score = velocity => prep.hazards.reduce((sum, hazard, i) => {
		const result = pathRisk(prep.position, velocity, prep.radius, hazard, prep.paths[i], prep.horizon);
		return { risk: sum.risk + result.risk, collisionTime: Math.min(sum.collisionTime, result.collisionTime) };
	}, { risk: 0, collisionTime: Infinity });
	const candidates = Array.from({ length: 9 }, (_, direction) => {
		const moving = direction < 8 && speed > 0, angle = moving ? direction * Math.PI / 4 : null;
		const velocity = moving ? { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed } : { x: 0, y: 0 };
		return { direction, angle, moving, clear: routeClear(prep.position, velocity, prep.radius, prep.horizon, prep.isClear), ...score(velocity) };
	});
	const current = score(prep.velocity);
	const allowed = candidates.filter(c => c.clear && (c.moving || c.direction === 8));
	let best = (allowed.length ? allowed : [candidates[8]]).slice().sort((a, b) => a.risk - b.risk || Number(b.direction === 8) - Number(a.direction === 8) || b.collisionTime - a.collisionTime || a.direction - b.direction)[0];
	const previous = options.previous;
	if (previous && number(previous.until ?? previous.dodgeUntil) > number(options.now)) {
		const prior = candidates[previous.direction];
		if (prior && prior.clear && (prior.moving || prior.direction === 8) && prior.risk <= best.risk * 1.05 + EPSILON) best = prior;
	}
	return { threats, candidates, risks: candidates.map(c => c.risk), currentRisk: current.risk, best, imminent: current.risk > 0 && current.collisionTime <= Math.min(.35, prep.horizon) };
}

function currentBody(stats) {
	if (stats.currentBody) return stats.currentBody;
	const state = stats.states && stats.states[stats.stateId];
	return stats.bodies && ((state && stats.bodies[state.body]) || stats.bodies.default || Object.values(stats.bodies)[0]) || {};
}

function physicalRadius(stats, entity) {
	const body = currentBody(stats), fixture = body.fixtures && body.fixtures[0], shape = fixture && fixture.shape || {};
	const bounds = entity && entity._bounds2d, scale = entity && entity._scale;
	const width = positive(bounds && bounds.x, positive(body.width, positive(stats.width)) * positive(scale && scale.x, 1));
	const height = positive(bounds && bounds.y, positive(body.height, positive(stats.height)) * positive(scale && scale.y, 1));
	const data = shape.data || {}, offset = Math.hypot(number(data.x), number(data.y));
	// Box2d shape.data uses half extents in pixels. Live bounds already include
	// physical entity scale; stats.scale/spriteScale only affect the texture.
	return offset + (shape.type === 'circle' ? positive(data.radius, positive(shape.radius, width / 2)) : Math.hypot(positive(data.width, width / 2), positive(data.height, height / 2)));
}

function variableValue(variables, key) {
	const v = variables && variables[key];
	return v && typeof v === 'object' ? v.value ?? v.default : v;
}

function healthDamage(stats, variables) {
	const data = stats.damageData || {}, damage = stats.damage || {};
	const value = data.unitAttributes && data.unitAttributes.health;
	return positive(value ?? data.healthdamage ?? stats.healthdamage ?? damage.healthdamage ?? (damage.unitAttributes && damage.unitAttributes.health) ?? variableValue(variables || stats.variables, 'healthdamage') ?? variableValue(variables || stats.variables, '(Global Projectile) Projectile Damage'));
}

function thisPosition(position) { return position && position.function === 'getEntityPosition' && position.entity && position.entity.function === 'thisEntity'; }

function unconditionalScript(script) {
	const conditions = script.conditions;
	return !conditions || !conditions.length || !!(conditions[0] && conditions[0].operator === '==' && conditions[1] === true && conditions[2] === true);
}

function describeHazard(entity, getProjectileType = () => null, now = 0) {
	if (!entity || entity._alive === false || !entity._translate) return null;
	const stats = entity._stats || {}, body = currentBody(stats), fixture = body.fixtures && body.fixtures[0] || {};
	const limitations = new Set(), scaleRatio = positive(entity._battleBotScaleRatio, 30);
	let velocity = entity._battleBotVelocity;
	if (!velocity && entity.body) {
		const getter = entity.body.getLinearVelocity || entity.body.GetLinearVelocity;
		if (typeof getter === 'function') { const v = getter.call(entity.body); velocity = { x: number(v && v.x) * scaleRatio, y: number(v && v.y) * scaleRatio }; }
	}
	if (!velocity) velocity = entity._velocity;
	if (!velocity) limitations.add('unknown-velocity');
	velocity = point(velocity);
	const age = Number.isFinite(entity._bornTime) ? Math.max(0, now - entity._bornTime) : 0;
	const lifeSeconds = Number.isFinite(entity._deathTime) ? Math.max(0, (entity._deathTime - now) / 1000) : Math.max(0, positive(stats.lifeSpan, Infinity) - age) / 1000;
	const scripts = Object.values(stats.scripts || {}).filter(s => s && !s.disabled && s.actions);
	const destroysWall = scripts.some(s => unconditionalScript(s) && (s.triggers || []).some(t => t.type === 'entityTouchesWall') && (s.actions || []).some(a => !a.disabled && a.type === 'destroyEntity' && a.entity && a.entity.function === 'thisEntity'));
	const restitution = positive(fixture.restitution), sensor = !!fixture.isSensor;
	const collidesWalls = !!(body.collidesWith && body.collidesWith.walls);
	const destroysOnWall = destroysWall || !!(collidesWalls && restitution <= 0 && stats.destroyOnContactWith && stats.destroyOnContactWith.walls);
	function changesWallMotion(actions) {
		return (actions || []).some(action => action && !action.disabled && (/Force|Velocity|rotate|translate|moveEntity|setEntityPosition|runScript|destroyEntity/i.test(action.type || '') || changesWallMotion(action.actions) || changesWallMotion(action.then) || changesWallMotion(action.else)));
	}
	const hasWallMotionScript = scripts.some(s => (s.triggers || []).some(t => t.type === 'entityTouchesWall') && changesWallMotion(s.actions));
	const explosions = [];
	function visit(actions, context, delay = 0, depth = 0) {
		if (depth > 12) { limitations.add('dynamic-script'); return; }
		for (const action of actions || []) {
			if (!action || action.disabled) continue;
			if (action.type === 'setTimeOut') {
				if (Number.isFinite(action.duration)) visit(action.actions, context, delay + action.duration / 1000, depth + 1);
				else limitations.add('dynamic-script');
			} else if (action.type === 'condition') {
				const condition = action.conditions;
				if (condition && condition[1] && condition[1].function === 'entityExists' && condition[1].entity && condition[1].entity.function === 'thisEntity' && condition[2] === true) visit(action.then, context, delay, depth + 1);
				else limitations.add('dynamic-script');
			} else if (action.type === 'createProjectileAtPosition') {
				const child = typeof action.projectileType === 'string' && getProjectileType(action.projectileType);
				if (!child || Number(action.force) !== 0 || !thisPosition(action.position)) { limitations.add('dynamic-script'); continue; }
				const childBody = currentBody(child), damage = healthDamage(child), radius = physicalRadius(child);
				if (childBody.collidesWith && childBody.collidesWith.units === false || !(damage > 0 && radius > 0)) continue;
				const at = context === 'created' ? (number(entity._bornTime, now) - now) / 1000 + delay : context === 'death' ? lifeSeconds + delay : Infinity;
				if (at < -EPSILON) continue;
				explosions.push({ radius, damage, at: Math.max(0, at), lifeSeconds: positive(child.lifeSpan) / 1000, onTouch: context === 'touch', onWall: context === 'wall' });
			} else if (/Force|Velocity|runScript|setEntityVariable|setEntityAttribute|rotate|repeat|forAll/i.test(action.type || '')) limitations.add('dynamic-script');
		}
	}
	for (const script of scripts) {
		if (!unconditionalScript(script)) {
			limitations.add('dynamic-script'); continue;
		}
		const triggers = (script.triggers || []).map(t => t.type);
		const context = triggers.includes('entityCreated') ? 'created' : triggers.some(t => /Death|Destroyed|LifeSpan|Lifespan|AttributeBecomesZero/.test(t)) ? 'death' : triggers.includes('entityTouchesWall') ? 'wall' : triggers.includes('entityTouchesUnit') ? 'touch' : 'unknown';
		visit(script.actions, context);
	}
	const damage = body.collidesWith && body.collidesWith.units === false ? 0 : healthDamage(stats, entity.variables);
	const first = explosions.slice().sort((a, b) => a.at - b.at || b.damage - a.damage)[0];
	return {
		id: typeof entity.id === 'function' ? entity.id() : entity._id,
		position: point(entity._translate), velocity, radius: physicalRadius(stats, entity), damage, lifeSeconds,
		bounce: !!(collidesWalls && restitution > 0 && !sensor && !destroysWall && !hasWallMotionScript), restitution, destroysOnWall,
		canIgnoreWalls: !collidesWalls || !!(sensor && !destroysOnWall && !hasWallMotionScript),
		kind: Math.hypot(velocity.x, velocity.y) < 1 && lifeSeconds > .5 ? 'area' : 'projectile',
		explosionRadius: first ? first.radius : 0, explosionDamage: first ? first.damage : 0,
		explosionAt: first ? first.at : Infinity, explosionLifeSeconds: first ? first.lifeSeconds : 0,
		explosionOnTouch: first ? first.onTouch : false, explosionOnWall: first ? first.onWall : false,
		explosions, limitations: Array.from(limitations).sort()
	};
}

module.exports = { planDodge, collisionTime, rankThreats, describeHazard };
