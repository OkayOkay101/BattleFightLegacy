// Diagnostic preload only. It does not alter decisions, rewards, or training files.
const controller = require('../server/training/NeuralController');
const original = controller.chooseNeuralAction;
const counts = {};
controller.chooseNeuralAction = function (config) {
	const result = original(config);
	if (config.weights.schemaVersion === 2) {
		const count = counts[config.policyVersion] ||= { decisions: 0, shootable: 0, withheld: 0, fired: 0 };
		count.decisions++;
		if (result.options.some(option => option.action.fire)) {
			count.shootable++;
			if (!result.action.fire) count.withheld++;
		}
		if (result.action.fire) count.fired++;
	}
	return result;
};
process.on('exit', () => console.log('NEURAL_FIRE_PROBE ' + JSON.stringify(counts)));
