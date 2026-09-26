const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');

function resolvePython({ env = process.env, spawnSync = childProcess.spawnSync } = {}) {
	const local = path.resolve(__dirname, '../../training-python/.venv/Scripts/python.exe');
	const executable = env.TRAINING_PYTHON || (fs.existsSync(local) ? local : 'python');
	const result = spawnSync(executable, ['--version'], { encoding: 'utf8' });
	if (result.error || result.status !== 0) throw new Error(`Python unavailable: ${executable}; set TRAINING_PYTHON to an absolute python.exe path`);
	const version = /Python\s+(\d+\.\d+\.\d+)/.exec(result.stdout || result.stderr || '')?.[1] ||
		(result.stdout || '').trim();
	return { executable, version };
}

function runNeuralPreflight({ env = process.env, spawnSync = childProcess.spawnSync } = {}) {
	const python = resolvePython({ env, spawnSync });
	const script = 'import json,torch,numpy; print(json.dumps({"torch":torch.__version__,"numpy":numpy.__version__}))';
	const result = spawnSync(python.executable, ['-c', script], { encoding: 'utf8' });
	if (result.error || result.status !== 0) throw new Error(`PyTorch or NumPy missing from ${python.executable}: ${(result.stderr || result.error || '').toString().trim()}`);
	try { return { ...python, ...JSON.parse(result.stdout.trim()) }; }
	catch (error) { throw new Error(`Invalid neural preflight output: ${result.stdout}`); }
}

module.exports = { resolvePython, runNeuralPreflight };
