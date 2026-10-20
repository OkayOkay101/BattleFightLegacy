'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname,'../src/gameClasses/components/script/ActionComponent.js'),'utf8');
function harness() {
 const entities = new Map(), pending = new Map(); let seq = 0;
 const ige = {isServer:true, $:id=>entities.get(id),
  game:{getAsset:()=>({bodies:{dropped:{}}})}, script:{recordLast50Action(){},errorLog(error){throw error;}},
  variable:{getValue:value=>value}, training:{
   scheduleSandboxAction(callback,delay){const id=++seq;pending.set(id,{callback,delay});return id;},
   cancelSandboxAction(id){pending.delete(id);}
  }};
 function Item(data){this._alive=true;this._stats=data;this._translate=data.defaultData.translate;this.id=()=>String(++seq);const id=this.id();this.id=()=>id;entities.set(id,this);this.remove=()=>{this._alive=false;entities.delete(id);};}
 const context = {IgeEntity:{extend:object=>object},ige,Item,_:{cloneDeep:structuredClone},console,
  setTimeout(callback,delay){const id=++seq;pending.set(id,{callback,delay,unmanaged:true});return id;},clearTimeout:id=>pending.delete(id)};
 vm.createContext(context);vm.runInContext(source,context);
 const action=context.ActionComponent;
 const unit={_stats:{type:'morrowRouteCartographer'},_alive:true,_translate:{x:0,y:0},id:()=> 'owner',getOwner:()=>({id:()=> 'player'})};entities.set('owner',unit);
 const place=(position={x:100,y:0})=>action.run([{type:'placeMorrowMarker',unit,position,itemType:'pTci7A1HLy'}],{});
 const flush=delay=>{for(const [id,task] of [...pending])if(task.delay===delay){pending.delete(id);task.callback();}};
 return {ige,action,unit,entities,pending,place,flush};
}
test('Morrow replaces one marker, expires after 7s and registers timers with sandbox',()=>{
 const h=harness();h.place();const old=h.unit._morrowMarkerId;h.place({x:200,y:0});
 assert.ok(!h.entities.has(old));assert.equal(h.entities.size,2);assert.equal(h.pending.size,1);
 assert.ok([...h.pending.values()].every(task=>!task.unmanaged),'timers must be cancelled by sandbox reset');
 h.flush(7000);assert.equal(h.unit._morrowMarkerId,undefined);assert.equal(h.entities.size,1);
});
test('Atlas warns for 800ms, hits each target once and reset cancels pending hit',()=>{
 const h=harness();h.place();let damage=0;
 const target={id:()=> 'victim',inflictDamage:data=>{damage+=data.unitAttributes.health;}};
 h.action._morrowLine=()=>({end:{x:100,y:0},units:[target,target,h.unit]});
 h.action._createMorrowTelegraph(h.unit,null,{x:0,y:0},{x:100,y:0},h.unit._morrowMarkerId);
 assert.equal(damage,0);assert.ok([...h.pending.values()].filter(x=>x.delay===800).every(x=>!x.unmanaged));
 const beam=[...h.entities.values()].find(x=>x._morrowTelegraphOwnerId);
 assert.equal(beam._stats.bodies.dropped.height,192,'transparent texture should display a constant ~24px attack strip');
 assert.equal(beam._stats.scaleDimensions,true,'client must retain dynamic dimensions after merging native asset bodies');
 assert.equal(beam._stats.width,100);assert.equal(beam._stats.height,192);
 h.flush(800);assert.equal(damage,30);assert.equal(beam._alive,false);
 h.action._createMorrowTelegraph(h.unit,null,{x:0,y:0},{x:100,y:0},h.unit._morrowMarkerId);
 h.pending.clear();h.flush(800);assert.equal(damage,30);
});
test('Atlas raycast clips to nearest wall and retains earliest hit across rays',()=>{
 const h=harness();
 const unit=id=>({_category:'unit',_alive:true,_stats:{attributes:{health:{value:100}}},id:()=>id});
 const before=unit('before'),behind=unit('behind');let ray=0;
 h.ige.physics={scaleRatio:()=>1,world:()=>({rayCast(callback){
  callback({m_body:{_entity:before}},null,null,ray++===0?0.3:0.7);
  callback({m_body:{_entity:behind}},null,null,0.8);
  callback({m_body:{_entity:{_category:'wall'}}},null,null,0.5);
 }})};
 const result=h.action._morrowLine({x:0,y:0},{x:100,y:0});
 assert.equal(result.end.x,50);assert.equal(result.units.length,1);assert.equal(result.units[0].id(),'before');
});
test('Atlas raycast uses the Planck argument order (point1, point2, callback)',()=>{
 const h=harness();
 const target={_category:'unit',_alive:true,_stats:{attributes:{health:{value:100}}},id:()=>'target'};
 const calls=[];
 h.ige.physics={engine:'PLANCK',scaleRatio:()=>1,world:()=>({rayCast(point1,point2,callback){
  calls.push([point1,point2]);
  assert.equal(typeof callback,'function','Planck expects the callback last');
  callback({getBody:()=>({_entity:target})},null,null,0.4);
 }})};
 const result=h.action._morrowLine({x:0,y:0},{x:100,y:0});
 assert.equal(calls.length,3);assert.equal(calls[1][0].x,0);assert.equal(calls[1][1].x,100);
 assert.equal(result.units.length,1);assert.equal(result.units[0].id(),'target');
});
