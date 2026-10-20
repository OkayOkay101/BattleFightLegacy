'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {installAdapters}=require('../server/custom-units/SandboxAdapters');
function arena(){
 const unit={_stats:{type:'cu-test',customUnit:{id:'cu-test',baseId:'p2VWFdjcM3'},attributes:{health:{value:10}}},stopMoving(){this.stopped=true;},setLinearVelocity(x,y){this.velocity=[x,y];},getCurrentItem(){return {_stats:{itemTypeId:'DUmSmPBSsI',isBeingUsed:true}};}};
 const player={_battleBot:{fixedCharacter:'cu-test',thinkingAt:0},getSelectedUnit:()=>unit};
 const ige={game:{data:{unitTypes:{}},_thinkBattleBot(p){p._battleBot.thinkingAt++;},_battleBotTargets:()=>[{unit:{_translate:{x:80,y:0}},distance:80}]},variable:{getValue:x=>x},training:null};
 const runtime={},snapshot={unit:{id:'cu-test',health:10,speed:5},compiled:{formIds:{p2VWFdjcM3:'cu-test'},adapter:{stationaryItems:['DUmSmPBSsI']}}};
 installAdapters(ige,runtime,snapshot);return {ige,runtime,unit,player};
}
test('sandbox heuristic holds position for a stationary skill while originals retain normal movement',()=>{
 const {ige,unit,player}=arena();ige.game._thinkBattleBot(player,unit);assert.ok(unit.stopped);assert.deepEqual(unit.velocity,[0,0]);
 delete unit._stats.customUnit;unit.stopped=false;ige.game._thinkBattleBot(player,unit);assert.equal(unit.stopped,false);
});
test('transforms and health minimum adapt only custom actors; summon identity stays native',()=>{
 const {runtime,unit}=arena();runtime.snapshot={};
 const native={_stats:{type:'p2VWFdjcM3'}};
 const action={type:'changeUnitType',unitType:'p2VWFdjcM3',entity:unit};
 assert.equal(runtime.adaptSandboxAction(action,{}).unitType,'cu-test');
 assert.equal(runtime.adaptSandboxAction({...action,entity:native},{}).unitType,'p2VWFdjcM3');
 assert.equal(runtime.adaptSandboxAction({type:'setEntityAttributeMin',attribute:'health',value:1,entity:unit},{}).value,1);
});
test('native temporary buffs may raise speed cap and health floor',()=>{
 const {runtime,unit}=arena();
 assert.equal(runtime.adaptSandboxAction({type:'setEntityAttributeMax',attribute:'speed',value:30,entity:unit},{}).value,30);
 assert.equal(runtime.adaptSandboxAction({type:'setEntityAttributeMin',attribute:'health',value:1,entity:unit},{}).value,1);
});
test('arena particle export aliases emit the existing position effect instead of an unsupported action',()=>{
 const {runtime,unit}=arena();
 const action=runtime.adaptSandboxAction({type:'emitParticlesFromEntity',entity:unit,particleType:'sparks'},{});
 assert.equal(action.type,'emitParticleOnceAtPosition');assert.equal(action.position.function,'getEntityPosition');
});
test('secondary force callback with a missing target position is ignored before calculating NaN',()=>{
 const {runtime,unit}=arena();
 const action={type:'applyForceOnEntityAngle',entity:unit,angle:{function:'calculate',items:[{operator:'+'},{function:'angleBetweenPositions',positionA:{x:0,y:0},positionB:null},Math.PI]}};
 assert.equal(runtime.adaptSandboxAction(action,{}),null);
 action.angle.items[1].positionB={x:0,y:0};
 assert.equal(runtime.adaptSandboxAction(action,{}),null);
});
test('custom heuristic weapon selection rejects a scripted ultimate whose meter condition is false',()=>{
 const {installAdapters}=require('../server/custom-units/SandboxAdapters');
 const item={_stats:{lastUsed:0,fireRate:0,isGun:false,scripts:{use:{triggers:[{type:'itemIsUsed'}],conditions:['outer'],actions:[{type:'condition',conditions:['meter'],then:[{type:'createProjectileAtPosition'}],else:[]}]}}},hasQuantityRemaining:()=>true,canAffordItemCost:()=>true,id:()=> 'item'};
 const unit={_stats:{customUnit:{id:'cu-test'}},inventory:{getItemBySlotNumber:()=>item},id:()=> 'unit',getOwner:()=>({id:()=> 'player'})};
 const ige={now:10000,game:{_thinkBattleBot(){},_selectBattleBotWeapon(u,profile){return profile.slots.length?'selected':null;}},condition:{run:conditions=>conditions[0]!=='meter'}};
 installAdapters(ige,{}, {unit:{id:'cu-test'},compiled:{adapter:{stationaryItems:[]},formIds:{}}});
 assert.equal(ige.game._selectBattleBotWeapon(unit,{slots:[0]},100,true,10000,0,{}),null);
 delete unit._stats.customUnit;assert.equal(ige.game._selectBattleBotWeapon(unit,{slots:[0]},100,true,10000,0,{}),'selected');
});

test('custom heuristic uses ranged spacing only while its selected equipment is a generic projectile weapon',()=>{
 const unit={_stats:{type:'cu-test',customUnit:{id:'cu-test'},attributes:{health:{value:10}}},getCurrentItem:()=>({_stats:{itemTypeId:unit.item}})};
 const profile={id:'cu-test',range:100,role:'melee'},ige={game:{battleBotRoster:[profile],_thinkBattleBot(){}}};
 installAdapters(ige,{}, {unit:{id:'cu-test'},compiled:{profile:{...profile},adapter:{stationaryItems:[]}}});
 unit.item='YCEF0g5Q66';ige.game._thinkBattleBot({},unit);assert.equal(profile.range,400);assert.equal(profile.role,'ranged');
 unit.item='native';ige.game._thinkBattleBot({},unit);assert.equal(profile.range,100);assert.equal(profile.role,'melee');
 delete unit._stats.customUnit;unit.item='YCEF0g5Q66';ige.game._thinkBattleBot({},unit);assert.equal(profile.range,100);
});

test('a projectile aimed at the teleported caster position uses the caster facing instead of an undefined angle',()=>{
 const {runtime,ige,unit}=arena();unit._rotate={z:1.25};ige.$=()=>unit;
 const angle={function:'angleBetweenPositions',positionA:{x:1,y:2},positionB:{x:1,y:2}};
 assert.equal(runtime.adaptSandboxAction({type:'createProjectileAtPosition',angle}, {triggeredBy:{unitId:'unit'}}).angle,1.25);
 assert.equal(runtime.adaptSandboxAction({type:'createProjectileAtPosition',angle:{...angle,positionB:null}},{}),null);
});

test('coincident projectile angles repair nested spawn geometry while preserving offsets and the original script',()=>{
 const {runtime,ige,unit}=arena();unit._rotate={z:1.25};ige.$=()=>unit;
 const angle={function:'angleBetweenPositions',positionA:{x:1,y:2},positionB:{x:1,y:2}};
 const position={function:'getPositionInFrontOfPosition',distance:80,angle:{function:'calculate',items:[{operator:'+'},angle,0]},position:{x:1,y:2}};
 const action={type:'createProjectileAtPosition',angle:{function:'calculate',items:[{operator:'+'},angle,0.5]},position};
 const repaired=runtime.adaptSandboxAction(action,{thisEntity:{getOwnerUnit:()=>unit}});
 assert.equal(repaired.angle.items[1],1.25);assert.equal(repaired.angle.items[2],0.5);
 assert.equal(repaired.position.angle.items[1],1.25);assert.equal(repaired.position.distance,80);
 assert.equal(action.position.angle.items[1],angle);
 assert.equal(runtime.adaptSandboxAction({...action,position:{...position,angle:{...angle,positionB:null}}},{}),null);
});
