# Release and Validation Notes

[ภาษาไทย](../th/release-notes.md) · [Documentation](index.md)

## 2026-10-20 — Solo Test and Morrow

Commit `39afe69` on `codex/battlefight-bots`.

- **Solo Test:** an isolated arena with no bots for any of the 45 menu characters, no saved custom unit required. It adds stationary target dummies, death/respawn, reset and an owned process that shuts down with the session. The menu opens it in a popup (browser) or through Electron IPC.
- **Morrow:** new character with Compass Bolt, Banked shot, a route marker that expires after 7 seconds, and Atlas (800 ms warning, one hit per target, clipped at walls). Morrow is not part of production training or custom cloning.
- **Fixes found during validation:** larger projectile and marker collision/render sizes; Atlas keeps its streamed dimensions; Banked first leg and marker redirect corrected; earliest raycast hit retained; Morrow timers cleaned up with the sandbox; target dummies no longer spawn overlapping.
- **Sixth Diva and Emo & Sky:** all eight skills fire, render with valid textures and damage a target in the real browser client. Sixth Diva's self-damage is a designed health cost (10 HP per blade/shot; Hexa-Shift trades health for speed or a temporary heal). Emo & Sky's skill 3 and Brillant Catastrophe have built-in delays of up to about 6.5 seconds. The original export file still contains the older item-position scripts, remote image URLs and bullet makers that are destroyed on contact; this source has those fixes.
- **Repository:** the original `.gitignore` was restored after being overwritten, and local outputs (backups, reports, dist, video, caches, result JSON) are ignored.

**Validation:** the Solo/Morrow/projectile selection passed 17/17 on 2026-10-20 (45/45 in the 2026-10-12 QA run, see [Solo Test QA](../qa/2026-10-12-solo-test.md)). The full suite was not rerun.

**Atlas fix:** Atlas Unfolded showed its warning but never dealt damage. The game runs on Planck physics, whose `rayCast` takes `(point1, point2, callback)`, but Atlas passed the callback first, so the ray found no units and walls never clipped the line. Atlas now uses the Planck order (the Box2D order is kept for other engines) and deals its 30 damage. A regression test covers the Planck argument order.

**Portable EXE rebuilt:** `dist/portable/BattleFight-Portable-1.0.0.exe`, 129,143,802 bytes, SHA256 `01292d696116238d6cf87a86af572a174131e599e07219f49285aa19f6702ce5`, Windows x64, unsigned. It includes Solo Test, Morrow, the Atlas fix and a `licenses/` folder with the Taro, browser-library and npm notices plus THIRD-PARTY-NOTICES.md. The packager now stages `/assets/morrow` images from `src/assets/morrow`, matching the source server; the build reported 0 missing visuals and 0 fallback units. Desktop tests passed 19/19 and the Electron smoke test passed 1/1.

**Renames (2026-10-21):** the Morphling weapon is now Morph, Malevolent Orchid is now Orchid, and Corkmaster is now Cork with skills Shot, Blow, Bait and Block. Only display names changed; internal variable keys did not.

**EXE play test:** the packaged server was played through the browser with input sent over the game network. A Play Game match against AI ran with a live kill feed; all Sixth Diva skills fired with visible bullets. In Solo Test, all four Emo & Sky skills rendered and damaged the dummy, and Morrow dealt 12 (Compass Bolt), 22 (Banked Delivery) and 30 (Atlas) with no script errors. The Electron window itself was covered by the smoke test, not played by hand.

## 2026-10-09 — Custom Units and Custom Weapons

- Custom Units supports all 44 playable originals with separate compiled IDs, forms, resources and player/heuristic arenas.
- Custom Weapons adds local versioned CRUD, single/spread/burst settings, per-slot selection, immutable snapshots and server-authoritative damage.
- Projectile contact dispatch fixes duplicated scripted damage. Custom pellets prevent repeated impacts and retain damage/kill ownership after shooter death. Pending bursts cancel on lifecycle changes; a pre-first-frame shot gets a valid safety deadline.
- Equipment offers native and saved custom weapons. Stardust Storm/Debris Strike are removed as extra cross-character options; PewPew's originals and previously saved compatible equipment remain supported. Native equipment is not duplicated as a saved-only option.
- English/Thai guides, API/storage reference, AI development credit and local license evidence are refreshed. Production training definitions, schemas and Champion promotion criteria are unchanged.

### Portable artifact (2026-10-09)

| Field | Verified build snapshot |
|---|---|
| File | `dist/portable/BattleFight-Portable-1.0.0.exe` |
| Platform | Windows x64, unsigned |
| Size | 127,822,333 bytes / 127.82 MB / 121.90 MiB |
| SHA256 | `790bd70ea0d5dbec366253f1b79a9515a27ea956feab471a15ab528a52a1f14d` |
| Approved seed | Champion `n-000027`, previous `n-000024`; 53 numbered policy files |
| Resource audit | 1,294 desktop-data files, 5,347 app.asar entries; no audio/Python/trainer/optimizer artifacts or missing visuals |

This EXE includes Custom Weapons and the startup/posthumous projectile fixes. It predates the latest source equipment-catalog change and this documentation refresh. No new EXE or GitHub Release is created by the documentation publication. Build again to include those later source changes. Local records are per-user data and do not become bundled sample units/weapons.

### Validation evidence and limits

The implementation's full 508-case run completed with 502 passed, two native Stardust fixture failures and four skipped opt-in training/optimizer/CLI cases. Both failures fired before the engine clock initialized. The native fixtures now wait for the real clock; the focused corrected run passed 17/17, including real Box2D single/spread/burst/native hits. The entire 508-case command was not rerun after that fixture correction.

All four long suites passed: 44-prototype runtime acceptance, native skill effects, autonomous heuristic and custom weapon matrix. The weapon matrix covers 173 root slots × three patterns × two controllers = 1,038 cases, plus 264 death/respawn cases. Measured damage is 10/50/30 for single/five-pellet/three-shot custom weapons. Exact matrix contact measurements use isolated callback injection; four additional tests exercise Box2D-generated contacts.

Source web/Electron smoke passed 2/2 and the actual portable EXE smoke passed 1/1: CRUD, language/draft preservation, saved loadout, visible sprites/projectiles, movement and owned-arena shutdown. These are representative rendered playthroughs, not 44 manual browser sessions. The portable archive passed 7-Zip integrity checking. Detailed historical evidence is in the [implementation ledger](../superpowers/plans/2026-10-09-custom-weapons-progress.md).

Replacing a native skill slot can disable its dependent mechanics; native passives can emit additional native shots. Custom content is limited to local experimental arenas. License notice gaps and unresolved asset provenance are recorded in [Licenses](licenses.md); a successful build is not a new license grant.
