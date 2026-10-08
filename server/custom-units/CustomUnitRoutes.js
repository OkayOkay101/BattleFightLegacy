'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CustomUnitStore, catalog } = require('./CustomUnitStore');
const { SandboxManager, localRequest } = require('./SandboxManager');

function registerCustomRoutes(app, server) {
 const token = crypto.randomBytes(32).toString('hex');
 const root = path.resolve(__dirname, '../..');
 const game = JSON.parse(fs.readFileSync(path.join(root, 'src/game.json'), 'utf8')).data;
 const directory = process.env.BATTLEFIGHT_CUSTOM_UNITS ||
  (process.env.BATTLEFIGHT_DESKTOP === '1' ? path.join(path.dirname(process.env.BATTLEFIGHT_USER_DATA), 'custom-units') : path.join(root, 'custom-units'));
 const store = new CustomUnitStore(directory, game);
 const manager = new SandboxManager({ root, directory, game, store });
 server.customUnitManager = manager;
 const route = handler => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!localRequest(req)) return res.status(403).json({ ok: false, error: 'Custom Units are available only on this computer' });
  if (req.method !== 'GET' && req.headers['x-custom-unit-token'] !== token) return res.status(403).json({ ok: false, error: 'Invalid editor session token' });
  if (process.env.BATTLEFIGHT_SANDBOX) return res.status(403).json({ ok: false, error: 'Open the editor in the main game window' });
  try { await handler(req, res); } catch (error) { res.status(error.status || 400).json({ ok: false, error: error.message }); }
 };
 app.get('/api/custom-units', route((req, res) => res.json({ ok: true, token, catalog: catalog(game), ...store.list() })));
 app.post('/api/custom-units', route((req, res) => res.json({ ok: true, unit: store.save(req.body) })));
 app.put('/api/custom-units/:id', route((req, res) => res.json({ ok: true, unit: store.save({ ...req.body, id: req.params.id }) })));
 app.delete('/api/custom-units/:id', route((req, res) => { store.remove(req.params.id, req.body.revision); res.json({ ok: true }); }));
 app.post('/api/custom-units/sandbox', route(async (req, res) => res.json({ ok: true, session: await manager.start(req.body) })));
 app.post('/api/custom-units/sandbox/:id/stop', route(async (req, res) => { await manager.stop(req.params.id); res.json({ ok: true }); }));
 app.get('/api/custom-units/sandbox/status', route((req, res) => res.json({ ok: true, session: manager.publicSession(), error: manager.lastError })));
 app.post('/api/custom-sandbox/control', async (req, res) => {
  if (!localRequest(req) || !global.ige?.training?.isCustomSandbox || req.headers['x-custom-unit-token'] !== global.ige.training.snapshot.token) {
   return res.status(403).json({ ok: false, error: 'Invalid sandbox session' });
  }
  const action = req.body.action;
  if (action === 'heartbeat') { process.send?.({ type: 'sandbox-alive' }); return res.json({ ok: true }); }
  if (action === 'reset') { try { return res.json({ ok: true, demo: global.ige.training.resetSandbox() }); } catch (error) { return res.status(500).json({ ok: false, error: error.message }); } }
  if (action === 'stop') { res.json({ ok: true }); setTimeout(() => process.emit('SIGTERM'), 100); return; }
  res.status(400).json({ ok: false, error: 'Unknown sandbox action' });
 });
}
module.exports = { registerCustomRoutes };
