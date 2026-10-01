'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sourceByUrl, rewriteGameAssets } = require('../tools/prepare-desktop-package');

test('original sprite filenames containing parentheses are retained', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-original-sprites-'));
	try {
		const directory = path.join(root, 'assets', 'cache.modd.io', 'asset', 'spriteImage');
		fs.mkdirSync(directory, { recursive: true });
		const original = path.join(directory, 'New_Piskel(379).svg');
		fs.writeFileSync(original, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>');
		assert.equal(sourceByUrl({ host: 'cache.modd.io', path: '/asset/spriteImage/New_Piskel(379).svg' }, root), original);
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('encoded local filenames and local skin assets keep their original artwork and animation frames', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-encoded-sprites-'));
	try {
		const sprite = 'assets/cache.modd.io/asset/spriteImage/Green%20Slime.svg';
		const skin = 'assets/s3-us-west-1.amazonaws.com/modd/man.svg';
		for (const relative of [sprite, skin]) {
			fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
			fs.writeFileSync(path.join(root, relative), '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>');
		}
		const context = { repoRoot: root, manifestIndex: new Map(), missingAssets: new Map(), resolvedAssets: new Map() };
		const game = { data: { unitTypes: { slime: { cellSheet: { url: '/' + sprite, rowCount: 2, columnCount: 3 }, skin: '/' + skin, animations: { walk: { frames: [1, 2, 3] } } } } } };
		const result = rewriteGameAssets(game, context, {});
		const unit = result.data.unitTypes.slime;
		assert.equal(unit.cellSheet.url, '/assets/cache.modd.io/asset/spriteImage/Green%2520Slime.svg');
		assert.equal(decodeURIComponent(unit.cellSheet.url.slice(1)), sprite);
		assert.equal(unit.skin, '/' + skin);
		assert.equal(unit.cellSheet.rowCount, 2);
		assert.deepEqual(unit.animations.walk.frames, [1, 2, 3]);
		assert.equal(context.missingUnits.size, 0);
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('previously sanitized sprite filenames still resolve', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'battlefight-sanitized-sprites-'));
	try {
		const directory = path.join(root, 'assets', 'cache.modd.io', 'asset', 'spriteImage');
		fs.mkdirSync(directory, { recursive: true });
		const sanitized = path.join(directory, 'New_Piskel_379_.svg');
		fs.writeFileSync(sanitized, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>');
		assert.equal(sourceByUrl({ host: 'cache.modd.io', path: '/asset/spriteImage/New_Piskel(379).svg' }, root), sanitized);
		assert.equal(sourceByUrl({ host: 'cache.modd.io', path: '/../../outside.svg' }, root), null);
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});
