# BattleFight Documentation

[ภาษาไทย](../th/index.md) · [Repository README](../../README.md)

English is the default documentation language. Every guide has a corresponding Thai page. These guides describe the current local implementation; historical evaluation reports are dated snapshots, not live training status.

| Guide | Contents |
|---|---|
| [Player guide](player-guide.md) | Starting a game, controls, teams, cameras, language, kill feed and statistics |
| [Architecture](architecture.md) | Client/server, game definitions, physics, skills, projectiles and attribution |
| [AI and training](ai-training.md) | Heuristic/Neural models, observations, PPO, checkpoints and promotion |
| [Development](development.md) | Prerequisites, commands, training stop behavior and offline packaging |
| [Licenses](licenses.md) | License scope, asset provenance, notices and unresolved evidence |
| [Component inventory](license-inventory.md) | Exact dependency versions, copied notices and distribution evidence |
| [Credits](credits.md) | Taro contributors, dependencies and AI-assisted development |

## Implementation and results

- Authoritative game definition: `src/game.json`; the separate exported game repository is not the active server definition.
- [Standalone release snapshot, 2026-10-01](../reports/standalone-2026-10-01.md).
- [Character statistics snapshot](../reports/neural-characters-n27-plus.md); team victories during character appearances are not isolated character strength tests.
- [Neural transfer comparison](../superpowers/plans/2026-10-01-neural-transfer-comparison.md).
- Some historical implementation reports are Thai or mixed-language records. The public guides in this index have matching English and Thai editions.

Development and redistribution evidence must be kept separate: being able to build an executable does not establish permission to redistribute every included asset.
