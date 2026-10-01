# AI and Training

[ภาษาไทย](../th/ai-training.md) · [Documentation](index.md)

## Models and schemas

Heuristic bots use game-state rules rather than learned network weights. Neural bots score a set of legal candidate actions: the policy does not directly overwrite physics, HP or skill rules. Gemini Flash and ChatGPT Sol are development assistants, not the in-game inference service.

| Schema | Observations | Action features | Maximum options | Actor | Critic |
|---|---:|---:|---:|---|---|
| V1 | 86 | 17 | 16 | 103 → 64 → 64 → 1 | 86 → 64 → 1 |
| V2 | 149 | 18 | 32 | 167 → 64 → 64 → 1 | 149 → 64 → 1 |
| V3 | 184 | 27 | 32 | 211 → 64 → 64 → 1 | 184 → 64 → 1 |

The actor evaluates concatenated observation/action features; the critic estimates state value. Action-feature count is not the number of possible character skills or actions. V2 adds weapon cooldown/ammo/cost/range, terrain, visibility/presence, navigation and match information. V3 appends four threat records, nine route-risk values, nine clearance values and own speed; actions add nine direction indicators, including stationary.

Where a ready legal shot exists, modern options combine firing with movement. During cooldown or when range/resources/visibility make a shot illegal, movement can remain available without firing. The maximum option count limits coverage. The runtime executes the requested command through normal gameplay checks and logs execution overrides.

## Projectile dodge

The planner estimates relative swept collision using actual sizes and velocities, ranks hazards, and checks stationary/eight compass routes for clearance and collision risk. It accounts for exposed bounce, explosion and persistent-area information and briefly favors a previous direction when still safe. Modern V3 can select an explicit escape direction. Newer features do not guarantee stronger results; arbitrary scripted hazards and custom skill semantics remain limitations.

## Training and reward

Modern training uses four workers by default and full matches, normally 300 simulated seconds. A PPO batch requires at least **8 completed matches and 8,192 multi-option actor decisions**. Single-option decisions still contribute to critic/GAE, but not actor/entropy optimization. The frozen opponent league is champion 50%, approved archives 30%, heuristic 20%.

PPO/GAE accounts for simulated elapsed time (`gamma=0.999` per 100 ms, `lambda=0.95`). Modern reward combines terminal win/loss/draw with discounted changes in team score/health potential. A unit death does not end the player trajectory; respawns remain in the same match episode. Optimizer data must match policy/schema/environment/protocol metadata. V1 keeps its legacy reward/optimizer behavior.

Current PPO defaults are Adam learning rate `3e-4`, four shuffled epochs, minibatches of 1,024, policy-ratio clip `0.2`, value-loss weight `0.5`, entropy weight `0.01` and gradient-norm cap `0.5`. Modern updates stop early when approximate KL exceeds `0.02`; that stops the optimizer update, not the entire continuous trainer. Status metrics include loss, entropy, KL, clip fraction, eligible decisions and completed epochs.

## Selection and promotion

1. Selection plays **10 side-swapped pairs per opponent**: champion, previous archive and heuristic, 60 games total.
2. A champion score at or below 0.5 skips final testing and starts the next training cycle. Score credits a draw as half a win; raw win rate does not.
3. Final testing uses **30 new pairs per opponent**, 180 games total, on seeds separate from training/selection.
4. Promotion needs champion bootstrap lower bound **greater than 0.5**, no statistically significant defeat against archive/heuristic, and passed runtime parity. The existing bootstrap uses 2,000 resamples and its configured lower quantile.
5. Only an approved promotion changes champion pointers. A selectable numbered candidate is not approval.

## Persistence and interpretation

Numbered policies are immutable. Schema-specific optimizer/state directories preserve V1/V2 compatibility (`neural-v3` and `neural-state-v3` for V3). Checkpoints keep seed counters, completed pending match references and evaluation progress; pending full matches need not have produced a PPO update yet. Migration copies compatible parent weights, zeros new input columns and resets Adam; this does not copy all old action/runtime guardrails.

Inspect production `status.json`, supervisor lock, actual PID and checkpoint together; a stale JSON file is not proof that training is alive. Evaluation and diagnostic/smoke fixtures are separate. Never promote a fixture result. See [Development](development.md) for safe stop behavior and [dated comparison](../superpowers/plans/2026-10-01-neural-transfer-comparison.md) for why inherited weights alone may not retain prior match strength.
