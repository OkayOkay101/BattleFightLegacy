'use strict';
const {test,describe}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {catalog,CustomUnitStore}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
describe('All native skill effects exclude lastUsed and voiceline bookkeeping',{concurrency:2},()=>{
 for(const entry of catalog(game)) test(entry.name,{timeout:40000},async()=>{
  const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'skill-effects-'));
  const store=new CustomUnitStore(dir,game),saved=store.save({baseId:entry.id,name:'Effects '+entry.name,health:500,speed:5,weapons:entry.defaults.weapons});
  const manager=new SandboxManager({root,directory:dir,game,store,testMode:true});
  const inspect=extra=>new Promise((resolve,reject)=>{const child=manager.active.child;const timer=setTimeout(()=>{child.removeListener('message',on);reject(new Error('IPC timeout'));},6000);function on(x){if(x.type==='sandbox-inspection'){clearTimeout(timer);child.removeListener('message',on);resolve(x);}}child.on('message',on);child.send({type:'inspect-sandbox',...extra});});
  try{for(const controller of ['human','heuristic']){
   const session=await manager.start({id:saved.id,controller,opponent:entry.id});await inspect({join:controller==='human',freeze:true});await delay(200);
   for(let slot=1;slot<=saved.weapons.length;slot++){
    let state=await inspect({freeze:true,exercise:slot});
    if(JSON.stringify(state.effects.before)===JSON.stringify(state.effects.after)){await delay(450);state=await inspect({freeze:true,effectResult:true});}
    assert.notDeepEqual(state.effects.before,state.effects.after,entry.name+' '+controller+' slot '+slot+': '+JSON.stringify(state.errors));
   }
   await delay(500);const state=await inspect({freeze:true});assert.equal(Object.keys(state.errors).length,0,JSON.stringify(state.errors));await manager.stop(session.id);
  }}finally{await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
 });
});
