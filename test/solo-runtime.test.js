'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),{fork}=require('child_process');
const {SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('real Solo arena: empty start, movement, native skills, contacts, death, reset and shutdown',{timeout:100000},async t=>{
 const tmp=path.join(root,'build/solo-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'runtime-'));
 const manager=new SandboxManager({root,directory:dir,game,store:null,testMode:true,
  forkProcess:(file,args,options)=>fork(file,args,{...options,execArgv:['--require',path.join(__dirname,'helpers/morrow-inspector.js')]})});
 try {
  const session=await manager.startSolo({characterId:'morrowRouteCartographer'});
  function ipc(type,response,extra={}){return new Promise((resolve,reject)=>{
   const child=manager.active.child,timer=setTimeout(()=>{child.off('message',on);reject(new Error(response+' timed out'));},10000);
   function on(msg){if(msg.type===response){clearTimeout(timer);child.off('message',on);resolve(msg);}}
   child.on('message',on);child.send({type,...extra});
  });}
  const inspect=extra=>ipc('inspect-sandbox','sandbox-inspection',extra);
  async function control(action,token=session.token){const r=await fetch(session.url+'/api/custom-sandbox/control',{method:'POST',headers:{'Content-Type':'application/json','X-Custom-Unit-Token':token},body:JSON.stringify({action})});return {status:r.status,...await r.json()};}
  assert.equal((await inspect()).units.length,0,'no automatic opponents');
  assert.equal((await control('dummy','wrong-token')).status,403);
  await inspect({join:true});await delay(500);
  const before=await inspect({move:true});assert.equal(before.units.length,1);
  assert.equal(before.units[0].type,'morrowRouteCartographer');
  await delay(400);const moved=await inspect({freeze:true});
  assert.ok(Math.hypot(moved.units[0].position.x-before.units[0].position.x,moved.units[0].position.y-before.units[0].position.y)>2,'movement changes world position');
  const dummy=await control('dummy');assert.equal(dummy.ok,true,JSON.stringify(dummy));
  const withDummy=await inspect({freeze:true});assert.equal(withDummy.units.length,2);
  const target=withDummy.units.find(x=>x.type==='NNGRxjPsrz');await delay(250);
  const settled=(await inspect()).units.find(x=>x.id===target.id).position;
  assert.ok(Math.hypot(settled.x-target.position.x,settled.y-target.position.y)<0.001,'dummy stays still (allow floating-point conversion)');
  assert.equal((await control('dummy')).ok,true);const pair=(await inspect()).units.filter(x=>x.type==='NNGRxjPsrz');
  assert.equal(pair.length,2);assert.ok(Math.hypot(pair[0].position.x-pair[1].position.x,pair[0].position.y-pair[1].position.y)>=60,'new targets must not overlap and push one another');
  for(const banked of [false,true])for(const reverse of [false,true]){
   const result=await ipc('morrow-inspect','morrow-result',{banked,reverse});
   assert.equal(result.error,undefined,result.error);assert.equal(result.damage,banked?22:12,'one impact even if callback repeats');
   if(banked){assert.ok(Math.abs(result.initial.x)<0.01 && result.initial.y>0,'Banked Delivery must first travel to marker, not cursor');assert.equal(result.redirected,true);assert.ok(Math.abs(result.rotation-Math.PI/2)<0.01,'redirect uses aim saved when cast: '+JSON.stringify({initial:result.initial,rotation:result.rotation}));}
  }
  for(const banked of [false,true]) {
   const result=await ipc('morrow-inspect','morrow-result',{banked,worldContact:true});
   assert.equal(result.error,undefined,result.error);assert.equal(result.damage,banked?22:12,'real Box2D contact produces exact native damage: '+JSON.stringify(result));
   assert.ok(result.contacts.length>0,'physics must deliver the impact');
  }
  await inspect({exercise:2});assert.equal((await inspect()).markers.filter(x=>x.type==='pTci7A1HLy').length,1);
  const atlas=await inspect({exercise:4});assert.ok(atlas.markers.some(x=>x.type==='morrowAtlasTelegraph'),'Atlas warning created');
  await delay(200);const warning=(await inspect()).markers.find(x=>x.type==='morrowAtlasTelegraph');assert.ok(warning,'warning persists while charging');assert.equal(warning.height,192);assert.equal(warning.scaleDimensions,true);assert.ok(warning.width>0);
  assert.equal((await control('reset')).ok,true);await delay(1000);
  const reset=await inspect();assert.equal(reset.units.length,1);assert.equal(reset.markers.length,0);assert.equal(reset.projectiles,0);assert.equal(reset.stats.teams.blue.deaths,0);
  const old=reset.units[0].id;await inspect({exercise:2});assert.equal((await control('kill')).ok,true);
  await delay(300);assert.equal((await inspect()).markers.length,0,'death removes the owner marker');
  await delay(4000);const respawn=await inspect();
  assert.ok(respawn.units.some(u=>u.id!==old&&u.type==='morrowRouteCartographer'&&u.health>0));
  assert.equal(respawn.stats.teams.blue.deaths,1);
  await inspect({exercise:2});await delay(7300);assert.equal((await inspect()).markers.length,0,'marker expires on real timer');
  await manager.stop(session.id);assert.equal(manager.active,null);await assert.rejects(fetch(session.url+'/api/demo/status'));
  t.diagnostic('Native Solo actor, real contact callback in both fixture orders, owned timers and child cleanup verified.');
 } finally {await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
