'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { playableIds, adapter, visit, GENERIC_WEAPONS } = require('./CustomUnitAdapters');
const ID = /^cu-[a-f0-9]{32}$/;
const clone = value => JSON.parse(JSON.stringify(value));
function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }

function catalog(game) {
 return playableIds(game).map(id => {
  const unit = game.unitTypes[id], support=adapter(game,id), profile=support.profile;
  const available = unit.attributes?.health && unit.attributes?.speed && unit.cellSheet?.url;
  const defaults = { health: unit.attributes.health.max, speed: unit.attributes.speed?.value || 0,
   weapons: unit.defaultItems.map(item => item.key) };
  return { id: profile.id, name: unit.name, available: !!available,
   reason: available ? null : 'custom.adapterRequired', image: unit.cellSheet?.url || '', defaults,
   weapons: defaults.weapons.map((original,index) => [...new Set([original, ...(support.genericSlots.includes(index)?GENERIC_WEAPONS:[])])]
    .filter(id => game.itemTypes[id]).map(id => ({ id, name: game.itemTypes[id].name }))),
   weaponRestrictions:defaults.weapons.map((_,index)=>support.genericSlots.includes(index)?null:'custom.nativeSlot'),
   hints:support.hints, profile };
 });
}

function validate(game, value) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid unit data');
 const base = catalog(game).find(entry => entry.id === value.baseId);
 if (!base?.available) fail('Prototype requires a compatibility adapter');
 if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80) fail('Name must contain 1–80 characters');
 if (!Number.isFinite(value.health) || value.health < 1 || value.health > 100000) fail('Health must be between 1 and 100000');
 if (!Number.isFinite(value.speed) || value.speed < 0 || value.speed > 100) fail('Speed must be between 0 and 100');
 if (!Array.isArray(value.weapons) || value.weapons.length !== base.weapons.length ||
  value.weapons.some((id, index) => !base.weapons[index].some(weapon => weapon.id === id))) fail('Incompatible weapon selection');
 return { baseId: value.baseId, name: value.name.trim(), health: value.health, speed: value.speed, weapons: value.weapons.slice() };
}

function compileUnit(game, saved) {
 const data = validate(game, saved);
 if (!ID.test(saved.id)) fail('Invalid custom unit ID');
 const support=adapter(game,data.baseId), formIds=Object.fromEntries(support.forms.map(id=>[id,id===data.baseId?saved.id:`${saved.id}-form-${id}`]));
 const unitTypes={};
 for(const baseId of support.forms) {
  const unit=clone(game.unitTypes[baseId]);
  unit.name=data.name;
  unit.attributes.health.value=unit.attributes.health.max=data.health;
  // SubLazer's first form must reach 1 HP before its secondTick transition.
  // Its compiled secondary form has a zero floor and can die normally.
  unit.attributes.health.min=baseId==='TtQ4275KLf'?1:0;
  unit.attributes.speed.value=unit.attributes.speed.max=data.speed;
  unit.attributes.speed.min=0;
  if(baseId===data.baseId) unit.defaultItems=data.weapons.map(id=>({key:id,name:game.itemTypes[id].name,value:game.itemTypes[id].name}));
  if(baseId==='TtQ4275KLf' && unit.scripts?.['7ghxSVXMRn']) {
   const transition=unit.scripts['7ghxSVXMRn'].actions[0].then;
   unit.scripts['7ghxSVXMRn'].actions[0].then=transition.filter(x=>!(x.type==='setEntityAttribute'&&x.attribute==='health'&&x.value===100));
  }
  visit(unit,node=>{
   // Descriptor metadata identifies the compiled form. Comparisons keep the
   // native script identity returned by getUnitTypeOfUnit.
   if(node.dataType && typeof node.entity==='string' && formIds[node.entity]) node.entity=formIds[node.entity];
   if(node.type==='changeUnitType'&&typeof node.unitType==='string'&&formIds[node.unitType]) node.unitType=formIds[node.unitType];
  });
  unit.customUnit={id:saved.id,baseId,rootBaseId:data.baseId,revision:saved.revision};
  unitTypes[formIds[baseId]]=unit;
 }
 const profile={...support.profile,id:saved.id,name:data.name};
 const itemTypes={};
 // Carry/use restrictions use actual IDs, unlike script comparisons. Extend
 // arena copies of the item definitions for the corresponding compiled form.
 for(const [itemId,item] of Object.entries(game.itemTypes)) for(const field of ['carriedBy','canBeUsedBy']) {
  if(!Array.isArray(item[field])||!item[field].length) continue;
  const additions=Object.entries(formIds).filter(([native])=>item[field].includes(native)).map(([,id])=>id);
  if(additions.length) { itemTypes[itemId] ||= clone(item);itemTypes[itemId][field]=[...new Set([...item[field],...additions])]; }
 }
 return {id:saved.id,unit:unitTypes[saved.id],unitTypes,itemTypes,formIds,adapter:support,profile};
}

class CustomUnitStore {
 constructor(directory, game) { this.directory = path.resolve(directory); this.game = game; }
 file(id) { if (!ID.test(id)) fail('Invalid custom unit ID'); return path.join(this.directory, `${id}.json`); }
 get(id) {
  const file = this.file(id);
  if (!fs.existsSync(file)) fail('Custom unit not found', 404);
  let value;
  try {
   if (fs.statSync(file).size > 16384) throw new Error('oversized');
   value = JSON.parse(fs.readFileSync(file, 'utf8'));
   if (value.schemaVersion !== 1 || value.id !== id || !Number.isInteger(value.revision) || value.revision < 1) throw new Error('invalid envelope');
  } catch (error) { fail(`Saved custom unit is corrupt: ${id}`, 422); }
  return value;
 }
 list() {
  const units = [], errors = [];
  if (!fs.existsSync(this.directory)) return { units, errors };
  for (const name of fs.readdirSync(this.directory).sort()) {
   if (!ID.test(name.slice(0, -5)) || !name.endsWith('.json')) continue;
   try {
    const value = this.get(name.slice(0, -5));
    let reason = null;
    try { validate(this.game, value); } catch (error) { reason = error.message; }
    units.push({ ...value, available: !reason, reason });
   } catch (error) { errors.push({ file: name, error: error.message }); }
  }
  return { units, errors };
 }
 save(value) {
  const data = validate(this.game, value);
  const old = value.id ? this.get(value.id) : null;
  if (old && old.baseId !== data.baseId) fail('Prototype cannot change on an existing unit; create a new variant');
  if (old && value.revision !== old.revision) fail('Revision conflict: reload this unit before saving', 409);
  const result = { schemaVersion: 1, id: old?.id || `cu-${crypto.randomBytes(16).toString('hex')}`,
   revision: (old?.revision || 0) + 1, ...data, updatedAt: new Date().toISOString() };
  fs.mkdirSync(this.directory, { recursive: true });
  const target = this.file(result.id), temp = `${target}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
   fs.writeFileSync(temp, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
   fs.renameSync(temp, target);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return result;
 }
 remove(id, revision) {
  const value = this.get(id);
  if (value.revision !== revision) fail('Revision conflict: reload this unit before deleting', 409);
  fs.unlinkSync(this.file(id));
 }
}
module.exports = { CustomUnitStore, catalog, compileUnit, validate };
