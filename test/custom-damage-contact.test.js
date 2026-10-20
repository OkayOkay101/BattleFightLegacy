'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const {CustomUnitStore,catalog}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
for(const reverse of [false,true]) test(`real Stardust projectile hits once through contact callback (reversed=${reverse})`,{timeout:45000},async t=>{
 const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'damage-'));
 const store=new CustomUnitStore(dir,game),entry=catalog(game).find(x=>x.id==='NNGRxjPsrz');
 const saved=store.save({baseId:entry.id,name:'Damage proof',health:1000,speed:0,weapons:entry.defaults.weapons.map((id,i)=>i===0?'YCEF0g5Q66':id)});
 const manager=new SandboxManager({root,directory:dir,game,store,testMode:true,forkProcess:(file,args,options)=>fork(file,args,{...options,execArgv:['--require',path.join(__dirname,'helpers/custom-weapon-inspector.js')]})});
 try {await manager.start({id:saved.id,controller:'heuristic',opponent:entry.id});
  const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Inspection timeout')),7000);manager.active.child.on('message',x=>{if(x.type==='weapon-result'){clearTimeout(timer);resolve(x);}});manager.active.child.send({type:'weapon-inspect',reverse,waitForClock:true,pausePhysics:true});});
  t.diagnostic(JSON.stringify(result));assert.equal(result.error,undefined);assert.equal(result.calls.length,1);assert.equal(result.before-result.after,4);assert.equal(result.calls[0].context,result.projectiles[0].id);
  const stun=await new Promise((resolve,reject)=>{const child=manager.active.child,timer=setTimeout(()=>reject(new Error('Stun timeout')),7000);function on(x){if(x.type==='weapon-result'){child.removeListener('message',on);clearTimeout(timer);resolve(x);}}child.on('message',on);child.send({type:'weapon-inspect',nativeStun:true});});
  assert.equal(stun.targetStunned,true,'native getLastTouchedUnit must resolve the victim');assert.equal(stun.ownerStunned,false);assert.equal(stun.lastTouched,stun.targetId);
 }finally{await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
