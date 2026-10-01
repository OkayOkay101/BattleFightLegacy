# Task C implementation report

Status: DONE. No commits, push, EXE build, deployment or live training data mutation.

## Delivered

- `DemoRuntime.js`: `champion` and legacy `latest` resolve approved champion, then approved previous, then baseline. Explicit version selects that version. Runtime reloads registry only when an exhibition round ends, including when decisions advance without a status poll. Requested aliases remain separate from resolved numbered versions. Team pins persist independently. Existing direct `installDemo(ige, policy)` and `setPolicies(blue, red)` remain compatible. Runtime exposes current match and execution override counters; it never creates a training trajectory.
- `server.js`: accepts per-team aliases and pins through demo selection API, persists requested values; preserves saved valid fixed selections at startup. Both defaults use champion. Neural training explicitly passes `schemaVersion: 2`; heuristic start retains schema 1.
- `menu.ejs`, `TrainingTelemetry.js`, `messages.js`: auto champion entry; requested versus resolved per-team model and schema; localized phase/schema/protocol, sample eligibility count, PPO diagnostics, per-opponent W/D/L and bootstrap lower bound; exhibition override count and inference error. English/Thai translation keys stay equal.
- `trainer_gui.py`: independent Blue/Red alias or fixed selectors, requested/resolved display, bilingual V2 and per-opponent telemetry, explicit schema 2 start. Selection submits both team values instead of globally activating a model.
- `prepare-desktop-package.js`: approved-seed-manifest.json with champion/previous/active pointers; active seed defaults to approved champion. Numbered V1/V2 policies remain available for explicit manual selection. Runtime whitelist includes NeuralSchema.js, neural-schema.json and NeuralCombatSnapshot.js. TrainingProtocol is deliberately absent because inference does not depend on it and it imports the excluded trainer-side HeuristicPolicy. Existing trainer/Python/checkpoint/audio exclusions and offline artwork handling are retained.
- `desktop/policy-data.js`: initializes missing user registry from approved manifest; preserves existing registry, policy files and fixed selections. Missing legacy manifest safely leaves baseline defaults rather than selecting highest candidate. DesktopSelection needs no implementation change: its existing string-preserving atomic format already supports champion aliases; coverage added.

## Verification

- RED: demo tests failed on newest unapproved candidate and missing round refresh (2 failures). GREEN: 5 demo tests passed, including fixed opponent, requested/resolved status, getter and execution telemetry.
- RED: desktop approved manifest tests failed on missing manifest and baseline registry (2 failures). GREEN: 9 desktop package/data tests passed.
- RED: V2 UI test failed because shared formatter did not exist. GREEN: localized formatter and rendered EJS JavaScript compilation passed.
- Final focused Node command: `node --test test/training-demo.test.js test/desktop-selection.test.js test/desktop-policy-data.test.js test/desktop-package-runtime.test.js test/desktop-original-sprites.test.js test/training-v2-ui.test.js test/game-i18n-dictionary.test.js test/game-i18n-dom.test.js test/game-i18n-dynamic-ui.test.js` — 29/29 passed.
- Bundled Python `test/trainer-gui-v2.test.py` — 2/2 passed (AST-isolated actual GUI formatter, neural start and independent selection methods). Whole GUI file parses successfully.
- `node --check server/server.js` passed.

## Limits

No actual browser/Tkinter/Electron window inspection or EXE rebuild in this package, as requested. Full integrated training and release gates remain root work. All filesystem mutation tests use temporary fixtures and do not touch real training state. Existing uncommitted source and data are preserved.
