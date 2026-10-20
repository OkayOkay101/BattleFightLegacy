# Player Guide

[ภาษาไทย](../th/player-guide.md) · [Documentation](index.md)

## Start and choose a mode

Download the Windows game from [GitHub Releases](https://github.com/OkayOkay101/BattleFightLegacy/releases/latest). The file on GitHub is `BattleFight-Portable-1.0.0-no-touhou.exe`, the **GitHub edition**: every character except Reimu & Marisa (see [Releasing](releasing.md#editions)). Windows may warn that the EXE is not signed; check its SHA256 against the release page, then choose **More info → Run anyway**.

For Windows standalone, run the portable `.exe`. It starts its own local server and game window; Node, Python and the training toolchain are not required. Keep browser-server instructions separate from portable play. To run from source, follow [Development](development.md).

Choose **Spectate** to watch Blue and Red bots, or **Play Game** to select a character and join Blue against Red. Use **Enter Game** after selecting options. The desktop edition offers play and AI selection, not training.

## Custom content

The web game and the 2026-10-09 portable build provide [Custom Units and Weapons](custom-units.md), editors with a separate player/heuristic test arena. The equipment catalog change described below is newer source behavior; consult [build notes](release-notes.md) before comparing an older EXE.

### Workflow

1. Open **Custom Weapons**, create single/spread/burst equipment, set damage, speed, range and cooldown, then save.
2. Open **Custom Units**, select one of 44 prototypes, set name/health/speed, choose native or saved custom equipment, then save.
3. Choose player or heuristic control and an original opponent; **Test** opens an independent local 1v1 arena. Use **Restart** for a fresh match or **End test** to close its server.

Source equipment no longer offers Stardust Storm/Debris Strike as extra cross-character choices. PewPew keeps its native versions; previously saved selections remain compatible. Replacing a native skill with a custom weapon can disable skill-dependent forms/resources/summons. Edits apply to the next arena, not one already running. Custom characters are not included in normal matches or Neural training.

## Solo Test

Open **Solo Test** on the main page. Choose any of the 45 playable characters (Morrow is selected initially), then **Start test**. A separate local arena opens in a browser tab or an Electron window. Enter the arena using **Enter Game**; the selected character spawns directly, without a character picker or automatic opponents.

- **Add target dummy** creates a stationary enemy PewPew nearby, up to 16 targets. Damage, kills and deaths use the existing statistics. This is a test session, not a training win-rate evaluation.
- **Die / respawn** exercises the selected character's death lifecycle and respawns it after about 3 seconds. Native transformations, health floors and skills remain available; this button explicitly allows testing death even with a native health floor of 1.
- **Restart** clears targets, projectiles, summons, pending sandbox skill timers and session statistics, then respawns the chosen character.
- **End test** stops the isolated server. Closing its tab/window also requests shutdown; the local heartbeat watchdog is a fallback if the close request is lost. Only one Custom/Solo arena can run per main game server.

Use the existing movement, equipment, camera and statistics controls. Morrow's Compass/Banked projectiles are now 44×44 world pixels and its marker is 64×64; their collision dimensions were enlarged accordingly. Atlas shows a constant-width attack band along the wall-clipped route, warns for 0.8 seconds and damages a target once. Banked Delivery travels to the marker's center before following the aim direction captured on cast. Marker lifetime is 7 seconds; replacement, death and reset clean it up.

Solo uses native characters rather than custom clones. Custom Unit adapters remain limited to the original 44 supported prototypes. Solo does not add Morrow or custom units to Neural training. Solo Test and Morrow are in the 2026-10-20 portable build; EXEs from 2026-10-09 and earlier do not have them.

## Renamed characters and skills

From 2026-10-21 some names changed; gameplay did not. Corkmaster is now **Cork** (skills **Shot!, Blow!, Bait!, Block!**), Manish's Morphling weapon is now **Morph**, and Marigold's Malevolent Orchid is now **Orchid**.

## Controls and cameras

- Default movement uses WASD or arrow keys; aim with the mouse and use the active item with the primary mouse button. Character-specific controls/skills are configured in the game data; do not assume every character shares the same skill keys or conditions.
- **Follow player** tracks the selected player. **Auto** chooses an available target; **Next player** changes the target. Team and target selectors help choose Blue/Red participants.
- **Overview** shows the map. **Free camera** uses right-button dragging to pan and the mouse wheel to zoom; switch back to Follow to resume tracking. Camera controls are available in both play and spectator modes.
- A dead player's unit may temporarily be absent. Automatic targeting can choose another living unit; a manually pinned target may be unavailable until respawn.
- Select English or Thai from the language control. Error Handling and Compatibility uses English as its configured default.

## AI selection

Blue and Red can use different models. `champion` resolves to the approved champion; a numbered model such as `n-000052` is a fixed selection and is not automatically a champion. The UI exposes requested and resolved models/schema. Champion alias refresh happens at a round boundary rather than replacing a model midway through a match.

## Kill feed and statistics

Kill feed shows recent combat deaths and their credited sources. Score and stats display the current demo/session context; training validation win rate is a separate measurement.

| Statistic | Meaning |
|---|---|
| Kill / Death / Assist | Credited enemy kills, recorded deaths and recent contributing damage assists |
| KDA in the demo UI | `(kills + assists) / max(1, deaths)`; with zero deaths, the denominator is 1 |
| Win rate in the demo UI | `(wins + 0.5 × draws) / completed games`; the UI credits a draw as half a win |
| Damage dealt / taken | Recorded health damage, not DPS or projectile hit accuracy |
| Character appearances | Games/lives in which a character appeared; a game can include multiple characters after respawns |

Character win rate in the [historical report](../reports/neural-characters-n27-plus.md) is team victory in games where that character appeared. It does not isolate the effect of choosing that character for an entire match.

Historical exports/reports can use a different zero-death convention and raw win rate (`wins / games`) rather than the demo UI's draw-adjusted score. Read their stated formulas rather than treating every displayed value as the same calculation.

## Offline edition and troubleshooting

Standalone bundles visuals and browser dependencies locally, blocks external renderer requests, and removes audio. Model selection persists in the desktop user-data directory. Closing the game window shuts down its owned server process.

If a model/sprite fails to load, preserve the startup log and selected model IDs. The desktop log is `desktop-startup.log` under Electron's BattleFight user-data directory, normally `%APPDATA%\BattleFight`. Do not delete local model selections or policies before recording the issue. An unsigned executable can trigger Windows security prompts; the release report identifies the exact artifact and hash.
