'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),http=require('http'),{spawn}=require('child_process'),WebSocket=require('ws'),crypto=require('crypto');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CDP {
 constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();this.ready=new Promise((resolve,reject)=>{this.ws.once('open',resolve);this.ws.once('error',reject);});this.ws.on('message',message=>{const d=JSON.parse(message),p=this.pending.get(d.id);if(p){this.pending.delete(d.id);clearTimeout(p.timer);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result);}});}
 async call(method,params={}){await this.ready;return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},12000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const r=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
 close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP closed'));}this.pending.clear();this.ws.close();}
}
test('actual portable EXE: weapon CRUD, movement, projectiles and sandbox shutdown',{timeout:180000},async t=>{
 const root=path.resolve(__dirname,'..'),exe=path.join(root,'dist/portable/BattleFight-Portable-1.0.0.exe');assert.ok(fs.existsSync(exe));
 const tmp=path.join(root,'build/custom-unit-tests');fs.mkdirSync(tmp,{recursive:true});const dir=fs.mkdtempSync(path.join(tmp,'portable-')),name='PortableSmoke-'+crypto.randomBytes(5).toString('hex');
 const listener=http.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(exe,['--remote-debugging-port='+port,'--user-data-dir='+path.join(dir,'browser-data')],{windowsHide:true,stdio:'ignore'});
 const source=fs.readFileSync(path.join(__dirname,'custom-weapon-electron-smoke.js'),'utf8'),tick=String.fromCharCode(96);
 function script(label){const start=source.indexOf('const '+label+' = '+tick)+('const '+label+' = '+tick).length,end=source.indexOf(tick+';',start);assert.ok(start>0&&end>start);return source.slice(start,end).split('$'+'{baseId}').join('NNGRxjPsrz');}
 let mainScript=script('mainInspect').replace(/GUI Burst/g,name).replace(/Electron Custom Adapter/g,name);
 mainScript=mainScript.replace("document.querySelectorAll('#custom-weapon-list button').length", "Array.from(document.querySelectorAll('#custom-weapon-list button')).filter(x=>x.textContent.startsWith('"+name+"')).length");
 mainScript=mainScript.replace(/const w = await \(await fetch\('\/api\/custom-weapons'\)\)\.json\(\);/g,"$& w.weapons = w.weapons.filter(x=>x.name.startsWith('"+name+"'));");
 mainScript=mainScript.replace("const data = await (await fetch('/api/custom-units')).json();","const data = await (await fetch('/api/custom-units')).json(); data.units = data.units.filter(x=>x.name==='"+name+"');");
 const sandboxScript=script('sandboxInspect');let main,sandbox,mainTarget,result={errors:[]},captured=false,previousLanguage;const deadline=Date.now()+150000;
 async function targets(){return (await fetch('http://127.0.0.1:'+port+'/json/list')).json();}
 try{
  while(Date.now()<deadline){
   let pages;try{pages=(await targets()).filter(x=>x.type==='page'&&/^http:\/\/127\.0\.0\.1/.test(x.url));}catch(_){await delay(500);continue;}
   if(!main&&pages.length){mainTarget=pages[0].id;main=new CDP(pages[0].webSocketDebuggerUrl);await main.ready;}
   if(main){if(previousLanguage===undefined)previousLanguage=await main.evaluate("window.gameI18n ? (function(){const old=window.gameI18n.language();window.gameI18n.setLanguage('en');return old;})() : undefined");const state=await main.evaluate(mainScript);if(state)result.editor=state;const stage=await main.evaluate('window.__editorTest');if(!captured&&stage>=11&&stage<=14){const im=await main.call('Page.captureScreenshot');fs.writeFileSync(path.join(root,'build/custom-weapon-editor-preview.png'),Buffer.from(im.data,'base64'));captured=true;}}
   if(!sandbox&&pages.some(x=>x.id!==mainTarget)){sandbox=new CDP(pages.find(x=>x.id!==mainTarget).webSocketDebuggerUrl);await sandbox.ready;}
   if(sandbox){const state=await sandbox.evaluate(sandboxScript);if(state)result.sandbox=state;if(state?.input){const k=state.input.toUpperCase();await sandbox.call('Input.dispatchKeyEvent',{type:'keyDown',key:state.input,code:'Key'+k,windowsVirtualKeyCode:k.charCodeAt(0)});await sandbox.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:740,y:410});await sandbox.call('Input.dispatchMouseEvent',{type:'mousePressed',x:740,y:410,button:'left',clickCount:1});}if(state?.sprite){const im=await sandbox.call('Page.captureScreenshot');fs.writeFileSync(path.join(root,'build/custom-weapon-portable-preview.png'),Buffer.from(im.data,'base64'));break;}}
   await delay(700);
  }
  assert.ok(result.sandbox?.sprite,JSON.stringify(result));assert.ok(result.sandbox.projectiles>0,JSON.stringify(result));assert.ok(result.sandbox.movement>5,JSON.stringify(result));assert.equal(result.sandbox.players,2);assert.equal(result.sandbox.selected,result.editor.saved.id);assert.equal(result.editor.weapon.revision,2);
  await sandbox.evaluate("document.getElementById('custom-sandbox-stop').click()").catch(()=>{});await delay(2500);
  const stopped=await main.evaluate("fetch('/api/custom-units/sandbox/status').then(r=>r.json())");result.stopped=stopped.session===null;assert.ok(result.stopped);
  fs.writeFileSync(path.join(root,'build/custom-weapon-portable-smoke.json'),JSON.stringify(result,null,2));t.diagnostic(JSON.stringify(result));
 }finally{
  if(main)await main.evaluate("(async()=>{const u=await (await fetch('/api/custom-units')).json();const headers={'Content-Type':'application/json','X-Custom-Unit-Token':u.token};for(const unit of u.units.filter(x=>x.name==='"+name+"'))await fetch('/api/custom-units/'+unit.id,{method:'DELETE',headers,body:JSON.stringify({revision:unit.revision})});const w=await (await fetch('/api/custom-weapons')).json();for(const weapon of w.weapons.filter(x=>x.name.startsWith('"+name+"')))await fetch('/api/custom-weapons/'+weapon.id,{method:'DELETE',headers,body:JSON.stringify({revision:weapon.revision})});})()").catch(e=>result.errors.push(e.message));
  if(main&&previousLanguage)await main.evaluate("window.gameI18n.setLanguage("+JSON.stringify(previousLanguage)+")").catch(()=>{});
  if(main)await main.call('Browser.close').catch(()=>{});sandbox?.close();main?.close();await delay(1500);child.kill();fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2));
 }
});
