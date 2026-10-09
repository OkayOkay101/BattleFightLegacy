'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const {CustomUnitStore,catalog}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
const defaults={name:'Damage 10',damage:10,speed:20,range:800,cooldown:500,pellets:5,spread:30,shots:3,interval:100};
function inspect(manager,extra={}) {return new Promise((resolve,reject)=>{const child=manager.active.child,timer=setTimeout(()=>{child.removeListener('message',on);reject(new Error('IPC timeout'));},7000);function on(x){if(x.type==='weapon-result'){clearTimeout(timer);child.removeListener('message',on);resolve(x);}}child.on('message',on);child.send({type:'weapon-inspect',...extra});});}
for(const pattern of ['single','spread','burst']) test(`real custom ${pattern}: projectile count, damage, duplicate contact and immutable snapshot`,{timeout:45000},async t=>{
 const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'weapon-runtime-'));
 const store=new CustomUnitStore(dir,game),entry=catalog(game).find(x=>x.id==='NNGRxjPsrz'),weapon=store.weaponStore.save({...defaults,pattern});
 const saved=store.save({baseId:entry.id,name:'Custom firing',health:1000,speed:0,weapons:entry.defaults.weapons.map(()=>weapon.id)});
 const manager=new SandboxManager({root,directory:dir,game,store,testMode:true,forkProcess:(file,args,options)=>fork(file,args,{...options,execArgv:['--require',path.join(__dirname,'helpers/custom-weapon-inspector.js')]})});
 try {await manager.start({id:saved.id,controller:'heuristic',opponent:entry.id});store.weaponStore.save({...weapon,damage:30});
  const result=await inspect(manager,{wait:pattern==='burst'?250:0,repeatContact:true,raiseTarget:true});t.diagnostic(JSON.stringify(result));assert.equal(result.error,undefined);
  const count={single:1,spread:5,burst:3}[pattern];assert.equal(result.projectiles.length,count);assert.equal(result.before-result.after,count*10);assert.equal(result.calls.filter(x=>x.target===result.targetId).length,count);
  assert.equal(Object.keys(result.errors).length,0);
 }finally{await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
module.exports={inspect,defaults};
