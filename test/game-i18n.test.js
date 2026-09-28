const test = require('node:test');
const assert = require('node:assert/strict');
const { createGameI18n } = require('../src/localization/GameI18n');

const messages = {
  en: { 'feed.kill': '{killer} eliminated {victim}', 'common.play': 'Play' },
  th: { 'feed.kill': '{killer} กำจัด {victim}', 'common.play': 'เล่น' }
};

function memoryStorage(initial = null) {
  const values = new Map(initial ? [['battlefight.language', initial]] : []);
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); }
  };
}

test('defaults to English and translates after a valid language selection', () => {
  const i18n = createGameI18n({ messages, storage: memoryStorage() });
  assert.equal(i18n.language(), 'en');
  assert.equal(i18n.t('feed.kill', { killer: 'A', victim: 'B' }), 'A eliminated B');
  assert.equal(i18n.setLanguage('th'), true);
  assert.equal(i18n.t('feed.kill', { killer: 'A', victim: 'B' }), 'A กำจัด B');
});

test('loads only supported saved language values', () => {
  assert.equal(createGameI18n({ messages, storage: memoryStorage('th') }).language(), 'th');
  assert.equal(createGameI18n({ messages, storage: memoryStorage('fr') }).language(), 'en');
});

test('falls back to the English source when the selected key is missing', () => {
  const partialMessages = { en: { greeting: 'Hello {name}' }, th: {} };
  const i18n = createGameI18n({ messages: partialMessages, storage: memoryStorage('th') });
  assert.equal(i18n.t('greeting', { name: 'Kai' }), 'Hello Kai');
});

test('interpolates parameters as literal strings', () => {
  const i18n = createGameI18n({ messages, storage: memoryStorage() });
  assert.equal(i18n.t('feed.kill', { killer: '<img src=x>', victim: 'B' }), '<img src=x> eliminated B');
});

test('rejects unsupported languages and leaves the active language unchanged', () => {
  const storage = memoryStorage();
  const i18n = createGameI18n({ messages, storage });
  assert.equal(i18n.setLanguage('fr'), false);
  assert.equal(i18n.language(), 'en');
  assert.equal(storage.getItem('battlefight.language'), null);
});

test('survives storage read and write errors', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  const i18n = createGameI18n({ messages, storage });
  assert.equal(i18n.language(), 'en');
  assert.equal(i18n.setLanguage('th'), true);
  assert.equal(i18n.language(), 'th');
});

test('persists changes and notifies subscribers only when language changes', () => {
  const storage = memoryStorage();
  const i18n = createGameI18n({ messages, storage });
  const changes = [];
  const unsubscribe = i18n.subscribe(language => changes.push(language));
  assert.equal(i18n.setLanguage('th'), true);
  assert.equal(i18n.setLanguage('th'), true);
  unsubscribe();
  assert.equal(i18n.setLanguage('en'), true);
  assert.equal(storage.getItem('battlefight.language'), 'en');
  assert.deepEqual(changes, ['th']);
});

