# Live Kill Feed and Thai/English UI Design

## Goal

Add a real-time kill feed to BattleFight and let players switch the built-in game interface between Thai and English. The selected language persists between visits. Existing training K/D/A statistics remain the source of match totals; the feed provides the live event view.

## Current State

- `server/training/TrainingStats.js` counts kills, deaths, assists, and damage for training and exhibition participants.
- `src/gameClasses/components/unit/AttributeComponent.js` detects a unit's health transition from positive to zero and builds attacker context before firing the existing death trigger.
- `src/gameClasses/components/GameComponent.js` handles BattleFight bot death, respawn, and exhibition statistics.
- `src/templates/menu.ejs` contains the Thai spectator controls and live exhibition statistics, alongside training controls and status messages.
- Other built-in interface text is distributed across EJS templates and UI components. There is no shared language selection or translation service.

## Scope

### Included

- A server-authoritative live feed for deaths of units controlled by a human or BattleFight bot.
- Each feed entry identifies the credited killer and eliminated player, with team and character context where available. Unknown, environmental, and self-inflicted deaths remain visible as eliminations without a credited opposing killer.
- A bounded recent-event list on the game screen, newest first, with readable Thai and English phrasing.
- A shared Thai/English localization service for built-in game UI: start and mode controls, spectator controls, combat HUD labels, scoreboard, statistics, chat controls, inventory/shop dialogs, system prompts, and application-generated status/error messages.
- A visible language selector in the menu and in-game interface. Store its choice in browser local storage; default to Thai when no valid choice exists.
- Re-render visible and subsequently generated UI text when the language changes, without reloading the match.
- Translation of accessibility text such as button labels, input placeholders, and ARIA labels where they are part of the built-in interface.
- Tests for kill attribution and deduplication, feed event delivery/rendering, language persistence, dictionary completeness, and dynamic UI text updates.

### Excluded

- Translating user-authored game content, including player chat, custom map/dialogue text, user-created UI, usernames, model IDs, and character names.
- Persisting kill history across matches or server restarts. The feed is a live, bounded display; existing match statistics continue to hold aggregate K/D/A.
- Changes to combat rules, scoring, respawn behavior, AI policy, or training outcomes.

## Design

### Localization

Add a focused localization module with `th` and `en` dictionaries, a validated current-language setting, a translation lookup with parameter substitution, and a change event for UI consumers. Read and validate the saved language at startup; write a new value whenever the player changes it. Missing keys must fall back to the Thai source string and be detectable by a test so new UI text cannot silently ship untranslated.

Templates mark static built-in strings with translation keys. UI components and asynchronous status/error updates use the same lookup function rather than embedding localized sentences in event handlers. Switching language updates static labels, accessibility attributes, and current dynamic panels without disturbing game state. User-authored content remains data and is not passed through the translation dictionaries.

### Kill event and display

At the server-side health transition to zero, resolve the dead unit's owning player and the recent attacking unit's owning player. Ignore units without a player owner. Deduplicate using the dead unit/life ID so repeated health callbacks cannot create duplicate feed entries. Credit a kill only when killer and victim are distinct players on opposing teams; still emit an elimination event when killer attribution is absent or invalid.

Broadcast a compact event containing stable player IDs, display names, team IDs, character IDs when available, and server event time. Do not include arbitrary entity objects or client-provided text. The client keeps a bounded list of recent events and renders names as text nodes, with localized team and elimination wording. The feed is presentation-only and does not increment score or statistics independently.

The training and exhibition statistics path remains responsible for aggregate kills/deaths/assists. Feed emission and statistics recording share the server death transition and identity resolution so they describe the same death, while their storage and display responsibilities remain separate.

## Error Handling and Compatibility

- If language storage is unavailable or contains an unknown value, use Thai and keep the selector usable for the current session.
- If a translation key is missing at runtime, display its Thai source text; automated dictionary checks report the missing English key.
- If a death has no resolvable player owner, do not emit a player kill-feed row.
- If killer ownership cannot be resolved, show an elimination without a credited killer.
- Escape names through DOM text APIs; never interpolate player-controlled names into HTML.
- Keep existing English acronyms, model IDs, and character names unchanged unless they are ordinary built-in UI labels.

## Validation

- Unit tests verify opposing-team kill credit, friendly/self/environment elimination behavior, non-player unit filtering, and duplicate death suppression.
- Integration tests verify one server death produces one client feed entry with the expected identity/context fields.
- Localization tests verify Thai default, English/Thai persistence, invalid saved-value fallback, parameter substitution, and missing-key detection.
- UI checks verify language changes update the spectator and combat screens, statistics, and asynchronously generated status text without a reload.
- Run the repository's full JavaScript test suite and manually inspect both language modes in a live local game.

## Implementation Boundaries

Likely implementation areas include `src/gameClasses/components/unit/AttributeComponent.js`, `src/gameClasses/components/GameComponent.js`, `src/client.js`, `src/templates/*.ejs`, `src/gameClasses/components/ui/*.js`, and focused tests under `test/`. Keep the localization dictionary and feed rendering logic in focused modules rather than expanding the existing large template script further.
