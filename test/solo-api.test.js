'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http'),express=require('express');
const {registerCustomRoutes}=require('../server/custom-units/CustomUnitRoutes');
test('Solo API has 45 native choices, enforces local capability and owns isolated process',{timeout:45000},async()=>{
 const tmp=path.resolve(__dirname,'../build/solo-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'api-'));
 const previous=process.env.BATTLEFIGHT_CUSTOM_UNITS;process.env.BATTLEFIGHT_CUSTOM_UNITS=dir;
 const app=express();app.use(express.json());const server={};registerCustomRoutes(app,server);
 const listener=http.createServer(app);await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+listener.address().port;
 try {
  const catalog=await(await fetch(origin+'/api/solo')).json();assert.equal(catalog.catalog.length,45);assert.ok(catalog.catalog.some(x=>x.id==='morrowRouteCartographer'));
  const post=(body,token=catalog.token)=>fetch(origin+'/api/solo',{method:'POST',headers:{'Content-Type':'application/json','X-Custom-Unit-Token':token},body:JSON.stringify(body)});
  assert.equal((await fetch(origin+'/api/solo',{headers:{Origin:'https://other.example'}})).status,403);
  assert.equal((await post({characterId:'morrowRouteCartographer'},'wrong')).status,403);
  assert.equal((await post({characterId:'not-playable'})).status,400);
  const response=await post({characterId:'morrowRouteCartographer'});const data=await response.json();assert.equal(data.ok,true,JSON.stringify(data));
  const state=await(await fetch(data.session.url+'/api/demo/status')).json();assert.equal(state.demo.sandbox.mode,'solo');
  const page=await(await fetch(data.session.url+'/')).text();assert.ok(page.includes('id="solo-dummy"'));assert.ok(page.includes('/src/custom-units/SoloTest.js'));
  assert.equal((await fetch(data.session.url+'/src/custom-units/SoloTest.js')).status,200);
  for(const image of ['morrow','marker','atlas-line']){const asset=await fetch(data.session.url+'/assets/morrow/'+image+'.png');assert.equal(asset.status,200);assert.ok(asset.headers.get('content-type').includes('image/png'));}
  assert.equal((await post({characterId:'NNGRxjPsrz'})).status,400,'one sandbox per manager');
  await server.customUnitManager.stop(data.session.id);await assert.rejects(fetch(data.session.url+'/'));
 }finally{await server.customUnitManager.close();await new Promise(resolve=>listener.close(resolve));if(previous===undefined)delete process.env.BATTLEFIGHT_CUSTOM_UNITS;else process.env.BATTLEFIGHT_CUSTOM_UNITS=previous;fs.rmSync(dir,{recursive:true,force:true});}
});
