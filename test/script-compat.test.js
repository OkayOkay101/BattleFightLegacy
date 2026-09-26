const test = require('node:test');
const assert = require('node:assert/strict');

// Load the real components without booting the network/physics engine.
global.IgeEntity = { extend(definition) {
	function Component() { if (this.init) this.init(); }
	Component.prototype = Object.assign({ log() {} }, definition);
	return Component;
} };
const Script = require('../src/gameClasses/components/script/ScriptComponent');
const Variable = require('../src/gameClasses/components/script/VariableComponent');
const Action = require('../src/gameClasses/components/script/ActionComponent');

function fixture() {
	global.ige = { isServer: true, isClient: false, devLog() {}, game: { data: { scripts: {}, variables: {} } },
		condition: { run: conditions => !conditions || conditions[0] !== false }, $: id => ({ id }) };
	ige.script = new Script();
	ige.variable = new Variable();
	ige.action = new Action();
	return ige;
}

test('entity script IDs stay scoped, global calls keep thisEntity and restore caller context', () => {
	fixture();
	const a = { _stats: { scripts: { same: { actions: ['a'] } } } };
	const b = { _stats: { scripts: { same: { actions: ['b'] } } } };
	ige.game.data.scripts.same = { actions: ['global'] };
	assert.deepEqual(ige.script.getScriptActions('same', false, a), ['a']);
	assert.deepEqual(ige.script.getScriptActions('same', false, b), ['b']);
	assert.deepEqual(ige.script.getScriptActions('same'), ['global']);
	assert.equal(ige.script.getScriptActions('missing', false, a), undefined);
	ige.script.currentScriptId = 'caller';
	ige.script.currentScriptEntity = a;
	ige.action.run = (actions, vars) => {
		assert.equal(vars.thisEntity, a);
		assert.equal(ige.script.currentScriptEntity, undefined);
	};
	ige.script.runScript('same', { thisEntity: a });
	assert.equal(ige.script.currentScriptId, 'caller');
	assert.equal(ige.script.currentScriptEntity, a);
});

test('entity event dispatch respects trigger, disabled flag, conditions and live entity', () => {
	fixture();
	const actions = [];
	const entity = { _category: 'item', id: () => 'item1', _stats: { scripts: {
		use: { triggers: [{ type: 'itemIsUsed' }], actions: ['use'] },
		helper: { triggers: [], actions: ['helper'] },
		disabled: { disabled: true, triggers: [{ type: 'itemIsUsed' }], actions: ['disabled'] },
		conditional: { conditions: [false], triggers: [{ type: 'itemIsUsed' }], actions: ['conditional'] }
	} } };
	ige.action.run = (list, vars) => { actions.push(...list); assert.equal(vars.thisEntity, entity); };
	assert.equal(ige.script.triggerEntity(entity, 'itemIsUsed', { unitId: 'owner' }), 1);
	assert.deepEqual(actions, ['use']);
	entity._alive = false;
	assert.equal(ige.script.triggerEntity(entity, 'itemIsUsed'), 0);
});

test('position-in-front uses up-zero radians in all four directions and accepts expressions', () => {
	fixture();
	const expected = [[10, 10], [20, 20], [10, 30], [0, 20]];
	for (let i = 0; i < 4; i++) {
		const result = ige.variable.getValue({ function: 'getPositionInFrontOfPosition', position: { x: 10, y: 20 },
			distance: 10, angle: { function: 'calculate', items: [{ operator: '+' }, i * Math.PI / 2, 0] } });
		assert.ok(Math.abs(result.x - expected[i][0]) < 1e-9);
		assert.ok(Math.abs(result.y - expected[i][1]) < 1e-9);
	}
	assert.equal(ige.variable.getValue(null), null);
	assert.equal(ige.variable.getValue({ function: 'stringIsANumber', string: '  ' }), false);
	assert.equal(ige.variable.getValue({ function: 'stringIsANumber', string: '-2.5' }), true);
});

test('timeouts evaluate duration and snapshot loop selection while retaining entity references', async () => {
	fixture();
	const originalSetTimeout = global.setTimeout;
	let callback, delay, payload;
	global.setTimeout = (fn, ms, arg) => { callback = fn; delay = ms; payload = arg; };
	const selected = { id: 'first' };
	const vars = { selectedUnit: selected, triggeredBy: { unitId: 'first' } };
	try {
		ige.action.run([{ type: 'setTimeOut', duration: { function: 'calculate', items: [{ operator: '+' }, 100, 150] }, actions: [] }], vars);
	} finally { global.setTimeout = originalSetTimeout; }
	assert.equal(delay, 250);
	vars.selectedUnit = { id: 'second' };
	vars.triggeredBy.unitId = 'second';
	ige.action.run = (_, delayedVars) => {
		assert.equal(delayedVars.selectedUnit, selected);
		assert.equal(delayedVars.triggeredBy.unitId, 'first');
	};
	callback(payload);
});

test('per-player death UI never broadcasts when its owner is a bot without clientId', () => {
	fixture();
	const sent = [];
	ige.gameText = { updateText: (...args) => sent.push(args) };
	ige.script.recordLast50Action = () => {};
	const bot = { _category: 'player', _stats: { controlledBy: 'computer', isBattleBot: true } };
	const human = { _category: 'player', _stats: { controlledBy: 'human', clientId: 'human-1' } };
	ige.variable.getValue = value => value && value.owner || value;
	ige.action.run([{ type: 'showUiTextForPlayer', entity: { owner: bot }, target: 'center-lg', value: 'Respawn' }]);
	ige.action.run([{ type: 'updateUiTextForPlayer', entity: { owner: bot }, target: 'center-lg', value: 'Respawn' }]);
	assert.equal(sent.length, 0, 'bot death must not show human a respawn prompt');
	ige.action.run([{ type: 'showUiTextForPlayer', entity: { owner: human }, target: 'center-lg', value: 'Respawn' }]);
	assert.equal(sent.length, 1);
	assert.equal(sent[0][1], 'human-1');
});
