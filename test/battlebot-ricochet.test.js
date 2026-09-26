const test = require('node:test');
const assert = require('node:assert/strict');
const { findRicochetOptions } = require('../src/gameClasses/components/unit/BattleBotRicochet');

function mapWithWalls(cells) {
	const width = 10, height = 8;
	const data = Array(width * height).fill(0);
	for (const [x, y] of cells) data[x + y * width] = 1;
	return { width, height, tilewidth: 10, tileheight: 10, layers: [{ name: 'walls', data }] };
}

test('finds a single-bounce path around a blocker using a real reflecting wall', () => {
	const walls = [[4, 2]];
	for (let x = 1; x <= 8; x++) walls.push([x, 4]);
	const options = findRicochetOptions({ map: mapWithWalls(walls), origin: { x: 20, y: 25 },
		target: { x: 74, y: 25 }, targetVelocity: { x: 0, y: 0 }, speed: 100,
		lifeSpanMs: 5000, restitution: 0.5, radius: 1 });
	assert.ok(options.length > 0);
	assert.ok(options[0].bouncePoint.y < 40);
	assert.ok(options[0].flightMs < 5000);
});

test('rejects non-bouncing, expired and absent-wall paths', () => {
	const map = mapWithWalls([[4, 2]]);
	const args = { map, origin: { x: 20, y: 25 }, target: { x: 80, y: 25 },
		targetVelocity: { x: 0, y: 0 }, speed: 100, lifeSpanMs: 5000, restitution: 0.5, radius: 1 };
	assert.deepEqual(findRicochetOptions({ ...args, restitution: 0 }), []);
	assert.deepEqual(findRicochetOptions({ ...args, lifeSpanMs: 1 }), []);
	assert.deepEqual(findRicochetOptions({ ...args, map: mapWithWalls([]) }), []);
});
