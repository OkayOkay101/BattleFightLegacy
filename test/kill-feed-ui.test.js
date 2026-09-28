const test = require('node:test');
const assert = require('node:assert/strict');
global.IgeEntity = { extend(definition) { function Entity() {} Entity.prototype = definition; return Entity; } };
const KillFeedUiComponent = require('../src/gameClasses/components/ui/KillFeedUiComponent');
const messages = require('../src/localization/messages');
const { createGameI18n } = require('../src/localization/GameI18n');

function makeNode(tagName) {
  const node = {
    tagName, children: [], attributes: {}, className: '', _text: '',
    set textContent(value) { this._text = String(value); this.children = []; },
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); },
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  };
  return node;
}

function setup() {
  const container = makeNode('div');
  global.document = { createElement: makeNode, getElementById(id) { return id === 'kill-feed-entries' ? container : null; } };
  const i18n = createGameI18n({ messages, storage: { getItem() { return null; }, setItem() {} } });
  global.ige = { client: { i18n }, game: { getAsset(category, id) { return category === 'unitTypes' && id === 'ranger' ? { name: 'Ranger' } : null; } } };
  const ui = Object.create(KillFeedUiComponent.prototype);
  ui.init();
  return { ui, container, i18n };
}

test('renders credited and unattributed eliminations newest first with translated context', () => {
  const { ui, container } = setup();
  ui.add({ eventId: 'one', killer: { id: 'blue', name: 'Blue', teamId: 'blue', characterId: 'ranger' }, victim: { id: 'red', name: 'Red', teamId: 'red' }, at: 1 });
  ui.add({ eventId: 'two', killer: null, victim: { id: 'friend', name: 'Friend', teamId: 'red' }, at: 2 });
  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].textContent, 'Friend (Red) was eliminated');
  assert.equal(container.children[1].textContent, 'Blue (Blue · Ranger) eliminated Red (Red)');
});

test('keeps player names as literal text and caps the display at twelve rows', () => {
  const { ui, container } = setup();
  ui.add({ eventId: 'html', killer: { id: 'blue', name: '<img src=x>', teamId: 'blue' }, victim: { id: 'victim', name: 'Victim' } });
  assert.equal(container.children[0].textContent, '<img src=x> (Blue) eliminated Victim');
  assert.equal(container.children[0].children.length, 0);
  for (let i = 1; i <= 14; i++) ui.add({ eventId: `event-${i}`, killer: null, victim: { id: `p-${i}`, name: `P${i}` } });
  assert.equal(container.children.length, 12);
  assert.equal(container.children[0].textContent, 'P14 was eliminated');
});

test('re-renders current entries when the selected language changes and ignores duplicate IDs', () => {
  const { ui, container, i18n } = setup();
  const event = { eventId: 'one', killer: { id: 'blue', name: 'Blue', teamId: 'blue' }, victim: { id: 'red', name: 'Red' } };
  ui.add(event);
  ui.add(event);
  assert.equal(container.children.length, 1);
  i18n.setLanguage('th');
  assert.equal(container.children[0].textContent, 'Blue (ทีมฟ้า) กำจัด Red');
});
