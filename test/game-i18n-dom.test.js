const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameI18n } = require('../src/localization/GameI18n');
const messages = require('../src/localization/messages');

function node(attributes = {}) {
  const values = { ...attributes };
  return {
    dataset: {},
    textContent: '',
    value: '',
    setAttribute(key, value) { values[key] = value; },
    getAttribute(key) { return values[key] ?? null; }
  };
}

function root(groups) {
  return { querySelectorAll(selector) { return groups[selector] || []; } };
}

test('applies translated text, placeholder, aria label, and selector value', () => {
  const label = node({ 'data-i18n': 'common.play' });
  const input = node({ 'data-i18n-placeholder': 'chat.placeholder' });
  const button = node({ 'data-i18n-aria-label': 'common.close' });
  const selector = node({});
  const document = root({
    '[data-i18n]': [label],
    '[data-i18n-placeholder]': [input],
    '[data-i18n-aria-label]': [button],
    '[data-language-selector]': [selector]
  });
  const i18n = createGameI18n({ messages, document });

  i18n.apply();
  assert.equal(label.textContent, 'Play');
  assert.equal(input.getAttribute('placeholder'), 'Type a message...');
  assert.equal(button.getAttribute('aria-label'), 'Close');
  assert.equal(selector.value, 'en');

  i18n.setLanguage('th');
  assert.equal(label.textContent, 'เล่น');
  assert.equal(input.getAttribute('placeholder'), 'พิมพ์ข้อความ...');
  assert.equal(button.getAttribute('aria-label'), 'ปิด');
  assert.equal(selector.value, 'th');
});

test('keeps user-authored text unchanged unless explicitly marked', () => {
  const custom = node({});
  custom.textContent = 'common.play';
  const document = root({ '[data-i18n]': [], '[data-i18n-placeholder]': [], '[data-i18n-aria-label]': [], '[data-language-selector]': [] });
  const i18n = createGameI18n({ messages, document });
  i18n.setLanguage('th');
  assert.equal(custom.textContent, 'common.play');
});
