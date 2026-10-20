'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
function ui(desktop=false) {
 const elements=new Map(),requests=[],opened=[],listeners={};let popup;
 for(const id of ['editor','message','start','stop','open','close','character'])elements.set('solo-'+id,{value:'',options:[],disabled:false,hidden:false,open:false,
  showModal(){this.open=true;},close(){this.open=false;},appendChild(option){this.options.push(option);},set textContent(text){this.text=text;if(id==='character')this.options=[];},get textContent(){return this.text;}});
 const document={getElementById:id=>elements.get(id),createElement:()=>({}),addEventListener:(event,cb)=>{listeners[event]=cb;}};
 const window={gameI18n:{t:key=>key},open(){popup={location:{},closed:false,close(){this.closed=true;}};return popup;}};
 if(desktop)window.battleFightDesktop={openCustomSandbox:async id=>opened.push(id)};
 const context={document,window,location:{hash:''},URLSearchParams,setInterval(){},fetch:async(url,options)=>{
  requests.push({url,...options});
  return {json:async()=>url==='/api/solo'&&!options.body?{ok:true,token:'capability',catalog:[{id:'morrowRouteCartographer',name:'Morrow'},{id:'NNGRxjPsrz',name:'PewPew'}]}:
   url==='/api/solo'?{ok:true,session:{id:'test-session',url:'http://127.0.0.1:12345',token:'sandbox-token'}}:{ok:true}};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/custom-units/SoloTest.js'),'utf8'),context);listeners.DOMContentLoaded();
 const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
 return {elements,requests,opened,window,flush,popup:()=>popup};
}
for(const desktop of [false,true])test(`Solo UI selects Morrow by default and opens correct isolated session (desktop=${desktop})`,async()=>{
 const h=ui(desktop),el=id=>h.elements.get('solo-'+id);
 el('open').onclick();await h.flush();assert.equal(el('editor').open,true);assert.equal(el('character').options.length,2);
 assert.equal(el('character').value,'morrowRouteCartographer');
 el('start').onclick();await h.flush();
 const call=h.requests.find(x=>x.url==='/api/solo'&&x.method==='POST');assert.equal(JSON.parse(call.body).characterId,'morrowRouteCartographer');assert.equal(call.headers['X-Custom-Unit-Token'],'capability');
 if(desktop)assert.deepEqual(h.opened,['test-session']);else assert.equal(h.popup().location.href,'http://127.0.0.1:12345/#custom-session=sandbox-token');
 assert.equal(el('start').disabled,true);assert.equal(el('stop').disabled,false);
 el('stop').onclick();await h.flush();assert.ok(h.requests.some(x=>x.url==='/api/custom-units/sandbox/test-session/stop'));assert.equal(el('start').disabled,false);
});
test('popup denial does not create an orphan arena',async()=>{
 const h=ui(),el=id=>h.elements.get('solo-'+id);el('open').onclick();await h.flush();h.window.open=()=>null;
 el('start').onclick();await h.flush();assert.equal(h.requests.filter(x=>x.method==='POST').length,0);assert.equal(el('message').textContent,'custom.popupBlocked');
});
test('Solo controls and labels are present in English and Thai',()=>{
 const messages=require('../src/localization/messages');for(const lang of ['en','th'])for(const key of ['solo.title','solo.character','solo.help','solo.dummy','solo.kill','solo.respawning','solo.dummyAdded'])assert.ok(messages[lang][key]);
 const template=fs.readFileSync(path.join(__dirname,'../src/templates/custom-units.ejs'),'utf8');for(const id of ['solo-character','solo-dummy','solo-kill','solo-start'])assert.ok(template.includes('id="'+id+'"'));
});
