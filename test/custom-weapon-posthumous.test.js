'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const {CustomUnitStore,catalog}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
test('custom projectile survives shooter death and credits actual HP loss and one elimination',{timeout:45000},async()=>{
 const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
 const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'posthumous-'));
 const store=new CustomUnitStore(dir,game),entry=catalog(game).find(x=>x.id==='NNGRxjPsrz');
 const w=store.weaponStore.save({name:'Posthumous',pattern:'single',damage:10,speed:20,range:800,cooldown:500,pellets:5,spread:30,shots:3,interval:100});
 const unit=store.save({baseId:entry.id,name:'Posthumous',health:1000,speed:0,weapons:entry.defaults.weapons.map(()=>w.id)});
 const manager=new SandboxManager({root,directory:dir,game,store,testMode:true,forkProcess:(file,args,options)=>fork(file,args,{...options,execArgv:['--require',path.join(__dirname,'helpers/custom-weapon-inspector.js')]})});
 try{
  await manager.start({id:unit.id,controller:'heuristic',opponent:entry.id});
  const r=await new Promise((resolve,reject)=>{const child=manager.active.child,timer=setTimeout(()=>reject(new Error('IPC timeout')),7000);child.on('message',function on(x){if(x.type==='weapon-result'){clearTimeout(timer);child.removeListener('message',on);resolve(x);}});child.send({type:'weapon-inspect',pausePhysics:true,targetHealth:7,killShooter:true,repeatContact:true,probeFriendly:true,waitRespawn:3200});});
  assert.equal(r.error,undefined,r.error);assert.ok(r.friendlySafe);assert.ok(r.survivedShooterDeath);assert.equal(r.before-r.after,7);
  assert.equal(r.respawn.type,unit.id);assert.deepEqual(r.respawn.weapons,unit.weapons);
  const source=r.stats.players[r.shooterId],before=r.statsBefore.players[r.shooterId];
  assert.equal(source.damageDealt-before.damageDealt,7);assert.equal(source.kills-before.kills,1);
  assert.equal(r.feed.filter(x=>x.victim?.id===r.victimId).length,1);
 }finally{await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
