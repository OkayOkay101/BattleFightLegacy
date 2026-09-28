const test = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../src/localization/messages');

test('English and Thai dictionaries contain the same keys', () => {
  const englishKeys = Object.keys(messages.en).sort();
  const thaiKeys = Object.keys(messages.th).sort();
  assert.deepEqual(thaiKeys, englishKeys,
    `Missing from Thai: ${englishKeys.filter(key => !messages.th[key]).join(', ')}; extra in Thai: ${thaiKeys.filter(key => !messages.en[key]).join(', ')}`);
});
