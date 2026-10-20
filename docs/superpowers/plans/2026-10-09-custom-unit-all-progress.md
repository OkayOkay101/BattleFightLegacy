# Custom Unit: all playable prototypes

Approved brief: the user's 44-prototype plan in this conversation. Source web/Electron only; local assets, no audio; no production training, portable build, commit or push.

- Task 1: independent 44-character catalog, dependency/adapter registry, namespaced forms and shared client/server overlay (implemented).
- Task 2: sandbox identity, transformations, skill readiness/stationary guidance and summon ownership (complete).
- Task 3: editor restrictions/hints and matching English/Thai 44-character tables (implemented).
- Task 4: all-prototype runtime acceptance, browser/Electron and regression (complete).

Ruling: extend the existing uncommitted Custom Unit feature on codex/battlefight-bots in place. Moving to a clean checkout would omit the already approved feature this task extends.
Ruling: 44 means the 45 IDs created by the seven main selection dialogues minus sarLaTkdF2 (legacy Custom Unit). Preserve the existing training roster and exclusions.
Ruling: keep edited health maximum and base movement speed in every form; retain native resources, buffs/debuffs and form equipment. No healing on type changes.
Pre-flight: catalog is consumed by validation, sandbox opponent selection and editor; all must use the new independent roster. Compiler output is consumed by both server startup and the arena game.json endpoint; both must install the same complete overlay.

## Implementation and review

- Preserve schemaVersion 1 and the four previously supported prototypes' generic weapon choices. Other slots require an explicit stateless-slot allowlist; native weapons always remain available.
- Shared sandbox overlay installs secondary forms and extends copied weapon carry/use restrictions. Script identity comparisons keep native aliases; form actions map only custom actors.
- SubLazer's fixed transition heal and reverse fixed HP/speed are suppressed only in its custom context. Its reverse loadout is installed once, with old equipment removed before type changes. Active health/speed cap, floor and regeneration effects carry across custom forms and stream to clients.
- Preserve SubLazer's first-form 1 HP floor to reach the native automatic form transition; the secondary form has floor 0 and can die. Lethal first-form damage changes to the namespaced secondary form at 1 HP without healing; a subsequent lethal hit records one death and respawns the saved custom root. The reverse skill retains its native temporary floor.
- Native temporary buffs and defensive health floors remain executable. A reviewer caught overly broad overrides; those were removed and replaced with the specific SubLazer reverse rule.
- Particle export aliases use the engine's existing particle event. Invalid force callbacks skip missing or coincident positions before calculating an undefined angle, within the isolated sandbox only.
- Rhythm Assassin's coincident cursor/caster geometry now uses the caster facing inside both projectile angle and spawn-position expressions, preserving formula offsets and distance. Missing targets remain skipped. A dedicated live test verifies actual projectile creation, and the reviewer closed the remaining geometry finding.
- Custom heuristic filters explicit skill preconditions and gives script-only abilities cast opportunities. Corkmaster holds stationary while its skill is used, with imminent dodge taking priority. Original opponent selection behavior is untouched.
- Generic projectile equipment uses ranged spacing while selected and restores native spacing on a native weapon. This profile change is isolated to the custom actor.
- Death and damage credit resolve the owner's fixed root custom ID, including attacks sourced from secondary units.

## Verification so far

- `build/custom-natural-special.log`: 47 passed, 0 failed. Includes all 44 autonomous heuristics without forced item use or filled resources, plus SubLazer low-HP speed 0/8 reversal cycles and Hidden Hand self-exclusion. Autonomous acceptance proves at least one equipment use per prototype, not every phase of every skill.
- `build/custom-all-gui.log`: 2 passed, 0 failed, real Electron and Chromium web editor/player windows with Archmage, 44 catalog entries, translation/draft retention, sprite, movement, projectile and process cleanup.
- `build/custom-tenkai-gui.log`: 2 passed, 0 failed for the same real GUI workflow with Tenkai.
- `build/custom-reflection-positive.log`: positive enemy reflection, copy ownership, exclusion of a reflection-only target and reset during pending reflection passed.
- `build/custom-special-complete.log`: earlier seven special-mechanic tests passed; the final nine-case run below also covers automatic SubLazer first-form damage and coincident Rhythm Assassin projectile geometry.
- `build/custom-form-client-order-red.log`: reproduced client cap/value loss after type update. `build/custom-form-client-final.log`: 3 passed after scoped sequential client type/update processing; Electron confirms 7/432 HP and 18/19 speed through both forms with valid sprites. Review of this fix found no outstanding issue.
- `build/custom-sprite-test.log`: Electron decoded all 44 local prototype sheets successfully, no remote image URLs.
- `build/custom-all-source-audit.json`: ten original game/training/controller/schema/PPO/Champion-policy source files match HEAD after newline normalization.
- `build/custom-effects-final.log`: 53 passed, 0 failed (all 44 native skill-effect checks in both controller modes, plus nine special-mechanic cases). Effects exclude `lastUsed` and voice bookkeeping; the dedicated Rhythm Assassin case checks projectile creation at a coincident cursor. SubLazer automatic lethal transition, second-form death/respawn, speed 0/8 and active buffs passed.
- `build/custom-form-delivery.log`: 3 passed, 0 failed, including a fresh real Electron form round trip after the final adapter correction, retaining 7/432 HP and 18/19 speed with valid sprites.
- Documentation verifier: 9 language pairs, 2780 local links, 890 original notices, 769 npm entries, no failures.
- Earlier acceptance runs exposed test timing/revision assumptions as well as real adapter defects. Test saves now create separate variants; defensive floors are allowed to expire; heuristic live caps are checked separately from compiled base caps; reset permits newly cast summons while rejecting stale IDs.

## Final acceptance

- `build/custom-all-verified.log`: `node --test --test-concurrency=1 --test-reporter=tap test/*.test.js` with `TRAINING_PYTHON` set to the existing `training-python/.venv/Scripts/python.exe` — **438 passed, 0 failed, 0 cancelled, 0 skipped**, 846.3 seconds. Covers all 44 prototypes' save/reopen, human and heuristic runtime, every native equipment slot's observable effect, all allowed generic slots, damage, native-opponent and custom death/respawn, reset, autonomous heuristic use, v1 compatibility/API security, and existing game/Neural regressions. CLI/optimizer tests use temporary fixture data, not production training.
- Real GUI evidence: Archmage and Tenkai editor/player workflows each pass in both Chromium web and Electron; the final Electron SubLazer round trip passes after the final adapter corrections. All 44 local sprite sheets decode with Electron. This is not a claim that each of the 44 characters was separately played through a visible GUI window.
- Shared catalog and EN/TH support tables contain 44 entries. Documentation verifier passes all nine language pairs and local links. The ten-file game/training source audit was refreshed after implementation and found no changed production definitions, roster, Neural schema/controller, PPO or Champion-policy source.
- Reviewer findings on buffs/floors, client form packet ordering and nested coincident geometry are resolved. Autonomous heuristic acceptance proves at least one equipment use per prototype, not optimal use of every skill in every situation.
- Final Windows process audit found no remaining `sandbox-entry.js`, custom test-window or neural CLI fixture process. Existing primary gameplay server was not restarted or stopped.

## Delivery boundary

No production training start, portable executable rebuild, commit, push or deployment. Existing primary server remains untouched. Runtime tests use independent ephemeral loopback arenas and temporary saved records.

## Authorized release follow-up — 2026-10-09

The user subsequently requested rebuilding and committing/pushing this work. This authorizes the separate portable build and Git source publication described below; the original implementation boundary above records the earlier scope.

- `npm run desktop:build` completed with exit 0. Artifact: `dist/portable/BattleFight-Portable-1.0.0.exe`, **127,814,399 bytes (127.81 MB / 121.89 MiB)**. SHA256: `da45d0959554c6049dfce62e64614e8e596d60df167cbdbdb678c05123fdf9fc`.
- Packaged resource/ASAR audit: 1,291 resource files, 5,347 ASAR entries, 44 prototypes, 53 selectable policy files. Packaged custom modules and desktop entries match current source. No audio files, Python, optimizer, match/checkpoint history or trainer entry points. Approved default/active remains `n-000027`, previous `n-000024`; no promotion or production training was performed.
- Fresh desktop package tests: **19 passed, 0 failed**. The Windows sandbox blocked atomic temp-file renames (`EPERM`) and the initial builder launch; rerunning the same commands outside that sandbox succeeded without a source change.
- Actual `win-unpacked/BattleFight.exe` and the final portable EXE both passed end-to-end editor/arena checks: 44-entry catalog, save/reopen, valid sprite and 432 HP, separate player arena, keyboard movement, real projectiles, arena cleanup, clean exit 0. The portable wrapper run moved 64.68 engine units and observed two projectiles. Runtime results: `build/custom-packaged-smoke.log`, `build/custom-portable-smoke.log`.
- 7-Zip reports `Everything is Ok` for both the NSIS wrapper and its embedded `app-64.7z` payload (1,364 files). Documentation and language links pass. This executable is unsigned.
- Source changes are prepared for the existing `codex/battlefight-bots` branch. The EXE remains a local build artifact excluded by Git; this commit/push request does not publish a GitHub Release asset. Unrelated reports, backups, caches and production data remain local.
