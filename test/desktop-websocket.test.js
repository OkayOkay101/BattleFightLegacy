'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function deferred () {
	let resolved = false;
	const callbacks = [];
	const result = {
		resolve () { resolved = true; callbacks.splice(0).forEach(callback => callback()); },
		reject () {},
		then (callback) { if (resolved) callback(); else callbacks.push(callback); return result; },
		done (callback) { return result.then(callback); },
		fail () { return result; }
	};
	return result;
}

function connectionUrl (isStandalone, isDesktopApp, serverUrl) {
	const context = {
		module: { exports: {} },
		window: { isStandalone, isDesktopApp, location: { hostname: '127.0.0.1' } },
		ige: { client: { servers: [{ gameId: 'test' }], getBestServer: () => null } },
		$: { Deferred: deferred, when () { const ready = deferred(); ready.resolve(); return ready; } },
		console: { log () {} }, WebSocket: function () {}
	};
	vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../engine/components/network/net.io/IgeNetIoClient.js'), 'utf8'), context);
	const client = Object.create(context.module.exports);
	let connectedUrl;
	client.log = () => {};
	client.connectToGS = (url) => {
		connectedUrl = url;
		client._state = 3;
		const ready = deferred();
		ready.resolve();
		return ready;
	};
	client.start({ id: 'test', url: serverUrl });
	return connectedUrl;
}

test('Electron keeps the dynamic WebSocket port supplied by its game server', () => {
	for (const port of [43101, 54321]) {
		const url = `ws://127.0.0.1:${port}`;
		assert.equal(connectionUrl(true, true, url), url);
	}
});

test('browser standalone keeps its default local port', () => {
	assert.equal(connectionUrl(true, false, undefined), 'ws://127.0.0.1:2001');
});

test('hosted browser games retain the configured server URL', () => {
	assert.equal(connectionUrl(false, false, 'wss://example.test:444'), 'wss://example.test:444');
});
