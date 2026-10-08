'use strict';
require('module')._initPaths();
process.env.ENV = 'standalone';
process.env.BATTLEFIGHT_DESKTOP = '1';
let stopping = false;
let previousEffect, createdCounts, particleCount=0;
function shutdown() {
 if (stopping) return;
 stopping = true;
 const deadline = setTimeout(() => process.exit(0), 2500);
 Promise.resolve(global.ige?.server?.shutdown?.()).finally(() => { clearTimeout(deadline); process.exit(0); });
}
process.on('message', message => {
 if (message?.type === 'battlefight-shutdown') shutdown();
 if (process.env.BATTLEFIGHT_SANDBOX_TEST === '1' && message?.type === 'inspect-sandbox') {
  if(!createdCounts) {
   createdCounts={unit:0,projectile:0};const created=ige.script.entityCreated;
   ige.script.entityCreated=function(entity){if(Object.hasOwn(createdCounts,entity._category)) createdCounts[entity._category]++;return created.apply(this,arguments);};
   const send=ige.network.send;ige.network.send=function(name,data){if(name==='particle') particleCount++;return send.apply(this,arguments);};
  }
  if (message.join) {
   const player = ige.game.createPlayer({ name:'Test human', controlledBy:'human', playerTypeId:'NZRmXbrEjA', unitIds:[] });
   ige.training.joinHuman(player);
  }
  const units = global.ige?.$$('unit').filter(unit => unit._stats?.type !== 'hLrbyj6dKv') || [];
  const custom = units.find(unit => unit._stats.customUnit?.id === ige.training.snapshot.unit.id);
  if(message.relocate) ige.$(message.relocate.id)?.translateTo(message.relocate.position.x,message.relocate.position.y,0);
  if(custom&&message.buff) ige.action.run([
   {type:'setEntityAttributeMax',attribute:'speed',entity:{function:'thisEntity'},value:message.buff.speedMax},
   {type:'setEntityAttribute',attribute:'speed',entity:{function:'thisEntity'},value:message.buff.speed},
   {type:'setEntityAttributeMin',attribute:'health',entity:{function:'thisEntity'},value:message.buff.healthMin||0},
   {type:'setEntityAttributeRegenerationRate',attribute:'speed',entity:{function:'thisEntity'},value:message.buff.regenerateSpeed}
  ],{thisEntity:custom});
  if(custom && message.transform) {
   custom.attribute.update('health',message.health||7);
   ige.action.run([{type:'changeUnitType',entity:{function:'thisEntity'},unitType:message.transform}],{thisEntity:custom});
  }
  if (message.freeze || message.freezeRed) for (const unit of units.filter(x=>!message.freezeRed||x.getOwner()?._stats.trainingTeamId==='red')) {
   unit.removeBehaviour('battleBotBrain'); unit.ability.stopUsingItem();
   unit.ability.stopMovingX(); unit.ability.stopMovingY();
  }
  let effectBefore;
  const effects=()=>({units:ige.$$('unit').map(x=>x.id()),projectiles:ige.$$('projectile').map(x=>x.id()),
   attributes:custom&&Object.fromEntries(Object.entries(custom._stats.attributes).map(([key,value])=>[key,value.value])),
   variables:custom&&Object.fromEntries(Object.entries(custom.variables||{}).filter(([key,v])=>!/voiceline/i.test(key)&&['number','string','boolean'].includes(v?.dataType)).map(([key,v])=>[key,v.value??v.default])),
   items:custom?._stats.itemIds,position:custom&&{x:custom._translate.x,y:custom._translate.y},state:custom?._stats.stateId,
   created:{...createdCounts},particles:particleCount});
  if(custom && message.move) {
   const directions=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
   const direction=directions.find(d=>ige.game._battleBotClearPosition({x:custom._translate.x+d.x*60,y:custom._translate.y+d.y*60},35))||directions[0];
   custom.direction=direction;custom.movementAngle=Math.atan2(direction.y,direction.x);custom.startMoving();
  }
  if(message.cursor && custom) {custom.botAimPosition=message.cursor;Object.assign(custom.getOwner().control.input.mouse,message.cursor);}
  if (custom && message.exercise) {
   for (const attribute of Object.keys(custom._stats.attributes)) if (!['health','speed'].includes(attribute)) custom.attribute.update(attribute, custom._stats.attributes[attribute].max);
   if(message.variables) for(const [key,value] of Object.entries(message.variables)) if(custom.variables?.[key]) custom.variables[key].value=value;
   custom.botAimPosition = message.cursor||{x:custom._translate.x+120,y:custom._translate.y};
   Object.assign(custom.getOwner().control.input.mouse, custom.botAimPosition);
   const item = custom.inventory.getItemBySlotNumber(message.exercise);
   custom.changeItem(message.exercise-1); item._stats.lastUsed = 0;
   effectBefore=JSON.parse(JSON.stringify(effects()));previousEffect=effectBefore; item.use();
  }
  if (message.damage) {
   const victim = units.find(unit => unit.getOwner()?._stats.trainingTeamId === 'red');
   const source=message.damageFrom?ige.$(message.damageFrom):custom;
   if (victim && source) victim.inflictDamage({sourcePlayerId:source.getOwner().id(),sourceUnitId:source.id(),
    sourceItemId:source.getCurrentItem()?.id(),unitAttributes:{health:message.damage}});
  }
  if (message.duel && units.length >= 2) {
   const blue = units.find(unit => unit.getOwner()?._stats.trainingTeamId === 'blue');
   const red = units.find(unit => unit.getOwner()?._stats.trainingTeamId === 'red');
   if (blue && red) {
    let placed=false;
    for (const distance of [110,150,180,220,260,320]) for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
     if(placed) continue;
     const target = { x: blue._translate.x + Math.cos(angle)*distance, y: blue._translate.y+Math.sin(angle)*distance };
     if (ige.game._battleBotClearPosition(target, 20) && blue.ai.battleBotHasLineOfSight(ige.map.data, 1, 1, ige.scaleMapDetails.tileWidth, blue._translate, target)) {
      red.translateTo(target.x, target.y, 0); placed=true;
     }
    }
   }
  }
  if (message.kill) { const unit = units.find(unit => unit._stats.type === message.kill); if (unit) unit.attribute.update('health', 0); }
  process.send?.({ type: 'sandbox-inspection', units: ige.$$('unit').map(unit => ({ id: unit.id(), type: unit._stats.type,
   health: unit._stats.attributes.health.value, healthMax: unit._stats.attributes.health.max,healthMin:unit._stats.attributes.health.min,
   custom:unit._stats.customUnit,owner:unit.getOwner()?.id(),
   speed: unit._stats.attributes.speed?.value, speedMax: unit._stats.attributes.speed?.max,
   target:unit.ai?.targetUnitId, attributes: Object.fromEntries(Object.entries(unit._stats.attributes).map(([key,value])=>[key,value.value])),
   items: (unit._stats.itemIds || []).filter(Boolean).map(id => {const item=ige.$(id);return item && {type:item._stats.itemTypeId,lastUsed:item._stats.lastUsed};}).filter(Boolean),
   position: { x: unit._translate.x, y: unit._translate.y } })),
   effects:effectBefore||message.effectResult?{before:effectBefore||previousEffect,after:effects()}:null,
   errors:global.ige?.script.errorLogs,
   projectiles: global.ige?.$$('projectile').length || 0, stats: global.ige?.training?.status(),
   timerTick:global.ige?.timer.lastTick,
   characterStats:global.ige?.training.stats.finish().characters,
   weaponStats:global.ige?.training.stats.finish().weapons,
   gameState: global.ige?.variable.getVariable('Current Game State') });
 }
});
process.on('disconnect', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', error => { process.send?.({ type: 'battlefight-error', message: error.stack }); shutdown(); });
process.on('unhandledRejection', error => { process.send?.({ type: 'battlefight-error', message: String(error?.stack || error) }); shutdown(); });
require('../ige');
