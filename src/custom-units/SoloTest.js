(function () {
 'use strict';
 document.addEventListener('DOMContentLoaded', function () {
  var el = function(id) { return document.getElementById('solo-' + id); };
  var dialog = el('editor'), session = null, token = '', busy = false;
  var tr = function(key) { return window.gameI18n ? window.gameI18n.t(key) : key; };
  function message(text) { el('message').textContent = text || ''; }
  async function api(url, body) {
   var response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Custom-Unit-Token': token }, body: body ? JSON.stringify(body) : undefined });
   var data = await response.json(); if (!data.ok) throw new Error(data.error || response.statusText); return data;
  }
  async function run(action) {
   if (busy) return; busy = true; el('start').disabled = true; message(tr('custom.working'));
   try { await action(); } catch(error) { message(error.message); }
   finally { busy = false; el('start').disabled = !!session || !el('character').options.length; el('stop').disabled = !session; }
  }
  el('open').onclick = function() { dialog.showModal(); run(async function() {
   var data = await api('/api/solo'); token = data.token; var previous = el('character').value;
   el('character').textContent = '';
   data.catalog.forEach(function(entry) { var option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name; el('character').appendChild(option); });
   el('character').value = previous || 'morrowRouteCartographer'; message('');
  }); };
  el('close').onclick = function() { dialog.close(); };
  el('start').onclick = function() {
   if (busy || session) return;
   var popup;
   if (!window.battleFightDesktop) { popup = window.open('about:blank','battlefight-solo'); if (!popup) return message(tr('custom.popupBlocked')); }
   run(async function() {
    try {
     session = (await api('/api/solo',{characterId:el('character').value})).session;
     if (window.battleFightDesktop?.openCustomSandbox) await window.battleFightDesktop.openCustomSandbox(session.id);
     else popup.location.href = session.url + '/#custom-session=' + session.token;
     message(tr('custom.started'));
    } catch(error) {
     if (session) { await api('/api/custom-units/sandbox/' + session.id + '/stop',{}); session = null; }
     if (popup && !popup.closed) popup.close(); throw error;
    }
   });
  };
  el('stop').onclick = function() { run(async function() { if (session) await api('/api/custom-units/sandbox/' + session.id + '/stop',{}); session = null; message(tr('custom.stopped')); }); };
  setInterval(function() {
   if (!session || busy) return;
   api('/api/custom-units/sandbox/status').then(function(data) {
    if (!data.session || data.session.id !== session.id) { session = null; el('start').disabled = false; el('stop').disabled = true; message(data.error || tr('custom.stopped')); }
   }).catch(function(error) { message(error.message); });
  },3000);
  if (new URLSearchParams(location.hash.slice(1)).has('custom-session')) el('open').hidden = true;
 });
})();
