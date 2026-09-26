const faceCache = new WeakMap();

function walls(map) {
	return (map.layers || []).find(layer => layer.name === 'walls')?.data || [];
}

function wallAt(map, data, x, y) {
	return x >= 0 && y >= 0 && x < map.width && y < map.height && !!data[x + y * map.width];
}

function faces(map) {
	if (faceCache.has(map)) return faceCache.get(map);
	const data = walls(map), result = [];
	for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
		if (!wallAt(map, data, x, y)) continue;
		if (!wallAt(map, data, x, y - 1)) result.push({ axis: 'y', wall: y * map.tileheight, min: x * map.tilewidth, max: (x + 1) * map.tilewidth, side: -1 });
		if (!wallAt(map, data, x, y + 1)) result.push({ axis: 'y', wall: (y + 1) * map.tileheight, min: x * map.tilewidth, max: (x + 1) * map.tilewidth, side: 1 });
		if (!wallAt(map, data, x - 1, y)) result.push({ axis: 'x', wall: x * map.tilewidth, min: y * map.tileheight, max: (y + 1) * map.tileheight, side: -1 });
		if (!wallAt(map, data, x + 1, y)) result.push({ axis: 'x', wall: (x + 1) * map.tilewidth, min: y * map.tileheight, max: (y + 1) * map.tileheight, side: 1 });
	}
	faceCache.set(map, result);
	return result;
}

function clearPoint(map, data, point, radius) {
	const minX = Math.floor((point.x - radius) / map.tilewidth);
	const maxX = Math.floor((point.x + radius) / map.tilewidth);
	const minY = Math.floor((point.y - radius) / map.tileheight);
	const maxY = Math.floor((point.y + radius) / map.tileheight);
	for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
		if (!wallAt(map, data, x, y)) continue;
		const nearestX = Math.max(x * map.tilewidth, Math.min(point.x, (x + 1) * map.tilewidth));
		const nearestY = Math.max(y * map.tileheight, Math.min(point.y, (y + 1) * map.tileheight));
		if (Math.hypot(point.x - nearestX, point.y - nearestY) < radius - 1e-6) return false;
	}
	return true;
}

function clearSegment(map, data, from, to, radius) {
	const distance = Math.hypot(to.x - from.x, to.y - from.y);
	const steps = Math.max(1, Math.ceil(distance / (Math.min(map.tilewidth, map.tileheight) / 4)));
	for (let index = 0; index <= steps; index++) {
		const t = index / steps;
		if (!clearPoint(map, data, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, radius)) return false;
	}
	return true;
}

function candidateForFace(face, origin, target, radius) {
	const primary = face.axis;
	const secondary = primary === 'x' ? 'y' : 'x';
	const plane = face.wall + face.side * (radius + 0.05);
	if ((origin[primary] - plane) * face.side <= 0 || (target[primary] - plane) * face.side <= 0) return null;
	const reflected = 2 * plane - target[primary];
	const denominator = reflected - origin[primary];
	if (Math.abs(denominator) < 1e-9) return null;
	const t = (plane - origin[primary]) / denominator;
	if (t <= 0 || t >= 1) return null;
	const along = origin[secondary] + (target[secondary] - origin[secondary]) * t;
	if (along <= face.min + radius || along >= face.max - radius) return null;
	return primary === 'x' ? { x: plane, y: along } : { x: along, y: plane };
}

function findRicochetOptions({ map, origin, target, targetVelocity = { x: 0, y: 0 }, speed,
	lifeSpanMs, restitution, radius = 1 }) {
	if (!map || !origin || !target || !(speed > 0) || !(lifeSpanMs > 0) || !(restitution > 0)) return [];
	const data = walls(map);
	const maxDistance = speed * lifeSpanMs / 1000;
	const nearby = faces(map).filter(face => {
		const center = face.axis === 'x' ? { x: face.wall, y: (face.min + face.max) / 2 } : { x: (face.min + face.max) / 2, y: face.wall };
		return Math.hypot(center.x - origin.x, center.y - origin.y) < maxDistance;
	}).sort((a, b) => Math.abs(a.wall - origin[a.axis]) - Math.abs(b.wall - origin[b.axis])).slice(0, 100);
	const options = [];
	for (const face of nearby) {
		let predicted = target;
		let bounce;
		let flightMs;
		for (let iteration = 0; iteration < 2; iteration++) {
			bounce = candidateForFace(face, origin, predicted, radius);
			if (!bounce) break;
			flightMs = (Math.hypot(origin.x - bounce.x, origin.y - bounce.y) / speed +
				Math.hypot(predicted.x - bounce.x, predicted.y - bounce.y) / (speed * restitution)) * 1000;
			predicted = { x: target.x + targetVelocity.x * flightMs / 1000,
				y: target.y + targetVelocity.y * flightMs / 1000 };
		}
		if (!bounce || flightMs > lifeSpanMs || !Number.isFinite(flightMs)) continue;
		if (!clearSegment(map, data, origin, bounce, radius) || !clearSegment(map, data, bounce, predicted, radius)) continue;
		options.push({ aim: bounce, bouncePoint: bounce, flightMs, score: 1 / (1 + flightMs) });
	}
	return options.sort((a, b) => a.flightMs - b.flightMs).slice(0, 8);
}

module.exports = { findRicochetOptions };
