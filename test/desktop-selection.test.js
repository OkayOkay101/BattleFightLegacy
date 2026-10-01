'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadSelection, saveSelection } = require('../server/training/DesktopSelection');

function fixture () {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-desktop-selection-'));
	return {
		file: path.join(directory, 'nested', 'desktop-selection.json'),
		cleanup: () => fs.rmSync(directory, { recursive: true, force: true })
	};
}

test('atomically saves and reloads Blue and Red model selections', () => {
	const f = fixture();
	try {
		saveSelection(f.file, { blue: 'n-24', red: 'baseline' });
		assert.deepEqual(loadSelection(f.file), { blue: 'n-24', red: 'baseline' });
		assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['desktop-selection.json']);
	} finally { f.cleanup(); }
});

test('automatic champion alias and independent fixed override survive persistence', () => {
	const f = fixture();
	try {
		saveSelection(f.file, { blue: 'champion', red: 'n-000024' });
		assert.deepEqual(loadSelection(f.file), { blue: 'champion', red: 'n-000024' });
	} finally { f.cleanup(); }
});

test('returns an empty selection for missing, malformed, or wrongly typed data', () => {
	const f = fixture();
	try {
		assert.deepEqual(loadSelection(f.file), {});
		fs.mkdirSync(path.dirname(f.file), { recursive: true });
		fs.writeFileSync(f.file, '{broken');
		assert.deepEqual(loadSelection(f.file), {});
		fs.writeFileSync(f.file, JSON.stringify({ blue: 123, red: 'n-24', other: 'ignored' }));
		assert.deepEqual(loadSelection(f.file), { red: 'n-24' });
		fs.writeFileSync(f.file, '[]');
		assert.deepEqual(loadSelection(f.file), {});
	} finally { f.cleanup(); }
});

test('rejects incomplete values and treats an unset path as no persisted selection', () => {
	assert.deepEqual(loadSelection(undefined), {});
	assert.doesNotThrow(() => saveSelection(undefined, { blue: 'n-24', red: 'baseline' }));
	const f = fixture();
	try {
		assert.throws(() => saveSelection(f.file, { blue: 'n-24' }), /Both blue and red/);
		assert.equal(fs.existsSync(path.dirname(f.file)), false);
	} finally { f.cleanup(); }
});
