const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePython, runNeuralPreflight } = require('../server/training/NeuralPreflight');

test('explicit training Python path is used without relying on shell PATH', () => {
	let executable;
	const result = resolvePython({ env: { TRAINING_PYTHON: 'C:\\Python314\\python.exe' },
		spawnSync(cmd) { executable = cmd; return { status: 0, stdout: '3.14.7\n' }; } });
	assert.equal(executable, 'C:\\Python314\\python.exe');
	assert.equal(result.version, '3.14.7');
});

test('missing torch has a distinct actionable preflight error', () => {
	assert.throws(() => runNeuralPreflight({ env: {}, spawnSync(_cmd, args) {
		return args.includes('--version') ? { status: 0, stdout: 'Python 3.14.7' } :
			{ status: 1, stderr: "No module named 'torch'" };
	} }), /PyTorch.*missing/i);
});
