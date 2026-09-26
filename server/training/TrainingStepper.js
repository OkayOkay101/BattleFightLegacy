class TrainingStepper {
	constructor({ ige, clock }) {
		if (!ige || typeof ige.engineStep !== 'function' || !clock || typeof clock.advanceTo !== 'function') {
			throw new TypeError('Training stepper requires an engine and clock');
		}
		this.ige = ige;
		this.clock = clock;
		this.startedAt = clock.now();
		this.steps = 0;
		this.disposed = false;
	}

	step() {
		if (this.disposed) throw new Error('Training stepper is disposed');
		const at = this.startedAt + (++this.steps * 1000 / 60);
		this.clock.advanceTo(at);
		this.ige.engineStep(at);
		return at;
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.clock.dispose();
	}
}

module.exports = { TrainingStepper };
