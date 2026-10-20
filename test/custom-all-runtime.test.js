'use strict';
const {test,describe}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const {CustomUnitStore,catalog}=require('../server/custom-units/CustomUnitStore');const {SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const entries=catalog(game).filter(x=>!process.env.CUSTOM_AUDIT_FILTER||new RegExp(process.env.CUSTOM_AUDIT_FILTER,'i').test(x.name));
describe('44 playable prototypes',{concurrency:2},()=>{
for(const entry of entries) test(`44-prototype acceptance: ${entry.name}`,{timeout:90000},async t=>{
 const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'all-'));
 const store=new CustomUnitStore(dir,game), manager=new SandboxManager({root,directory:dir,game,store,testMode:true});
 const saved=store.save({baseId:entry.id,name:entry.name+' Custom',health:333,speed:5,weapons:entry.defaults.weapons});
 assert.equal(new CustomUnitStore(dir,game).get(saved.id).revision,1);
 const inspect=extra=>new Promise((resolve,reject)=>{
  const child=manager.active.child,timer=setTimeout(()=>{child.removeListener('message',listener);reject(new Error('IPC timeout'));},6000);
  const listener=x=>{if(x.type==='sandbox-inspection'){clearTimeout(timer);child.removeListener('message',listener);resolve(x);}};child.on('message',listener);child.send({type:'inspect-sandbox',...extra});
 });
 const results=[];
 try {for(const controller of ['human','heuristic']) {
  const session=await manager.start({id:saved.id,controller,opponent:entry.id});
  let before=await inspect({join:controller==='human',freeze:true});
  const actor=before.units.find(x=>x.type===saved.id);assert.ok(actor,JSON.stringify(before));
  const document=(await (await fetch(session.url+'/src/game.json')).json()).data;
  const definition=document.unitTypes[saved.id];
  assert.equal(definition.attributes.health.max,333);assert.equal(definition.attributes.speed.max,5);
  assert.equal(document.unitTypes[entry.id].attributes.health.max,game.unitTypes[entry.id].attributes.health.max);
  // Autonomous skills may already apply temporary caps before IPC can freeze.
  if(controller==='human') {assert.equal(actor.healthMax,333);assert.equal(actor.speedMax,5);}
  // Use real ability movement input against a clear local direction.
  await inspect({move:true});await delay(220);const moved=await inspect({freeze:true});
  const movingActor=moved.units.find(x=>x.id===actor.id);
  assert.ok(Math.hypot(movingActor.position.x-actor.position.x,movingActor.position.y-actor.position.y)>0.1,entry.name+' did not move');
  for(let slot=1;slot<=saved.weapons.length;slot++) {
   let used=await inspect({freeze:true,exercise:slot});
   if(JSON.stringify(used.effects.after)===JSON.stringify(used.effects.before)) {await delay(450);used=await inspect({effectResult:true});}
   assert.ok(used.effects,JSON.stringify(used));
   assert.notDeepEqual(used.effects.after,used.effects.before,`${entry.name} slot ${slot}: no observable skill result; ${JSON.stringify(used.errors)}`);
   results.push({controller,slot,effect:true});
  }
  await delay(1600);const final=await inspect({freeze:true});
  assert.equal(Object.keys(final.errors||{}).length,0,entry.name+': '+JSON.stringify(final.errors));
  const hit=await inspect({damage:20});assert.ok(hit.stats.teams.blue.damageDealt>=20,JSON.stringify(hit));
  let kill=await inspect({damage:10000});
  if(!kill.stats.teams.red.deaths&&entry.id==='TtQ4275KLf') {await delay(1600);kill=await inspect({damage:10000});}
  assert.equal(kill.stats.teams.red.deaths,1,JSON.stringify(kill));
  // A native defensive skill can temporarily prevent health reaching zero.
  // Wait for its floor to expire before testing death/respawn.
  if(entry.id!=='TtQ4275KLf') for(let attempt=0;attempt<12;attempt++) {const actor=(await inspect({freeze:true})).units.find(x=>x.type===saved.id);if(!actor||!actor.healthMin)break;await delay(500);}
  await inspect({kill:saved.id});
  if(entry.id==='TtQ4275KLf') {await delay(1600);await inspect({kill:saved.id+'-form-qHn7EE5XjH'});}
  await delay(3500);
  const respawn=await inspect({freeze:true});const respawned=respawn.units.find(x=>x.type===saved.id&&x.id!==actor.id&&x.health>0);assert.ok(respawned,JSON.stringify(respawn));
  if(controller==='human') assert.equal(respawned.healthMax,333);
  assert.equal(respawn.stats.teams.blue.deaths,1,JSON.stringify(respawn));
  const oldIds=respawn.units.map(x=>x.id);
  const response=await fetch(session.url+'/api/custom-sandbox/control',{method:'POST',headers:{'Content-Type':'application/json','X-Custom-Unit-Token':session.token},body:JSON.stringify({action:'reset'})});assert.equal(response.status,200);
  const fresh=await inspect({freeze:true});
  // Fresh heuristic actors may already summon during the next engine tick.
  assert.equal(fresh.units.filter(x=>x.type===saved.id||x.type===entry.id).length,2,JSON.stringify(fresh));
  assert.ok(fresh.units.every(x=>!oldIds.includes(x.id)),JSON.stringify(fresh));
  assert.equal(fresh.stats.teams.blue.deaths,0);
  assert.ok(fresh.units.some(x=>x.type===entry.id)); // native buffs may already be active
  await manager.stop(session.id);
 }
 const allowed=entry.weapons.map((slot,index)=>({slot,index})).filter(x=>x.slot.length>1);
 for(const generic of ['YCEF0g5Q66','HxgjN3vbXs']) if(allowed.length) {
  const variant=store.save({...saved,id:undefined,revision:undefined,weapons:saved.weapons.map((id,n)=>allowed.some(x=>x.index===n)?generic:id)});
  const session=await manager.start({id:variant.id,controller:'heuristic',opponent:entry.id});
  await inspect({freeze:true});await delay(200); // let the first engine clock/physics tick complete
  for(const {index} of allowed) {
   const fired=await inspect({freeze:true,exercise:index+1});
   assert.ok(fired.effects.after.created.projectile>fired.effects.before.created.projectile,entry.name+' generic slot '+index+': '+JSON.stringify(fired));
  }
  await manager.stop(session.id);
 }
 t.diagnostic(JSON.stringify(results));
 } finally {await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
});
