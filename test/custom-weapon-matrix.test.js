'use strict';
const {test,describe}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const {CustomUnitStore,catalog}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
function inspect(manager,extra){return new Promise((resolve,reject)=>{const child=manager.active.child,timer=setTimeout(()=>{child.removeListener('message',on);reject(new Error('IPC timeout'));},7000);function on(x){if(x.type==='weapon-result'){clearTimeout(timer);child.removeListener('message',on);resolve(x);}}child.on('message',on);child.send({type:'weapon-inspect',...extra});});}
describe('Custom weapons: all patterns in every slot of all 44 characters',{concurrency:2},()=>{
 for(const entry of catalog(game).filter(x=>!process.env.CUSTOM_WEAPON_FILTER||new RegExp(process.env.CUSTOM_WEAPON_FILTER,'i').test(x.name))) test(entry.name,{timeout:180000},async t=>{
  const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'weapon-matrix-')),store=new CustomUnitStore(dir,game);
  const manager=new SandboxManager({root,directory:dir,game,store,testMode:true,forkProcess:(file,args,options)=>fork(file,args,{...options,execArgv:['--require',path.join(__dirname,'helpers/custom-weapon-inspector.js')]})});
  try {for(const pattern of ['single','spread','burst']) {
   const weapon=store.weaponStore.save({name:pattern,pattern,damage:10,speed:1,range:5000,cooldown:500,pellets:5,spread:30,shots:3,interval:100});
   const saved=store.save({baseId:entry.id,name:entry.name,health:100000,speed:0,weapons:entry.defaults.weapons.map(()=>weapon.id)});
   for(const controller of ['human','heuristic']) {
    const session=await manager.start({id:saved.id,controller,opponent:'NNGRxjPsrz'});
    for(let slot=1;slot<=saved.weapons.length;slot++) {
     const result=await inspect(manager,{join:controller==='human'&&slot===1,slot,raiseTarget:true,pausePhysics:true,wait:pattern==='burst'?260:0,repeatContact:true,reverse:slot%2===0});
     if(result.error||result.projectiles?.length!==({single:1,spread:5,burst:3}[pattern])||result.before-result.after!==10*({single:1,spread:5,burst:3}[pattern]))t.diagnostic(JSON.stringify({controller,pattern,slot,result}));
     assert.equal(result.error,undefined,`${entry.name} ${controller} ${pattern} slot ${slot}: ${result.error}`);
     const count={single:1,spread:5,burst:3}[pattern];assert.equal(result.projectiles.length,count,JSON.stringify(result));assert.equal(result.before-result.after,10*count,JSON.stringify(result));assert.equal(Object.keys(result.errors).length,0,JSON.stringify(result.errors));
    }
    // Verify each prototype/pattern/controller restores the saved loadout,
    // and accepted shots still hit after the shooter dies. The ordinary
    // slot checks above measure exact damage before this lifecycle check.
    const death=await inspect(manager,{slot:saved.weapons.length,raiseTarget:true,pausePhysics:true,wait:pattern==='burst'?260:0,repeatContact:true,killShooter:true,waitRespawn:3200});
    assert.equal(death.error,undefined,death.error);assert.ok(death.survivedShooterDeath);assert.equal(death.before-death.after,10*({single:1,spread:5,burst:3}[pattern]));
    assert.equal(death.respawn.type,saved.id);assert.deepEqual(death.respawn.weapons,saved.weapons);
    await manager.stop(session.id);
   }
  }}finally{await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
 });
});
