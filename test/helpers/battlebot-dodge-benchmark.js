'use strict';
const { planDodge } = require('../../src/gameClasses/components/unit/BattleBotDodge');
const { performance } = require('node:perf_hooks');
const zero = { x: 0, y: 0 };
const bullet = (id, x, y, vx, vy, damage, extra = {}) => ({ id, position: { x, y }, velocity: { x: vx, y: vy }, radius: 2, damage, lifeSeconds: 2, kind: 'projectile', ...extra });

// Literal fixtures target distinct known shortcomings. This is a collision
// regression benchmark, not a match winrate or a learned-policy evaluation.
function fixtures() {
	const incoming = () => bullet('incoming', -70, 0, 140, 0, 10);
	return [
		{ name: 'crossing-second-bullet', hazards: [incoming(), bullet('crossing', 0, 60, 0, -20, 30)] },
		{ name: 'perpendicular-escape-into-stationary-area', hazards: [incoming(), bullet('pool', 0, 60, 0, 0, 40, { radius: 12, kind: 'area' })] },
		{ name: 'delayed-explosion', hazards: [bullet('bomb', 0, 0, 0, 0, 0, { radius: 1, lifeSeconds: .6, explosionRadius: 40, explosionDamage: 50, explosionAt: .6, explosionLifeSeconds: .2 })] },
		{ name: 'wall-reflection', horizon: 1.2, isClear: (p, r) => p.x + r <= 60, hazards: [bullet('bounce', 20, 0, 100, 0, 30, { bounce: true, restitution: 1 })] },
		{ name: 'large-physical-projectile', hazards: [bullet('large', -70, 35, 140, 0, 40, { radius: 40 })] }
	];
}

// Preserves AIComponent.chooseBattleBotDodge's 0.9s projection, fixed clearance,
// two perpendicular options, and GameComponent's last qualifying bullet wins.
function originalVelocity(options) {
	let angle;
	for (const h of options.hazards) {
		const squared = h.velocity.x ** 2 + h.velocity.y ** 2;
		if (squared < 1) continue;
		const dx = options.position.x - h.position.x, dy = options.position.y - h.position.y;
		const at = (dx * h.velocity.x + dy * h.velocity.y) / squared;
		if (at < 0 || at > .9 || Math.hypot(dx - h.velocity.x * at, dy - h.velocity.y * at) > Math.max(28, options.radius * 2)) continue;
		const base = Math.atan2(h.velocity.y, h.velocity.x);
		const candidate = [base + Math.PI / 2, base - Math.PI / 2].find(a => [72, 112].every(d => options.isClear({ x: options.position.x + Math.cos(a) * d, y: options.position.y + Math.sin(a) * d }, options.radius)));
		if (candidate !== undefined) angle = candidate;
	}
	return angle === undefined ? zero : { x: Math.cos(angle) * options.speed, y: Math.sin(angle) * options.speed };
}

// Independent 1ms forward simulation. It does not call planner collisionTime or
// use candidate.risk as ground truth; only physical overlaps count as contacts.
function simulate(options, unitVelocity) {
	const dt = .001, p = { ...options.position }, seen = new Set();
	const bullets = options.hazards.map(h => ({ ...h, position: { ...h.position }, velocity: { ...h.velocity }, active: true, blastPosition: null }));
	let collisions = 0, damage = 0;
	const contact = (id, amount) => { if (amount > 0 && !seen.has(id)) { seen.add(id); collisions++; damage += amount; } };
	for (let frame = 0; frame <= Math.round(options.horizon / dt); frame++) {
		const at = frame * dt;
		for (const h of bullets) {
			if (h.active && at <= h.lifeSeconds && Math.hypot(p.x - h.position.x, p.y - h.position.y) <= options.radius + h.radius) contact(h.id, h.damage);
			if (h.explosionAt !== undefined && at >= h.explosionAt && at <= h.explosionAt + (h.explosionLifeSeconds || dt)) {
				h.blastPosition = h.blastPosition || { ...h.position };
				if (Math.hypot(p.x - h.blastPosition.x, p.y - h.blastPosition.y) <= options.radius + h.explosionRadius) contact(h.id + ':explosion', h.explosionDamage);
			}
			if (at >= h.lifeSeconds || !h.active) continue;
			const next = { x: h.position.x + h.velocity.x * dt, y: h.position.y + h.velocity.y * dt };
			if (h.canIgnoreWalls || options.isClear(next, h.radius)) h.position = next;
			else if (h.bounce) {
				const bx = !options.isClear({ x: next.x, y: h.position.y }, h.radius), by = !options.isClear({ x: h.position.x, y: next.y }, h.radius);
				if (bx || !by) h.velocity.x *= -h.restitution;
				if (by || !bx) h.velocity.y *= -h.restitution;
			} else h.active = false;
		}
		const next = { x: p.x + unitVelocity.x * dt, y: p.y + unitVelocity.y * dt };
		if (options.isClear(next, options.radius)) Object.assign(p, next);
	}
	return { collisions, damage };
}

function benchmark() {
	const scenarios = fixtures().map(fixture => {
		const options = { position: zero, velocity: zero, speed: 100, radius: 5, now: 1000, horizon: 1, isClear: () => true, ...fixture };
		const best = planDodge(options).best;
		const plannerVelocity = best.moving ? { x: Math.cos(best.angle) * options.speed, y: Math.sin(best.angle) * options.speed } : zero;
		return { name: fixture.name, original: simulate(options, originalVelocity(options)), planner: simulate(options, plannerVelocity), direction: best.direction };
	});
	const total = key => scenarios.reduce((sum, s) => ({ collisions: sum.collisions + s[key].collisions, damage: sum.damage + s[key].damage }), { collisions: 0, damage: 0 });
	return { scope: 'five fixed adversarial collision fixtures; no match winrate claim', stepSeconds: .001, scenarios, original: total('original'), planner: total('planner') };
}

function stressProfile(iterations = 200) {
	const hazards = Array.from({ length: 100 }, (_, i) => {
		const angle = i * Math.PI * 2 / 100, distance = 100 + i % 10 * 20;
		return bullet(String(i), Math.cos(angle) * distance, Math.sin(angle) * distance, -Math.cos(angle) * 600, -Math.sin(angle) * 600, 10 + i % 5);
	});
	const options = { position: zero, velocity: zero, radius: 10, speed: 160, hazards, horizon: .8, isClear: (p, r) => Math.abs(p.x) + r < 500 && Math.abs(p.y) + r < 500 };
	for (let i = 0; i < 20; i++) planDodge(options);
	const durations = [];
	for (let i = 0; i < iterations; i++) { const start = performance.now(); planDodge(options); durations.push(performance.now() - start); }
	durations.sort((a, b) => a - b);
	return { hazards: 100, iterations, meanMilliseconds: durations.reduce((a, b) => a + b, 0) / iterations, p95Milliseconds: durations[Math.floor(iterations * .95)], maxMilliseconds: durations[iterations - 1], scope: 'local planner CPU timing only; synthetic callback is cheaper than full map queries' };
}

if (require.main === module) {
	const report = benchmark();
	if (process.argv.includes('--profile')) report.performance = stressProfile();
	process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
module.exports = { benchmark, fixtures, originalVelocity, simulate, stressProfile };
