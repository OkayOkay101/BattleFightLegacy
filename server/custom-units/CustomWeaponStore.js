'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ID = /^cw-[a-f0-9]{32}$/;
const DEFAULTS = { name:'Custom Weapon', pattern:'single', damage:10, speed:20, range:800, cooldown:500, pellets:5, spread:30, shots:3, interval:100 };
function fail(message,status=400) {const error=new Error(message);error.status=status;throw error;}
function validateWeapon(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)) fail('Invalid weapon data');
 if(typeof value.name!=='string'||!value.name.trim()||value.name.trim().length>80) fail('Name must contain 1–80 characters');
 if(!['single','spread','burst'].includes(value.pattern)) fail('Unknown firing pattern');
 const limits={damage:[0,100000],speed:[1,200],range:[50,5000],cooldown:[100,10000],pellets:[1,9],spread:[0,120],shots:[1,5],interval:[50,500]};
 const result={name:value.name.trim(),pattern:value.pattern};
 for(const [key,[min,max]] of Object.entries(limits)) {
  const n=value[key];if(!Number.isFinite(n)||n<min||n>max||(['pellets','shots','cooldown','interval'].includes(key)&&!Number.isInteger(n))) fail(`Invalid ${key}: expected ${min}–${max}`);
  result[key]=n;
 }
 if(result.pattern==='burst' && result.cooldown<(result.shots-1)*result.interval+100) fail('Cooldown must exceed the last burst shot by at least 100 ms');
 return result;
}
function validRecord(value) {
 if(!value||!ID.test(value.id)||value.schemaVersion!==1||!Number.isInteger(value.revision)||value.revision<1) fail('Invalid custom weapon record');
 validateWeapon(value);return value;
}
class CustomWeaponStore {
 constructor(unitDirectory) {this.unitDirectory=path.resolve(unitDirectory);this.directory=path.join(this.unitDirectory,'weapons');}
 file(id) {if(!ID.test(id)) fail('Invalid custom weapon ID');return path.join(this.directory,id+'.json');}
 get(id) {
  const file=this.file(id);if(!fs.existsSync(file)) fail(`Custom weapon not found: ${id}`,404);
  try {if(fs.statSync(file).size>16384) throw new Error('oversized');const value=validRecord(JSON.parse(fs.readFileSync(file,'utf8')));if(value.id!==id) throw new Error('ID mismatch');return value;}
  catch(_) {fail(`Saved custom weapon is corrupt: ${id}`,422);}
 }
 list() {
  const weapons=[],errors=[];if(fs.existsSync(this.directory)) for(const file of fs.readdirSync(this.directory).sort()) {
   if(!file.endsWith('.json')||!ID.test(file.slice(0,-5))) continue;
   try {weapons.push(this.get(file.slice(0,-5)));}catch(error){errors.push({file,error:error.message});}
  }
  return {weapons,errors};
 }
 recordsFor(ids) {return [...new Set(ids.filter(id=>typeof id==='string'&&id.startsWith('cw-')))].map(id=>this.get(id));}
 save(value) {
  const data=validateWeapon(value),old=value.id?this.get(value.id):null;
  if(old&&value.revision!==old.revision) fail('Revision conflict: reload this weapon before saving',409);
  const result={schemaVersion:1,id:old?.id||'cw-'+crypto.randomBytes(16).toString('hex'),revision:(old?.revision||0)+1,...data,updatedAt:new Date().toISOString()};
  fs.mkdirSync(this.directory,{recursive:true});const target=this.file(result.id),temp=target+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try {fs.writeFileSync(temp,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});fs.renameSync(temp,target);}finally{if(fs.existsSync(temp)) fs.unlinkSync(temp);}
  return result;
 }
 remove(id,revision) {
  const value=this.get(id);if(value.revision!==revision) fail('Revision conflict: reload this weapon before deleting',409);
  for(const file of fs.readdirSync(this.unitDirectory)) {
   if(!/^cu-[a-f0-9]{32}\.json$/.test(file)) continue;
   let unit;try{unit=JSON.parse(fs.readFileSync(path.join(this.unitDirectory,file),'utf8'));if(!Array.isArray(unit.weapons)) throw new Error('Invalid unit');}
   catch(_){fail(`Cannot check weapon references: saved unit is corrupt: ${file}`,422);}
   if(unit.weapons.includes(id)) fail(`Weapon is referenced by custom unit: ${unit.name||unit.id}`,409);
  }
  fs.unlinkSync(this.file(id));
 }
}
// Reuse only local visual/body data. Native scripts, variables and resource
// costs are deliberately absent from these server-authoritative definitions.
function compileWeapons(game,records) {
 const itemTypes={},projectileTypes={};
 for(const saved of records) {
  validRecord(saved);if(itemTypes[saved.id]) fail('Duplicate weapon in snapshot');
  const clone=x=>JSON.parse(JSON.stringify(x)),item=clone(game.itemTypes.YCEF0g5Q66),projectile=clone(game.projectileTypes.dtdglQIhUa);
  Object.assign(item,{name:saved.name,scripts:{},variables:{},attributes:{},cost:{},carriedBy:[],canBeUsedBy:[],quantity:null,
   damage:{unitAttributes:{health:saved.damage},targetsAffected:['hostile']},bonus:{},type:'weapon',isGun:true,
   projectileType:saved.id+'-projectile',projectileStreamMode:1,bulletType:'projectile',bulletForce:saved.speed,
   bulletDistance:saved.range,fireRate:saved.cooldown,customWeapon:clone(saved)});
  Object.assign(projectile,{name:saved.name,scripts:{},variables:{},attributes:{},customWeapon:{id:saved.id,range:saved.range},
   lifeSpan:600000,destroyOnContactWith:{units:true,walls:true,items:false,debris:false}});
  for(const body of Object.values(projectile.bodies||{})) {body.linearDamping=0;body.constantSpeed=true;body.bullet=true;body.collidesWith={...body.collidesWith,units:true,walls:true};}
  itemTypes[saved.id]=item;projectileTypes[item.projectileType]=projectile;
 }
 return {itemTypes,projectileTypes};
}
module.exports={CustomWeaponStore,validateWeapon,validRecord,compileWeapons,DEFAULTS,ID};
