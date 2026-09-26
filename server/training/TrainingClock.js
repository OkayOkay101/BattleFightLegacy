class TrainingClock {
	constructor(startMs = 0, { maxCallbacksPerAdvance = 10000 } = {}) {
		if (!Number.isFinite(startMs)) throw new TypeError('Invalid clock start');
		this.currentMs = startMs;
		this.maxCallbacksPerAdvance = maxCallbacksPerAdvance;
		this.queue = new Map();
		this.nextId = 0;
		this.disposed = false;
	}

	now() { return this.currentMs; }
	pendingCount() { return this.queue.size; }

	schedule(callback, delayMs) {
		if (this.disposed) throw new Error('Training clock is disposed');
		if (typeof callback !== 'function' || !Number.isFinite(delayMs) || delayMs < 0) throw new RangeError('Invalid training timer delay');
		const id = ++this.nextId;
		this.queue.set(id, { id, at: this.currentMs + delayMs, callback });
		return id;
	}

	cancel(id) { return this.queue.delete(id); }

	advanceTo(ms) {
		if (this.disposed) throw new Error('Training clock is disposed');
		if (!Number.isFinite(ms) || ms < this.currentMs) throw new RangeError('Training clock cannot go backwards');
		let callbacks = 0;
		while (this.queue.size) {
			const next = [...this.queue.values()].sort((a, b) => a.at - b.at || a.id - b.id)[0];
			if (next.at > ms) break;
			if (++callbacks > this.maxCallbacksPerAdvance) throw new Error('Training clock callback limit exceeded');
			this.queue.delete(next.id);
			this.currentMs = next.at;
			next.callback();
		}
		this.currentMs = ms;
	}

	dispose() { this.queue.clear(); this.disposed = true; }
}

module.exports = { TrainingClock };
