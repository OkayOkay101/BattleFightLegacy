'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');

// Electron utility processes do not initialize Node's global search paths.
// Load the NODE_PATH supplied by the desktop launcher before loading the server.
require('module')._initPaths();

process.env.ENV = 'standalone';
process.env.BATTLEFIGHT_DESKTOP = '1';

const resourceRoot = path.resolve(process.env.BATTLEFIGHT_RESOURCE_ROOT || process.cwd());
const userDataRoot = path.resolve(process.env.BATTLEFIGHT_USER_DATA || '');
if (!process.env.BATTLEFIGHT_USER_DATA) throw new Error('BATTLEFIGHT_USER_DATA is required');
process.env.BATTLEFIGHT_RESOURCE_ROOT = resourceRoot;
process.env.BATTLEFIGHT_USER_DATA = userDataRoot;
process.chdir(resourceRoot);

const logPath = path.join(path.dirname(userDataRoot), 'desktop-server.log');
const logLimitBytes = 2 * 1024 * 1024;
let isShuttingDown = false;

function writeLog (message) {
	try {
		fs.mkdirSync(path.dirname(logPath), { recursive: true });
		if (fs.existsSync(logPath) && fs.statSync(logPath).size >= logLimitBytes) {
			const previousPath = `${logPath}.1`;
			try { fs.rmSync(previousPath, { force: true }); } catch (error) {}
			fs.renameSync(logPath, previousPath);
		}
		fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
	} catch (error) {
		try { process.stderr.write(`Could not write server log: ${error.message}\n`); } catch (writeError) {}
	}
}

function postToParent (message) {
	if (process.parentPort) process.parentPort.postMessage(message);
}

function shutdown () {
	if (isShuttingDown) return;
	isShuttingDown = true;
	const gameServer = global.ige && global.ige.server;
	if (gameServer && typeof gameServer.shutdown === 'function') {
		Promise.resolve(gameServer.shutdown()).then(() => process.exit(0)).catch((error) => {
			writeLog(`Graceful server shutdown failed: ${error.stack || error.message}`);
			process.exit(1);
		});
		return;
	}
	process.exit(0);
}

if (process.parentPort) {
	process.parentPort.on('message', (event) => {
		const message = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : event;
		if (message && message.type === 'battlefight-shutdown') shutdown();
	});
}

for (const method of ['log', 'warn', 'error']) {
	const original = console[method].bind(console);
	console[method] = (...args) => {
		const message = util.format(...args);
		writeLog(message);
		original(...args);
	};
}

process.on('uncaughtException', (error) => {
	const message = error.stack || error.message;
	writeLog(`Uncaught exception: ${message}`);
	postToParent({ type: 'battlefight-error', message });
	shutdown();
});
process.on('unhandledRejection', (reason) => {
	const message = reason && (reason.stack || reason.message) ? (reason.stack || reason.message) : String(reason);
	writeLog(`Unhandled rejection: ${message}`);
	postToParent({ type: 'battlefight-error', message });
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
	require('./ige');
} catch (error) {
	const message = error.stack || error.message;
	writeLog(`Server startup failed: ${message}`);
	postToParent({ type: 'battlefight-error', message });
	process.exitCode = 1;
}
