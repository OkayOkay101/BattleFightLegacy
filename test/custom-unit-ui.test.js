'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
test('editor and sandbox controls are available in both languages', () => {
 const messages = require('../src/localization/messages');
 for (const lang of ['en', 'th']) {
  for (const key of ['custom.title', 'custom.save', 'custom.health', 'custom.speed', 'custom.adapterRequired', 'custom.start', 'custom.stop', 'custom.reset']) {
   assert.ok(messages[lang][key], `${lang}: ${key}`);
  }
 }
 const template = fs.readFileSync(path.join(__dirname, '../src/templates/menu.ejs'), 'utf8');
 assert.ok(template.includes('custom-units.ejs'));
 assert.ok(fs.existsSync(path.join(__dirname, '../src/custom-units/CustomUnitEditor.js')));
 const preload = fs.readFileSync(path.join(__dirname, '../desktop/preload.js'), 'utf8');
 assert.ok(preload.includes('openCustomSandbox'));
});
