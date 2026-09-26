const test = require('node:test');
const assert = require('node:assert/strict');
const { TrainingClock } = require('../server/training/TrainingClock');
const { TrainingStepper } = require('../server/training/TrainingStepper');

test('fixed steps advance one simulation second and run timers at the correct step', () => {
	const clock = new TrainingClock(1000);
	const frames = [];
	const engine = { engineStep(at) { frames.push(at); } };
	const stepper = new TrainingStepper({ ige: engine, clock });
	let timerStep = null;
	clock.schedule(() => { timerStep = frames.length; }, 250);
	for (let i = 0; i < 60; i++) stepper.step();
	assert.equal(clock.now(), 2000);
	assert.equal(frames.length, 60);
	assert.equal(timerStep, 14);
	assert.ok(Math.abs(frames[0] - 1016.6666666666666) < 1e-9);
	assert.ok(Math.abs(frames[59] - 2000) < 1e-9);
});

test('a training stepper can be disposed without running a later timer', () => {
	const clock = new TrainingClock(0);
	const stepper = new TrainingStepper({ ige: { engineStep() {} }, clock });
	let fired = false;
	clock.schedule(() => { fired = true; }, 100);
	stepper.dispose();
	assert.throws(() => stepper.step(), /disposed/i);
	assert.equal(fired, false);
	assert.equal(clock.pendingCount(), 0);
});
