# Custom Units

[ภาษาไทย](../th/custom-units.md) · [Documentation](index.md)

Open **Custom Units** from the main game menu. Choose a prototype, enter a name, health and movement speed, choose equipment, then press **Save**. Select a saved unit to edit, duplicate or delete it. English is the default; the game language selector also translates the editor.

## Prototypes and equipment

All **44 playable characters from the original selection menu** are supported, including Emo & Sky, Sixth Diva, Roboto and Zaprytos. Unfinished characters outside that menu, summons, selectors and the old character named Custom Unit are excluded. The custom catalog is independent of the production training roster.

Every slot retains its original weapon. Audited slots also offer the independently usable **Stardust Storm** and **Debris Strike** weapons. Other slots are locked to native equipment because their state, resource, summon or form mechanics depend on it; the editor explains each restriction. Existing saved PewPew, Flaulist, Orlette and Casker variants retain their equipment choices. Images, skill scripts and resources are inherited. Image uploads, custom scripts, damage/cooldown editing and cross-character skill composition are not included.

Names contain 1–80 characters. Health is 1–100000, and base speed is 0–100 in the engine's movement units; zero means stationary before skill buffs. Original skills can temporarily modify these values. The editor shows the prototype's original values for comparison.

## Separate arena

Save the unit, choose **Player** or **Heuristic**, choose an opponent and press **Start test**. Web users must allow the popup; Electron opens a separate window. The arena uses two loopback ports chosen by the operating system and runs a fixed 1v1 lineup independently of the main game.

Use WASD, the mouse, left click and equipment keys 1–4. The existing follow/overview/free camera controls and statistics panel are available. **Restart** clears old actors, summons, traps, projectiles and pending skill callbacks, then resets both main units, scores and statistics. Fresh heuristic actors can summon again after the restart. Death respawns the same selected character after three seconds. **End test** stops the separate server. Closing its window also stops it; a lost browser session expires after up to 90 seconds without a heartbeat.

The arena loads a snapshot when it starts. Editing or deleting the saved unit does not mutate an active test. Start a new test to apply edits. One arena is allowed per main server, and a player-controlled arena admits one active human; additional clients spectate.

## Storage and compatibility

- Web: `custom-units/` beside the game server source.
- Electron: `custom-units/` in Electron userData, normally `%APPDATA%/BattleFight/`.
- `BATTLEFIGHT_CUSTOM_UNITS` overrides this directory for local development or tests.

Each JSON record has `schemaVersion: 1`, an independent `cu-` ID, revision, prototype ID, name, stats, equipment and modification time. Writes use a temporary file and atomic rename; edits and deletion require the current revision. Corrupt files and unsupported saved prototypes are reported instead of silently replaced. These files are excluded from Git and the portable seed package.

The editor and process-control API are available only from the server computer, require a loopback host and reject cross-origin requests. Write operations require the editor session token; arena WebSocket connections and reset/stop use a separate token. WebSocket connections also require the arena's exact origin. Tokens are not stored in saved unit records.

Custom units and secondary forms use separate renderer IDs; damage, kill/assist and life statistics stay under the root custom character. Script comparisons resolve native identity only in the relevant context, including Casker and Hidden Hand self-exclusion. SubLazer forms inherit the edited maximum health and base speed without restoring health merely by transforming. Native temporary buffs, debuffs, resource costs and defensive health floors remain active. The arena uses local assets and no audio. Custom units never join the production training roster and do not modify Neural schemas, policies, checkpoints or promotion gates. Starting this feature does not start training.

Web source and the portable build rebuilt on 2026-10-09 include this editor and arena. Older portable executables do not include it.

## Skill guidance

The isolated heuristic retains native targeting, aiming and movement and checks skill resource/state prerequisites before selecting equipment. Script-only skills receive their own cast opportunities. Corkmaster holds position for its stationary skill unless an imminent projectile requires a dodge; Tenkai uses its native projectile, barrier and summon scripts. The editor identifies resource, form, summon and stationary requirements. This guidance is for the sandbox and does not change production bot decisions.

Selected generic projectile weapons use ranged spacing; selecting a native weapon restores the prototype's spacing. SubLazer keeps the first form's native 1 HP floor so lethal damage can trigger the automatic secondary form. That form retains 1 HP, receives no transformation heal and has a zero health floor so the next lethal hit can kill it. A respawn returns to the saved root custom unit. Active buffs and debuffs carry across forms and their values reach the client after its type update.

## Supported characters

All rows support player and heuristic control. Slot numbers start at 1. A dash means native weapons only; every original weapon is always available.

| Character | Generic weapon slots | Additional requirements |
| --- | --- | --- |
| Archmage | 1, 2, 3, 4 | — |
| Alchemist | 1, 2, 3, 4 | — |
| Nadia | 1 | — |
| The Elements | 1 | — |
| Commander | — | Summons / secondary units |
| Corkmaster | — | Summons / secondary units, Stationary skill |
| Reimu & Marisa | — | Resources, Summons / secondary units |
| Razor's Edge | — | Resources |
| Toxic Brillance | 1 | — |
| Fool's Gambit | — | Resources |
| Hidden Hand | — | Summons / secondary units |
| Propeller | — | Resources |
| Crackshot | — | Resources |
| Overlord | — | Resources, Summons / secondary units |
| Sukune | — | Resources, Summons / secondary units |
| Shadow Dancer | 1 | — |
| Berserker | — | Resources, Summons / secondary units |
| Grand Artificer | — | Resources, Summons / secondary units |
| Reaper | — | Resources |
| Dual Assassin | — | Summons / secondary units |
| Hunter | — | Resources, Summons / secondary units |
| Reeze | — | Resources |
| Minato | — | Resources |
| Assassin Double | — | — |
| Cannonstriker | 1 | Summons / secondary units |
| Pekk | 1 | — |
| Gata | 1 | Summons / secondary units |
| Plator | — | Resources |
| Echo | 1 | Resources |
| SubLazer | — | Resources, Forms, Summons / secondary units |
| Shinobi | 1 | Resources |
| Bush Man | — | Summons / secondary units |
| Orlette | 1, 2, 3, 4 | Summons / secondary units |
| Flaulist | 1, 2, 3, 4 | Resources |
| PewPew | 1, 2, 3, 4 | — |
| Ming | — | Resources, Summons / secondary units |
| Tenkai | — | Resources, Summons / secondary units, Projectile / barrier control |
| Casker | 1, 2, 3, 4 | Resources, Summons / secondary units |
| Rhythm Assassin | — | Resources |
| Sixth Diva | 1 | — |
| Engineer | — | Summons / secondary units |
| Emo & Sky | 1 | — |
| Roboto | 1 | — |
| Zaprytos | 1 | — |
