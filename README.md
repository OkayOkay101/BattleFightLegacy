# BattleFight

Top-down 2D team arena game built on the Taro engine, with heuristic and Neural bots, 45 characters in Solo Test, custom units and weapons, and an offline Windows portable build.

**English** · [ภาษาไทย](README_TH.md)

## Features

- **Play or spectate:** join the Blue team or watch heuristic and Neural bots fight with a live kill feed and match stats.
- **Solo Test:** isolated arena with all 45 characters and stationary target dummies.
- **Custom Units & Weapons:** create unit variants (44 supported characters) and single, spread, or burst weapons locally.
- **Bilingual UI:** switch between English and Thai in the browser or Windows portable app.

## Requirements

- Node.js and npm (for running from source or building the desktop app)
- Windows (for the standalone `BattleFight-Portable-1.0.0-no-touhou.exe` release)

## Setup and play

```powershell
npm ci
npm run demo
```

Open `http://127.0.0.1/` in your browser. Controls: `WASD` to move, mouse to aim, left click to fire, `1–4` to switch equipment.

Or download `BattleFight-Portable-1.0.0-no-touhou.exe` from [GitHub Releases](https://github.com/OkayOkay101/BattleFightLegacy/releases/latest) (see [Releasing](docs/en/releasing.md#editions) for edition differences).

## Build and tests

```powershell
npm install
npm run desktop:build
npm run test:desktop
```

## Documentation and project layout

- [Documentation index](docs/en/index.md) · [Player guide](docs/en/player-guide.md) · [Release notes](docs/en/release-notes.md)
- [Architecture](docs/en/architecture.md) · [AI and training](docs/en/ai-training.md) · [Development guide](docs/en/development.md)
- [Third-party notices](docs/licenses/THIRD-PARTY-NOTICES.md) · [Character credits](docs/licenses/CHARACTER-CREDITS.md) · [License](LICENSE)
- `src/`, `server/`, `engine/`, `desktop/`, `test/`: game logic, server, Taro engine, Electron wrapper, and tests
