'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');
const { catalog, compileUnit } = require('./CustomUnitStore');

function localRequest(req) {
 const address = req.socket?.remoteAddress;
 if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
 try {
  const host = new URL(`http://${req.headers.host}`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) return false;
  if (req.headers.origin && new URL(req.headers.origin).host !== host.host) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
 } catch (_) { return false; }
}

class SandboxManager {
 constructor({ root, directory, game, store, testMode = false, forkProcess = fork }) {
  this.root = root; this.directory = directory; this.game = game; this.store = store;
  this.active = null; this.starting = false; this.testMode = testMode; this.lastError = null;
  this.forkProcess = forkProcess;
 }
 async start({ id, controller, opponent }) {
  if (!['human', 'heuristic'].includes(controller)) throw new Error('Choose human or heuristic');
  const saved = this.store.get(id);
  compileUnit(this.game, saved);
  if (!catalog(this.game).some(entry => entry.id === opponent)) throw new Error('Unknown opponent');
  if (this.starting || this.active) throw new Error('Close the current sandbox before starting another');
  this.starting = true;
  this.lastError = null;
  const sessionId = crypto.randomBytes(16).toString('hex');
  const snapshot = { schemaVersion: 1, unit: saved, controller, opponent, token: crypto.randomBytes(32).toString('hex') };
  const file = path.join(this.directory, `sandbox-${sessionId}.json`);
  let active;
  try {
  fs.mkdirSync(this.directory, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
  const child = this.forkProcess(path.join(this.root, 'server/custom-units/sandbox-entry.js'), ['-g', './src'], {
   cwd: this.root, execArgv: [], windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
   env: { ...process.env, ENV: 'standalone', ELECTRON_RUN_AS_NODE: '1', BATTLEFIGHT_DESKTOP: '1',
    BATTLEFIGHT_SANDBOX: file, BATTLEFIGHT_SANDBOX_TEST: this.testMode ? '1' : '', BATTLEFIGHT_DEMO_POLICY: '',
    BATTLEFIGHT_USER_DATA: path.join(this.directory, 'sandbox-runtime'), BATTLEFIGHT_SELECTION_FILE: '' }
  });
  let log = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-12000); });
  active = { id: sessionId, child, file, token: snapshot.token, lastSeen: Date.now(), timer: null };
  this.active = active;
  const cleanup = () => {
   if (active.timer) clearInterval(active.timer);
   if (this.active === active) this.active = null;
   if (fs.existsSync(file)) fs.unlinkSync(file);
  };
  child.once('close', code => {
   if (code && !active.stopping) this.lastError = `Sandbox stopped unexpectedly (${code}). ${log.slice(-2000)}`;
   cleanup();
  });
  child.on('message', message => {
   if (message?.type === 'sandbox-alive') active.lastSeen = Date.now();
   if (message?.type === 'battlefight-error') this.lastError = message.message;
  });
   const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Sandbox startup timed out. ${log.slice(-2000)}`)), 35000);
    const finish = (error, value) => { clearTimeout(timer); child.removeListener('message', onMessage); error ? reject(error) : resolve(value); };
    const onMessage = message => {
     if (message?.type === 'battlefight-ready') finish(null, message);
     if (message?.type === 'battlefight-error') finish(new Error(message.message));
    };
    child.on('message', onMessage);
    child.once('error', error => finish(error));
    child.once('close', code => finish(new Error(`Sandbox stopped before readiness (${code}). ${log.slice(-2000)}`)));
   });
   if (![ready.httpPort, ready.wsPort].every(port => Number.isInteger(port) && port > 0 && port <= 65535) || ready.httpPort === ready.wsPort) throw new Error('Invalid sandbox ports');
   Object.assign(active, ready);
   active.timer = setInterval(() => { if (Date.now() - active.lastSeen > 90000) this.stop(active.id).catch(() => {}); }, 10000);
   active.timer.unref();
   return this.publicSession();
  } catch (error) {
   if (active) await this.stop(active.id);
   if (fs.existsSync(file)) fs.unlinkSync(file);
   this.lastError = error.message;
   throw error;
  }
  finally { this.starting = false; }
 }
 publicSession() {
  const active = this.active;
  if (!active?.httpPort) return null;
  return { id: active.id, httpPort: active.httpPort, wsPort: active.wsPort,
   url: `http://127.0.0.1:${active.httpPort}`, token: active.token };
 }
 touch(id) { if (this.active?.id !== id) throw new Error('Sandbox not found'); this.active.lastSeen = Date.now(); }
 async stop(id) {
  const active = this.active;
  if (!active || active.id !== id) return;
  if (active.stopping) return active.stopping;
  active.stopping = new Promise((resolve, reject) => {
   const force = setTimeout(() => { active.child.kill(); }, 4000);
   const deadline = setTimeout(() => { clearTimeout(force); reject(new Error('Sandbox process did not stop')); }, 6500);
   active.child.once('close', () => { clearTimeout(force); clearTimeout(deadline); resolve(); });
   try { active.child.send({ type: 'battlefight-shutdown' }); } catch (_) { active.child.kill(); }
  });
  return active.stopping;
 }
 async close() { if (this.active) await this.stop(this.active.id); }
}
module.exports = { SandboxManager, localRequest };
