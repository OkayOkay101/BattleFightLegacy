'use strict';
// Hooks are installed only inside the isolated arena. All shared scripts and
// production decisions remain unchanged for actors without custom metadata.
function installAdapters(ige,runtime,snapshot) {
 const {compiled}=snapshot;
 const originalProfile={...compiled.profile};
 runtime.attachCustomUnit=unit=>{
  if(unit._stats.customUnit?.id!==snapshot.unit.id) return;
  const change=unit.changeUnitType;
  unit.changeUnitType=function(type,...args) {
   if(!Object.values(compiled.formIds).includes(type)) return change.call(this,type,...args);
   const prior={};
   for(const id of ['health','speed']) prior[id]={...this._stats.attributes[id]};
   // Unit.streamUpdateData's base class has already assigned the incoming
   // type; metadata still identifies the outgoing form at this point.
   const definition=compiled.unitTypes[compiled.formIds[this._stats.customUnit.baseId]];
   const result=change.call(this,type,...args);
   for(const id of ['health','speed']) {
    const attribute=this._stats.attributes[id], old=prior[id], defaults=definition.attributes[id];
    // Carry active cap/floor/regen effects across forms. Each compiled form
    // already has the editor's base caps; native resource form caps stay native.
    const updates=[];
    for(const [field,stream] of [['min','attributesMin'],['max','attributesMax'],['regenerateSpeed','attributesRegenerateRate']]) if(old[field]!==defaults[field]) {
     attribute[field]=old[field];updates.push({[stream]:{[id]:old[field]}});
    }
    if(updates.length) this.streamUpdateData(updates);
    const retainedValue=Math.max(attribute.min,Math.min(attribute.max,old.value));
    this.attribute.update(id,retainedValue,true);
    // A type change can clamp the client even if this value was synced before;
    // send it explicitly instead of relying on lastSyncedValue suppression.
    this.streamUpdateData([{attributes:{[id]:retainedValue}}]);
   }
   return result;
  };
 };
 const normalSelect=ige.game._selectBattleBotWeapon;
 if(normalSelect) ige.game._selectBattleBotWeapon=function(unit,profile,...args) {
  if(unit?._stats?.customUnit?.id===snapshot.unit.id) {
   if(runtime.customBurstActive?.(unit.getCurrentItem())) return {slot:unit._stats.currentItemIndex,item:unit.getCurrentItem(),ricochet:null};
   profile={...profile,slots:(profile.slots||[]).filter(slot=>{
    const item=unit.inventory.getItemBySlotNumber(slot+1);
    return item&&scriptPrerequisites(ige,item,unit,unit.getOwner());
   })};
  }
  return normalSelect.call(this,unit,profile,...args);
 };
 const normalThink=ige.game._thinkBattleBot;
 ige.game._thinkBattleBot=function(player,unit) {
  if(unit?._stats?.customUnit?.id===snapshot.unit.id) {
   const profile=this.battleBotRoster?.find(x=>x.id===unit._stats.type);
   if(profile) {
    const generic=['YCEF0g5Q66','HxgjN3vbXs'].includes(unit.getCurrentItem()?._stats.itemTypeId);
    const customWeapon=unit.getCurrentItem()?._stats.customWeapon;
    profile.range=customWeapon?customWeapon.range:generic?400:originalProfile.range;profile.role=customWeapon||generic?'ranged':originalProfile.role;
   }
  }
  const prior=player?._battleBot?.thinkingAt;
  normalThink.call(this,player,unit);
  const state=player?._battleBot;
  if(unit?._stats?.customUnit?.id!==snapshot.unit.id||!state||state.thinkingAt===prior||unit._stats.attributes.health.value<=0) return;
  const now=Date.now(), target=this._battleBotTargets(player,unit,now)[0];
  if(!target) return;
  // Native gun selection handles aim, range and dodge. Script-only abilities
  // also need a chance to run: readiness includes their explicit resource/state
  // conditions, not just the generic gun's cost object.
  if(unit.inventory && !runtime.customBurstActive?.(unit.getCurrentItem()) && now >= (state.customSkillAt||0) && target.distance <= compiled.profile.range) {
   const map=ige.map.data, visible=unit.ai.battleBotHasLineOfSight(map,1,1,ige.scaleMapDetails.tileWidth,unit._translate,target.unit._translate);
   const count=unit._stats.itemIds.length;
   if(visible) for(let offset=0;offset<count;offset++) {
    const slot=((state.customSkillSlot||0)+offset)%count, item=unit.inventory.getItemBySlotNumber(slot+1);
    if(!item || !readyScriptSkill(ige,item,unit,player)) continue;
    unit.ability.stopUsingItem();unit.changeItem(slot);
    const aim={x:target.unit._translate.x,y:target.unit._translate.y};
    // Placement/teleport skills use the same aim as the player cursor. Avoid
    // choosing a destination inside a wall; keep native attack geometry intact.
    if(this._battleBotClearPosition(aim,20)) {
     unit.botAimPosition=aim;Object.assign(player.control.input.mouse,aim);
    }
    unit.ability.startUsingItem();state.customSkillAt=now+900;state.customSkillSlot=(slot+1)%count;break;
   }
  }
  const item=unit.getCurrentItem();
  if(compiled.adapter.stationaryItems.includes(item?._stats.itemTypeId)&&item?._stats.isBeingUsed) state.customHoldUntil=now+2000;
  if(state.customHoldUntil>now && !state.dodgePlan?.imminent) {unit.stopMoving();unit.setLinearVelocity(0,0);}
 };
 runtime.resolveCombatCharacterId=(player,unit)=>player?._battleBot?.fixedCharacter||unit?._stats.type;
 runtime.adaptSandboxAction=(action,vars)=>{
  if(action.type==='emitParticlesFromEntity') return {...action,type:'emitParticleOnceAtPosition',position:{function:'getEntityPosition',entity:action.entity}};
  if(action.type==='emitParticlesAtPosition') return {...action,type:'emitParticleOnceAtPosition'};
  if(action.type==='applyForceOnEntityAngle'&&!validPositions(ige,action.angle,vars)) return null;
  if(action.type==='createProjectileAtPosition'&&(!validPositions(ige,action.angle,vars)||!validPositions(ige,action.position,vars))) {
   if(!validPositions(ige,action.angle,vars,true)||!validPositions(ige,action.position,vars,true)) return null;
   // A teleport can place the caster at its own cursor. Preserve a real shot
   // using its facing direction when those two valid points now coincide.
   const source=(vars.triggeredBy?.unitId?ige.$(vars.triggeredBy.unitId):null)||vars.thisEntity?.getOwnerUnit?.()||vars.thisEntity;
   const facing=Number.isFinite(source?._rotate?.z)?source._rotate.z:0;
   return {...action,angle:repairCoincidentAngles(ige,action.angle,vars,facing),position:repairCoincidentAngles(ige,action.position,vars,facing)};
  }
  const entity=action.entity && ige.variable.getValue(action.entity,vars);
  const custom=entity?._stats?.customUnit;
  if(custom?.id!==snapshot.unit.id) {
   // Item-giving actions identify their actor through `unit`, not `entity`.
   if(action.type!=='giveNewItemToUnit') return action;
   const unit=ige.variable.getValue(action.unit,vars);
   if(unit?._stats?.customUnit?.id!==snapshot.unit.id) return action;
   const native=ige.game.data.unitTypes[unit._stats.customUnit.baseId]?.defaultItems||[];
   const itemId=ige.variable.getValue(action.itemType,vars);
   if(unit._stats.customUnit.rootBaseId==='TtQ4275KLf'&&native.some(x=>x.key===itemId)) return null; // SubLazer's transition already installed the compiled loadout
   return action;
  }
  if(action.type==='changeUnitType') {
   const target=ige.variable.getValue(action.unitType,vars);
   const mapped=compiled.formIds[target]||target;
   if(Object.values(compiled.formIds).includes(mapped)) {
    if(entity._stats.type!==mapped) {
     entity.ability?.stopUsingItem();
     for(const id of [...(entity._stats.itemIds||[])]) if(id) ige.$(id)?.remove();
     entity._stats.itemIds=new Array(ige.game.data.unitTypes[mapped].inventorySize||4);
     entity._stats.currentItemIndex=0;
    }
    return {...action,unitType:mapped};
   }
  }
  // SubLazer's reverse script carries fixed original caps/HP. Apply its form
  // policy only here; other characters' temporary buffs and immunity floors
  // must continue to run unchanged.
  const reverse=custom.rootBaseId==='TtQ4275KLf'&&vars.thisEntity?._stats?.itemTypeId==='geIms9avTb';
  if(reverse&&action.type==='setEntityAttribute'&&action.attribute==='health'&&action.value===200) return null;
  if(reverse&&action.type==='setEntityAttribute'&&action.attribute==='speed'&&action.value===6) return null;
  return action;
 };
}
function repairCoincidentAngles(ige,node,vars,facing) {
 if(!node||typeof node!=='object') return node;
 if(node.function==='angleBetweenPositions') {
  const a=ige.variable.getValue(node.positionA,vars),b=ige.variable.getValue(node.positionB,vars);
  if(a.x===b.x&&a.y===b.y) return facing;
 }
 if(Array.isArray(node)) return node.map(child=>repairCoincidentAngles(ige,child,vars,facing));
 return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,repairCoincidentAngles(ige,value,vars,facing)]));
}
function validPositions(ige,node,vars,allowCoincident=false) {
 if(!node||typeof node!=='object') return true;
 if(node.function==='angleBetweenPositions') {
  const a=ige.variable.getValue(node.positionA,vars),b=ige.variable.getValue(node.positionB,vars);
  if(!a||!b||![a.x,a.y,b.x,b.y].every(Number.isFinite)||(!allowCoincident&&a.x===b.x&&a.y===b.y)) return false;
 }
 return Object.values(node).every(child=>validPositions(ige,child,vars,allowCoincident));
}
function readyScriptSkill(ige,item,unit,player) {
 if(item._stats.isGun||!item.hasQuantityRemaining()||!item.canAffordItemCost()) return false;
 if(Number(item._stats.lastUsed||0)+Number(item._stats.fireRate||0)>=ige.now) return false;
 return scriptPrerequisites(ige,item,unit,player,true);
}
function scriptPrerequisites(ige,item,unit,player,requireScript=false) {
 const vars={thisEntity:item,triggeredBy:{unitId:unit.id(),itemId:item.id(),playerId:player.id()}};
 const scripts=Object.values(item._stats.scripts||{}).filter(script=>
  !script.disabled&&script.actions?.some(x=>!x.disabled&&!/Sound/.test(x.type))&&script.triggers?.some(t=>t.type==='itemIsUsed'||t.type==='unitUsesItem'));
 if(!scripts.length) return !requireScript;
 return scripts.some(script=>{
  if(script.disabled||!script.actions?.length||!script.triggers?.some(t=>t.type==='itemIsUsed'||t.type==='unitUsesItem')) return false;
  if(!ige.condition.run(script.conditions,vars)) return false;
  const action=script.actions.find(x=>!x.disabled&&!/Sound/.test(x.type));
  if(!action) return false;
  return action.type!=='condition'||action.else?.length>0||ige.condition.run(action.conditions,vars);
 });
}
module.exports={installAdapters,readyScriptSkill};
