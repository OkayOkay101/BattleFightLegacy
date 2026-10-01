# Player Guide

[ภาษาไทย](../th/player-guide.md) · [Documentation](index.md)

## Start and choose a mode

For Windows standalone, run the portable `.exe`. It starts its own local server and game window; Node, Python and the training toolchain are not required. Keep browser-server instructions separate from portable play. To run from source, follow [Development](development.md).

Choose **Spectate** to watch Blue and Red bots, or **Play Game** to select a character and join Blue against Red. Use **Enter Game** after selecting options. The desktop edition offers play and AI selection, not training.

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
