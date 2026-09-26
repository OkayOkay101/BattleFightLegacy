const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../src/game.json').data;
const { buildTrainingRoster } = require('../server/training/TrainingRoster');

test('training roster contains main characters plus four requested unfinished units', () => {
	const { eligible, excluded } = buildTrainingRoster(game);
	assert.equal(eligible.length, 40);
	assert.ok(eligible.some(entry => entry.id === 'r3dZTAf1qa'));
	for (const id of ['xHn8XJz8XB', 'h6HHaafNct', 'JZaENvn4qJ']) {
		assert.equal(eligible.some(entry => entry.id === id), true, `${id} should train`);
	}
	for (const id of ['sarLaTkdF2', 'Z5gkgxy2M9', 'I7weYETFLl', 'McZTj7oVZ1', 'BUcKqXTF16', 'H6K6gpqlPE', '2GjTUKR9Bz']) {
		assert.equal(eligible.some(entry => entry.id === id), false, `${id} should not train`);
		assert.equal(excluded.some(entry => entry.id === id), true, `${id} should be reported`);
	}
	for (const id of ['McZTj7oVZ1', 'BUcKqXTF16', 'H6K6gpqlPE', '2GjTUKR9Bz']) {
		assert.equal(excluded.find(entry => entry.id === id).reason, 'removed from training by request');
	}
	assert.equal(eligible.some(entry => entry.id === '8f2X69k2rK'), false, 'Commander sentry is not a player choice');
	assert.ok(eligible.every(entry => entry.name && Number.isFinite(entry.range) && entry.slots.length > 0));
	for (const name of ['Fleeting Dream', 'Team Spirit Breaker', 'Collective Company']) {
		assert.ok(excluded.some(entry => entry.name.includes(name) && entry.reason === 'no selection script'), name);
	}
});
