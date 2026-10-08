'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { registerCustomRoutes } = require('../server/custom-units/CustomUnitRoutes');
test('editor API enforces capability, revisions, validation and local origin', async () => {
 const tmpRoot = path.resolve(__dirname, '../build/custom-unit-tests'); fs.mkdirSync(tmpRoot, { recursive: true });
 const dir = fs.mkdtempSync(path.join(tmpRoot, 'api-'));
 const oldDirectory = process.env.BATTLEFIGHT_CUSTOM_UNITS;
 process.env.BATTLEFIGHT_CUSTOM_UNITS = dir;
 const app = express(); app.use(express.json()); const server = {};
 registerCustomRoutes(app, server);
 const listener = http.createServer(app);
 await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
 const url = `http://127.0.0.1:${listener.address().port}/api/custom-units`;
 try {
  const data = await (await fetch(url)).json(); const base = data.catalog.find(x => x.id === 'NNGRxjPsrz');
  const body = { baseId: base.id, name: 'API Custom', ...base.defaults };
  const request = (suffix, method, value, token = data.token) => fetch(url + suffix, { method,
   headers: { 'Content-Type': 'application/json', 'X-Custom-Unit-Token': token }, body: JSON.stringify(value) });
  assert.equal((await request('', 'POST', body, 'wrong')).status, 403);
  assert.equal((await fetch(url, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await request('', 'POST', { ...body, health: -1 })).status, 400);
  const saved = (await (await request('', 'POST', body)).json()).unit;
  const revised = (await (await request('/' + saved.id, 'PUT', { ...saved, speed: 19 })).json()).unit;
  assert.equal(revised.revision, 2);
  assert.equal((await request('/' + saved.id, 'PUT', saved)).status, 409);
  assert.equal((await request('/' + saved.id, 'DELETE', { revision: 1 })).status, 409);
  assert.equal((await request('/' + saved.id, 'DELETE', { revision: 2 })).status, 200);
  assert.equal((await (await fetch(url)).json()).units.length, 0);
 } finally {
  await server.customUnitManager.close(); await new Promise(resolve => listener.close(resolve));
  if (oldDirectory === undefined) delete process.env.BATTLEFIGHT_CUSTOM_UNITS; else process.env.BATTLEFIGHT_CUSTOM_UNITS = oldDirectory;
  fs.rmSync(dir, { recursive: true, force: true });
 }
});
