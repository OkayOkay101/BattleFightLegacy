const test = require('node:test');
const assert = require('node:assert/strict');

global.IgeClass = { extend(definition) { function Animation() {} Animation.prototype = definition; return Animation; } };
const animation = require('../src/pixi/IgePixiAnimation').prototype;

test('a finite animation loop decrements its own loop count without throwing', () => {
	const stopped = [];
	const instance = { i: 1, totalNumberOfFrames: 2, loopCount: 1, startFrame: 0,
		stopAtFrame(frame) { stopped.push(frame); } };
	animation.advanceFrame.call(instance, 2);
	assert.equal(instance.loopCount, 0);
	assert.equal(instance.i, 0);
	assert.deepEqual(stopped, [0]);
});
