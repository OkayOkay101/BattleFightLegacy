'use strict';
// Test process preload; never bundled or loaded by normal gameplay.
process.on('message', async message => {
 if (message?.type !== 'weapon-inspect') return;
 try {
  // Sandbox readiness precedes the first engine frame under CPU load.
  // Native Item.use compares against ige.now, so a callback-only native
  // test must wait for the real clock rather than fire with undefined now.
  if(message.waitForClock){const deadline=Date.now()+5000;while((!Number.isFinite(ige.now)||!ige._currentTime)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));if(!Number.isFinite(ige.now)||!ige._currentTime)throw new Error('Engine clock did not initialize before native contact test');}
  if(message.join) {const player=ige.game.createPlayer({name:'Weapon human',controlledBy:'human',playerTypeId:'NZRmXbrEjA',unitIds:[]});ige.training.joinHuman(player);}
  const units = ige.$$('unit'), custom = units.find(x => x._stats.customUnit), target = units.find(x => x.getOwner()?._stats.trainingTeamId==='red' && x.getOwner().getSelectedUnit()===x);
  for (const unit of units) { unit.removeBehaviour('battleBotBrain'); unit.ability.stopUsingItem(); unit.stopMoving(); unit.setLinearVelocity(0,0); }
  // Exclude autonomous shots accepted before readiness from this measured use.
  ige.training.cancelCustomBursts?.();for(const shot of ige.$$('projectile'))shot.destroy();
  if (!custom || !target) throw new Error('Missing arena actors');
  if(message.nativeStun) {
   const data=JSON.parse(JSON.stringify(ige.game.data.projectileTypes.yU49zzueBU));
   // Isolate the native contact skill from its unrelated entityCreated sweep.
   data.scripts={tT3e6jbonY:data.scripts.tT3e6jbonY};
   Object.assign(data,{type:'yU49zzueBU',sourceUnitId:custom.id(),sourcePlayerId:custom.getOwner().id(),damageData:{},defaultData:{translate:{...custom._translate},velocity:{x:0,y:0},rotate:0}});
   const shot=new Projectile(data);
   ige.trigger._beginContactCallback({m_fixtureA:{m_body:{_entity:target}},m_fixtureB:{m_body:{_entity:shot}}});
   process.send({type:'weapon-result',targetStunned:target._stats.isStunned,ownerStunned:custom._stats.isStunned||false,lastTouched:ige.game.lastTouchedUnitId,targetId:target.id()});return;
  }
  for (const unit of [custom,target]) { if(unit._stats.attributes.armor) unit.attribute.update('armor',0); unit._stats.attributes.health.regenerateSpeed=0; }
  if(message.raiseTarget) {target._stats.attributes.health.max=100000;target.attribute.update('health',100000);}
  if(message.targetHealth!==undefined)target.attribute.update('health',message.targetHealth);
  if(message.worldContact){
   // Let Box2D generate contacts, with no synthetic fixture or direct fire.
   const map=ige.map.data,tw=ige.scaleMapDetails.tileWidth,th=ige.scaleMapDetails.tileHeight;
   let position;for(let y=2;y<map.height-2&&!position;y++)for(let x=2;x<map.width-6&&!position;x++){const p={x:(x+0.5)*tw,y:(y+0.5)*th};if(Array.from({length:7},(_,n)=>({x:p.x+n*50,y:p.y})).every(q=>ige.game._battleBotClearPosition(q,45)))position=p;}
   if(!position)throw new Error('No clear physics contact test lane');
   custom.translateTo(position.x,position.y,0);target.translateTo(position.x+300,position.y,0);
   target.attribute.update('health',100);const before=target._stats.attributes.health.value,contacts=[];
   const oldTrace=ige.training.stats.trace;
   // Observe the engine's existing listener; registering a second listener
   // could itself repeat contacts or be replaced by startup initialization.
   ige.training.stats.trace=new Proxy({recordContact(data){if(data.targetPlayerId===target.getOwner().id())contacts.push(data.projectileId);}},{get(object,key){return object[key]||function(){};}});
   try{
    await new Promise(resolve=>setTimeout(resolve,250));const item=custom.getCurrentItem();item._stats.lastUsed=Number(ige.now||0)-item._stats.fireRate-1;custom.botAimPosition={x:target._translate.x,y:target._translate.y};item.use();
    const expected=message.expectedDamage??10*({single:1,spread:5,burst:3}[item._stats.customWeapon.pattern]),deadline=Date.now()+4000;
    while(before-target._stats.attributes.health.value<expected&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    await new Promise(resolve=>setTimeout(resolve,150));
    process.send({type:'weapon-result',before,after:target._stats.attributes.health.value,contacts,errors:ige.script.errorLogs});return;
   }finally{ige.training.stats.trace=oldTrace;}
  }
  const calls=[];const original=ige.script.triggerEntity;
  ige.script.triggerEntity=function(entity,event,by) { if(entity?._category==='projectile' && event==='entityTouchesUnit') calls.push({projectile:entity.id(),target:by.unitId,context:ige.game.currentProjectileId}); return original.apply(this,arguments); };
  const beforeIds=new Set(ige.$$('projectile').map(x=>x.id())), before=target._stats.attributes.health.value;
  // The matrix injects measured contacts below. Keep walls/spawn geometry
  // from consuming the first burst pellet during its timed firing interval.
  // Readiness can arrive before physics.start(). Inhibit the update call
  // itself so a later startup cannot resume physics during this fixture.
  const physicsUpdate=message.pausePhysics&&ige.physics.update;
  if(physicsUpdate)ige.physics.update=function(){};
  const destroyed=[],destroyProjectile=Projectile.prototype.destroy;
  Projectile.prototype.destroy=function(){destroyed.push({id:this.id(),type:this._stats.type,custom:!!this._stats.customWeapon,stack:new Error('Projectile destroyed').stack});return destroyProjectile.apply(this,arguments);};
  try {
   const item=custom.inventory.getItemBySlotNumber(message.slot||1); custom.changeItem((message.slot||1)-1);item._stats.lastUsed=Number(ige.now||0)-Number(item._stats.fireRate||0)-1;
   custom.botAimPosition={x:custom._translate.x+150,y:custom._translate.y}; Object.assign(custom.getOwner().control.input.mouse,custom.botAimPosition); item.use();
   if(message.wait) await new Promise(resolve=>setTimeout(resolve,message.wait));
   // Loaded test runs may delay Node timers beyond the requested wall time.
   // Await the accepted burst, while keeping its real runtime cancellation.
   const burstDeadline=Date.now()+2000;
   while(message.wait&&ige.training.customBurstActive?.(item)&&Date.now()<burstDeadline)await new Promise(resolve=>setTimeout(resolve,10));
   if(message.wait&&ige.training.customBurstActive?.(item))throw new Error('Burst did not finish before test deadline');
   const created=ige.$$('projectile').filter(x=>!beforeIds.has(x.id()));
   // Character passives (e.g. Rhythm Assassin) may also create native shots.
   // Measure the selected custom weapon separately without disabling passives.
   const projectiles=item._stats.customWeapon?created.filter(x=>x._stats.customWeapon):created;
   if (!projectiles.length) throw new Error('Weapon did not create a projectile');
   const shooterId=custom.getOwner().id(),victimId=target.getOwner().id();
   const statsBefore=JSON.parse(JSON.stringify(ige.training.stats.finish()));
   let friendlySafe=true;
   if(message.probeFriendly){const owner=custom.getOwner(),friendly=owner.isFriendlyTo;owner.isFriendlyTo=()=>true;try{for(const shot of projectiles){ige.trigger._beginContactCallback({m_fixtureA:{m_body:{_entity:target}},m_fixtureB:{m_body:{_entity:shot}}});ige.trigger._beginContactCallback({m_fixtureA:{m_body:{_entity:custom}},m_fixtureB:{m_body:{_entity:shot}}});}friendlySafe=target._stats.attributes.health.value===before&&projectiles.every(shot=>shot._alive!==false&&!shot._customImpactConsumed);}finally{owner.isFriendlyTo=friendly;}}
   const shooterUnitId=custom.id();
   if(message.killShooter){
    // SubLazer intentionally retains its native health minimum of 1.
    // Exercise the engine lifecycle explicitly for that prototype rather
    // than treating a clamped-to-1 actor as a completed death/respawn.
    if(custom._stats.attributes.health.min>0){custom._stats.attributes.health.value=0;ige.game.handleBattleBotDeath(custom,{});}
    else custom.attribute.update('health',0);
   }
   const survivedShooterDeath=projectiles.every(shot=>shot._alive!==false);
   for(const shot of projectiles) {
    const pair=[target,shot];if(message.reverse) pair.reverse();
    ige.trigger._beginContactCallback({m_fixtureA:{m_body:{_entity:pair[0]}},m_fixtureB:{m_body:{_entity:pair[1]}}});
    if(message.repeatContact) ige.trigger._beginContactCallback({m_fixtureA:{m_body:{_entity:pair[1]}},m_fixtureB:{m_body:{_entity:pair[0]}}});
   }
   const after=target._stats.attributes.health.value;
   if(message.waitRespawn)await new Promise(resolve=>setTimeout(resolve,message.waitRespawn));
   const respawn=ige.$(shooterId).getSelectedUnit();
   if(message.killShooter&&message.waitRespawn&&(!respawn||respawn.id()===shooterUnitId))throw new Error('Shooter did not start a new life after death');
   process.send({type:'weapon-result',targetId:target.id(),before,after,calls,projectiles:projectiles.map(x=>({id:x.id(),type:x._stats.type})),nativeProjectiles:created.filter(x=>!x._stats.customWeapon).map(x=>x._stats.type),destroyed,errors:ige.script.errorLogs,shooterId,victimId,survivedShooterDeath,friendlySafe,statsBefore,stats:ige.training.stats.finish(),feed:ige.game.killFeed.recent(),respawn:respawn?{id:respawn.id(),type:respawn._stats.type,weapons:respawn._stats.itemIds.map(id=>ige.$(id)?._stats.itemTypeId).filter(Boolean)}:null});
  } finally {Projectile.prototype.destroy=destroyProjectile;ige.script.triggerEntity=original;if(physicsUpdate)ige.physics.update=physicsUpdate;}
 } catch(error) {process.send({type:'weapon-result',error:error.stack});}
});
