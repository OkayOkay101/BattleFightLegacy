'use strict';
// Loaded only into the explicitly configured test child process.
process.on('message', async message => {
 if (message?.type !== 'morrow-inspect') return;
 try {
  const deadline=Date.now()+5000;
  while(!Number.isFinite(ige.now) && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,20));
  const source=ige.$$('unit').find(u=>u.getOwner()?._stats.controlledBy==='human');
  const target=ige.$$('unit').find(u=>u.getOwner()?._soloDummy);
  if(!source||!target)throw new Error('Missing Solo actors');
  for(const unit of [source,target]) {unit.stopMoving();unit.setLinearVelocity(0,0);unit._stats.attributes.health.regenerateSpeed=0;if(unit._stats.attributes.armor)unit.attribute.update('armor',0);}
  if(message.worldContact) {
   for(const shot of ige.$$('projectile'))shot.destroy();
   ige.action._clearMorrowMarker(source);
   const map=ige.map.data,tw=ige.scaleMapDetails.tileWidth,th=ige.scaleMapDetails.tileHeight;let position;
   for(let y=2;y<map.height-8&&!position;y++)for(let x=2;x<map.width-8&&!position;x++){
    const p={x:(x+0.5)*tw,y:(y+0.5)*th};
    if([0,50,100,150,200,250,300].every(n=>ige.game._battleBotClearPosition({x:p.x+n,y:p.y},45)) &&
     [0,50,100,150,200,250].every(n=>ige.game._battleBotClearPosition({x:p.x+220,y:p.y+n},45)))position=p;
   }
   if(!position)throw new Error('No clear real-physics test lane');
   source.translateTo(position.x,position.y,0);
   target.translateTo(position.x+(message.banked?220:300),position.y+(message.banked?200:0),0);
   target._stats.attributes.health.max=100;target.attribute.update('health',100);
   await new Promise(resolve=>setTimeout(resolve,250));
   const cursor=message.banked?{x:position.x,y:position.y+1000}:{x:position.x+1000,y:position.y};
   if(message.banked)ige.action.run([{type:'placeMorrowMarker',unit:source,position:{x:position.x+220,y:position.y},itemType:'pTci7A1HLy'}]);
   source.botAimPosition=cursor;Object.assign(source.getOwner().control.input.mouse,cursor);
   const item=source.inventory.getItemBySlotNumber(message.banked?3:1);source.changeItem(message.banked?2:0);item._stats.lastUsed=Number(ige.now)-item._stats.fireRate-1;
   const contacts=[],previousTrace=ige.training.stats.trace;
   ige.training.stats.trace=new Proxy({recordContact(data){if(data.targetPlayerId===target.getOwner().id())contacts.push(data.projectileId);}},{get:(object,key)=>object[key]||function(){}});
   try {
    item.use();const measured=ige.$$('projectile').find(p=>p._stats.sourceUnitId===source.id());const deadline=Date.now()+4500;
    while(target._stats.attributes.health.value===100&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    await new Promise(resolve=>setTimeout(resolve,150));
    process.send({type:'morrow-result',damage:100-target._stats.attributes.health.value,contacts,errors:ige.script.errorLogs,
     shot:measured&&{alive:measured._alive,position:{...measured._translate},redirect:measured._morrowRedirect,source:measured._stats.sourceUnitId},
     source:{...source._translate},target:{...target._translate},marker:ige.$(source._morrowMarkerId)?._translate});return;
   }finally{ige.training.stats.trace=previousTrace;}
  }
  const update=ige.physics.update;ige.physics.update=function(){};
  try {
   for(const shot of ige.$$('projectile'))shot.destroy();
   const cursor={x:source._translate.x+200,y:source._translate.y};
   const markerPosition={x:source._translate.x,y:source._translate.y+180};
   ige.action.run([{type:'placeMorrowMarker',unit:source,position:markerPosition,itemType:'pTci7A1HLy'}]);
   source.botAimPosition=cursor;Object.assign(source.getOwner().control.input.mouse,cursor);
   const slot=message.banked?3:1,item=source.inventory.getItemBySlotNumber(slot);source.changeItem(slot-1);item._stats.lastUsed=Number(ige.now)-item._stats.fireRate-1;item.use();
   const shot=ige.$$('projectile').find(p=>p._stats.sourceUnitId===source.id());
   if(!shot)throw new Error('Morrow did not fire');
   const initial={...shot._stats.defaultData.velocity};
   if(message.banked){
    const marker=ige.$(source._morrowMarkerId);
    ige.trigger._beginContactCallback({m_fixtureA:{m_body:{_entity:shot}},m_fixtureB:{m_body:{_entity:marker}}});
   }
   target._stats.attributes.health.max=100;target.attribute.update('health',100);
   for(let n=0;n<2;n++) {
    const pair=[shot,target];if(Boolean(n)!==Boolean(message.reverse))pair.reverse();
    ige.trigger._beginContactCallback({m_fixtureA:{m_body:{_entity:pair[0]}},m_fixtureB:{m_body:{_entity:pair[1]}}});
   }
   process.send({type:'morrow-result',initial,redirected:shot._morrowRedirect?.redirected,rotation:shot._rotate.z,damage:100-target._stats.attributes.health.value,stats:ige.training.stats.finish(),errors:ige.script.errorLogs});
  }finally{ige.physics.update=update;}
 }catch(error){process.send({type:'morrow-result',error:error.stack});}
});
