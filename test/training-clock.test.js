const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingClock } = require('../server/training/TrainingClock');

test('virtual timers preserve order, nested zero-delay callbacks and cancellation', () => {
	const clock = new TrainingClock(0);
	const events = [];
	clock.schedule(() => { events.push('A'); clock.schedule(() => events.push('D'), 0); }, 100);
	clock.schedule(() => events.push('B'), 100);
	clock.schedule(() => events.push('C'), 0);
	const cancel = clock.schedule(() => events.push('X'), 50);
	clock.cancel(cancel);
	clock.advanceTo(100);
	assert.deepEqual(events, ['C', 'A', 'B', 'D']);
	assert.equal(clock.now(), 100);
	assert.throws(() => clock.advanceTo(99), /backwards/);
});

test('zero-delay runaway timer is stopped by a safety limit', () => {
	const clock = new TrainingClock(0, { maxCallbacksPerAdvance: 10 });
	function loop() { clock.schedule(loop, 0); }
	clock.schedule(loop, 0);
	assert.throws(() => clock.advanceTo(0), /limit/);
	clock.dispose();
	assert.equal(clock.pendingCount(), 0);
});
