(function () {
 'use strict';
 document.addEventListener('DOMContentLoaded', function () {
  var i18n=window.gameI18n,tr=function(key,values){return i18n?i18n.t(key,values):key;},el=function(id){return document.getElementById('custom-weapon-'+id);};
  var token,entries=[],defaults,selected=null,busy=false;
  var fields=['name','pattern','damage','speed','range','cooldown','pellets','spread','shots','interval'];
  function message(text){el('message').textContent=text||'';}
  async function api(suffix,method,body){var response=await fetch('/api/custom-weapons'+suffix,{method:method||'GET',headers:{'Content-Type':'application/json','X-Custom-Unit-Token':token||''},body:body?JSON.stringify(body):undefined});var data=await response.json();if(!data.ok)throw new Error(data.error||response.statusText);return data;}
  function renderList(){el('list').textContent='';entries.forEach(function(weapon){var button=document.createElement('button');button.type='button';button.textContent=weapon.name+' · '+tr('weapon.'+weapon.pattern);button.setAttribute('aria-current',String(selected?.id===weapon.id));button.onclick=function(){load(weapon);message('');};el('list').appendChild(button);});if(!entries.length)el('list').textContent=tr('weapon.empty');}
  function describe(){
   var pattern=el('pattern').value,count=pattern==='spread'?Number(el('pellets').value):pattern==='burst'?Number(el('shots').value):1;
   el('spread-fields').hidden=pattern!=='spread';el('burst-fields').hidden=pattern!=='burst';
   var minimum=pattern==='burst'?(Number(el('shots').value)-1)*Number(el('interval').value)+100:100;
   el('cooldown').min=String(minimum);el('minimum').textContent=tr('weapon.minimum',{value:minimum});
   el('summary').textContent=tr('weapon.summary',{count:count,damage:Number(el('damage').value),total:count*Number(el('damage').value)});
  }
  function load(weapon){selected=weapon?.id?weapon:null;var value=weapon||defaults;if(!value)return;fields.forEach(function(key){el(key).value=value[key];});el('delete').disabled=!selected;el('copy').disabled=!selected;describe();renderList();}
  async function refresh(){var data=await api('');token=data.token;entries=data.weapons;defaults=data.defaults;el('image').src=data.image?.startsWith('/assets/')?data.image:'';load(selected?entries.find(function(x){return x.id===selected.id;}):null);if(data.errors.length)message(data.errors.map(function(x){return x.error;}).join('\n'));}
  async function run(action){if(busy)return;busy=true;message(tr('custom.working'));try{await action();if(el('message').textContent===tr('custom.working'))message('');}catch(error){message(error.message);}finally{busy=false;}}
  function tab(weapons){document.getElementById('custom-unit-panel').hidden=weapons;el('panel').hidden=!weapons;document.getElementById('custom-unit-message').hidden=weapons;el('tab').setAttribute('aria-selected',String(weapons));document.getElementById('custom-unit-tab').setAttribute('aria-selected',String(!weapons));if(weapons&&!defaults)run(refresh);}
  el('tab').onclick=function(){tab(true);};document.getElementById('custom-unit-tab').onclick=function(){tab(false);};
  document.querySelector('[role=tablist]').addEventListener('keydown',function(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();var weapons=event.key==='End'||(event.key!=='Home'&&el('panel').hidden);tab(weapons);(weapons?el('tab'):document.getElementById('custom-unit-tab')).focus();});
  el('new').onclick=function(){load(null);message('');};el('copy').onclick=function(){if(selected){load(Object.assign({},selected,{id:undefined,name:selected.name+' Copy'}));message(tr('custom.copyHelp'));}};
  el('form').addEventListener('input',describe);
  el('form').onsubmit=function(event){event.preventDefault();run(async function(){var body={};fields.forEach(function(key){body[key]=['name','pattern'].includes(key)?el(key).value:Number(el(key).value);});if(selected)Object.assign(body,{id:selected.id,revision:selected.revision});selected=(await api(selected?'/'+selected.id:'',selected?'PUT':'POST',body)).weapon;await refresh();window.dispatchEvent(new Event('custom-weapons-changed'));message(tr('weapon.savedOk'));});};
  el('delete').onclick=function(){if(!selected||!confirm(tr('custom.deleteConfirm',{name:selected.name})))return;run(async function(){await api('/'+selected.id,'DELETE',{revision:selected.revision});selected=null;await refresh();window.dispatchEvent(new Event('custom-weapons-changed'));message(tr('weapon.deleted'));});};
  if(i18n)i18n.subscribe(function(){renderList();if(defaults)describe();});
 });
})();
