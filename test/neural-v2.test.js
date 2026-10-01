const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildObservation, ROSTER_IDS, isAllowedTrainingDecision } = require('../server/training/NeuralObservation');
const { enumerateLegalActions } = require('../server/training/NeuralActions');
const { loadWeights, scoreActions } = require('../server/training/NeuralInference');
const { chooseNeuralAction } = require('../server/training/NeuralController');
const layer = (rows, cols) => ({ rows, cols, weights: Array(rows * cols).fill(0), bias: Array(rows).fill(0) });

test('V2 observations append bounded state and deterministic visibility and presence masks', () => {
 const observation = buildObservation({ self: { characterId: ROSTER_IDS[0] },
  enemies: [{ id: 'b', distance: 10, features: [2], visible: false }, { id: 'a', distance: 10, features: [1], visible: true }],
  allies: [{ id: 'a' }], projectiles: [{ id: 'p' }], weaponState: [{ present: 1, cooldown: 2, ammoRatio: Infinity, unlimited: 1, affordability: .5, range: .2, speed: .3, damage: .4 }],
  activeSlot: 2, terrain: [2, -.5, NaN], navigation: { dx: -2, dy: 2, stuck: 1 }, match: { remaining: .5, ownScore: 2 } }, 2);
 assert.equal(observation.length, 149);
 assert.deepEqual([...observation.slice(86, 91)], [1, 1, 0, 1, .5]);
 assert.deepEqual([...observation.slice(118, 125)], [0, 0, 1, 0, 1, 0, 0]);
 assert.deepEqual([...observation.slice(130, 142)], [1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0]);
 assert.deepEqual([...observation.slice(142)], [-1, 1, 1, 0, .5, 1, 0]);
 assert.equal(observation[11], 1);
 assert.ok([...observation].every(Number.isFinite));
});

test('V2 keeps every movement while continuously firing any legal ready weapon', () => {
 const options = enumerateLegalActions({ targets: ['b','a','c'].map(id => ({ id, distance: 100, visible: true })),
  weapons: [0,1,2,3].map(slot => ({ slot, ready: true, range: 500 })), projectiles: [{ threat: true }] }, 2);
 assert.equal(options.length, 32);
 assert.deepEqual(options.slice(0,7).map(o => o.action.movement), ['hold','approach','strafe_left','strafe_right','retreat','kite','dodge']);
 assert.ok(options.every(o => o.action.fire === true && Number.isInteger(o.action.slot) && o.features[17] === 1));
 assert.equal(new Set(options.map(o => JSON.stringify(o.action))).size,options.length);
 assert.equal(new Set(options.filter(o => o.action.fire).map(o => `${o.action.targetId}:${o.action.slot}:${o.action.aimMode}`)).size, 24);
 assert.deepEqual(new Set(options.filter(o => o.action.fire).map(o => o.action.movement)), new Set(['hold','approach','strafe_left','strafe_right','retreat','kite','dodge']));
 assert.ok(options.every(o => o.features.length === 18));
 const hold = enumerateLegalActions({ targets: [], weapons: [] }, 2);
 assert.equal(hold.length, 1);
 assert.equal(hold[0].action.fire, false);
});

test('V2 no-fire remains available only when shots are unavailable and never selects a cooling or blocked weapon', () => {
 const target={id:'enemy',distance:100,visible:true};
 for(const snapshot of [
  {targets:[target],weapons:[{slot:0,ready:false,range:500}]},
  {targets:[{...target,visible:false}],weapons:[{slot:0,ready:true,range:500}]},
  {targets:[{...target,distance:600}],weapons:[{slot:0,ready:true,range:500}]}
 ]) assert.ok(enumerateLegalActions(snapshot,2).every(o=>!o.action.fire&&o.action.slot===null));
 const options=enumerateLegalActions({targets:[target],activeSlot:2,
  weapons:[{slot:0,ready:false,range:500},{slot:1,ready:true,range:500},{slot:2,ready:true,range:500}]},2);
 assert.ok(options.every(o=>o.action.fire&&o.action.slot!==0));
 assert.ok(options.slice(0,6).every(o=>o.action.slot===2));
});

test('V2 inference validates metadata and controller emits canonical requested decisions', () => {
 const { getSchema } = require('../server/training/NeuralSchema');
 const schema = getSchema(2);
 const payload = JSON.stringify({ schemaVersion: 2, observationSchemaVersion: 2, actionSchemaVersion: 2,
  schemaHash: schema.schemaHash, environmentHash: 'env', trainingProtocolVersion: 2,
  rosterHash: require('../server/training/NeuralObservation').rosterHash,
  actor: [layer(64,167),layer(64,64),layer(1,64)], critic: [layer(64,149),layer(1,64)] });
 const weights = loadWeights({ payload, checksum: crypto.createHash('sha256').update(payload).digest('hex') });
 assert.equal(scoreActions(weights, new Float32Array(149), [{ legal:true,features:new Float32Array(18) }]).value, 0);
 assert.throws(() => scoreActions(weights, Float32Array.from(Array(149).fill(NaN)), [{legal:true,features:new Float32Array(18)}]), /finite/i);
 const decision = chooseNeuralAction({ weights, policyVersion:'n-10',playerId:'p', simulatedAt:100,snapshot:{self:{characterId:ROSTER_IDS[0]}},training:false });
 assert.equal(decision.record.schemaHash, schema.schemaHash);
 assert.equal(decision.record.environmentHash, 'env');
 assert.equal(decision.record.observation.length,149);
 assert.equal(decision.record.observation86,undefined);
 assert.equal(decision.record.options17,undefined);
 assert.deepEqual(decision.record.requestedAction, decision.action);
 assert.equal(isAllowedTrainingDecision(decision.record), true);
 assert.equal(isAllowedTrainingDecision({ ...decision.record, schemaHash:'bad' }), false);
 assert.equal(isAllowedTrainingDecision({ ...decision.record, environmentHash:undefined }), false);
 assert.throws(() => loadWeights({ payload: payload.replace(schema.schemaHash,'bad'), checksum:crypto.createHash('sha256').update(payload.replace(schema.schemaHash,'bad')).digest('hex') }), /schema/i);
});
