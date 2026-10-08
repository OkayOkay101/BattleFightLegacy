'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { catalog, compileUnit } = require('../server/custom-units/CustomUnitStore');
const { buildTrainingRoster } = require('../server/training/TrainingRoster');
const game = JSON.parse(fs.readFileSync(path.join(__dirname,'../src/game.json'))).data;
const record = baseId => ({schemaVersion:1,id:'cu-'+'a'.repeat(32),revision:1,baseId,name:'Test custom',health:333,speed:5,weapons:game.unitTypes[baseId].defaultItems.map(x=>x.key)});

test('all 44 playable originals are independently catalogued and compilable', () => {
 const source=JSON.stringify(game), roster=buildTrainingRoster(game);
 const entries=catalog(game);
 assert.equal(entries.length,44);
 assert.ok(entries.every(x=>x.available));
 for(const id of ['H6K6gpqlPE','2GjTUKR9Bz','McZTj7oVZ1','BUcKqXTF16']) assert.ok(entries.some(x=>x.id===id));
 assert.ok(!entries.some(x=>x.id==='sarLaTkdF2'||x.id==='qHn7EE5XjH'));
 for(const entry of entries) {
  const compiled=compileUnit(game,record(entry.id));
  assert.equal(compiled.unit.attributes.health.max,333);
  assert.equal(compiled.unit.attributes.health.min,entry.id==='TtQ4275KLf'?1:0);
  assert.equal(compiled.unit.attributes.speed.value,5);
  entry.weapons.forEach((slot,n)=>assert.ok(slot.some(x=>x.id===entry.defaults.weapons[n])));
 }
 assert.equal(JSON.stringify(game),source);
 assert.deepEqual(buildTrainingRoster(game),roster);
});

test('SubLazer gets namespaced forms with custom caps, native form items and reversible mapping',()=>{
 const saved=record('TtQ4275KLf'), compiled=compileUnit(game,saved);
 const formId=compiled.formIds.qHn7EE5XjH;
 assert.notEqual(formId,'qHn7EE5XjH');
 const form=compiled.unitTypes[formId];
 assert.equal(form.attributes.health.max,333);assert.equal(form.attributes.health.min,0);
 assert.equal(form.attributes.speed.max,5);
 assert.equal(form.customUnit.id,saved.id);assert.equal(form.customUnit.baseId,'qHn7EE5XjH');
 assert.deepEqual(form.defaultItems,game.unitTypes.qHn7EE5XjH.defaultItems);
 assert.equal(compiled.formIds.TtQ4275KLf,saved.id);
 const change=compiled.unit.scripts['7ghxSVXMRn'].actions[0].then;
 assert.ok(!change.some(x=>x.type==='setEntityAttribute'&&x.attribute==='health'&&x.value===100),'transition must not reset HP');
});

test('dependent skill slots explain restrictions; four existing prototypes keep prior equipment choices',()=>{
 const entries=catalog(game);
 const sub=entries.find(x=>x.id==='TtQ4275KLf');
 assert.ok(sub.weaponRestrictions.some(Boolean));
 sub.weaponRestrictions.forEach((reason,n)=>{if(reason) assert.equal(sub.weapons[n].length,1);});
 for(const id of ['NNGRxjPsrz','8FyWfzucqo','Q2Vd00dRsL','JZaENvn4qJ']) {
  for(const slot of entries.find(x=>x.id===id).weapons) assert.ok(slot.some(x=>x.id==='YCEF0g5Q66')&&slot.some(x=>x.id==='HxgjN3vbXs'));
 }
});

test('editor restriction and mechanic hints have matching English and Thai strings',()=>{
 const messages=require('../src/localization/messages');
 for(const key of ['custom.nativeSlot','custom.hintResources','custom.hintForms','custom.hintSummons','custom.hintStationary','custom.hintTenkai']) {
  assert.ok(messages.en[key],key);assert.ok(messages.th[key],key);
 }
 const editor=fs.readFileSync(path.join(__dirname,'../src/custom-units/CustomUnitEditor.js'),'utf8');
 assert.match(editor,/weaponRestrictions/);assert.match(editor,/base\.hints/);
});

test('English and Thai support tables match the live 44-character catalog and slot restrictions',()=>{
 const expected=catalog(game).map(entry=>[entry.name,entry.weapons.map((slot,i)=>slot.length>1?i+1:null).filter(Boolean).join(', ')||'—']);
 for(const language of ['en','th']) {
  const text=fs.readFileSync(path.join(__dirname,`../docs/${language}/custom-units.md`),'utf8');
  const rows=text.split('\n').filter(line=>/^\| /.test(line)).slice(2).map(line=>line.split('|').slice(1,3).map(x=>x.trim()));
  assert.deepEqual(rows,expected);
 }
});
