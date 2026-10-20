const { buildObservation, rosterHash } = require('./NeuralObservation');
const { enumerateLegalActions } = require('./NeuralActions');
const { scoreActions } = require('./NeuralInference');

function chooseNeuralAction({ weights, policyVersion, playerId, simulatedAt, snapshot,
	training = true, random = Math.random }) {
	const schemaVersion = weights.schemaVersion || 1;
	const observation = buildObservation(snapshot, schemaVersion);
	const options = enumerateLegalActions(snapshot, schemaVersion);
	const { logits, value } = scoreActions(weights, observation, options);
	const max = Math.max(...logits);
	if (!Number.isFinite(max)) throw new Error('No legal neural action');
	const exponentials = logits.map(logit => Number.isFinite(logit) ? Math.exp(logit - max) : 0);
	const total = exponentials.reduce((sum, value) => sum + value, 0);
	if (!Number.isFinite(total) || total <= 0) throw new Error('Invalid neural action distribution');
	let chosenIndex = logits.indexOf(max);
	if (training) {
		let draw = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
		for (let index = 0; index < exponentials.length; index++) {
			draw -= exponentials[index];
			if (draw < 0) { chosenIndex = index; break; }
		}
	}
	const record = { playerId, policyVersion, rosterHash,
		observation: [...observation], observation86: [...observation], observation82: [...observation],
		options: options.map(option => [...option.features]), options17: options.map(option => [...option.features]), options13: options.map(option => [...option.features]),
		chosenIndex,
		logProb: Math.log(exponentials[chosenIndex] / total), value, simulatedAt };
	if (schemaVersion >= 2) {
		delete record.observation86; delete record.observation82; delete record.options17; delete record.options13;
		Object.assign(record, { schemaVersion, observationSchemaVersion: schemaVersion, actionSchemaVersion: schemaVersion,
			schemaHash: weights.schemaHash, environmentHash: weights.environmentHash,
			trainingProtocolVersion: weights.trainingProtocolVersion, requestedAction: { ...options[chosenIndex].action } });
	}
	return { action: options[chosenIndex].action, options, record };
}

module.exports = { chooseNeuralAction };
