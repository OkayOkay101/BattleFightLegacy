# Projectile dodge implementation evidence

## Completed source

All approved dodge changes implemented: relative swept collision prediction with physical sizes and velocity; aggregate time/damage threat priority; eight reachable movement headings plus stationary; full route wall tests; safe direction commitment; physical ricochets, sensor wall pass, stopped traps, supported timed/touch/wall blast areas and age-correct last-observed hazards. Unknown dynamic scripts are exposed as limitations, rather than predicted from unseen state.

Neural schema3 uses184 observations and27 action features with explicit validated escape directions. Schemas1/2 retain their definitions and remain playable. Compatible weights migrate into3 with additional columns zeroed and Adam reset. New training defaults3, separate neural-v3/neural-state-v3, unchanged protocol2 and promotion thresholds.

Backup: backups/dodge-2026-09-30T19-46-23-164Z. Original V2 data retained. Old run575faa30-98b8-4909-b225-298c453f56fa intentionally stopped before changes; stopped candidate n-000041,98 completed and3 stop-aborted jobs. Fresh V3 counters carried train59,selection1000000090,final-test2000000000,parity3000000001. No old match rows entered the fresh namespace.

Review caught and fixed stationary movement, no-target escape, sensor wall behavior, trap wall lifetime, canonical namespace orphan numbering, occluded explosion timers, exact detonation tick and parent/blast lifetime separation. Final scoped source review has no open important findings.

## Fresh checks

- Node full suite:266/266 passed,0 skipped,92563ms; dodge-regression-release-final.log.
- Python:17/17 passed, including Node numerical parity and V2-to-V3 trained optimizer migration; dodge-python-release.log.
- Planner/game focused suite:30/30 passed; dodge-timer-final.log.
- Fixed five adversarial scenarios, independent1ms collision simulation: original5 hits/190HP versus planner0/0. This is regression evidence, not game-wide winrate. Artifact:test/helpers/battlebot-dodge-benchmark-result.json.
- Local synthetic100-hazard planner timing:mean3.995ms,p95 5.938ms,max8.892ms. Real map callbacks cost more; no whole-game performance guarantee.
- Actual Electron utility-process and rendered game:2/2 passed using manually selected schema3 n-000042. Eight owned units, five currently visible valid sprites and six valid projectile textures. Temporary user data only; dodge-electron-smoke.log.
- Offline source stage:43 policy files,approved champion/active n-000027,previous n-000024;826 visuals,no missing source visuals. Audit found zero audio/Python/trainer/optimizer artifacts, planner included. Existing portable EXE has not been rebuilt; release is conditional on production final-test promotion.
- Web server restarted,PID26836,HTTP200 at http://127.0.0.1/.

## Production

Run b8195354-79a7-4c60-90e2-9b171a1b80b3,PID12896,4 workers,max speed,initial migrated candidate n-000042,parent champion n-000027. Six real-time/max parity cases passed:three heldout seeds each against heuristic and champion. Lock/status/runId agree.

Schema hash96d9552512bc6b74cd69994c2e286ce74cedd3c0ef36d78c73269bf45aacb444; frozen environment hash e6ed10cff282f41822a1afffffc0ff312296dbb08447e734a09f544c6bc853a8; planner SHA256 F136C093ABE89864474410E70CD11897340044582190DB024027364B88F8DB27.

First actual production batch completed11 training matches,0 failures:76689 decisions/76346 actor-eligible,300 minibatch updates across4 epochs,approxKL0.00458182575,clipFraction0.02623582,no early stop. Manifest trainedFromVersion n-000042,parent n-000027 advanced to n-000043; phase selection,4 active workers. Live PID/lock/runId and recomputed frozen source/manifest environment identity agree. Evidence:training-data/dodge-v3-production-evidence.json and dodge-v3-trajectory-evidence.json. Champion still n-000027; selection/final-test outcome pending, no winrate claim.

Heartbeat restored ACTIVE, accepts approved schema>=2 champions including3 and ignores fixtures. It respects user stops and never weakens promotion criteria. No commit,push or deployment.
