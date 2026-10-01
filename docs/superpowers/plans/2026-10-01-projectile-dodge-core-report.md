# Projectile dodge schema3 core report

Task2 implementation is complete on the authorized existing checkout. No training process was launched, and no commit, push, deployment, or production promotion was performed by this task.

## Contract

- V1 and V2 schema definitions were compared with `backups/dodge-2026-09-30T19-46-23-164Z/server/training/neural-schema.json`; both are unchanged.
- Schema3 is observation184, action27, actor211→64→64→1, critic184→64→1, maxOptions32. Its final schemaHash is `96d9552512bc6b74cd69994c2e286ce74cedd3c0ef36d78c73269bf45aacb444`.
- Schema3 metadata retains trainingProtocolVersion2 and requires exact observation/action/schema versions and schemaHash for model loading. Trainer also compares the optimizer manifest with the validated exported weights, including parentVersion.
- The schema description records the threat ordering and normalization used by the integrated observation: TTC/0.8, maximum projectile/explosion damage/1000 and radius/256, speed/1000, route risks/1000, nine boolean clearance masks, own speed/1000, clamped0..1. Missing threat records are zero; noncollision TTC is one.
- Inference provides a schema3 input buffer and rejects empty or entirely illegal option sets with explicit errors. Runtime continues surfacing inference failures and prevents unusable partial trajectories.
- Schemas>=2 follow the existing modern duration shaping, match-separated GAE, single-option critic-only updates, KL limit, frozen opponents, heldout seed allocations, and selection/final-test promotion gates. Schema3 uses the same checkpoint kind `neural-evaluation-v2`, with an exact schemaVersion and schemaHash check.
- Schema3 optimizer/state directories are `neural-v3` and `neural-state-v3`. V1/V2 remain in their existing directories. Scheduler reads/restores its persisted seed counters, pending frozen jobs and evaluation state; the root integrator owns initial production counter carryover.
- Python warm migration accepts V1 and compatible V2 checkpoints into3, copies common observation columns, relocates the old action columns to offset184, zeros added columns, and creates fresh Adam state. Compatible3 parents can also initialize a new3 namespace. V2 still accepts V1 migration with its historical column offsets.
- CLI, web start and GUI start default to3; explicit legacy1/2 remain supported. Tier export includes the new namespace.

## Files

- Core: `server/training/neural-schema.json`, `NeuralInference.js`, `NeuralController.js`, `NeuralTrainer.js`, `TrainingSupervisor.js`, `TrainingCli.js`, `TrainingRuntime.js`, `TrainingTrajectory.js`, `TrainingStore.js`, `PolicyRegistry.js`.
- Python: `training-python/train.py`, `ppo.py`, `export_model.py`.
- UI start defaults: `tools/trainer_gui.py`, `src/templates/menu.ejs`.
- New tests: `test/neural-v3-core.test.js`, `training-python/test_v3.py`.
- Approved default expectation updates: `test/neural-v2-scheduler.test.js` uses explicit2 for V2 CLI coverage and rejects unsupported4; `test/training-v2-ui.test.js` expects the new start default3 while retaining V2 telemetry assertions.

## Validation

RED before core implementation: five new Node tests failed with unsupported schema3; eight Python tests failed with unsupported schema3. An initial Python test fixture replacement accidentally produced274 observation counts and was corrected to184 before GREEN validation.

Final focused Node command:

```powershell
node --test test/neural-v3-core.test.js test/neural-v2.test.js test/neural-v2-scheduler.test.js test/neural-v2-trajectory.test.js test/neural-v2-runtime.test.js test/training-store.test.js test/training-v2-ui.test.js
```

Result:41 passed,0 failed,0 skipped, final schema description/hash in place. Six dedicated3 tests cover dimensions/defaults, exact model metadata and invalid option sets, scheduler resume/seed preservation/promotion gates, duration shaping and crossed archive rejection, V2 parent directory selection, and mismatch between manifest and weights.

Final Python command from `training-python`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s . -p 'test_*.py'
```

Result:17 passed in11.406seconds, including eight dedicated3 tests. They generate fresh golden fixtures and compare Node/Python logits/value to1e-5 with equal schemaHash; verify V1 migration common logits/value; verify a V2 checkpoint that has undergone PPO has populated Adam state and migrates into3 with empty Adam and preserved common logits/value; verify successful3 PPO update, immutable artifacts, resumed RNG, critic-only single-option updates, duration-aware match-separated GAE, exact metadata rejection, export CLI dimensions, and KL early stop with no update.

Python execution used the project virtual environment with sandbox escalation because the interpreter launcher was denied in the restricted shell. All tests use disposable directories; no production optimizer files were written.

Root integration owns game-wide full regression, actual canonical match trajectories, actual production PPO3, policy promotion and release. Focused validation above does not establish improved live winrate.

## Review followup: interrupted artifact publication

Review found that global numbering scanned only `policies`, `neural` and `neural-v2`. If Python published an immutable3 weight/optimizer and crashed before registry publication, numbering could reuse its number and block startup with an overwrite refusal.

`PolicyRegistry.nextNeuralVersion()` now discovers canonical normal directories matching `neural-v[1-9]\d*` under the data root, in addition to `policies` and `neural`. It reserves every published artifact number in those namespaces, including orphan weights and orphan optimizer files. Backup names, state namespaces, and ordinary files named like namespaces do not count. Missing data roots still start at000000; the999999 exhaustion limit remains.

Two new regressions were RED before the fix: orphan3 weight expected000044 but returned000043, and a later canonical namespace expected123457 but returned000000. After the fix:

```powershell
node --test test/neural-v3-core.test.js test/neural-v2-scheduler.test.js test/training-policy-registry.test.js
```

Result:22 passed,0 failed,0 skipped. This includes eight schema3 core tests, eleven V2 scheduler tests, and three existing policy registry tests. Code is frozen after this fix; schema3 contract/hash and Python code did not change.
