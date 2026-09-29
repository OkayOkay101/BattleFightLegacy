'use strict';

const { app, BrowserWindow, dialog, ipcMain, session, utilityProcess } = require('electron');
const fs = require('fs');
const path = require('path');

const LOG_LIMIT_BYTES = 1024 * 1024;
const STARTUP_TIMEOUT_MS = 30000;
const SHUTDOWN_TIMEOUT_MS = 4000;

let gameProcess = null;
let gameWindow = null;
let connectionConfig = null;
let stopPromise = null;
let quitAfterStop = false;
let readyHttpOrigin = null;
let readyWebSocketOrigin = null;

function resourceRoot () {
	return app.isPackaged
		? path.join(process.resourcesPath, 'desktop-data')
		: path.resolve(__dirname, '..', 'build', 'desktop-resources');
}

function appendLog (message) {
	try {
		const logDirectory = app.getPath('userData');
		fs.mkdirSync(logDirectory, { recursive: true });
		const logPath = path.join(logDirectory, 'desktop-startup.log');
		if (fs.existsSync(logPath) && fs.statSync(logPath).size >= LOG_LIMIT_BYTES) {
			const previousLogPath = `${logPath}.1`;
			try { fs.rmSync(previousLogPath, { force: true }); } catch (error) {}
			fs.renameSync(logPath, previousLogPath);
		}
		fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
	} catch (error) {
		console.error('Could not write BattleFight startup log:', error);
	}
}

function isPort (value) {
	return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isReadyMessage (message) {
	return message && message.type === 'battlefight-ready' && isPort(message.httpPort) && isPort(message.wsPort) && message.httpPort !== message.wsPort;
}

function installRequestAllowlist (rendererSession) {
	const allowedOrigins = new Set([readyHttpOrigin, readyWebSocketOrigin]);
	rendererSession.webRequest.onBeforeRequest((details, callback) => {
		let allowed = false;
		try {
			allowed = allowedOrigins.has(new URL(details.url).origin);
		} catch (error) {}
		callback({ cancel: !allowed });
	});
}

function startGameServer () {
	return new Promise((resolve, reject) => {
		const root = resourceRoot();
		const entryPath = path.join(root, 'server', 'desktop-entry.js');
		if (!fs.existsSync(entryPath)) {
			return reject(new Error(`Desktop runtime is missing: ${entryPath}`));
		}

		const packagedModulesPath = path.join(app.getAppPath(), 'node_modules');
		gameProcess = utilityProcess.fork(entryPath, ['-g', './src'], {
			cwd: root,
			env: {
				...process.env,
				BATTLEFIGHT_DESKTOP: '1',
				BATTLEFIGHT_RESOURCE_ROOT: root,
				BATTLEFIGHT_USER_DATA: path.join(app.getPath('userData'), 'training-data'),
				NODE_PATH: [packagedModulesPath, process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
			}
		});

		let settled = false;
		const timeout = setTimeout(() => {
			fail(new Error(`Game server readiness timed out after ${STARTUP_TIMEOUT_MS} ms`));
		}, STARTUP_TIMEOUT_MS);

		const fail = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			appendLog(error.stack || error.message);
			reject(error);
		};

		gameProcess.on('message', (event) => {
			const message = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : event;
			if (message && message.type === 'battlefight-error') {
				const error = new Error(message.message || 'Local game server failed during startup');
				if (settled) {
					appendLog(error.stack || error.message);
					dialog.showErrorBox('BattleFight server stopped', `${error.message}\n\nDetails: ${path.join(app.getPath('userData'), 'desktop-startup.log')}`);
					app.quit();
				} else {
					fail(error);
				}
				return;
			}
			if (!isReadyMessage(message)) {
				if (message && message.type === 'battlefight-ready') fail(new Error('Game server sent invalid readiness ports'));
				return;
			}
			if (settled) {
				fail(new Error('Game server sent more than one readiness message'));
				return;
			}
			settled = true;
			clearTimeout(timeout);
			readyHttpOrigin = `http://127.0.0.1:${message.httpPort}`;
			readyWebSocketOrigin = `ws://127.0.0.1:${message.wsPort}`;
			connectionConfig = { webSocketUrl: readyWebSocketOrigin };
			resolve({ httpUrl: readyHttpOrigin });
		});

		gameProcess.on('error', (error) => fail(new Error(`Could not start local game server: ${error.message}`)));
		gameProcess.on('exit', (code) => {
			if (!settled) fail(new Error(`Local game server exited before readiness (code ${code})`));
			gameProcess = null;
		});
	});
}

function createGameWindow (httpUrl) {
	const partition = 'persist:battlefight-desktop';
	const rendererSession = session.fromPartition(partition);
	installRequestAllowlist(rendererSession);

	gameWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 960,
		minHeight: 640,
		show: false,
		backgroundColor: '#101a27',
		webPreferences: {
			partition,
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true
		}
	});

	gameWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	gameWindow.webContents.on('will-navigate', (event, url) => {
		if (new URL(url).origin !== readyHttpOrigin) event.preventDefault();
	});
	gameWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
		if (code === -3 || !isMainFrame) return;
		appendLog(`Renderer load failed (${code}) ${description}: ${validatedURL}`);
		dialog.showErrorBox('BattleFight could not open', `${description}\n\nDetails: ${path.join(app.getPath('userData'), 'desktop-startup.log')}`);
		app.quit();
	});
	gameWindow.once('ready-to-show', () => gameWindow && gameWindow.show());
	gameWindow.on('closed', () => { gameWindow = null; });
	return gameWindow.loadURL(httpUrl);
}

ipcMain.handle('desktop:get-connection-config', (event) => {
	const senderUrl = event.senderFrame && event.senderFrame.url;
	if (!connectionConfig || !senderUrl || new URL(senderUrl).origin !== readyHttpOrigin) {
		throw new Error('Local game connection is not ready');
	}
	return connectionConfig;
});

function stopGameServer () {
	if (stopPromise) return stopPromise;
	if (!gameProcess) return Promise.resolve();

	const child = gameProcess;
	stopPromise = new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			child.removeListener('exit', finish);
			if (gameProcess === child) gameProcess = null;
			resolve();
		};
		const timer = setTimeout(() => {
			appendLog('Graceful shutdown timed out; terminating the local game process');
			child.kill();
			setTimeout(finish, 500);
		}, SHUTDOWN_TIMEOUT_MS);
		child.once('exit', finish);
		try {
			child.postMessage({ type: 'battlefight-shutdown' });
		} catch (error) {
			appendLog(`Could not request graceful shutdown: ${error.message}`);
			child.kill();
		}
	});
	return stopPromise;
}

app.whenReady().then(async () => {
	try {
		const { httpUrl } = await startGameServer();
		await createGameWindow(httpUrl);
	} catch (error) {
		appendLog(error.stack || error.message);
		dialog.showErrorBox('BattleFight could not start', `${error.message}\n\nDetails: ${path.join(app.getPath('userData'), 'desktop-startup.log')}`);
		app.quit();
	}
});

app.on('before-quit', (event) => {
	if (quitAfterStop || !gameProcess) return;
	event.preventDefault();
	stopGameServer().finally(() => {
		quitAfterStop = true;
		app.quit();
	});
});

app.on('window-all-closed', () => app.quit());
