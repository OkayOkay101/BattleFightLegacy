# Standalone update — 2026-10-01

User explicitly requested updating the standalone executable and GitHub after stopping production training. This manual release supersedes waiting for a newer champion for this build; promotion criteria and approved policy pointers remain unchanged.

- Build: existing `npm run desktop:build`, Windows x64 Electron portable.
- Local artifact: `dist/portable/BattleFight-Portable-1.0.0.exe`.
- Size: 127,797,454 bytes (127.80 MB / 121.88 MiB).
- SHA256: `E628EA0BDF5621AA67414219F6844D8B074D8E54F55418245FE809349F839FD2`.
- Includes projectile/dodge and kill-attribution fixes, Neural schemas 1/2/3 and team model selection.
- 826 visual files, zero missing source visuals, zero fallback unit visuals; 53 selectable policies.
- Approved default/active seed: n-000027; previous n-000024. Unapproved candidates are manual selections, not new champions.
- Staged and packaged resource audit: 1,281 files; no audio, Python, trainer, optimizer, matches or checkpoint artifacts. app.asar enumerated 5,347 entries.
- Actual development Electron smoke: 2/2 passed, selecting schema3 n-000052; 9 player units, 6 valid visible sprites, all 6 requested projectile textures, successful utility-process dependency resolution.
- Fresh regression: 266/266 passed, zero skipped, using the absolute installed Python interpreter path. An earlier invocation with a relative Python path caused four test failures; no source change was needed to correct the invocation.
- Portable embedded archive integrity: 7-Zip reports Everything is Ok, 1,354 files. Its trailing-data warning accompanies the self-extracting executable wrapper.
- Limit: runtime smoke uses the current Electron entry and packaged resources; this report does not claim a manual interactive launch of the rebuilt portable wrapper. Executable is unsigned.
- Training remains stopped; release heartbeat remains paused. Production checkpoint and backups remain local.

Source is pushed to the existing codex/battlefight-bots branch. Executable is distributed as a private GitHub Release asset rather than a Git source blob.
