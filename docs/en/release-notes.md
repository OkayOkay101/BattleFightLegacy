# Release and Validation Notes — 2026-10-09

[ภาษาไทย](../th/release-notes.md) · [Documentation](index.md)

## Current source

- Custom Units supports all 44 playable originals with separate compiled IDs, forms, resources and player/heuristic arenas.
- Custom Weapons adds local versioned CRUD, single/spread/burst settings, per-slot selection, immutable snapshots and server-authoritative damage.
- Projectile contact dispatch fixes duplicated scripted damage. Custom pellets prevent repeated impacts and retain damage/kill ownership after shooter death. Pending bursts cancel on lifecycle changes; a pre-first-frame shot gets a valid safety deadline.
- Equipment offers native and saved custom weapons. Stardust Storm/Debris Strike are removed as extra cross-character options; PewPew's originals and previously saved compatible equipment remain supported. Native equipment is not duplicated as a saved-only option.
- English/Thai guides, API/storage reference, AI development credit and local license evidence are refreshed. Production training definitions, schemas and Champion promotion criteria are unchanged.

## Existing portable artifact

| Field | Verified build snapshot |
|---|---|
| File | `dist/portable/BattleFight-Portable-1.0.0.exe` |
| Platform | Windows x64, unsigned |
| Size | 127,822,333 bytes / 127.82 MB / 121.90 MiB |
| SHA256 | `790bd70ea0d5dbec366253f1b79a9515a27ea956feab471a15ab528a52a1f14d` |
| Approved seed | Champion `n-000027`, previous `n-000024`; 53 numbered policy files |
| Resource audit | 1,294 desktop-data files, 5,347 app.asar entries; no audio/Python/trainer/optimizer artifacts or missing visuals |

This EXE includes Custom Weapons and the startup/posthumous projectile fixes. It predates the latest source equipment-catalog change and this documentation refresh. No new EXE or GitHub Release is created by the documentation publication. Build again to include those later source changes. Local records are per-user data and do not become bundled sample units/weapons.

## Validation evidence and limits

The implementation's full 508-case run completed with 502 passed, two native Stardust fixture failures and four skipped opt-in training/optimizer/CLI cases. Both failures fired before the engine clock initialized. The native fixtures now wait for the real clock; the focused corrected run passed 17/17, including real Box2D single/spread/burst/native hits. The entire 508-case command was not rerun after that fixture correction.

All four long suites passed: 44-prototype runtime acceptance, native skill effects, autonomous heuristic and custom weapon matrix. The weapon matrix covers 173 root slots × three patterns × two controllers = 1,038 cases, plus 264 death/respawn cases. Measured damage is 10/50/30 for single/five-pellet/three-shot custom weapons. Exact matrix contact measurements use isolated callback injection; four additional tests exercise Box2D-generated contacts.

Source web/Electron smoke passed 2/2 and the actual portable EXE smoke passed 1/1: CRUD, language/draft preservation, saved loadout, visible sprites/projectiles, movement and owned-arena shutdown. These are representative rendered playthroughs, not 44 manual browser sessions. The portable archive passed 7-Zip integrity checking. Detailed historical evidence is in the [implementation ledger](../superpowers/plans/2026-10-09-custom-weapons-progress.md).

Replacing a native skill slot can disable its dependent mechanics; native passives can emit additional native shots. Custom content is limited to local experimental arenas. License notice gaps and unresolved asset provenance are recorded in [Licenses](licenses.md); a successful build is not a new license grant.
