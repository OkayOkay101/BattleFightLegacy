# Live Kill Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a bounded, real-time list of player eliminations with accurate killer attribution for humans and BattleFight bots.

**Architecture:** Resolve each death on the authoritative server at the existing health-to-zero transition. A small server helper validates and deduplicates the event, updates existing exhibition stats through their current path, and broadcasts only safe display fields. A focused UI component receives events and renders localized text through `ige.client.i18n` from the bilingual UI plan.

**Tech Stack:** Node.js, IGE network events, browser DOM, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-29-live-killfeed-bilingual-ui-design.md`

## Global Constraints

- Each feed entry identifies the credited killer and eliminated player, with team and character context where available. Credit follows the game's server-side hostile-player relationship; unknown, environmental, friendly, and self-inflicted deaths remain visible as eliminations without a credited opposing killer.
- A server-authoritative live feed for deaths of units controlled by a human or BattleFight bot.
- A bounded recent-event list on the game screen, newest first, with readable Thai and English phrasing.
- The feed is presentation-only and does not increment score or statistics independently.
- Escape names through DOM text APIs; never interpolate player-controlled names into HTML.
- Persisting kill history across matches or server restarts. The feed is a live, bounded display; existing match statistics continue to hold aggregate K/D/A.

## Review Focus

- A summon or unit without an owning player dies: no player feed row and no new score.
- Same death transition repeats: at most one event is broadcast.
- Recent attacker is friendly to the victim or is the victim: show elimination without enemy-kill credit.
- Attacker lookup fails or attacker is absent: show an unattributed elimination and keep the server alive.
- Player name contains HTML-like characters: display the literal name without creating markup.

## File Structure

- Create `server/KillFeed.js`: pure validation, ID deduplication, normalized display event creation, and bounded recent history for the running match.
- Modify `src/gameClasses/components/GameComponent.js`: initialize the feed service and provide the server death-recording method.
- Modify `src/gameClasses/components/unit/AttributeComponent.js`: call the common feed hook once when unit health crosses zero, while keeping existing bot-death handling intact.
- Modify `src/client.js`: define and handle the `battleKillFeed` network event and initialize the UI component.
- Create `src/gameClasses/components/ui/KillFeedUiComponent.js`: bounded, newest-first DOM rows; translate event wording through `ige.client.i18n`; render names with text nodes.
- Modify `src/templates/gui.ejs`: add an accessible kill-feed container in the HUD.
- Test: `test/kill-feed.test.js`, `test/kill-feed-hook.test.js`, and `test/kill-feed-ui.test.js`.

## Tasks

### Task 1: Define and test normalized feed events

**Files:**
- Create: `server/KillFeed.js`
- Test: `test/kill-feed.test.js`

**Interfaces:**
- Export `KillFeed` with `recordDeath({ lifeId, victim, attacker, hostile, at })` and `recent()`.
- Participant shape is `{ id, name, teamId, characterId }`; `victim` is required; attacker may be `null`; `hostile` is computed by the server from the existing player relationship. Use a null `name` when no display name exists so the UI can localize the fallback label.
- A valid event is `{ eventId, killer, victim, at }`; `killer` is null unless attacker and victim are distinct opposing-team participants.
- `recordDeath()` returns the normalized event on first valid death and `null` for invalid or duplicate life IDs.
- Keep the newest 12 events in memory; `recent()` returns a defensive array copy, newest first.

- [ ] **Step 1: Write failing pure helper tests**

Cover enemy kill credit, friendly/self/environment elimination, missing identity rejection, duplicate life ID, newest-first ordering, 12-row bound, and defensive-copy behavior.

```js
const feed = new KillFeed();
const event = feed.recordDeath({ lifeId: 'life-1', victim: red, attacker: blue, hostile: true, at: 10 });
assert.equal(event.killer.id, blue.id);
assert.equal(feed.recordDeath({ lifeId: 'life-1', victim: red, attacker: blue, hostile: true, at: 11 }), null);
```

- [ ] **Step 2: Run the helper test and confirm the module is absent**

Run: `node --test test/kill-feed.test.js`
Expected: FAIL because `KillFeed.js` does not exist yet.

- [ ] **Step 3: Implement normalized participant and event rules**

Require a non-empty life ID and victim ID, normalize missing names to `null`, accept only `blue` and `red` team IDs for kill credit, and reject repeat life IDs. An event with no valid enemy attacker still represents a death with `killer: null`.

```js
function safeParticipant(person) {
  return {
    id: String(person.id),
    name: typeof person.name === 'string' && person.name.trim() ? person.name : null,
    teamId: ['blue', 'red'].includes(person.teamId) ? person.teamId : null,
    characterId: typeof person.characterId === 'string' ? person.characterId : null
  };
}

class KillFeed {
  constructor() { this.seen = new Set(); this.events = []; }

recordDeath({ lifeId, victim, attacker, at }) {
  if (!lifeId || !victim || !victim.id || this.seen.has(lifeId)) return null;
  this.seen.add(lifeId);
  const validEnemy = attacker && attacker.id !== victim.id && hostile === true;
  const event = { eventId: lifeId, killer: validEnemy ? safeParticipant(attacker) : null,
    victim: safeParticipant(victim), at: Number.isFinite(at) ? at : Date.now() };
  this.events.unshift(event);
  this.events.length = Math.min(this.events.length, 12);
  return event;
}

recent() { return this.events.slice(); }
}
```

- [ ] **Step 4: Run the helper test and verify all rules**

Run: `node --test test/kill-feed.test.js`
Expected: all attribution, duplicate, bound, ordering, and copy tests pass.

- [ ] **Step 5: Commit the pure event model**

```bash
git add server/training/KillFeed.js test/kill-feed.test.js
git commit -m "feat: model deduplicated kill feed events"
```

### Task 2: Record deaths at the server health transition

**Files:**
- Modify: `src/gameClasses/components/GameComponent.js`
- Modify: `src/gameClasses/components/unit/AttributeComponent.js`
- Test: `test/kill-feed-hook.test.js`
- Reference: `test/training-death-hook.test.js`, `test/training-stats.test.js`

**Interfaces:**
- `ige.game.recordKillFeedDeath(unit, eventContext)` resolves the victim and attacker owners, asks `KillFeed.recordDeath()` for one normalized event, and broadcasts valid events as `ige.network.send('battleKillFeed', event)`.
- The method never changes match score or calls `TrainingStats.recordDeath()`; existing bot/exhibition hook owns those counters.

- [ ] **Step 1: Write failing death-hook tests**

Use small fake units and a fake `ige.network.send`. Verify hostile players emit the expected event, friendly players emit an unattributed elimination, no-owner summons are ignored, same life twice emits once, and existing `handleBattleBotDeath()` remains called.

```js
game.recordKillFeedDeath(unit, { attackingUnitId: 'attacker-unit' });
assert.equal(sent[0].event, 'battleKillFeed');
assert.equal(sent[0].payload.killer.id, 'blue-player');
assert.equal(sent.length, 1);
```

- [ ] **Step 2: Run the hook test and confirm the method is absent**

Run: `node --test test/kill-feed-hook.test.js`
Expected: FAIL because GameComponent has no feed recorder yet.

- [ ] **Step 3: Initialize the feed and call it on server death**

Add a `KillFeed` instance to `GameComponent.init`. Implement `recordKillFeedDeath` to resolve owner identity fields from the unit and player stats, with player `id()` and display name, team ID when present, and selected/current character. Resolve attacker only from `eventContext.attackingUnitId`; set `hostile` when owners are distinct and either owner's existing `isHostileTo()` method reports the other hostile. In `AttributeComponent`, invoke the new method only in the server branch when unit health changes from positive to zero; preserve the existing trigger and bot-death call.

```js
if (newValue <= 0 && oldValue > 0 && this._entity._category === 'unit' && attributeTypeId === 'health') {
  if (ige.game.recordKillFeedDeath) ige.game.recordKillFeedDeath(this._entity, triggeredBy);
  ige.trigger.fire(`${this._entity._category}AttributeBecomesZero`, triggeredBy);
  if (ige.game.handleBattleBotDeath) ige.game.handleBattleBotDeath(this._entity, triggeredBy);
}
```

- [ ] **Step 4: Run hook, death, and training statistics tests**

Run: `node --test test/kill-feed-hook.test.js test/training-death-hook.test.js test/training-stats.test.js`
Expected: all kill-feed hook tests pass; existing death and K/D/A results remain unchanged.

- [ ] **Step 5: Commit server death integration**

```bash
git add src/gameClasses/components/GameComponent.js src/gameClasses/components/unit/AttributeComponent.js test/kill-feed-hook.test.js
git commit -m "feat: broadcast authoritative player eliminations"
```

### Task 3: Receive and render feed events in the HUD

**Files:**
- Modify: `src/client.js`
- Create: `src/gameClasses/components/ui/KillFeedUiComponent.js`
- Modify: `src/templates/gui.ejs`
- Test: `test/kill-feed-ui.test.js`
- Dependency: `docs/superpowers/plans/2026-09-29-bilingual-game-ui.md` Task 1 and Task 2.

**Interfaces:**
- Client network definition `battleKillFeed` passes the normalized event to `ige.client.killFeed.add(event)`.
- `KillFeedUiComponent.add(event)` prepends one row, retains at most 12 rows, and renders via `ige.client.i18n.t()`.
- Translation keys are `feed.kill` (`{killer} eliminated {victim}`), `feed.elimination` (`{victim} was eliminated`), and `feed.team.blue` / `feed.team.red`.

- [ ] **Step 1: Write failing UI rendering tests**

Use fake DOM nodes and an i18n stub. Verify a killer row, an unattributed row, latest-first order, 12-row bound, and literal text for a name such as `<img src=x>`.

```js
ui.add({ killer: { name: '<img src=x>', teamId: 'blue' },
  victim: { name: 'Victim', teamId: 'red' }, at: 10 });
assert.equal(row.textContent, '<img src=x> eliminated Victim');
assert.equal(row.children.length, 0);
```

- [ ] **Step 2: Run the UI test and confirm the component is missing**

Run: `node --test test/kill-feed-ui.test.js`
Expected: FAIL because `KillFeedUiComponent.js` does not exist yet.

- [ ] **Step 3: Implement the UI component and network handler**

Add the HUD container with `aria-live="polite"` and a screen-reader label. Create rows using `document.createElement` and `textContent`. Register `battleKillFeed` with the other client network definitions. Attach the UI component with other components in `src/client.js` after `ige.client.i18n` is initialized.

- [ ] **Step 4: Run UI and event integration tests**

Run: `node --test test/kill-feed-ui.test.js test/kill-feed-hook.test.js test/kill-feed.test.js`
Expected: one normalized server event renders exactly one safe, localized feed row.

- [ ] **Step 5: Commit client feed and HUD**

```bash
git add src/client.js src/gameClasses/components/ui/KillFeedUiComponent.js src/templates/gui.ejs test/kill-feed-ui.test.js src/localization/messages.js
git commit -m "feat: render localized live kill feed"
```

### Task 4: Verify the combined feature in game

**Files:**
- Test: all `test/kill-feed*.test.js` and `test/game-i18n*.test.js`
- Test: full repository suite.
- Manual: local BattleFight match with human and bot players.

**Interfaces:** uses `GameI18n` from `src/localization/GameI18n.js` and `KillFeedUiComponent` through the normal client component lifecycle.

- [ ] **Step 1: Run focused kill feed and localization tests**

Run: `node --test test/kill-feed*.test.js test/game-i18n*.test.js`
Expected: all focused tests pass.

- [ ] **Step 2: Run the full suite serially**

Run: `node --test --test-concurrency=1 test/*.test.js`
Expected: exit code 0; record exact pass, skip, and fail counts.

- [ ] **Step 3: Verify a live match**

Run `npm run demo`, observe several bot eliminations, and confirm the feed names both sides once per death. Switch English to Thai while the match continues, verify the current and next rows use the selected language, and confirm environment eliminations show no credited killer. Check existing score and K/D/A totals still change exactly once.

- [ ] **Step 4: Commit combined regression coverage**

```bash
git add test/kill-feed*.test.js test/game-i18n*.test.js
git commit -m "test: cover live kill feed and bilingual UI"
```
