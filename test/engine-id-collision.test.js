const test = require('node:test');
const assert = require('node:assert/strict');

global.IgeEntity = {
	extend(definition) {
		function Engine() {}
		Engine.prototype = definition;
		return Engine;
	}
};

const IgeEngine = require('../engine/core/IgeEngine');

test('newIdHex retries when a generated entity ID is already registered', () => {
	const engine = Object.create(IgeEngine.prototype);
	engine._idCounter = 0;
	engine._register = { 1: { _classId: 'Unit' } };
	const random = Math.random;
	try {
		Math.random = () => 0;
		assert.equal(engine.newIdHex(), '2');
		assert.equal(engine._idCounter, 2);
	} finally {
		Math.random = random;
	}
});
