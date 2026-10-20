'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),path=require('path');
function client(custom=true){
 const context={module:{exports:{}},ige:{isClient:true},window:{isCustomSandbox:true},IgeEntityPhysics:{extend:definition=>definition},IgeEntity:{prototype:{streamUpdateData(updates){for(const data of updates)for(const [field,values] of Object.entries(data))if(field==='attributesMax'||field==='attributes')for(const [id,value]of Object.entries(values))this._stats.attributes[id][field==='attributesMax'?'max':'value']=value;}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/gameClasses/Unit.js'),'utf8'),context);
 const unit={_stats:{type:'cu-root',customUnit:custom?{id:'cu-root'}:null,attributes:{speed:{value:18,max:19}}},changeUnitType(type){this._stats.type=type;this._stats.attributes.speed={value:14,max:14};}};
 unit.streamUpdateData=context.module.exports.streamUpdateData;return unit;
}
test('custom client form processes a type before subsequent retained caps and values',()=>{
 for(const updates of [[{type:'cu-form'},{attributesMax:{speed:19}},{attributes:{speed:18}}],[{type:'cu-form',attributesMax:{speed:19},attributes:{speed:18}}]]){
  const unit=client();unit.streamUpdateData(updates);assert.equal(unit._stats.type,'cu-form');assert.equal(unit._stats.attributes.speed.max,19);assert.equal(unit._stats.attributes.speed.value,18);
 }
});
test('original client units retain their existing batch path',()=>{
 const unit=client(false);unit.streamUpdateData([{type:'native-form'},{attributesMax:{speed:19}},{attributes:{speed:18}}]);assert.equal(unit._stats.attributes.speed.max,14);
});
