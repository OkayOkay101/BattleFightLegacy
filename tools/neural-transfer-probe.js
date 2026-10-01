// Diagnostic-only preload. Does not change actions or production training sources.
const controller = require('../server/training/NeuralController');
const original = controller.chooseNeuralAction;
const counters = {};
controller.chooseNeuralAction = function (config) {
	const result = original(config);
	const count = counters[config.policyVersion] ||= { decisions: 0, shootable: 0, fired: 0,
		dangerDecisions: 0, explicitEscapes: 0, unsafeEscapes: 0, movements: {}, directions: {} };
	count.decisions++;
	if (result.options.some(option => option.action.fire)) count.shootable++;
	if (result.action.fire) count.fired++;
	count.movements[result.action.movement] = (count.movements[result.action.movement] || 0) + 1;
	const plan = config.snapshot.dodge;
	if (plan?.currentRisk > 0 || plan?.imminent) count.dangerDecisions++;
	if (Number.isInteger(result.action.dodgeDirection)) {
		count.explicitEscapes++;
		count.directions[result.action.dodgeDirection] = (count.directions[result.action.dodgeDirection] || 0) + 1;
		const selected = plan?.candidates.find(entry => entry.direction === result.action.dodgeDirection);
		if (selected && selected.risk > (plan.best?.risk || 0) + 1e-6) count.unsafeEscapes++;
	}
	return result;
};
if (process.send) {
	const send = process.send.bind(process);
	process.send = function (message, ...args) {
		if (message?.type === 'result') message.report.transferProbe = counters;
		return send(message, ...args);
	};
}
