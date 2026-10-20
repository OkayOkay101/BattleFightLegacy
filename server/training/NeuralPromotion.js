const { pairedLowerBound } = require('./HeuristicPolicy');

function pairScores(pairs) {
	if (!Array.isArray(pairs) || pairs.length < 30 || pairs.some(pair =>
		!Array.isArray(pair) || pair.length !== 2 || pair.some(value =>
			!Number.isFinite(value) || value < 0 || value > 1))) return null;
	return pairs.map(pair => (pair[0] + pair[1]) / 2);
}

function canPromoteNeural({ championPairs, archivedPairs = null, heuristicPairs = null, parityPassed } = {}) {
	if (!parityPassed) return false;
	const championScores = pairScores(championPairs);
	if (!championScores || pairedLowerBound(championScores) <= 0.5) return false;
	for (const opponentPairs of [archivedPairs, heuristicPairs]) {
		if (opponentPairs === null) continue;
		const archivedScores = pairScores(opponentPairs);
		if (!archivedScores || pairedLowerBound(archivedScores.map(score => 1 - score)) > 0.5) return false;
	}
	return true;
}

module.exports = { canPromoteNeural };
