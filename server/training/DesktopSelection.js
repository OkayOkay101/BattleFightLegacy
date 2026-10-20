'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function loadSelection (selectionFile) {
	if (!selectionFile) return {};
	try {
		const selection = JSON.parse(fs.readFileSync(selectionFile, 'utf8'));
		if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return {};
		return {
			...(typeof selection.blue === 'string' ? { blue: selection.blue } : {}),
			...(typeof selection.red === 'string' ? { red: selection.red } : {})
		};
	} catch (error) {
		return {};
	}
}

function saveSelection (selectionFile, selection) {
	if (!selectionFile) return;
	if (!selection || typeof selection.blue !== 'string' || typeof selection.red !== 'string') {
		throw new TypeError('Both blue and red model selections must be strings');
	}
	fs.mkdirSync(path.dirname(selectionFile), { recursive: true });
	const temporaryFile = `${selectionFile}.${process.pid}.${randomUUID()}.tmp`;
	try {
		fs.writeFileSync(temporaryFile, JSON.stringify({ blue: selection.blue, red: selection.red }), 'utf8');
		fs.renameSync(temporaryFile, selectionFile);
	} finally {
		if (fs.existsSync(temporaryFile)) fs.rmSync(temporaryFile, { force: true });
	}
}

module.exports = { loadSelection, saveSelection };
