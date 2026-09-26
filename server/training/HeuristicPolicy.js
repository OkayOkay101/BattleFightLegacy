const { validPolicy } = require('./PolicyRegistry');

function random(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

function mutatePolicy(source, seed, version) {
	if (!validPolicy(source)) throw new TypeError('Invalid source policy');
	const rng = random(seed);
	const keys = ['rangeScale', 'dodgeScale', 'switchScale'];
	const key = keys[Math.floor(rng() * keys.length)];
	const direction = rng() < 0.5 ? -1 : 1;
	const params = { ...source.params, [key]: Math.max(0.5, Math.min(1.5,
		Math.round((source.params[key] + direction * 0.1) * 100) / 100)) };
	return { version, kind: 'heuristic', params, parentVersion: source.version };
}

function candidateScore(winner, candidateSide) {
	return winner === null ? 0.5 : winner === candidateSide ? 1 : 0;
}

function pairedLowerBound(pairs, iterations = 2000) {
	if (!pairs.length || pairs.some(value => !Number.isFinite(value) || value < 0 || value > 1)) return 0;
	const rng = random(0x1a2b3c4d);
	const samples = [];
	for (let sample = 0; sample < iterations; sample++) {
		let score = 0;
		for (let index = 0; index < pairs.length; index++) score += pairs[Math.floor(rng() * pairs.length)];
		samples.push(score / pairs.length);
	}
	samples.sort((a, b) => a - b);
	return samples[Math.floor(iterations * 0.05)];
}

module.exports = { mutatePolicy, pairedLowerBound, candidateScore };
