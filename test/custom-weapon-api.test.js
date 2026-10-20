'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http'),express=require('express');
const {registerCustomRoutes}=require('../server/custom-units/CustomUnitRoutes');
test('weapon API uses the editor capability and blocks deleting a referenced weapon',{timeout:10000},async()=>{
 const tmp=path.resolve(__dirname,'../build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'weapon-api-')),previous=process.env.BATTLEFIGHT_CUSTOM_UNITS;process.env.BATTLEFIGHT_CUSTOM_UNITS=dir;
 const app=express();app.use(express.json());const server={};registerCustomRoutes(app,server);const listener=http.createServer(app);await new Promise(r=>listener.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+listener.address().port;
 try {
  const unitData=await (await fetch(url+'/api/custom-units')).json();
  const request=(route,method,body,token=unitData.token)=>fetch(url+route,{method,headers:{'Content-Type':'application/json','X-Custom-Unit-Token':token},body:JSON.stringify(body)});
  const input={name:'API weapon',pattern:'burst',damage:10,speed:20,range:800,cooldown:500,pellets:5,spread:30,shots:3,interval:100};
  assert.equal((await request('/api/custom-weapons','POST',input,'bad')).status,403);
  const saved=await (await request('/api/custom-weapons','POST',input)).json();assert.ok(saved.weapon,saved.error);
  const catalog=await (await fetch(url+'/api/custom-units')).json();assert.equal(catalog.catalog.length,44);assert.ok(catalog.catalog.every(x=>x.weapons.every(slot=>slot.some(w=>w.id===saved.weapon.id))));
  const base=catalog.catalog[0],unit=await (await request('/api/custom-units','POST',{baseId:base.id,name:'Uses API weapon',...base.defaults,weapons:base.defaults.weapons.map(()=>saved.weapon.id)})).json();assert.ok(unit.unit,unit.error);
  assert.equal((await request('/api/custom-weapons/'+saved.weapon.id,'DELETE',{revision:1})).status,409);
  const revised=await (await request('/api/custom-weapons/'+saved.weapon.id,'PUT',{...saved.weapon,damage:22})).json();assert.equal(revised.weapon.revision,2);
  assert.equal((await request('/api/custom-weapons/'+saved.weapon.id,'PUT',saved.weapon)).status,409);
  const result=await (await fetch(url+'/api/custom-weapons')).json();assert.equal(result.weapons[0].damage,22);
  await request('/api/custom-units/'+unit.unit.id,'DELETE',{revision:1});assert.equal((await request('/api/custom-weapons/'+saved.weapon.id,'DELETE',{revision:2})).status,200);
 }finally{await server.customUnitManager.close();await new Promise(r=>listener.close(r));if(previous===undefined)delete process.env.BATTLEFIGHT_CUSTOM_UNITS;else process.env.BATTLEFIGHT_CUSTOM_UNITS=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
