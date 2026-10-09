# Custom Weapon Editor and duplicate damage — progress

Approved specification: user's Custom Weapon Editor พร้อมแก้บั๊กดาเมจซ้ำ plan, 2026-10-09.
Base: b9f87aae3010b3b37f6589a5353d495256e1dbbe. Original implementation delivery excluded commit/push/release and training; the user subsequently authorized a documentation refresh and GitHub commit/push.

## Tasks
1. Reproduce real scripted projectile damage through engine contact callback; fix duplicate dispatch and preserve attribution/owner mechanics.
2. Versioned atomic weapon store, compiler, custom-unit references, CRUD and immutable sandbox snapshots.
3. Server authoritative single/spread/burst, cleanup, range, capacity and sandbox heuristic.
4. English/Thai editor and documentation.
5. Automated runtime matrix, real web/Electron, review, offline/no-audio portable build and executable checks.

## Rulings
- Work in the existing feature checkout (`codex/battlefight-bots`) so the user's source and local server can use the delivered changes; preserve pre-existing untracked artifacts.
- Shared interfaces: unit store validates weapon IDs against the weapon store; sandbox snapshots carry referenced records; one compiler produces the server/client overlay; runtime metadata identifies custom projectiles without altering native projectile definitions.
- Existing saved unit schema stays 1. Custom projectile damage is the configured per-pellet damage, with target armor applied; native attacker bonus damage must not be added to it.

## Evidence
- Initial read-only callback reproduction: one contact invoked projectile entity script twice, HP 100 -> 80 for a 10 damage handler. Real exported Stardust projectile has a 4 damage variable and no destroy-on-hit script; next step reproduces with the actual runtime.
- Task 1: real Stardust contact in both fixture orders reproduced HP100->92, then passed HP100->96 after canonical dispatch. Native `getLastTouchedUnit` stun regression was found during review, watched fail and fixed by assigning the victim inside the canonical context. Attribution regression suite passes.
- Tasks 2–4: weapon CRUD/atomic revision validation, all-44 slot catalog/compiler, immutable weapon snapshots, server-authoritative patterns, EN/TH editor and paired guide implemented. Real single/spread/burst contact tests show 10/50/30 damage with repeated callbacks suppressed.
- GUI source smoke: both Electron and web passed real create/edit/duplicate/delete, saved/reopened burst weapon, language switch preserving draft, player movement, streamed projectile sprites and window-close server cleanup (2/2, build/custom-weapon-gui.log).
- Behavioral checks: spread symmetry; burst 100/200ms/current aim; release finishes; switch/form/death/reset cancel; capacity cancels without backlog; actual traveled range. Review found `actorId` statistic field and lifespan-based bot range issues; fixed with targeted regressions.
- Ruling: native character passives are preserved. Rhythm Assassin can create native shots when using a custom weapon. Matrix counts and applies contacts for custom projectiles separately, retaining rather than suppressing those passive effects.
- Ruling: freeze/clear autonomous accepted bursts before a measured test activation; use an already-ready item timestamp even before the first engine tick. Native passive extras and pre-readiness autonomous bursts needed fixture isolation. Remaining missing-first-shot failures were investigated further rather than treated as passing evidence.
- Reviewer checked canonical contact victim context, `actorId`, and bot range corrections; no further P2 findings. A later posthumous-shot check exposed existing unit cleanup deleting accepted custom shots. Watched the real test fail, then limited the exception to `customWeapon` projectiles in custom sandbox. Reset still explicitly destroys all projectiles. Reviewer checked this delta too.
- Posthumous test passes real owner/friendly immunity, HP7 -> 0 with configured damage10, exactly 7 damage credit, one target kill/feed, and respawn with the saved root weapon loadout. Burst behavior tests independently cover cancellation of not-yet-fired shots.
- Test isolation: inhibit physics update while injecting measured contacts, including when readiness precedes physics.start(); wait for the accepted burst to finish rather than relying on a 260ms sleep under CPU load. Runtime timer/aim assertions remain in deterministic behavioral tests. Native/GUI gameplay tests retain actual physics.
- Missing-first-shot root cause: destruction stacks pointed to IgeEntity.update lifespan expiry. A shot accepted before the engine's first frame received deathTime600000 from _currentTime0, then expired at the first epoch tick. CustomWeaponRuntime now anchors the safety deadline to wall time only while the engine clock is uninitialized. Watched the regression fail/pass; normal travel range and initialized-clock lifespan are unchanged. Full 16/16 focused behavior/posthumous/physical-contact checks passed after this fix.
- Real physics tests use the existing engine listener and its contact trace, not a second listener or synthetic fixture. Box2D-generated hits pass single10, spread50, burst30 and native Stardust4 damage (4/4, `build/custom-weapon-world-contact-verified.log`; repeated in the focused 16/16 run).
- Fixed-step regression fixture uses 10 simulated seconds (600 steps). With corrected native contact context, seed1 has zero HP changes at 5s and 18 at 10s. No damage assertion or production training source was removed/changed.
- Final source syntax checked across 26 changed/new JS files; `git diff --check` clean.
- Final source GUI smoke passed both web and Electron after the startup-deadline fix (2/2, `build/custom-weapon-gui-final.log`).
- Final portable rebuilt successfully (`build/custom-weapon-final-runtime-build.log`). Actual EXE smoke passed create/edit/copy/delete, EN/TH switch preserving the draft, saved/reopened custom burst loadout, sprite rendering, movement, streamed projectiles, isolated arena close and server stop (`build/custom-weapon-portable-verified.log`, 1/1). The resulting editor and arena screenshots were visually inspected. A fresh Windows process inventory confirmed no BattleFight.exe process remained after exit.
- Package audit passed: staged and bundled implementation match source (Unit.js after the existing no-audio transformation); 0 audio/Python/optimizer/trainer files; no missing visuals; 53 exact source policy copies; approved seed champion n-000027 / previous n-000024; EXE archive `Everything is Ok`. Production game/status/registry hashes match the baseline; server/training source diff is empty.
- Final package audit repeated successfully against the rebuilt EXE (`build/custom-weapon-package-audit.json`, `build/custom-weapon-final-audit.log`). Artifact: `dist/portable/BattleFight-Portable-1.0.0.exe`, 127822333 bytes (127.82 MB / 121.90 MiB), SHA256 `790bd70ea0d5dbec366253f1b79a9515a27ea956feab471a15ab528a52a1f14d`.
- Full acceptance completed against the startup-corrected implementation: `node --test --test-concurrency=3 test/*.test.js` -> `build/custom-weapon-verified-suite.log`: 508 tests, 502 passed, 2 failed, 4 skipped, exit 1. All four long-running suites passed: 44-prototype native acceptance, native skill effects, autonomous heuristic, and every-slot custom weapon matrix. The two failures were native Stardust callback fixtures firing before the first initialized engine clock, not incorrect measured damage. The previous test tree was stopped after the custom lifespan bug was confirmed. Earlier incomplete runs/failures are retained and are not passing evidence.
- Native callback fixtures now wait for the real engine clock and isolate physics during their injected contact; all damage, reversed-fixture and victim-stun assertions remain. Focused rerun with native callbacks, real Box2D contacts and custom behavior passed 17/17 (`build/custom-weapon-native-clock-verified.log`, exit 0). An earlier unchanged focused rerun also passed both native callbacks. Only test code changed after the final EXE build. Across the full run and corrected rerun, all 504 executed test cases have passing evidence; the whole 508-case command was not rerun after this final fixture correction, so the full-run exit 1 is not represented as green.
- Four existing opt-in training/optimizer/legacy CLI integration cases were skipped; no production training was started. Fresh package/invariant audit passed again after the suite completed; production game/status/registry hashes and server/training source remain unchanged.

## Validation scope
- The automated 44-prototype matrix covers 173 root equipment slots, each with all three patterns and both human/heuristic controller modes: 1038 slot/pattern/controller checks, plus 264 death/respawn checks. Exact-damage measurements isolate autonomous actions and physics, then inject the engine's collision callback in both fixture orders with repeated contacts. SubLazer retains its native first-form 1 HP floor; the death/respawn matrix forces the existing death lifecycle for that prototype rather than removing its native floor.
- Four additional runtime tests exercise Box2D-generated collisions with no injected contact callback. Separate native-skill acceptance and deterministic burst/range/capacity checks cover the relevant mechanics.
- Web, source Electron and portable EXE smoke tests exercise real rendered UI/gameplay with a representative saved custom character and burst weapon. They are not 44 separate manual browser playthroughs. Screenshots verify the editor, sprites and projectiles; automated assertions verify CRUD, language, movement, persistence and cleanup.

## Documentation publication follow-up — 2026-10-09

- Removed extra Stardust Storm/Debris Strike catalog choices; native PewPew equipment and saved compatible legacy selections remain supported. Prevented a native item from appearing twice as saved-only equipment.
- Refreshed README and all public English/Thai guides, added paired release notes and API/storage reference, regenerated local license inventories without changing original notice bytes.
- Documentation verifier: 10 language pairs, 2804 local links, 890 original notices and 769 lockfile entries; zero failures. Focused catalog/store/compiler/UI checks passed 13/13 (`build/documentation-custom-source-check.log`).
- The existing portable hash/size were rechecked. Its build predates the catalog cleanup and documentation publication; this follow-up does not rebuild or upload an executable, create a Release, or start training.
- Publication includes this session's Custom Weapon source/tests and refreshed documentation. Local custom records, backups, training reports, caches and generated logs/build artifacts are excluded from the commit.

## Original delivery limitations
- Replacing native equipment can disable the skill/form/summon/resource mechanics that require it; the editor warns per slot. Native character passives may add independent native shots.
- Custom weapons are restricted to isolated local arenas, not normal matches or production Neural training.
- Portable is Windows x64, unsigned (existing build configuration), offline and no-audio. No commit, push, GitHub Release or production training was performed.
