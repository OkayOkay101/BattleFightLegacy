const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const json = fs.readFileSync(path.resolve(__dirname, '../src/game.json'), 'utf8');
const gzip = zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname, '../src/game.json.gz'))).toString('utf8');

function activeCreationPaths(actions, conditions = [], paths = []) {
	for (const action of actions || []) {
		if (!action || action.disabled) continue;
		if (action.type === 'createUnitAtPosition' && action.unitType === 'Wvr1JjdNM6') paths.push(conditions);
		if (action.type === 'condition') {
			activeCreationPaths(action.then, [...conditions, action.conditions], paths);
			activeCreationPaths(action.else, conditions, paths);
		}
	}
	return paths;
}

function excludesType(path, typeId) {
	return path.some(conditions => conditions?.[0]?.operator === '!=' &&
		conditions[1]?.function === 'getUnitTypeOfUnit' &&
		conditions[1]?.entity?.function === 'getTriggeringUnit' && conditions[2] === typeId);
}

test('active Hidden Hand Reflection paths cannot clone Hidden Hand or its reflection units', () => {
	for (const [source, raw] of [['game.json', json], ['game.json.gz', gzip]]) {
		const script = JSON.parse(raw).data.projectileTypes.XaQh8cYalD.scripts.cV1EoYr7dj;
		const paths = activeCreationPaths(script.actions);
		assert.ok(paths.length > 0, `${source}: the reflection effect must remain reachable for normal targets`);
		for (const conditionPath of paths) {
			assert.ok(excludesType(conditionPath, '4d8Ed56NBs'), `${source}: must exclude Hidden Hand`);
			assert.ok(excludesType(conditionPath, 'Wvr1JjdNM6'), `${source}: must exclude Hidden Hand Reflect`);
		}
	}
});
