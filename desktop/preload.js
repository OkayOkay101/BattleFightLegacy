'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('battleFightDesktop', Object.freeze({
	getConnectionConfig: () => ipcRenderer.invoke('desktop:get-connection-config'),
	openCustomSandbox: id => ipcRenderer.invoke('desktop:open-custom-sandbox', id)
}));
