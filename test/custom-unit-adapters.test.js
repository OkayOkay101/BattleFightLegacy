'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SandboxManager } = require('../server/custom-units/SandboxManager');
const { CustomUnitStore } = require('../server/custom-units/CustomUnitStore');
const root = path.resolve(__dirname, '..');
const game = JSON.parse(fs.readFileSync(path.join(root, 'src/game.json'))).data;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const baseId of ['NNGRxjPsrz','8FyWfzucqo','Q2Vd00dRsL','JZaENvn4qJ']) test(`live adapter: ${game.unitTypes[baseId].name}, original skills and generic equipment`, {timeout:60000}, async t => {
 const tmpRoot = path.join(root,'build/custom-unit-tests'); fs.mkdirSync(tmpRoot,{recursive:true});
 const dir = fs.mkdtempSync(path.join(tmpRoot,'adapter-'));
 const store = new CustomUnitStore(dir,game);
 const saved = store.save({baseId,name:'Adapter '+game.unitTypes[baseId].name,health:500,speed:baseId==='8FyWfzucqo'?0:5,
  weapons:game.unitTypes[baseId].defaultItems.map(x=>x.key)});
 const manager = new SandboxManager({root,directory:dir,game,store,testMode:true});
 const inspect = extra => new Promise((resolve,reject)=>{
  const child=manager.active.child;
  const timer=setTimeout(()=>{child.removeListener('message',listener);reject(new Error('Inspection timed out'));},5000);
  const listener=message=>{if(message.type==='sandbox-inspection'){clearTimeout(timer);child.removeListener('message',listener);resolve(message);}};
  child.on('message',listener);child.send({type:'inspect-sandbox',...extra});
 });
 try {
  let session=await manager.start({id:saved.id,controller:'human',opponent:'NNGRxjPsrz'});
  const before=await inspect({join:true,freeze:true});
  const actor=before.units.find(x=>x.type===saved.id);
  assert.ok(actor); assert.equal(actor.speed,saved.speed);
  await delay(1200);
  const idle=await inspect({freeze:true});
  assert.equal(idle.units.find(x=>x.type===saved.id).speed,saved.speed);
  if(baseId==='8FyWfzucqo') assert.ok(Math.hypot(idle.units.find(x=>x.type===saved.id).position.x-actor.position.x,idle.units.find(x=>x.type===saved.id).position.y-actor.position.y)<1);
  for(let slot=1;slot<=saved.weapons.length;slot++) {
   const used=await inspect({freeze:true,exercise:slot});
   const current=used.units.find(x=>x.type===saved.id);
   assert.ok(current.items.find(x=>x.type===saved.weapons[slot-1]).lastUsed>0,JSON.stringify(used));
  }
  await delay(1800);
  const after=await inspect({freeze:true});
  // The original Blizzard skill grants a temporary speed buff; preserve it.
  if(baseId!=='8FyWfzucqo') assert.equal(after.units.find(x=>x.type===saved.id).speed,saved.speed);
  if(baseId==='JZaENvn4qJ') {
   assert.ok(after.units.some(x=>x.type==='teq7uP8dBk'),JSON.stringify(after));
   assert.ok(after.units.filter(x=>x.type==='teq7uP8dBk').every(x=>x.target!==actor.id),'Casker summon must exclude the custom owner');
  }
  const hit=await inspect({damage:20});
  assert.ok(hit.stats.teams.blue.damageDealt>=20,JSON.stringify(hit));
  const killed=await inspect({damage:10000});
  assert.equal(killed.stats.teams.blue.kills,1); assert.equal(killed.stats.teams.red.deaths,1);
  await inspect({kill:saved.id}); await delay(3500);
  const respawn=await inspect({freeze:true});
  assert.ok(respawn.units.some(x=>x.type===saved.id&&x.id!==actor.id&&x.health>0&&x.healthMax===500),JSON.stringify(respawn));
  assert.equal(respawn.stats.teams.blue.deaths,1);
  await inspect({exercise:4});
  const reset=await fetch(session.url+'/api/custom-sandbox/control',{method:'POST',headers:{'Content-Type':'application/json','X-Custom-Unit-Token':session.token},body:JSON.stringify({action:'reset'})});
  assert.equal(reset.status,200);
  const resetClock=await inspect({freeze:true}); await delay(1800);
  const fresh=await inspect({freeze:true});
  assert.equal(fresh.units.length,2,JSON.stringify(fresh));
  assert.equal(fresh.stats.teams.blue.deaths,0);
  assert.ok(fresh.timerTick>resetClock.timerTick,JSON.stringify(fresh));
  await manager.stop(session.id);
  const generic=store.save({...saved,speed:5,weapons:saved.weapons.map(()=> 'YCEF0g5Q66')});
  session=await manager.start({id:generic.id,controller:'heuristic',opponent:'NNGRxjPsrz'});
  await inspect({freeze:true});
  for(let slot=1;slot<=generic.weapons.length;slot++) {
   const used=await inspect({exercise:slot});
   assert.ok(used.units.find(x=>x.type===generic.id).items.every(x=>x.type==='YCEF0g5Q66'));
   assert.ok(used.units.find(x=>x.type===generic.id).items[slot-1].lastUsed>0);
   // An opponent can debuff current speed before the IPC freeze; the saved
   // movement cap and equipment must still be the compiled custom values.
   assert.equal(used.units.find(x=>x.type===generic.id).speedMax,5);
  }
  assert.equal(manager.lastError,null);
  t.diagnostic('Real item callbacks, resources, damage credit, fixed human respawn and generic slots verified');
 } finally {await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
