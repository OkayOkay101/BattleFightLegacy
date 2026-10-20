# Thai and English Game UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players switch all built-in BattleFight interface text between Thai and English, persist the choice, and default to English.

**Architecture:** Add a small browser and Node compatible localization module with complete `en` and `th` message dictionaries, safe storage access, DOM translation attributes, and a language-change event. Load it before the engine client; templates and UI components use its stable translation keys for static and generated messages.

**Tech Stack:** Node.js, browser JavaScript, EJS, `node:test`, localStorage.

**Spec:** `docs/superpowers/specs/2026-09-29-live-killfeed-bilingual-ui-design.md`

## Global Constraints

- A visible language selector in the menu and in-game interface. Store its choice in browser local storage; default to English when no valid choice exists.
- Re-render visible and subsequently generated UI text when the language changes, without reloading the match.
- Translation of accessibility text such as button labels, input placeholders, and ARIA labels where they are part of the built-in interface.
- Translating user-authored game content, including player chat, custom map/dialogue text, user-created UI, usernames, model IDs, and character names is excluded.
- Changes to combat rules, scoring, respawn behavior, AI policy, or training outcomes are excluded.

## Review Focus

- Browser storage throws or contains an unsupported locale: boot and selector still work in English.
- A translation parameter contains user-provided text: it is inserted as text, not interpreted as HTML.
- A UI message is created after language selection: it uses the selected locale instead of its startup language.
- An English key is absent from Thai: automated completeness check names the missing key and runtime remains readable in English.
- User-authored text resembles a translation key: localization leaves it unchanged.

## File Structure

- Create `src/localization/GameI18n.js`: locale selection, translation lookup, DOM application, storage safety, and change notifications; export a testable factory and browser global.
- Create `src/localization/messages.js`: English source strings and Thai translations keyed by stable names.
- Modify `src/index.ejs`: load the localization runtime before `/engine/loader.js` and provide the shared language selector in the outer game interface.
- Modify `src/templates/menu.ejs`, `gui.ejs`, `chat.ejs`, `dev-console.ejs`, `dialogue.ejs`, `inventory.ejs`, `shop.ejs`, `trade.ejs`, and `videochat.ejs`: mark built-in labels, placeholders, and accessibility strings with keys; add menu/game selector placement where needed.
- Modify `src/client.js`: initialize the localization service before UI components, expose it as `ige.client.i18n`, and subscribe to language changes.
- Modify built-in UI modules `src/gameClasses/components/ui/MenuUiComponent.js`, `PlayerUiComponent.js`, `ScoreboardComponent.js`, `ItemUiComponent.js`, `UnitUiComponent.js`, `GameTextComponent.js`, `TradeUiComponent.js`, `VideoChatComponent.js`, and `DevConsoleComponent.js` only where they generate interface wording.
- Create `test/game-i18n.test.js`: locale, fallback, formatting, DOM, and storage behavior.
- Create `test/game-i18n-dictionary.test.js`: require all English and Thai keys and report missing or extra keys.

## Tasks

### Task 1: Build the locale service and dictionary contract

**Files:**
- Create: `src/localization/GameI18n.js`
- Create: `src/localization/messages.js`
- Test: `test/game-i18n.test.js`
- Test: `test/game-i18n-dictionary.test.js`

**Interfaces:**
- Produce `createGameI18n({ messages, storage, document })` returning `language()`, `t(key, values)`, `setLanguage(language)`, `apply(root)`, and `subscribe(listener)`.
- `t()` returns the English source when the selected dictionary or key is missing; replace `{name}`-style parameters as plain string values.
- `setLanguage()` accepts only `en` or `th`, returns false for any other value, safely persists valid values, notifies subscribers only when the locale changes, and reapplies marked DOM text.
- In a browser, publish `window.GameI18n`; in Node, export `createGameI18n` and the dictionaries.

- [ ] **Step 1: Write failing service tests**

Create cases for English default, Thai translation, English fallback on a missing Thai key, parameter substitution, invalid locale rejection, persistence, a throwing storage implementation, and one language-change notification.

```js
const i18n = createGameI18n({ messages, storage: memoryStorage() });
assert.equal(i18n.language(), 'en');
assert.equal(i18n.t('feed.kill', { killer: 'A', victim: 'B' }), 'A eliminated B');
assert.equal(i18n.setLanguage('th'), true);
assert.equal(i18n.t('feed.kill', { killer: 'A', victim: 'B' }), 'A กำจัด B');
```

- [ ] **Step 2: Run the tests and confirm the missing module fails**

Run: `node --test test/game-i18n.test.js`
Expected: FAIL because `GameI18n.js` does not exist yet.

- [ ] **Step 3: Implement the smallest locale service and starter dictionary**

Use English keys as the source contract and corresponding Thai values. Guard storage reads and writes with `try/catch`; substitute only `{identifier}` placeholders. Notify subscribers after a successful language change.

```js
function createGameI18n({ messages, storage, document }) {
  let current = 'en';
  try {
    const saved = storage && storage.getItem('battlefight.language');
    if (saved === 'en' || saved === 'th') current = saved;
  } catch (_) {}
  const listeners = new Set();
  function t(key, values = {}) {
    const template = messages[current][key] || messages.en[key] || key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
  }
  function apply(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
      node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach(node => {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    });
    root.querySelectorAll('[data-language-selector]').forEach(node => { node.value = current; });
  }
  return {
    language: () => current,
    t,
    setLanguage(language) {
      if (language !== 'en' && language !== 'th') return false;
      if (language === current) return true;
      current = language;
      try { if (storage) storage.setItem('battlefight.language', current); } catch (_) {}
      apply();
      listeners.forEach(listener => listener(current));
      return true;
    },
    apply,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
```

- [ ] **Step 4: Run service tests and confirm they pass**

Run: `node --test test/game-i18n.test.js`
Expected: all locale, fallback, storage, interpolation, and notification cases pass.

- [ ] **Step 5: Test dictionary parity before filling the complete UI vocabulary**

Add an assertion that sorted keys match between `messages.en` and `messages.th`; a mismatch reports the missing keys for each language.

```js
assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.th).sort());
```

Run: `node --test test/game-i18n-dictionary.test.js`
Expected: FAIL until every UI key has both values.

- [ ] **Step 6: Fill the complete initial UI dictionary and verify parity**

Add keys used by the templates and components in later tasks, grouped by menu, common actions, combat HUD, scoreboard, chat, inventory/shop, trade, dialogs, errors, and kill-feed wording. Re-run `node --test test/game-i18n-dictionary.test.js`; expected PASS with no missing or extra keys.

```js
const messages = {
  en: { 'common.play': 'Play', 'feed.kill': '{killer} eliminated {victim}' },
  th: { 'common.play': 'เล่น', 'feed.kill': '{killer} กำจัด {victim}' }
};
```

- [ ] **Step 7: Commit the locale service**

```bash
git add src/localization/GameI18n.js src/localization/messages.js test/game-i18n.test.js test/game-i18n-dictionary.test.js
git commit -m "feat: add Thai and English localization service"
```

### Task 2: Localize static templates and expose the language selector

**Files:**
- Modify: `src/index.ejs`
- Modify: `src/templates/menu.ejs`
- Modify: `src/templates/gui.ejs`
- Modify: `src/templates/chat.ejs`
- Modify: `src/templates/dev-console.ejs`
- Modify: `src/templates/dialogue.ejs`
- Modify: `src/templates/inventory.ejs`
- Modify: `src/templates/shop.ejs`
- Modify: `src/templates/trade.ejs`
- Modify: `src/templates/videochat.ejs`
- Test: `test/game-i18n-dom.test.js`

**Interfaces:**
- Consume `window.GameI18n.createGameI18n()` and `apply(root)` from Task 1.
- Static elements use `data-i18n="key"`, placeholders use `data-i18n-placeholder="key"`, and accessibility labels use `data-i18n-aria-label="key"`.
- Both menu and in-game selector use `data-language-selector` and values `en` and `th`.

- [ ] **Step 1: Write failing DOM translation tests**

Use a minimal document stub with elements implementing `textContent`, `getAttribute`, `setAttribute`, and `querySelectorAll`; verify labels, placeholder, and `aria-label` update.

```js
const node = element({ 'data-i18n': 'common.play', textContent: 'Play' });
i18n.setLanguage('th');
i18n.apply(root);
assert.equal(node.textContent, 'เล่น');
```

- [ ] **Step 2: Run the DOM test and confirm the DOM adapter is missing**

Run: `node --test test/game-i18n-dom.test.js`
Expected: FAIL on the absent `apply()` DOM behavior.

- [ ] **Step 3: Implement DOM attribute translation**

Update `apply(root)` to translate `data-i18n`, `data-i18n-placeholder`, and `data-i18n-aria-label` with `textContent` or `setAttribute`, never HTML insertion.

- [ ] **Step 4: Run the DOM test and confirm it passes**

Run: `node --test test/game-i18n-dom.test.js`
Expected: static text, placeholder, and accessibility-label assertions pass.

- [ ] **Step 5: Add the selector and load order**

Load `/src/localization/messages.js` and then `/src/localization/GameI18n.js` before `/engine/loader.js`. The first script publishes `window.GameI18nMessages`; the second publishes the service factory. Add a language selector to the menu layer and game HUD; initialize their value from `language()` and call `setLanguage(select.value)` on `change`.

```html
<label data-i18n="settings.language">Language</label>
<select data-language-selector aria-label="Language">
  <option value="en">English</option>
  <option value="th">ไทย</option>
</select>
```

- [ ] **Step 6: Mark every built-in static template string**

Walk each listed EJS template. Mark only application-authored labels, controls, placeholders, static hints, and accessibility text. Leave custom map/dialogue values, chat messages, names, character names, and model IDs untouched. Confirm each key exists in both dictionaries with `node --test test/game-i18n-dictionary.test.js`.

- [ ] **Step 7: Commit template localization**

```bash
git add src/index.ejs src/templates test/game-i18n-dom.test.js
git commit -m "feat: localize game templates and add language selector"
```

### Task 3: Localize generated messages and live panels

**Files:**
- Modify: `src/client.js`
- Modify: `src/templates/menu.ejs`
- Modify: `src/gameClasses/components/ui/MenuUiComponent.js`
- Modify: `src/gameClasses/components/ui/PlayerUiComponent.js`
- Modify: `src/gameClasses/components/ui/ScoreboardComponent.js`
- Modify: `src/gameClasses/components/ui/ItemUiComponent.js`
- Modify: `src/gameClasses/components/ui/UnitUiComponent.js`
- Modify: `src/gameClasses/components/ui/GameTextComponent.js`
- Modify: `src/gameClasses/components/ui/TradeUiComponent.js`
- Modify: `src/gameClasses/components/ui/VideoChatComponent.js`
- Modify: `src/gameClasses/components/ui/DevConsoleComponent.js`
- Test: `test/game-i18n-dynamic-ui.test.js`

**Interfaces:**
- `ige.client.i18n` is initialized before UI components and exposes the Task 1 API.
- Dynamic messages call `ige.client.i18n.t(key, values)` at the moment they render; they do not cache translated strings across locale changes.
- A locale-change subscriber refreshes currently open panels and visible game text without restarting the match.

- [ ] **Step 1: Write failing dynamic-message tests**

Test one spectator-follow message, one refreshed score/stat label, and one generated shop or trade status under both locales.

```js
assert.equal(i18n.t('spectator.following', { team: 'Red', player: 'AI 1' }), 'Following Red: AI 1');
i18n.setLanguage('th');
assert.equal(i18n.t('spectator.following', { team: 'Red', player: 'AI 1' }), 'กำลังดู Red: AI 1');
```

- [ ] **Step 2: Run dynamic UI tests and confirm generated strings stay fixed today**

Run: `node --test test/game-i18n-dynamic-ui.test.js`
Expected: FAIL because generated UI call sites do not use `i18n` yet.

- [ ] **Step 3: Initialize i18n and replace built-in generated copy**

Initialize the service in `src/client.js` before components are added. Replace application-authored dynamic strings and labels in the listed UI modules and `menu.ejs` with translation keys. Add a refresh function for live statistic rows when the locale changes. Preserve server-provided error detail as a text parameter after a localized prefix.

- [ ] **Step 4: Run dynamic UI tests and confirm locale updates**

Run: `node --test test/game-i18n-dynamic-ui.test.js`
Expected: the same dynamic message, currently visible stats, and status labels reflect both selected languages without reload.

- [ ] **Step 5: Audit built-in wording outside templates**

Search `src/client.js` and the listed UI components for hard-coded user-visible English or Thai strings. Add dictionary keys and replace every built-in string found; do not translate data authored by players or map creators. Re-run both dictionary and dynamic-message tests.

- [ ] **Step 6: Commit dynamic UI localization**

```bash
git add src/client.js src/templates/menu.ejs src/gameClasses/components/ui test/game-i18n-dynamic-ui.test.js src/localization/messages.js
git commit -m "feat: localize generated game interface text"
```

### Task 4: Verify both complete language modes

**Files:**
- Test: `test/game-i18n*.test.js`
- Test: all repository tests via `node --test --test-concurrency=1 test/*.test.js`
- Manual: live local BattleFight UI.

**Interfaces:** consume the completed locale API through selectors and UI components.

- [ ] **Step 1: Run localization-specific tests**

Run: `node --test test/game-i18n*.test.js`
Expected: every service, dictionary, static DOM, and dynamic UI case passes.

- [ ] **Step 2: Run the full suite serially**

Run: `node --test --test-concurrency=1 test/*.test.js`
Expected: exit code 0; record exact pass, skip, and fail counts.

- [ ] **Step 3: Inspect both locales in a local game**

Run `npm run demo`, select English, inspect menu, controls, spectator labels, scoreboard, stats, chat controls, dialogs, and status messages, then switch to Thai during the match and repeat. Reload once in each language to verify persistence and confirm default English with the stored key removed. Confirm names, model IDs, chat content, and custom map/dialogue content remain unchanged.

- [ ] **Step 4: Commit verified UI localization**

```bash
git add test/game-i18n*.test.js
git commit -m "test: verify bilingual game interface"
```
