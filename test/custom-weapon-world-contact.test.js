'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const {CustomUnitStore,catalog}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
for(const pattern of ['single','spread','burst','native-Stardust'])test('Box2D-generated '+pattern+' contacts apply exact damage',{timeout:45000},async t=>{
 const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data,tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'world-contact-'));
 const store=new CustomUnitStore(dir,game),entry=catalog(game).find(x=>x.id==='NNGRxjPsrz'),w=pattern==='native-Stardust'?{id:'YCEF0g5Q66'}:store.weaponStore.save({name:'Physics hit',pattern,damage:10,speed:20,range:800,cooldown:500,pellets:5,spread:0,shots:3,interval:100});
 const unit=store.save({baseId:entry.id,name:'Physics hit',health:1000,speed:0,weapons:entry.defaults.weapons.map((id,i)=>pattern==='native-Stardust'&&i>0?id:w.id)});
 const manager=new SandboxManager({root,directory:dir,game,store,testMode:true,forkProcess:(file,args,options)=>fork(file,args,{...options,execArgv:['--require',path.join(__dirname,'helpers/custom-weapon-inspector.js')]})});
 try{
  await manager.start({id:unit.id,controller:'heuristic',opponent:entry.id});
  const r=await new Promise((resolve,reject)=>{const child=manager.active.child,timer=setTimeout(()=>reject(new Error('IPC timeout')),7000);child.on('message',function on(x){if(x.type==='weapon-result'){clearTimeout(timer);child.removeListener('message',on);resolve(x);}});child.send({type:'weapon-inspect',worldContact:true,expectedDamage:pattern==='native-Stardust'?4:undefined});});
  t.diagnostic(JSON.stringify(r));assert.equal(r.error,undefined,r.error);const count={single:1,spread:5,burst:3,'native-Stardust':1}[pattern];assert.equal(r.before-r.after,pattern==='native-Stardust'?4:count*10);assert.equal(new Set(r.contacts).size,count);assert.equal(Object.keys(r.errors).length,0);
 }finally{await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
