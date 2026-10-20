'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {CustomUnitStore}=require('../server/custom-units/CustomUnitStore'),{SandboxManager}=require('../server/custom-units/SandboxManager');
const root=path.resolve(__dirname,'..'),game=JSON.parse(fs.readFileSync(path.join(root,'src/game.json'))).data;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('actual Electron client receives custom SubLazer form identity, active caps and retained values', {timeout:70000},async t=>{
 const temp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(temp,{recursive:true});const dir=fs.mkdtempSync(path.join(temp,'form-client-'));
 const store=new CustomUnitStore(dir,game),saved=store.save({baseId:'TtQ4275KLf',name:'Form client',health:432,speed:14,weapons:game.unitTypes.TtQ4275KLf.defaultItems.map(x=>x.key)});
 const manager=new SandboxManager({root,directory:dir,game,store,testMode:true});let child;
 const inspect=extra=>new Promise((resolve,reject)=>{const server=manager.active.child;const timer=setTimeout(()=>{server.removeListener('message',on);reject(new Error('Inspection timeout'));},6000);function on(x){if(x.type==='sandbox-inspection'){clearTimeout(timer);server.removeListener('message',on);resolve(x);}}server.on('message',on);server.send({type:'inspect-sandbox',...extra});});
 const file=path.join(dir,'client.json');
 const wait=async predicate=>{let last;for(let n=0;n<65;n++){if(fs.existsSync(file)){const state=JSON.parse(fs.readFileSync(file));last=state;if(state.error)throw new Error(state.error);if(predicate(state))return state;}await delay(400);}throw new Error('Electron client state timeout: '+JSON.stringify(last));};
 try{
  const session=await manager.start({id:saved.id,controller:'human',opponent:'TtQ4275KLf'});
  fs.writeFileSync(path.join(dir,'main.js'),`
const {app,BrowserWindow}=require('electron'),fs=require('fs');app.setPath('userData',${JSON.stringify(path.join(dir,'user-data'))});
let window;app.whenReady().then(()=>{window=new BrowserWindow({width:1000,height:750,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
window.webContents.session.webRequest.onBeforeRequest((request,done)=>{let allowed=false;try{allowed=new URL(request.url).hostname==='127.0.0.1';}catch(_){}done({cancel:!allowed});});
window.loadURL(${JSON.stringify(session.url+'/#custom-session='+session.token)});
const timer=setInterval(async()=>{try{const state=await window.webContents.executeJavaScript(
"(()=>{if(!window.ige||!ige.pixi||ige.pixi.loader.progress!==100||!ige.client?.server)return null;if(!window.__joined){window.__joined=true;window.trainingDemoMode='fight';document.getElementById('play-game-button').click();return null;}const u=ige.client.myPlayer?.getSelectedUnit();if(!u)return null;return {type:u._stats.type,hp:u._stats.attributes.health.value,hpMax:u._stats.attributes.health.max,speed:u._stats.attributes.speed.value,speedMax:u._stats.attributes.speed.max,sprite:!!u._pixiTexture?.texture?.valid};})()");
if(state)fs.writeFileSync(${JSON.stringify(file)},JSON.stringify(state));}catch(error){fs.writeFileSync(${JSON.stringify(file)},JSON.stringify({error:error.message}));}},250);window.once('closed',()=>clearInterval(timer));});
setTimeout(()=>app.quit(),60000);
`);
  child=spawn(require('electron'),[path.join(dir,'main.js')],{env:{...process.env,NODE_PATH:path.join(root,'node_modules')},stdio:'ignore',windowsHide:true});
  await wait(x=>x.type===saved.id&&x.sprite);
  await inspect({freeze:true,buff:{speed:18,speedMax:19,regenerateSpeed:0}});
  await wait(x=>x.speedMax===19);
  await inspect({freeze:true,transform:'qHn7EE5XjH',health:7});
  const form=await wait(x=>x.type===saved.id+'-form-qHn7EE5XjH'&&x.hp===7&&x.speedMax===19&&x.speed===18&&x.sprite);
  assert.equal(form.hpMax,432);
  await inspect({freeze:true,transform:'TtQ4275KLf',health:7});
  const reversed=await wait(x=>x.type===saved.id&&x.hp===7&&x.speedMax===19&&x.speed===18&&x.sprite);assert.equal(reversed.hpMax,432);
  t.diagnostic(JSON.stringify({form,reversed}));
 }finally{if(child){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);});}await manager.close();fs.rmSync(dir,{recursive:true,force:true});}
});
