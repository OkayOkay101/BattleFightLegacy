const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const messages = require('../src/localization/messages');

test('English and Thai dictionaries contain the same keys', () => {
  const englishKeys = Object.keys(messages.en).sort();
  const thaiKeys = Object.keys(messages.th).sort();
  assert.deepEqual(thaiKeys, englishKeys,
    `Missing from Thai: ${englishKeys.filter(key => !messages.th[key]).join(', ')}; extra in Thai: ${thaiKeys.filter(key => !messages.en[key]).join(', ')}`);
});

test('every localization key referenced by a game template exists in both dictionaries', () => {
  const templateDirectory = path.join(__dirname, '../src/templates');
  const templates = fs.readdirSync(templateDirectory).filter(file => file.endsWith('.ejs'));
  const missing = new Set();
  for (const file of templates) {
    const contents = fs.readFileSync(path.join(templateDirectory, file), 'utf8');
    for (const match of contents.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)) {
      const key = match[1];
      if (!(key in messages.en) || !(key in messages.th)) missing.add(`${file}: ${key}`);
    }
  }
  assert.deepEqual([...missing], []);
});
