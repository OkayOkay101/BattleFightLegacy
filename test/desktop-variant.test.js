'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { removeCharacters, VARIANTS } = require('../tools/prepare-desktop-package');
const { buildTrainingRoster } = require('../server/training/TrainingRoster');
const { ROSTER_IDS } = require('../server/training/NeuralObservation');

const freshGame = () => JSON.parse(JSON.stringify(require('../src/game.json')));

test('full variant removes nothing', () => {
	const game = freshGame();
	const before = JSON.stringify(game);
	const result = removeCharacters(game, VARIANTS.full);
	assert.deepEqual(result.removedEntities, {});
	assert.equal(JSON.stringify(game), before);
});

test('github variant removes Reimu & Marisa without breaking other characters', () => {
	const game = freshGame();
	const data = game.data;
	const result = removeCharacters(game, VARIANTS.github);
	assert.equal(result.removedMenuOptions, 1);
	assert.equal(data.unitTypes.SIIVFpgz7Y, undefined);
	assert.equal(data.scripts.YSjll70YvX, undefined);
	assert.ok(!JSON.stringify(data.dialogues.WGLrmBwn2T).includes('Reimu'), 'menu option removed');
	assert.ok(!/Reimu Ult|Marisa Ult/.test(data.dialogues.u7aAZAycQc.message), 'music credits removed');
	// Shared content stays: Hidden Hand's Reflection and the effect Flaulist reuses.
	assert.ok(data.projectileTypes.XaQh8cYalD, 'Hidden Hand Reflection kept');
	assert.ok(data.projectileTypes.fVwcDFKz3W, 'shared effect kept');

	const ids = new Set(Object.entries(data).flatMap(([group, items]) =>
		['unitTypes', 'itemTypes', 'projectileTypes', 'scripts', 'animationTypes'].includes(group) ? Object.keys(items) : []));
	const sourceIds = new Set(Object.entries(freshGame().data).flatMap(([group, items]) =>
		['unitTypes', 'itemTypes', 'projectileTypes', 'scripts', 'animationTypes'].includes(group) ? Object.keys(items) : []));
	const removedIds = [...sourceIds].filter(id => !ids.has(id));
	const text = JSON.stringify({ ...data, projectileTypes: { ...data.projectileTypes, XaQh8cYalD: undefined } });
	for (const id of removedIds) assert.ok(!text.includes('"' + id + '"'), 'dangling reference to removed ' + id);

	const roster = buildTrainingRoster(data).eligible.map(entry => entry.id);
	assert.ok(!roster.includes('SIIVFpgz7Y'), 'bots never pick the removed character');
	assert.equal(roster.length, ROSTER_IDS.length - 1);
	assert.deepEqual(roster, ROSTER_IDS.filter(id => id !== 'SIIVFpgz7Y'), 'remaining roster order is unchanged');
});
