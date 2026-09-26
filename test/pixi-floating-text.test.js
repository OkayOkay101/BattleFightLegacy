const test = require('node:test');
const assert = require('node:assert/strict');

global.IgeEntity = {
	prototype: { destroy() {} },
	extend(definition) { function FloatingText() {} FloatingText.prototype = definition; return FloatingText; }
};
const FloatingText = require('../src/pixi/IgePixiFloatingText').prototype;

test('fade-up stops updating when its parent destroyed the PIXI text', () => {
	const originals = { setInterval: global.setInterval, clearInterval: global.clearInterval, setTimeout: global.setTimeout };
	let tick, cleared = false, destroyed = false;
	global.setInterval = callback => { tick = callback; return 1; };
	global.clearInterval = id => { assert.equal(id, 1); cleared = true; };
	global.setTimeout = () => 2;
	try {
		const text = { _pixiText: { _destroyed: true }, destroy() { destroyed = true; } };
		FloatingText.fadeUp.call(text);
		tick();
		assert.equal(cleared, true);
		assert.equal(destroyed, true);
	} finally {
		Object.assign(global, originals);
	}
});

test('queued unit damage text stops when the unit sprite has been destroyed', () => {
	global.IgeEntityPhysics = global.IgeEntity;
	const Unit = require('../src/gameClasses/Unit').prototype;
	const originals = { setInterval: global.setInterval, clearInterval: global.clearInterval, ige: global.ige };
	let tick, cleared = false;
	global.setInterval = callback => { tick = callback; return 7; };
	global.clearInterval = id => { assert.equal(id, 7); cleared = true; };
	global.ige = { client: { myPlayer: { _stats: { playerJoined: true } } }, network: { id: () => 'local' }, game: {} };
	try {
		const unit = { getOwner: () => null, _stats: { clientId: 'enemy', fadingTextQueue: [] },
			_pixiTexture: { _destroyed: true }, _pixiContainer: {} };
		Unit.updateFadingText.call(unit, '10', 'red');
		tick();
		assert.equal(cleared, true);
		assert.equal(unit._fadingTextInterval, null);
		assert.equal(unit._stats.fadingTextQueue.length, 0);
	} finally { Object.assign(global, originals); }
});
