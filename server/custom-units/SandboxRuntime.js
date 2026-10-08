'use strict';
const fs = require('fs');
const { compileUnit, catalog } = require('./CustomUnitStore');
const { installDemo } = require('../training/DemoRuntime');

function loadSnapshot(game, file) {
 const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
 const compiled = compileUnit(game, snapshot.unit);
 Object.assign(game.unitTypes,compiled.unitTypes);
 Object.assign(game.itemTypes,compiled.itemTypes);
 snapshot.compiled = compiled;
 // The test arena has a continuous match, without the lobby's scheduled
 // mode changes or its character-selection/respawn scripts.
 for (const script of Object.values(game.scripts || {})) {
  if (script.triggers) script.triggers = script.triggers.filter(trigger => trigger.type !== 'gameStart');
 }
 if (game.scripts.hRwdzzEwgW) game.scripts.hRwdzzEwgW.triggers = [];
 if (game.variables['Current Game State']) game.variables['Current Game State'].default = 'Ongoing';
 if (game.variables['Gamemode Random']) game.variables['Gamemode Random'].default = 1;
 // Sandbox always uses local assets and never loads audio.
 const visited = new WeakSet();
 function mute(node) {
  if (!node || typeof node !== 'object' || visited.has(node)) return;
  visited.add(node);
  for (const key of Object.keys(node)) {
   if (key === 'sound') node[key] = {};
   else if (key === 'type' && typeof node[key] === 'string' && /Sound/.test(node[key])) node.disabled = true;
   else mute(node[key]);
  }
 }
 mute(game);
 return snapshot;
}

function installSandbox(ige, snapshot) {
 const runtime = installDemo(ige, { kind: 'heuristic', version: 'baseline' }, { selections: { blue: 'baseline', red: 'baseline' } });
 runtime.isCustomSandbox = true;
 runtime.snapshot = snapshot;
 require('./SandboxAdapters').installAdapters(ige,runtime,snapshot);
 const scheduled = new Set();
 runtime.scheduleSandboxAction = (callback, delay) => {
  const timer = setTimeout(() => { scheduled.delete(timer); callback(); }, delay);
  scheduled.add(timer); return timer;
 };
 const roster = catalog(ige.game.data).map(entry=>entry.profile);
 const opponent = roster.find(entry => entry.id === snapshot.opponent);
 if (!opponent) throw new Error('Sandbox opponent unavailable');
 const pickSpawn = ige.game._pickBattleBotSpawn.bind(ige.game);
 ige.game._pickBattleBotSpawn = (leftSide, previousPosition, radius) => {
  const definition = ige.game.data.unitTypes[leftSide ? snapshot.compiled.id : opponent.id];
  const bodyRadius = Math.max(20, ...Object.values(definition.bodies || {}).map(body => Math.hypot(Number(body.width) || 0, Number(body.height) || 0) / 2 + 2));
  return pickSpawn(leftSide, previousPosition, Math.max(radius || 0, bodyRadius));
 };
 const participants = new Set();
 // Fixed selection belongs to the isolated runtime, so the production bot
 // spawner and frozen training source hash remain unchanged.
 ige.game._spawnBattleBotUnit = function(player, position, rotation) {
  const id = player._battleBot.fixedCharacter;
  const definition = ige.game.getAsset('unitTypes', id);
  if (!definition) throw new Error('Sandbox unit unavailable');
  const data = JSON.parse(JSON.stringify(definition));
  data.type = id;
  data.defaultData = { ...data.defaultData, translate: position, rotate: rotation };
  player._battleBot.previousCharacter = id;
  const unit = player.createUnit(data);
  runtime.attachCustomUnit(unit);
  player.selectUnit(unit.id());
  runtime.stats.startLife({ playerId: player.id(), lifeId: unit.id(), characterId: id });
  if (player._stats.controlledBy !== 'human') unit.addBehaviour('battleBotBrain', () => this._thinkBattleBot(player, unit));
  return unit;
 };
 const spawn = (player, team) => {
  const leftSide = team === 'blue';
  player._battleBot = { leftSide, fixedCharacter: leftSide ? snapshot.compiled.id : opponent.id,
   previousCharacter: null, respawnTimer: null, thinkingAt: 0, lastPosition: null, stuckAt: 0 };
  player._stats.trainingTeamId = team;
  player._stats.playerJoined = true;
  const type = ige.game.getAsset('playerTypes', leftSide ? 'NZRmXbrEjA' : 'A6C0imglP3');
  if (type?.attributes) player.updatePlayerType({ attributes: JSON.parse(JSON.stringify(type.attributes)), variables: type.variables || {} });
  runtime.stats.registerPlayer({ playerId: player.id(), teamId: team, characterId: player._battleBot.fixedCharacter });
  const position = ige.game._pickBattleBotSpawn(leftSide, null, 20);
  if (!position) throw new Error('No clear sandbox spawn');
  ige.game._spawnBattleBotUnit(player, position, leftSide ? 0 : Math.PI);
  participants.add(player);
 };
 runtime.spawnBots = game => {
  game.battleBotRoster = [snapshot.compiled.profile, ...Object.entries(snapshot.compiled.formIds)
   .filter(([,id])=>id!==snapshot.unit.id).map(([baseId,id])=>({...snapshot.compiled.profile,id})), opponent];
  for (const team of ['blue', 'red']) {
   if (team === 'blue' && snapshot.controller === 'human') continue;
   const player = game.createPlayer({ name: team === 'blue' ? snapshot.unit.name : opponent.name,
    controlledBy: 'computer', playerTypeId: team === 'blue' ? 'NZRmXbrEjA' : 'A6C0imglP3',
    isBattleBot: true, playerJoined: true, trainingTeamId: team, unitIds: [] });
   spawn(player, team);
  }
 };
 runtime.joinHuman = player => {
  // Only one interactive participant; further clients are spectators.
  const occupied = [...participants].some(p => p !== player && p._stats.controlledBy === 'human' && ige.$(p.id()));
  player._stats.isSpectator = snapshot.controller !== 'human' || occupied;
  if (!player._stats.isSpectator && !player._battleBot) spawn(player, 'blue');
 };
 const status = runtime.status.bind(runtime);
 runtime.status = () => ({ ...status(), sandbox: { customId: snapshot.unit.id, revision: snapshot.unit.revision,
  controller: snapshot.controller, opponent: snapshot.opponent } });
 // Count human kills exactly like heuristic kills in this isolated runtime.
 const originalDeath = ige.game.handleBattleBotDeath;
 const recordDeath = runtime.recordBotDeath.bind(runtime);
 let deathSource = null;
 runtime.recordBotDeath = event => recordDeath(deathSource ? { ...event, ...deathSource } : event);
 ige.game.handleBattleBotDeath = function(unit, context) {
  const attacker = context?.attackingPlayer;
  const killer = ige.$(context?.attackingUnitId)?.getOwner() || (attacker?.id ? ige.$(attacker.id) : null);
  deathSource = { killerId: killer?.id() || attacker?.id || null,
   killerCharacterId: killer?._battleBot?.fixedCharacter || attacker?.characterId || null,
   killerTeamId: killer?._stats.trainingTeamId || attacker?.teamId || null };
  try { return originalDeath.call(this, unit, context); } finally { deathSource = null; }
 };
 runtime.resetSandbox = () => {
  for (const timer of scheduled) clearTimeout(timer);
  scheduled.clear();
  for (const player of participants) {
   if (player._battleBot?.respawnTimer) clearTimeout(player._battleBot.respawnTimer);
   player._battleBot = null;
  }
  for (const entity of [...ige.$$('projectile'), ...ige.$$('unit'), ...ige.$$('item')]) {
   if (entity._category === 'unit') entity.getOwner()?.disownUnit(entity);
   entity.destroy();
  }
  runtime.resetExhibition();
  for (const player of [...participants]) {
   if (!ige.$(player.id())) { participants.delete(player); continue; }
   spawn(player, player._stats.trainingTeamId);
  }
  if (ige.game.killFeed) ige.game.killFeed = new (require('../KillFeed').KillFeed)();
  return runtime.status();
 };
 return runtime;
}
module.exports = { loadSnapshot, installSandbox };
