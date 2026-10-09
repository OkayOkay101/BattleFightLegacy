'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {installCustomWeapons}=require('../server/custom-units/CustomWeaponRuntime');
function fixture(patch={}) {
 const shots=[],timers=new Map(),player={id:()=> 'player',_stats:{trainingTeamId:'blue'},control:{input:{mouse:{x:200,y:0}}}};
 const unit={id:()=> 'unit',_alive:true,_category:'unit',_translate:{x:0,y:0},_rotate:{z:0},_stats:{type:'cu-root',customUnit:{id:'cu-root'},currentBody:{width:20,height:20},currentItemIndex:0,attributes:{health:{value:100}}},getOwner:()=>player,getCurrentItem:()=>unit.item,changeItem(index){this._stats.currentItemIndex=index;this.item=index===0?item:other;},changeUnitType(type){this._stats.type=type;}};
 const item={id:()=> 'item',_category:'item',_stats:{itemTypeId:'cw-test',projectileType:'custom-shot',lastUsed:0,customWeapon:{id:'cw-test',pattern:'single',damage:10,speed:20,range:800,cooldown:500,pellets:5,spread:30,shots:3,interval:100,...patch}},getOwnerUnit:()=>unit};
 const other={id:()=> 'other',_stats:{}};unit.item=item;
 const entities={unit,item,player},ige={isServer:true,now:1000,_currentTime:0,game:{data:{projectileTypes:{'custom-shot':{scripts:{},variables:{},lifeSpan:600000}}},handleBattleBotDeath(){}},$:id=>entities[id],$$:()=>shots,trigger:{fire(){}}};
 const runtime={isCustomSandbox:true,attachCustomUnit(){},scheduleSandboxAction(fn,delay){const timer={fn,delay};timers.set(timer,timer);return timer;},cancelSandboxAction(timer){timers.delete(timer);},stats:{recordItemUse(){}}};
 global.ige=ige;global.Projectile=function(data){this._stats=data;this._alive=true;this._deathTime=ige._currentTime+data.lifeSpan;this.deathTime=value=>{this._deathTime=value;};this._translate={...data.defaultData.translate};this.addBehaviour=(name,fn)=>{this.rangeCheck=fn;};this.destroy=()=>{this._alive=false;};shots.push(this);};
 installCustomWeapons(ige,runtime);runtime.attachCustomUnit(unit);
 const advance=ms=>{for(const timer of [...timers.keys()].sort((a,b)=>a.delay-b.delay))if(timer.delay<=ms){timers.delete(timer);timer.fn();}};
 return {ige,runtime,item,unit,player,shots,timers,advance,other};
}
test('spread angles are symmetric and each pellet carries only its configured damage',()=>{
 const f=fixture({pattern:'spread'});assert.equal(f.runtime.useCustomWeapon(f.item),true);
 assert.deepEqual(f.shots.map(x=>Math.round(Math.atan2(x._stats.defaultData.velocity.y,x._stats.defaultData.velocity.x)*180/Math.PI*10)/10),[-15,-7.5,0,7.5,15]);
 assert.ok(f.shots.every(x=>x._stats.damageData.unitAttributes.health===10&&x._stats.damageData.ignoreBaseDamage));
});
test('burst timing and current aim, release finishes the accepted burst, cooldown blocks new activations',()=>{
 const f=fixture({pattern:'burst'});f.runtime.useCustomWeapon(f.item);assert.deepEqual([...f.timers.keys()].map(t=>t.delay),[100,200]);
 f.item._stats.isBeingUsed=false;f.player.control.input.mouse={x:0,y:200};f.advance(100);assert.equal(f.shots.length,2);assert.ok(f.shots[1]._stats.defaultData.velocity.y>19);
 f.player.control.input.mouse={x:-200,y:0};f.advance(200);assert.equal(f.shots.length,3);assert.ok(f.shots[2]._stats.defaultData.velocity.x< -19);
 assert.equal(f.runtime.useCustomWeapon(f.item),false);f.ige.now=1500;assert.equal(f.runtime.useCustomWeapon(f.item),true);
});
for(const action of ['switch','form','death','reset'])test(`${action} cancels pending burst callbacks`,()=>{
 const f=fixture({pattern:'burst'});f.runtime.useCustomWeapon(f.item);
 if(action==='switch')f.unit.changeItem(1);if(action==='form')f.unit.changeUnitType('secondary');if(action==='death'){f.unit._stats.attributes.health.value=0;f.ige.game.handleBattleBotDeath(f.unit);}if(action==='reset')f.runtime.cancelCustomBursts();
 assert.equal(f.timers.size,0);f.advance(500);assert.equal(f.shots.length,1);
});
test('capacity stops firing and cancels remaining burst without a deferred queue',()=>{
 const f=fixture({pattern:'burst'});for(let n=0;n<255;n++)f.shots.push({_alive:true,_stats:{customWeapon:{}}});
 f.runtime.useCustomWeapon(f.item);assert.equal(f.shots.length,256);f.advance(100);assert.equal(f.timers.size,0);assert.equal(f.shots.length,256);assert.equal(f.runtime.customWeaponNotice.key,'weapon.capacity');
 f.shots.length=0;f.advance(500);assert.equal(f.shots.length,0);
});
test('range uses actual distance traveled from muzzle, including curved or redirected movement',()=>{
 const f=fixture({range:100});f.runtime.useCustomWeapon(f.item);const shot=f.shots[0],start={...shot._translate};
 shot._translate.x+=60;shot.rangeCheck();assert.equal(shot._alive,true);shot._translate.y+=40;shot.rangeCheck();assert.equal(shot._alive,false);assert.equal(start.y,0);
});

test('accepted shot before first engine frame has a future safety deadline',()=>{
 const f=fixture(),before=Date.now();f.runtime.useCustomWeapon(f.item);const after=Date.now();
 assert.ok(f.shots[0]._deathTime>=before+600000&&f.shots[0]._deathTime<=after+600000);
});
test('one custom activation records one weapon use in the real sandbox statistics',()=>{
 const f=fixture({pattern:'burst'}),{TrainingStats}=require('../server/training/TrainingStats');
 f.runtime.stats=new TrainingStats();f.runtime.stats.registerPlayer({playerId:'player',teamId:'blue'});f.runtime.stats.startLife({playerId:'player',lifeId:'unit',characterId:'cu-root'});
 f.runtime.useCustomWeapon(f.item);f.advance(200);
 assert.equal(Object.values(f.runtime.stats.finish().weapons)[0]?.uses,1);
});
test('sandbox bot range follows configured travel distance instead of the safety lifespan',()=>{
 const f=fixture({range:50});f.ige.game._battleBotWeaponRange=()=>360000;
 installCustomWeapons(f.ige,f.runtime);
 assert.equal(f.ige.game._battleBotWeaponRange(f.item),75);
});
