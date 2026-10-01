const crypto = require('node:crypto');
const { rosterHash } = require('./NeuralObservation');
const { getSchema } = require('./NeuralSchema');

function validateLayers(layers, dimensions) {
	if (!Array.isArray(layers) || layers.length !== dimensions.length - 1) throw new Error('Invalid neural layer count');
	for (let index = 0; index < layers.length; index++) {
		const layer = layers[index];
		if (layer.rows !== dimensions[index + 1] || layer.cols !== dimensions[index] ||
			!Array.isArray(layer.weights) || layer.weights.length !== layer.rows * layer.cols ||
			!Array.isArray(layer.bias) || layer.bias.length !== layer.rows ||
			![...layer.weights, ...layer.bias].every(Number.isFinite)) throw new Error('Invalid neural layer dimensions or values');
	}
}

function loadWeights(envelope) {
	if (typeof envelope?.payload !== 'string' || typeof envelope.checksum !== 'string' ||
		crypto.createHash('sha256').update(envelope.payload).digest('hex') !== envelope.checksum) {
		throw new Error('Neural weights checksum mismatch');
	}
	const weights = JSON.parse(envelope.payload);
	if (weights.rosterHash !== rosterHash) throw new Error('Neural weights roster mismatch');
	const schema = getSchema(weights.schemaVersion);
	if (weights.observationSchemaVersion !== schema.version || (schema.version >= 2 &&
		(weights.actionSchemaVersion !== schema.version || weights.schemaHash !== schema.schemaHash ||
		 typeof weights.environmentHash !== 'string' || !weights.environmentHash || weights.trainingProtocolVersion !== 2))) throw new Error('Unsupported neural schema or protocol metadata');
	validateLayers(weights.actor, schema.actorDimensions);
	validateLayers(weights.critic, schema.criticDimensions);
	return weights;
}

const bufferA = new Float32Array(64);
const bufferB = new Float32Array(64);
const actorInputs = { 1: new Float32Array(103), 2: new Float32Array(167), 3: new Float32Array(211) };

function forward(input, layers) {
	let inBuf = input;
	let outBuf = bufferA;
	for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
		const layer = layers[layerIndex];
		const isLast = layerIndex === layers.length - 1;
		const rows = layer.rows;
		const cols = layer.cols;
		const weights = layer.weights;
		const bias = layer.bias;

		if (isLast) {
			let val = bias[0];
			for (let c = 0; c < cols; c++) val += weights[c] * inBuf[c];
			return val;
		}

		for (let row = 0; row < rows; row++) {
			let value = bias[row];
			const start = row * cols;
			for (let column = 0; column < cols; column++) value += weights[start + column] * inBuf[column];
			outBuf[row] = value > 0 ? value : 0;
		}
		inBuf = outBuf;
		outBuf = inBuf === bufferA ? bufferB : bufferA;
	}
	return inBuf[0];
}

function scoreActions(weights, observation, options) {
	const schema = getSchema(weights.schemaVersion || 1);
	if (!observation || observation.length !== schema.observationCount || !Array.isArray(options) || !options.length || options.length > schema.maxOptions) throw new RangeError('Invalid neural observation or no actions');
	if (!options.some(option => option.legal)) throw new Error('No legal neural action');
	if (![...observation].every(Number.isFinite)) throw new Error('Non-finite neural observation');
	const actorInput = actorInputs[schema.version];
	const value = forward(observation, weights.critic);
	actorInput.set(observation);
	const logits = options.map(option => {
		if (!option.legal) return -Infinity;
		if (option.features.length !== schema.actionCount) throw new RangeError('Invalid neural action features');
		if (![...option.features].every(Number.isFinite)) throw new Error('Non-finite neural action features');
		actorInput.set(option.features, schema.observationCount);
		return forward(actorInput, weights.actor);
	});
	if (!Number.isFinite(value) || logits.some((logit, index) => options[index].legal && !Number.isFinite(logit))) throw new Error('Non-finite neural output');
	return { logits, value };
}

module.exports = { loadWeights, scoreActions };
