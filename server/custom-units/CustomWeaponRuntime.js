'use strict';
const {fromEntity}=require('../../src/gameClasses/components/CombatAttribution');
function muzzleDistance(weapon,unit) {
 const body=unit?._stats.currentBody||{};
 return Math.min(weapon.range/2,Math.max(35,Math.hypot(body.width||0,body.height||0)/2+20));
}
function installCustomWeapons(ige,runtime) {
 const bursts=new Map();let sequence=0;
 const cancel=item=>{const burst=bursts.get(item.id());if(!burst)return;for(const timer of burst.timers)runtime.cancelSandboxAction(timer);bursts.delete(item.id());};
 runtime.cancelCustomBursts=()=>{for(const burst of [...bursts.values()])cancel(burst.item);};
 runtime.customBurstActive=item=>!!item&&bursts.has(item.id());
 runtime.cancelCustomBurst=cancel;
 const alive=(item,unit)=>item._alive!==false && ige.$(item.id())===item && unit && unit._alive!==false && unit._stats.attributes.health.value>0 && unit.getCurrentItem()===item;
 const notifyLimit=()=>{runtime.customWeaponNotice={key:'weapon.capacity',at:Date.now()};};
 const normalRange=ige.game._battleBotWeaponRange;
 ige.game._battleBotWeaponRange=function(item,...args) {
  const weapon=item?._stats.customWeapon;
  return weapon?weapon.range+muzzleDistance(weapon,item.getOwnerUnit()):normalRange.call(this,item,...args);
 };
 function shoot(item,unit,activation,index,offset=0) {
  if(!alive(item,unit))return false;
  if(ige.$$('projectile').filter(x=>x._stats.customWeapon && x._alive!==false).length>=256){notifyLimit(unit.getOwner());return false;}
  const weapon=item._stats.customWeapon,player=unit.getOwner();
  const aim=unit.botAimPosition||player?.control?.input?.mouse;
  let heading=aim&&Math.hypot(aim.x-unit._translate.x,aim.y-unit._translate.y)>0?Math.atan2(aim.y-unit._translate.y,aim.x-unit._translate.x):unit._rotate.z-Math.PI/2;
  heading+=offset;
  const muzzle=muzzleDistance(weapon,unit);
  const position={x:unit._translate.x+Math.cos(heading)*muzzle,y:unit._translate.y+Math.sin(heading)*muzzle};
  const data=JSON.parse(JSON.stringify(ige.game.data.projectileTypes[item._stats.projectileType]));
  Object.assign(data,{type:item._stats.projectileType,sourceUnitId:unit.id(),sourceItemId:item.id(),sourcePlayerId:player.id(),combatSource:fromEntity(ige,unit,item.id()),streamMode:1,
   customWeapon:{id:weapon.id,range:weapon.range,activation,index},
   damageData:{sourceUnitId:unit.id(),sourceItemId:item.id(),sourcePlayerId:player.id(),targetsAffected:['hostile'],unitAttributes:{health:weapon.damage},ignoreBaseDamage:true},
   defaultData:{translate:position,rotate:heading+Math.PI/2,velocity:{x:Math.cos(heading)*weapon.speed,y:Math.sin(heading)*weapon.speed}}});
  // Projectile is the engine constructor, loaded before sandbox installation.
  const shot=new Projectile(data);
  // A sandbox can accept a shot before the first engine frame initializes
  // _currentTime. lifeSpan(600000) would then expire on the first epoch tick.
  if(!ige._currentTime&&typeof shot.deathTime==='function')shot.deathTime(Date.now()+data.lifeSpan);
  let last={...position},distance=0;
  shot.addBehaviour('customWeaponRange',function(){
   distance+=Math.hypot(this._translate.x-last.x,this._translate.y-last.y);last={x:this._translate.x,y:this._translate.y};
   if(distance>=weapon.range)this.destroy();
  });
  return true;
 }
 runtime.useCustomWeapon=item=>{
  const unit=item.getOwnerUnit(),weapon=item._stats.customWeapon,now=ige.now;
  if(!weapon||!alive(item,unit)||bursts.has(item.id())||Number(item._stats.lastUsed||0)+weapon.cooldown>now)return false;
  item._stats.lastUsed=now;ige.game.lastUsedItemId=item.id();
  const activation=item.id()+':custom:'+(++sequence),player=unit.getOwner();
  runtime.stats?.recordItemUse({actorId:player.id(),itemTypeId:item._stats.itemTypeId,eventId:activation});
  // Unit passives remain active; no native item firing script is inherited.
  ige.trigger.fire('unitUsesItem',{unitId:unit.id(),itemId:item.id(),playerId:player.id()});
  if(weapon.pattern==='spread') {
   for(let n=0;n<weapon.pellets;n++){const degrees=weapon.pellets===1?0:(n/(weapon.pellets-1)-0.5)*weapon.spread;if(!shoot(item,unit,activation,n,degrees*Math.PI/180))break;}
  } else {
   if(!shoot(item,unit,activation,0))return false;
   if(weapon.pattern==='burst'&&weapon.shots>1) {
    const burst={item,timers:new Set()};bursts.set(item.id(),burst);
    for(let n=1;n<weapon.shots;n++) {
     const timer=runtime.scheduleSandboxAction(()=>{
      burst.timers.delete(timer);
      if(!shoot(item,unit,activation,n)){cancel(item);return;}
      if(n===weapon.shots-1)bursts.delete(item.id());
     },n*weapon.interval);burst.timers.add(timer);
    }
   }
  }
  return true;
 };
 const attach=runtime.attachCustomUnit;
 runtime.attachCustomUnit=unit=>{
  attach(unit);if(!unit._stats.customUnit)return;
  const change=unit.changeItem;
  unit.changeItem=function(index){if(index!==undefined&&index!==this._stats.currentItemIndex){const item=this.getCurrentItem();if(item)cancel(item);}return change.apply(this,arguments);};
  const transform=unit.changeUnitType;
  unit.changeUnitType=function(){const item=this.getCurrentItem();if(item)cancel(item);return transform.apply(this,arguments);};
 };
 const death=ige.game.handleBattleBotDeath;
 ige.game.handleBattleBotDeath=function(unit){const item=unit.getCurrentItem();if(item)cancel(item);return death.apply(this,arguments);};
}
module.exports={installCustomWeapons};
