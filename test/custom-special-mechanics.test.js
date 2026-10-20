'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {CustomUnitStore}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function arena(baseId,speed,run,opponent=baseId,health=9){
 const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'special-'));
 const store=new CustomUnitStore(dir,game), saved=store.save({baseId,name:'Special',health,speed,weapons:game.unitTypes[baseId].defaultItems.map(x=>x.key)});
 const manager=new SandboxManager({root,directory:dir,game,store,testMode:true});
 const inspect=extra=>new Promise((resolve,reject)=>{const child=manager.active.child;const timer=setTimeout(()=>{child.removeListener('message',on);reject(new Error('IPC timeout'));},6000);const on=x=>{if(x.type==='sandbox-inspection'){clearTimeout(timer);child.removeListener('message',on);resolve(x);}};child.on('message',on);child.send({type:'inspect-sandbox',...extra});});
 try{const session=await manager.start({id:saved.id,controller:'human',opponent});await inspect({join:true,freeze:true});await run({inspect,saved,session});}
 finally{await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('Rhythm Assassin fires its sideline projectile when the cursor coincides with the caster', {timeout:15000},async()=>arena('xHn8XJz8XB',5,async({inspect,saved})=>{
 await delay(200);const before=await inspect({freeze:true});const actor=before.units.find(x=>x.type===saved.id);
 const shot=await inspect({freeze:true,exercise:4,cursor:actor.position});
 assert.ok(shot.effects.after.created.projectile>shot.effects.before.created.projectile,JSON.stringify(shot));
 assert.equal(Object.keys(shot.errors).length,0,JSON.stringify(shot.errors));
},'xHn8XJz8XB',500));
for(const speed of [0,8]) test(`SubLazer form cycles retain low HP, speed ${speed}, equipment and root identity on server and client`, {timeout:50000},async()=>arena('TtQ4275KLf',speed,async({inspect,saved,session})=>{
 const doc=await (await fetch(session.url+'/src/game.json')).json();
 const formId=Object.keys(doc.data.unitTypes).find(id=>doc.data.unitTypes[id].customUnit?.id===saved.id&&id!==saved.id);
 assert.ok(formId);assert.equal(doc.data.unitTypes[formId].attributes.health.max,9);
 for(let n=0;n<3;n++) for(const native of ['qHn7EE5XjH','TtQ4275KLf']) {
  const state=await inspect({freeze:true,transform:native,health:7});
  const actor=state.units.find(x=>x.custom?.id===saved.id);
  assert.equal(actor.type,native==='TtQ4275KLf'?saved.id:formId);assert.equal(actor.health,7);assert.equal(actor.healthMax,9);assert.equal(actor.speedMax,speed);
  const expected=game.unitTypes[native].defaultItems.map(x=>x.key);assert.deepEqual(actor.items.map(x=>x.type),expected);
  assert.equal(state.stats.teams.blue.players[0].characterId,saved.id);
 }
 await inspect({freeze:true,transform:'qHn7EE5XjH',health:7});await inspect({exercise:4});await delay(3200);
 const reversed=await inspect({freeze:true});const rootActor=reversed.units.find(x=>x.type===saved.id);
 assert.ok(rootActor,JSON.stringify(reversed));assert.equal(rootActor.health,7);assert.equal(rootActor.speed,speed);
 await inspect({kill:saved.id});await delay(1600);await inspect({kill:saved.id+'-form-qHn7EE5XjH'});await delay(3500);const alive=await inspect({freeze:true});assert.ok(alive.units.some(x=>x.type===saved.id&&x.health>0));assert.equal(alive.stats.teams.blue.deaths,1);
}));

test('SubLazer preserves an active speed buff and shared skill resource across forms', {timeout:15000},async()=>arena('TtQ4275KLf',5,async({inspect,saved})=>{
 await inspect({exercise:1});
 const before=await inspect({freeze:true,buff:{speed:8,speedMax:9}});
 const resource=before.units.find(x=>x.custom?.id===saved.id).attributes.rP1x7BEeVq;
 const form=await inspect({freeze:true,transform:'qHn7EE5XjH',health:7});const actor=form.units.find(x=>x.custom?.id===saved.id);
 assert.equal(actor.speedMax,9);assert.equal(actor.speed,8);assert.ok(Math.abs(actor.attributes.rP1x7BEeVq-resource)<0.1);
}));

test('Hidden Hand copies a different enemy, assigns its owner, excludes copies and clears pending reflection on reset', {timeout:30000},async()=>arena('4d8Ed56NBs',5,async({inspect,saved,session})=>{
 const state=await inspect({freeze:true});const actor=state.units.find(x=>x.type===saved.id),enemy=state.units.find(x=>x.type==='NNGRxjPsrz');
 await inspect({exercise:1,cursor:enemy.position});await delay(1500);
 const copied=await inspect({freeze:true});const copies=copied.units.filter(x=>x.type==='Wvr1JjdNM6');assert.ok(copies.length>0,JSON.stringify(copied));assert.ok(copies.every(x=>x.owner===actor.owner));
 // Keep the eligible original outside the reflection area; only a copy and
 // the excluded custom caster are near this second cursor.
 const copyPosition={x:actor.position.x+80,y:actor.position.y};
 await inspect({freeze:true,relocate:{id:copies[0].id,position:copyPosition}});
 await inspect({exercise:1,cursor:copyPosition});await delay(1500);
 const reflected=await inspect({freeze:true});assert.ok(reflected.units.filter(x=>x.type==='Wvr1JjdNM6').length<=copies.length,JSON.stringify(reflected));
 await inspect({exercise:1,cursor:enemy.position});
 const reset=await fetch(session.url+'/api/custom-sandbox/control',{method:'POST',headers:{'Content-Type':'application/json','X-Custom-Unit-Token':session.token},body:JSON.stringify({action:'reset'})});assert.equal(reset.status,200);
 await inspect({freeze:true});await delay(1500);assert.equal((await inspect({freeze:true})).units.length,2);
}, 'NNGRxjPsrz'));
test('Hidden Hand reflection excludes its custom caster and reflection summons, and reset clears pending copies', {timeout:35000},async()=>arena('4d8Ed56NBs',5,async({inspect,saved,session})=>{
 const before=await inspect({freeze:true});const custom=before.units.find(x=>x.type===saved.id);
 await inspect({exercise:1,cursor:custom.position});await delay(1500);
 const self=await inspect({freeze:true});assert.equal(self.units.filter(x=>x.type==='Wvr1JjdNM6').length,0);
 // A native Hidden Hand opponent is likewise excluded by the existing script.
 const native=self.units.find(x=>x.type==='4d8Ed56NBs');await inspect({exercise:1,cursor:native.position});await delay(1400);
 assert.equal((await inspect({freeze:true})).units.filter(x=>x.type==='Wvr1JjdNM6').length,0);
 const response=await fetch(session.url+'/api/custom-sandbox/control',{method:'POST',headers:{'Content-Type':'application/json','X-Custom-Unit-Token':session.token},body:JSON.stringify({action:'reset'})});assert.equal(response.status,200);
 await delay(1500);assert.equal((await inspect({freeze:true})).units.length,2);
}));

test('Tenkai barrier phases, owned summons, resource cost and summon kill credit retain custom identity', {timeout:20000},async()=>arena('1yCQJedPRM',5,async({inspect,saved,session})=>{
 const state=await inspect({freeze:true});const actor=state.units.find(x=>x.type===saved.id);
 const first=await inspect({exercise:3});assert.equal(first.effects.after.variables['(Tenkai) Barrier State'],2);
 const second=await inspect({exercise:3});assert.equal(second.effects.after.variables['(Tenkai) Barrier State'],1);
 assert.ok(second.units.filter(x=>['1GtkVURT0X','Pp73Gv6rbm'].includes(x.type)).every(x=>x.owner===actor.owner));
 const airflow=await inspect({exercise:1});const summon=airflow.units.find(x=>x.type==='A88Bmq3EKf');assert.ok(summon);assert.equal(summon.owner,actor.owner);
 const fantasy=await inspect({exercise:4});assert.equal(fantasy.effects.after.attributes.bpDIpVPdGH,0);assert.ok(fantasy.effects.after.created.projectile>fantasy.effects.before.created.projectile);
 const hit=await inspect({damage:20,damageFrom:summon.id});assert.ok(hit.characterStats[actor.owner+':'+saved.id].damageDealt>=20);assert.equal(Object.values(hit.characterStats).filter(x=>x.playerId===actor.owner).length,1);
 const kill=await inspect({damage:10000,damageFrom:summon.id});assert.equal(kill.characterStats[actor.owner+':'+saved.id].kills,1);
 const reset=await fetch(session.url+'/api/custom-sandbox/control',{method:'POST',headers:{'Content-Type':'application/json','X-Custom-Unit-Token':session.token},body:JSON.stringify({action:'reset'})});assert.equal(reset.status,200);
 await inspect({freeze:true});await delay(1500);const fresh=await inspect({freeze:true});assert.equal(fresh.units.length,2);assert.ok(!fresh.units.some(x=>x.id===summon.id));
}));

test('Nadia defensive health floor prevents lethal damage and expires normally', {timeout:15000},async()=>arena('Pko4SCDSlz',5,async({inspect,saved})=>{
 await inspect({exercise:4});const guarded=await inspect({kill:saved.id});assert.ok(guarded.units.some(x=>x.type===saved.id&&x.health>0&&x.healthMin>0));
 await delay(2800);const expired=await inspect({freeze:true});assert.equal(expired.units.find(x=>x.type===saved.id).healthMin,0);
 await inspect({kill:saved.id});await delay(3500);assert.equal((await inspect({freeze:true})).stats.teams.blue.deaths,1);
},'Pko4SCDSlz',333));

test('SubLazer lethal damage enters its custom secondary form without healing, then dies and respawns', {timeout:16000},async()=>arena('TtQ4275KLf',5,async({inspect,saved})=>{
 await inspect({kill:saved.id});await delay(1600);
 const phase=await inspect({freeze:true}),form=phase.units.find(x=>x.custom?.id===saved.id);
 assert.ok(form,JSON.stringify(phase));assert.equal(form.type,saved.id+'-form-qHn7EE5XjH');assert.equal(form.health,1);assert.equal(form.healthMax,9);assert.equal(form.speedMax,5);assert.equal(phase.stats.teams.blue.deaths,0);
 await inspect({kill:form.type});await delay(3500);const respawn=await inspect({freeze:true});assert.ok(respawn.units.some(x=>x.type===saved.id&&x.health>0));assert.equal(respawn.stats.teams.blue.deaths,1);
}));
