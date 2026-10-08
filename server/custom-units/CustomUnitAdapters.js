'use strict';
// This catalog intentionally has no dependency on the production training roster.
const DIALOGUES = ['WGLrmBwn2T','k96sFK3LHq','7pfCK59OBW','D2HqGt1xhx','MQOk6ssi3h','cH7x5cF5DS','nd4Fd6NfCQ'];
const GENERIC_WEAPONS = ['YCEF0g5Q66','HxgjN3vbXs'];
const LEGACY = new Set(['NNGRxjPsrz','8FyWfzucqo','Q2Vd00dRsL','JZaENvn4qJ']);
// Stateless slots audited separately from slots which drive a character state
// machine. New prototypes default to native equipment until explicitly audited.
const GENERIC_SLOTS = {
 r3dZTAf1qa:[0,1,2,3], hlnCxD3Epn:[0,1,2,3], Pko4SCDSlz:[0],
 FjUdcgVSGQ:[0], eb0RxBDTuv:[0], aclAiyngYW:[0], o6f85pYRKj:[0],
 mgyCFapknQ:[0], qS7NVAn6gx:[0], sGtAaKmGj0:[0], gRgjiOzm8T:[0],
 H6K6gpqlPE:[0], '2GjTUKR9Bz':[0], McZTj7oVZ1:[0], BUcKqXTF16:[0]
};
const PROFILES = {
 r3dZTAf1qa:{role:'control',range:430,slots:[1,0,2,3]},
 hlnCxD3Epn:{role:'zone',range:330,slots:[1,0,2,3]},
 Pko4SCDSlz:{role:'melee',range:100,slots:[0,1,2,3]},
 Z60xDr0g4n:{role:'support',range:380,slots:[1,0,2,3]},
 TRneecJl6K:{role:'ranged',range:500,slots:[0,1,2,3]},
 AuD3DjTn9B:{role:'melee',range:120,slots:[0,1,2,3]}
};
function visit(value, callback) {
 if(!value || typeof value!=='object' || value.disabled===true) return;
 callback(value);
 for(const child of Object.values(value)) visit(child,callback);
}
function playableIds(game) {
 const ids=new Set();
 for(const dialogueId of DIALOGUES) for(const option of game.dialogues[dialogueId]?.options||[]) {
  visit(game.scripts[option.scriptName],node=>{
   if(node.type==='createUnitAtPosition' && typeof node.unitType==='string' && node.unitType!=='sarLaTkdF2') ids.add(node.unitType);
  });
 }
 return [...ids];
}
function dependencies(game,baseId) {
 const seen=new Set(), queue=[['unitTypes',baseId]], result={unitTypes:[],itemTypes:[],projectileTypes:[],scripts:[]};
 while(queue.length) {
  const [group,id]=queue.shift(), key=group+':'+id;
  if(seen.has(key)||!game[group]?.[id]) continue;
  seen.add(key);result[group].push(id);
  visit(game[group][id],node=>{
   for(const value of Object.values(node)) if(typeof value==='string') {
    // Only executable asset references, not variable metadata or comparison
    // literals, expand the dependency graph.
    for(const [field,target] of [['itemType','itemTypes'],['projectileType','projectileTypes'],['scriptName','scripts'],['unitType','unitTypes']]) {
     if(node[field]===value && (field!=='unitType'||['createUnitAtPosition','changeUnitType'].includes(node.type))) queue.push([target,value]);
    }
   }
  });
  if(group==='unitTypes') for(const item of game.unitTypes[id].defaultItems||[]) queue.push(['itemTypes',item.key]);
  if(group==='itemTypes' && game.itemTypes[id].bulletType) queue.push(['projectileTypes',game.itemTypes[id].bulletType]);
 }
 return result;
}
function adapter(game,id) {
 const unit=game.unitTypes[id];
 const extraResources=Object.keys(unit.attributes||{}).filter(x=>!['health','speed'].includes(x));
 const nativeItems=(unit.defaultItems||[]).map(x=>x.key);
 const ranged=nativeItems.some(x=>game.itemTypes[x]?.isGun&&Number(game.itemTypes[x].bulletForce)>18);
 const profile={id,name:unit.name,role:ranged?'ranged':'melee',range:ranged?400:120,slots:nativeItems.map((_,i)=>i).slice(0,4),...PROFILES[id]};
 const graph=dependencies(game,id);
 const transforms=new Set([id]);
 for(const source of graph.unitTypes) visit(game.unitTypes[source].scripts,node=>{
  if(node.type==='changeUnitType'&&typeof node.unitType==='string') transforms.add(node.unitType);
 });
 for(const source of graph.itemTypes) visit(game.itemTypes[source].scripts,node=>{
  if(node.type==='changeUnitType'&&typeof node.unitType==='string') transforms.add(node.unitType);
 });
 const generic=LEGACY.has(id)?nativeItems.map((_,i)=>i):GENERIC_SLOTS[id]||[];
 return {id,profile,graph,forms:[...transforms],resources:extraResources,
  genericSlots:generic,stationaryItems:id==='p2VWFdjcM3'?['DUmSmPBSsI']:[],
  hints:[...(extraResources.length?['custom.hintResources']:[]),...(transforms.size>1?['custom.hintForms']:[]),
   ...(graph.unitTypes.length>transforms.size?['custom.hintSummons']:[]),...(id==='p2VWFdjcM3'?['custom.hintStationary']:[]),
   ...(id==='1yCQJedPRM'?['custom.hintTenkai']:[])]};
}
module.exports={playableIds,adapter,visit,GENERIC_WEAPONS};
