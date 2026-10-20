# Custom Units implementation ledger

Approved plan: Custom Unit editor, persistent overlay, isolated local sandbox; web and Electron; human and heuristic only.

- Baseline: codex/battlefight-bots, existing unrelated untracked artifacts preserved. Prior attempt only read files.
- Task 1: catalog/compiler/store and validation (complete).
- Task 2: isolated server process, authenticated lifecycle and 1v1 runtime (complete).
- Task 3: English/Thai editor and Electron integration (complete).
- Task 4: acceptance tests, runtime checks and documentation (complete).
- No production training, portable rebuild, commit or push authorized by this task.
- Ruling: reuse the current feature checkout; no tracked edits existed before resuming.

## Implemented

- Versioned atomic JSON store with revision checks, corrupt-file reporting, independent custom IDs and cloned definitions; no modification to `src/game.json`.
- Four audited prototypes: PewPew, Flaulist, Orlette and Casker. Other 36 roster prototypes display an adapter-required reason. Each slot keeps its original weapon and permits the tested standalone Stardust Storm/Debris Strike weapons.
- English/Thai editor: saved list, clone/edit/copy/delete, sprite preview, original stats and equipment. Switching language preserves unsaved fields.
- Fixed 1v1 arena: human or heuristic, immutable starting snapshot, automatic loopback HTTP/WS ports, fixed respawn, existing cameras/stats, reset and stop. Custom units remain outside production Neural training.
- Separate editor and arena capabilities. Arena WebSocket requires its exact HTTP origin plus token; editor/process-control requests require local host, peer and origin checks.
- Electron creates a separate restricted window and saves records in userData. Browser source opens a new arena window. Window close, parent IPC disconnect and idle lease clean up the arena.
- Startup failures release the lock and partial snapshot, including async child error/close without exit. Stop has a bounded fallback.
- Reset clears delayed skill actions without stopping the game's recurring clock. Lobby death triggers are removed only in the arena so human custom units do not become selectors. Spawn clearance uses actual body size.

## Final verification

- `TRAINING_PYTHON=training-python/.venv/Scripts/python.exe node --test --test-concurrency=2 test/*.test.js`: **281 passed, 0 failed, 0 skipped**. Log: `build/custom-unit-regression.log`.
- `node --test test/custom-unit-electron-smoke.js`: **2 passed, 0 failed**. Actual Electron and Chromium browser windows save through the editor, switch to Thai without losing drafts, load visible custom sprites, accept keyboard/mouse input, move and fire real projectiles, and close the arena child. Saved records reopen after app shutdown from the default userData directory. Log: `build/custom-unit-gui-smoke.log`.
- Runtime adapter tests cover original skills and all replacement slots for each of the four prototypes, resource-cost readiness, Casker summon/self-exclusion, zero/low base speed, damage/kill credit, human death/fixed respawn, reset without stale summons and continuing `timerTick`.
- Arena isolation tests verify separate ports, matching server/client definitions, unchanged originals and production roster, snapshot persistence after edits, rejection of Neural controller and unauthenticated WebSocket, and refused HTTP connections after child stop.
- `node docs/verify-documentation.cjs`: **9 language pairs, 2780 local links, no failures**.
- Fresh read-only code review identified startup lock, WebSocket access and reset clock issues; all were addressed and covered by tests. The reviewer did not run GUI tests; the runtime evidence above was collected by the implementer.

## Distribution limits

- This completes source support for the web and Electron. The existing portable EXE has not been rebuilt or tested with this new feature.
- No production training was started; training-related regression tests used isolated fixtures.
- No commit, push or deployment was performed. Existing unrelated untracked artifacts were retained.
