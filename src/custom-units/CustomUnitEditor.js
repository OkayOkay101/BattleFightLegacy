(function () {
 'use strict';
 document.addEventListener('DOMContentLoaded', function () {
  var i18n = window.gameI18n, tr = function (key, values) { return i18n ? i18n.t(key, values) : key; };
  var el = function (id) { return document.getElementById('custom-unit-' + id); };
  var dialog = el('editor'), token, entries = [], prototypes = [], selected = null, session = null, popup = null, busy = false;
  function message(text) { el('message').textContent = text || ''; }
  async function api(url, method, body) {
   var response = await fetch('/api/custom-units' + url, { method: method || 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Custom-Unit-Token': token || '' }, body: body ? JSON.stringify(body) : undefined });
   var data = await response.json(); if (!data.ok) throw new Error(data.error || response.statusText); return data;
  }
  function option(select, id, name, disabled) { var node = document.createElement('option'); node.value = id; node.textContent = name; node.disabled = !!disabled; select.appendChild(node); }
  function renderList() {
   el('list').textContent = '';
   entries.forEach(function (unit) {
    var button = document.createElement('button'); button.type = 'button'; button.textContent = unit.name + (unit.available ? '' : ' ⚠');
    button.setAttribute('aria-current', String(selected?.id === unit.id)); button.onclick = function () { loadUnit(unit); }; el('list').appendChild(button);
   });
   if (!entries.length) el('list').textContent = tr('custom.empty');
  }
  function fillWeapons(base, values) {
   el('weapons').textContent = '';
   base.weapons.forEach(function (weapons, index) {
    var label = document.createElement('label'), text = document.createElement('span'), select = document.createElement('select');
    text.textContent = tr('custom.slot', { number: index + 1 }); select.dataset.customSlot = String(index);
    weapons.forEach(function (weapon) { option(select, weapon.id, weapon.name); });
    var savedLegacy = (base.legacyWeapons?.[index] || []).find(function (weapon) { return weapon.id === values[index]; });
    if (savedLegacy && !weapons.some(function (weapon) { return weapon.id === savedLegacy.id; })) option(select, savedLegacy.id, savedLegacy.name + ' — ' + tr('custom.savedEquipment'));
    select.value = values[index]; label.append(text, select);
    if(base.weaponRestrictions?.[index]) {var note=document.createElement('small');note.dataset.customRestriction=base.weaponRestrictions[index];note.textContent=tr(note.dataset.customRestriction);label.appendChild(note);}
    var warning=document.createElement('small');warning.className='custom-warning';warning.dataset.customReplacement='true';label.appendChild(warning);
    function updateWarning(){warning.textContent=select.value.startsWith('cw-')?tr('weapon.replaceWarning'):'';}
    select.onchange=updateWarning;updateWarning();
    el('weapons').appendChild(label);
   });
  }
  function loadUnit(unit) {
   selected = unit?.id ? unit : null;
   var base = prototypes.find(function (entry) { return entry.id === (unit?.baseId || el('base').value); });
   if (!base) return;
   el('base').value = base.id; el('base').disabled = !!selected;
   var data = unit || Object.assign({ name: base.name + ' Custom' }, base.defaults);
   el('name').value = data.name; el('health').value = data.health; el('speed').value = data.speed;
   el('reason').textContent = unit?.reason || (base.reason ? tr(base.reason) : '');
   el('image').src = base.image.startsWith('/assets/') ? base.image : '';
   el('defaults').textContent = tr('custom.defaults', { health: base.defaults.health, speed: base.defaults.speed });
   el('hints').textContent = (base.hints || []).map(function(key){return tr(key);}).join('\n');
   fillWeapons(base, data.weapons); renderList();
   el('start').disabled = !selected || !base.available || unit?.available === false; el('delete').disabled = !selected; el('copy').disabled = !selected;
   dialog.querySelector('[type=submit]').disabled = !base.available;
  }
  async function refresh() {
   var data = await api(''); token = data.token; entries = data.units; prototypes = data.catalog;
   var currentBase = el('base').value, currentOpponent = el('opponent').value;
   el('base').textContent = ''; el('opponent').textContent = '';
   prototypes.forEach(function (entry) {
    option(el('base'), entry.id, entry.name + (entry.available ? '' : ' — ' + tr(entry.reason)), !entry.available);
    option(el('opponent'), entry.id, entry.name);
   });
   el('base').value = prototypes.some(function (entry) { return entry.id === currentBase && entry.available; }) ? currentBase : prototypes.find(function (entry) { return entry.available; })?.id;
   if (prototypes.some(function (entry) { return entry.id === currentOpponent; })) el('opponent').value = currentOpponent;
   loadUnit(selected ? entries.find(function (unit) { return unit.id === selected.id; }) : null);
   if (data.errors.length) message(data.errors.map(function (error) { return error.error; }).join('\n'));
  }
  async function run(action) {
   if (busy) return;
   busy = true; message(tr('custom.working'));
   try { await action(); if (el('message').textContent === tr('custom.working')) message(''); }
   catch (error) { message(error.message); } finally { busy = false; }
  }
  el('open').onclick = function () { dialog.showModal(); run(refresh); };
  el('close').onclick = function () { dialog.close(); };
  el('new').onclick = function () { loadUnit(null); message(''); };
  el('base').onchange = function () { loadUnit(null); };
  window.addEventListener('custom-weapons-changed', function () { run(async function () {
   var draft={baseId:el('base').value,name:el('name').value,health:el('health').value,speed:el('speed').value,weapons:Array.from(el('weapons').querySelectorAll('select')).map(function(x){return x.value;})};
   await refresh();el('name').value=draft.name;el('health').value=draft.health;el('speed').value=draft.speed;
   var base=prototypes.find(function(x){return x.id===draft.baseId;});if(base){el('base').value=base.id;fillWeapons(base,draft.weapons);}
  }); });
  el('form').onsubmit = function (event) {
   event.preventDefault(); run(async function () {
    var input = { baseId: el('base').value, name: el('name').value, health: Number(el('health').value), speed: Number(el('speed').value),
     weapons: Array.from(el('weapons').querySelectorAll('select')).map(function (select) { return select.value; }) };
    if (selected) Object.assign(input, { id: selected.id, revision: selected.revision });
    selected = (await api(selected ? '/' + selected.id : '', selected ? 'PUT' : 'POST', input)).unit;
    await refresh(); message(tr('custom.savedOk'));
   });
  };
  el('copy').onclick = function () { if (selected) { var copy = Object.assign({}, selected, { id: undefined, name: selected.name + ' Copy' }); loadUnit(copy); message(tr('custom.copyHelp')); } };
  el('delete').onclick = function () { if (!selected || !confirm(tr('custom.deleteConfirm', { name: selected.name }))) return;
   run(async function () { await api('/' + selected.id, 'DELETE', { revision: selected.revision }); selected = null; await refresh(); message(tr('custom.deleted')); }); };
  async function stop() { if (session) await api('/sandbox/' + session.id + '/stop', 'POST', {}); session = null; if (popup && !popup.closed) popup.close(); el('stop').disabled = true; }
  el('start').onclick = function () {
   if (!selected || busy) return;
   if (session) return message(tr('custom.closeFirst'));
   if (!window.battleFightDesktop) { popup = window.open('about:blank', 'battlefight-custom-sandbox'); if (!popup) return message(tr('custom.popupBlocked')); }
   run(async function () {
    try {
     session = (await api('/sandbox', 'POST', { id: selected.id, controller: el('controller').value, opponent: el('opponent').value })).session;
     if (window.battleFightDesktop?.openCustomSandbox) await window.battleFightDesktop.openCustomSandbox(session.id);
     else popup.location.href = session.url + '/#custom-session=' + session.token;
     el('stop').disabled = false; message(tr('custom.started'));
    } catch (error) { if (session) await stop(); else if (popup && !popup.closed) popup.close(); throw error; }
   });
  };
  el('stop').disabled = true;
  el('stop').onclick = function () { run(async function () { await stop(); message(tr('custom.stopped')); }); };
  setInterval(function () {
   if (!session || !dialog.open) return;
   api('/sandbox/status').then(function (state) {
    if (!state.session) { session = null; el('stop').disabled = true; message(state.error || tr('custom.stopped')); }
   }).catch(function (error) { message(error.message); });
  }, 3000);
  if (i18n) i18n.subscribe(function () {
   renderList();
   Array.from(el('base').options).forEach(function (item) {
    var base = prototypes.find(function (entry) { return entry.id === item.value; });
    if (base) item.textContent = base.name + (base.available ? '' : ' — ' + tr(base.reason));
   });
   var base = prototypes.find(function (entry) { return entry.id === el('base').value; });
   if (base) {
    el('defaults').textContent = tr('custom.defaults', { health: base.defaults.health, speed: base.defaults.speed });
    el('hints').textContent = (base.hints || []).map(function(key){return tr(key);}).join('\n');
    el('weapons').querySelectorAll('[data-custom-restriction]').forEach(function(note){note.textContent=tr(note.dataset.customRestriction);});
    el('weapons').querySelectorAll('select').forEach(function(select){select.onchange();});
    el('reason').textContent = selected?.reason || (base.reason ? tr(base.reason) : '');
    Array.from(el('weapons').querySelectorAll('label span')).forEach(function (label, index) { label.textContent = tr('custom.slot', { number: index + 1 }); });
   }
  });

  // Sandbox controls use a separate capability from the editor's session.
  var sandboxToken = new URLSearchParams(location.hash.slice(1)).get('custom-session');
  if (sandboxToken && /^[a-f0-9]{64}$/.test(sandboxToken)) {
   window.isCustomSandbox = true;
   el('open').hidden = true;
   var modeChange = document.getElementById('training-demo-exit'); if (modeChange) modeChange.hidden = true;
   var controls = document.getElementById('custom-sandbox-controls'); controls.hidden = false;
   async function control(action) {
    var response = await fetch('/api/custom-sandbox/control', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Custom-Unit-Token': sandboxToken }, body: JSON.stringify({ action: action }) });
    var data = await response.json(); if (!data.ok) throw new Error(data.error); return data;
   }
   var heartbeat = setInterval(function () { control('heartbeat').then(function(data){if(data.notice)document.getElementById('custom-sandbox-message').textContent=tr(data.notice.key);}).catch(function (error) { document.getElementById('custom-sandbox-message').textContent = error.message; }); }, 3000);
   window.addEventListener('pagehide', function () { clearInterval(heartbeat); fetch('/api/custom-sandbox/control', { method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-Custom-Unit-Token': sandboxToken }, body: JSON.stringify({ action: 'stop' }) }).catch(function () {}); });
   document.getElementById('custom-sandbox-reset').onclick = function () { control('reset').catch(function (error) { document.getElementById('custom-sandbox-message').textContent = error.message; }); };
   document.getElementById('custom-sandbox-stop').onclick = async function () { try { await control('stop'); document.getElementById('custom-sandbox-message').textContent = tr('custom.stopped'); window.close(); } catch (error) { document.getElementById('custom-sandbox-message').textContent = error.message; } };
   fetch('/api/demo/status').then(function (response) { return response.json(); }).then(function (data) {
    var mode = data.demo.sandbox.controller === 'human' ? 'fight' : 'spectate';
    window.trainingDemoMode = mode; var radio = document.querySelector('input[name=training-demo-mode][value="' + mode + '"]');
    if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
    document.querySelectorAll('input[name=training-demo-mode]').forEach(function (input) { input.disabled = true; });
    var policies = document.querySelector('.demo-model-controls'); if (policies) policies.hidden = true;
   }).catch(function () {});
  }
 });
})();
