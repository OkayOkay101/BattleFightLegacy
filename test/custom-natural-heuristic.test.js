'use strict';
const {test,describe}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {CustomUnitStore,catalog}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
describe('Autonomous custom heuristic (no forced item.use or filled resources)',{concurrency:2},()=>{
for(const entry of catalog(game)) test(entry.name,{timeout:45000},async()=>{
 const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'natural-'));
 const store=new CustomUnitStore(dir,game),saved=store.save({baseId:entry.id,name:'Natural '+entry.name,health:333,speed:5,weapons:entry.defaults.weapons});
 const manager=new SandboxManager({root,directory:dir,game,store,testMode:true});
 const inspect=extra=>new Promise((resolve,reject)=>{const child=manager.active.child;const timer=setTimeout(()=>{child.removeListener('message',on);reject(new Error('IPC timeout'));},6000);const on=x=>{if(x.type==='sandbox-inspection'){clearTimeout(timer);child.removeListener('message',on);resolve(x);}};child.on('message',on);child.send({type:'inspect-sandbox',...extra});});
 try {
  await manager.start({id:saved.id,controller:'heuristic',opponent:'NNGRxjPsrz'});
  const before=await inspect({duel:true,freezeRed:true});
  const actor=before.units.find(x=>x.type===saved.id);
  await delay(2600);let state=await inspect({freezeRed:true});
  const uses=()=>Object.values(state.weaponStats).filter(x=>x.actorId===actor.owner).reduce((n,x)=>n+x.uses,0);
  if(!uses()){await delay(2000);state=await inspect({freezeRed:true});}
  assert.ok(uses()>0,entry.name+': autonomous heuristic never used equipment '+JSON.stringify(state));
  assert.equal(Object.keys(state.errors).length,0,JSON.stringify(state.errors));
 } finally {await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
});
