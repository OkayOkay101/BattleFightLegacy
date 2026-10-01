# Development and Standalone Packaging

[ภาษาไทย](../th/development.md) · [Documentation](index.md)

## Prerequisites

Work in the nested `taro-engine` repository, not its parent or the sibling export. The current Windows release was built with Node 24.19.0 and Electron 44.3.0; this is a verified environment snapshot, not a guarantee that every Node version supported by the upstream README works. Install the lockfile dependencies with `npm ci` when preparing a development environment. This can access the network.

Python is only needed for training. `training-python/environment.json` records Python 3.14.7, Torch 2.14.0+cpu and NumPy 2.5.3 (verified 2026-09-25); `requirements.in` pins Torch/NumPy package versions. Install matching CPU wheels from the recorded official Torch index if recreating this environment. Other hardware/platforms need compatible wheels and independent validation. Tkinter is required for the Python GUI; web controls remain a separate entry.

## Commands

Run from the repository root:

```powershell
npm run server
npm run demo
npm run train:status
npm run train:3v3 -- --neural on --neural-schema 3 --workers 4 --speed max
npm run train:stop
npm run train:gui
npm run desktop:build
```

These are alternative operations, not a script to run sequentially. `server`/`demo` start a source game server; `demo` requests the latest demo policy according to runtime policy resolution. Inspect the actual resolved model rather than assuming latest means champion. `train:3v3` starts/resumes training; schema3 and four workers are the modern defaults for neural training. Max speed requires parity preflight and can fall back to realtime when parity fails. Inspect CLI status/logs for the chosen mode.

For the current source server, open `http://127.0.0.1/` (HTTP port 80). The game WebSocket normally uses port 2001 or `PORT`; setting `PORT` does not change that source HTTP port. Desktop uses dynamically allocated loopback HTTP/WebSocket ports. Read startup output if a port is occupied.

`launch-ai-gui.bat` is the Windows launcher for the training/server workflow. The portable executable does not require it. Do not change gameplay/schema/reward source while a frozen production training environment is running; keep diagnostics and fixtures out of the production optimizer and registry.

## Checkpoints and stopping

`train:status` should be checked with live PID, `supervisor.lock.json`, timestamps and schema-specific checkpoint. Do not start a second supervisor against a locked production directory. Status, models, optimizer state and match logs under `training-data` are local runtime data, not documentation or distributable trainer assets.

**Important stop behavior:** `train:stop` stops dispatch and initially drains active matches, but its daemon escalates to aborting workers after **30 seconds**. It therefore does not guarantee that every long match finishes. The existing operational helper provides a no-timeout drain:

```powershell
node tools/stop-training-after-evaluation.js
```

For a running evaluation it waits for the current candidate evaluation result, then sends stop. During train phase it requests stop immediately. After the supervisor acknowledges the latched stop, it removes that consumed request to prevent the 30-second abort escalation and lets started matches finish. It checks the original run/lock, refuses another run, and has a 20-minute monitoring deadline; reaching the deadline needs status inspection, not a blind restart. Completed pending matches are saved for resume and may not have formed the minimum PPO batch. Verify `stopped`, active zero, PID exit and lock removal. A failed/partial match must not be accepted as a full training trajectory.

## Offline build

`desktop:build` prepares local resources then uses electron-builder for a Windows x64 portable EXE at `dist/portable/BattleFight-Portable-1.0.0.exe`. Preparation rewrites supported asset URLs to local paths, optimizes PNG data and removes audio references/files. It bundles approved-pointer metadata and available numbered policies for manual selection, while excluding Python, optimizer/checkpoint/match data and training mutation tools. The default seed follows the approved champion, not the largest candidate number.

Missing visuals or unsupported asset origins can cause preparation failure; do not replace these errors with a silent network dependency. Browser vendor code and Font Awesome webfonts are copied locally. Source readme/licenses are not automatically shipped merely because they exist in the repository; see [notice gaps](licenses.md).

## Existing validation commands

Use these only when verifying an implementation/release; writing documentation does not start them:

```powershell
$env:TRAINING_PYTHON = (Resolve-Path training-python/.venv/Scripts/python.exe).Path
node --test test/*.test.js
npm run test:desktop:runtime
$env:BATTLEFIGHT_SMOKE_POLICY = 'n-000052'
$env:BATTLEFIGHT_SMOKE_SCHEMA = '3'
npm run test:desktop:game
```

The example candidate must exist in the prepared resources; it is not a default-champion recommendation. Absolute Python paths are needed because trainer subprocesses change working directory. Actual Electron tests require an interactive-capable Windows environment. Archive/build success does not replace a manual portable-window check. [Release snapshot](../reports/standalone-2026-10-01.md) distinguishes what was verified.
