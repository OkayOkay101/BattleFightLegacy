'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {CustomUnitStore,catalog,compileUnit}=require('../server/custom-units/CustomUnitStore');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
const input=()=>({name:'My weapon',pattern:'single',damage:10,speed:20,range:800,cooldown:500,pellets:5,spread:30,shots:3,interval:100});
function fixture(fn){const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'weapons-'));try{return fn(new CustomUnitStore(dir,game),dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('atomic weapon CRUD, reopen, copy, revisions and strict bounds',()=>fixture((store,dir)=>{
 assert.ok(store.weaponStore,'weapon store is provided by the unit store');const weapons=store.weaponStore;
 const saved=weapons.save(input());assert.match(saved.id,/^cw-[a-f0-9]{32}$/);assert.equal(saved.schemaVersion,1);
 assert.deepEqual(new CustomUnitStore(dir,game).weaponStore.get(saved.id),saved);
 const revised=weapons.save({...saved,damage:12});assert.equal(revised.revision,2);assert.throws(()=>weapons.save(saved),/Revision conflict/);
 const copy=weapons.save({...saved,id:undefined});assert.notEqual(copy.id,saved.id);
 for(const patch of [{damage:-1},{speed:0},{range:5001},{cooldown:99},{pellets:1.5},{shots:6},{interval:49},{pattern:'script'},{name:''},{pattern:'burst',shots:5,interval:500,cooldown:2000}])assert.throws(()=>weapons.save({...input(),...patch}),JSON.stringify(patch));
 weapons.remove(copy.id,1);assert.throws(()=>weapons.get(copy.id),/not found/);
 fs.writeFileSync(weapons.file(saved.id),'{bad');assert.equal(weapons.list().errors.length,1);assert.throws(()=>weapons.save(revised),/corrupt/);
}));
test('custom weapons are allowed in every slot of 44 prototypes and compiled without native damage scripts',()=>fixture(store=>{
 const before=JSON.stringify(game),saved=store.weaponStore.save(input());
 for(const entry of catalog(game,[saved])) {
  assert.ok(entry.weapons.every(slot=>slot.some(w=>w.id===saved.id)));
  const unit=store.save({baseId:entry.id,name:entry.name,health:321,speed:0,weapons:entry.defaults.weapons.map(()=>saved.id)});
  const compiled=compileUnit(game,unit,[saved]);assert.equal(compiled.unit.attributes.health.max,321);
  assert.equal(compiled.itemTypes[saved.id].customWeapon.damage,10);assert.deepEqual(compiled.itemTypes[saved.id].scripts,{});
  assert.deepEqual(compiled.projectileTypes[saved.id+'-projectile'].scripts,{});
 }
 assert.equal(JSON.stringify(game),before);
 assert.throws(()=>store.weaponStore.remove(saved.id,1),/referenced/);
 const id='cw-'+'a'.repeat(32),base=catalog(game)[0];assert.throws(()=>store.save({baseId:base.id,name:'Missing',health:100,speed:1,weapons:base.defaults.weapons.map(()=>id)}),/weapon/i);
}));
test('missing and corrupt weapon references make saved units unavailable and secondary forms keep native equipment',()=>fixture((store,dir)=>{
 const weapon=store.weaponStore.save(input()),base=catalog(game).find(x=>x.id==='TtQ4275KLf');
 const unit=store.save({baseId:base.id,name:'Form',health:17,speed:0,weapons:base.defaults.weapons.map(()=>weapon.id)});
 const compiled=compileUnit(game,unit,[weapon]);assert.deepEqual(compiled.unitTypes[compiled.formIds.qHn7EE5XjH].defaultItems,game.unitTypes.qHn7EE5XjH.defaultItems);
 fs.unlinkSync(store.weaponStore.file(weapon.id));assert.equal(store.list().units[0].available,false);
 fs.writeFileSync(store.weaponStore.file(weapon.id),JSON.stringify({...weapon,damage:-1}));assert.equal(store.list().units[0].available,false);assert.equal(store.weaponStore.list().errors.length,1);
}));
module.exports={input};
