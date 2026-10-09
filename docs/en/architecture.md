# Architecture and Combat

[ภาษาไทย](../th/architecture.md) · [Documentation](index.md)

## Data and runtime

`src/game.json` defines units, items, projectiles, attributes, map layers, controls and scripts. Parse it with Node `JSON.parse`: some exported keys differ only by case. It is distinct from the sibling exported-game repository.

```mermaid
flowchart LR
  Data[Game data and scripts] --> Server[Node / Taro server]
  Input[Player input or bot decisions] --> Server
  Server --> Physics[Physics / collisions / combat]
  Physics --> Server
  Server --> Network[HTTP and WebSocket state/events]
  Network --> Client[Browser / Pixi renderer and UI]
  Physics --> Stats[Attribution / statistics / kill feed]
```

The server executes game logic and authoritative combat. Client input travels through the networking layer; the browser renders entities and UI with Pixi and local browser libraries. Physics components handle bodies/collisions according to the configured backend. Client-side prediction/rendering is not itself permission to change server health or scores.

## Skills, damage and life cycle

Units hold attributes such as HP/resources, items and ability state. The ability/item path checks cooldown, costs and available actions; scripts can impose additional character-specific conditions. Projectile scripts, movement, collisions, area effects and summons can produce damage through different paths. A generic ready-to-fire decision does not model every custom skill perfectly.

When a tracked combat unit dies, life bookkeeping avoids duplicate death credit. Training/demo bots respawn according to the game/runtime schedule; the next life can use another character. Summoned units have their own entity lifecycle and are not automatically separate training participants.

## Attribution and statistics

Projectile-to-unit entity scripts are dispatched through one canonical contact path with the projectile owner and touched victim in context. This removes the former double invocation that made Stardust damage count twice. Unit-side contacts, owner-touch skills, native piercing and later contacts keep their own rules. Non-piercing custom projectiles mark themselves consumed before damage so repeated fixtures cannot spend the same pellet twice.

`CombatAttribution` and combat event propagation preserve damage-source ownership/character information, including delayed projectiles. `TrainingStats` groups records by player and by player/character life history. It records actual HP loss; source damage credit applies to an enemy source, while target damage taken can include other causes.

- Duplicate health/death events are rejected by identifiers/life bookkeeping.
- A kill requires a valid opposing participant; self/team damage is not an enemy kill.
- Assists use recent contributing enemy damage within **10 seconds**, excluding the credited killer, when a valid kill is recorded.
- Source character IDs preserve credit when a projectile hits after its source changes character or dies, where the event carries that information.
- Weapon use and damage-hit events are separate; multiple hits can result from one use, so hits/use is not bullet accuracy.

## Custom editor and sandbox boundary

Custom records use separate `cu-`/`cw-` IDs and versioned JSON; the editor never rewrites the original game definition. A shared compiler creates root/secondary definitions for client and server. A loopback-only child process receives an immutable unit/weapon snapshot and starts its own HTTP/WebSocket ports, world and statistics. The main match and production training roster remain separate.

Custom weapons clone local visual/body data, omit native firing/damage scripts, and create authoritative server projectiles. Single/spread/burst scheduling, travelled distance and the 256-projectile limit are owned by the arena runtime. Un-fired burst shots cancel on weapon/form change, death or reset; accepted projectiles retain attribution after the shooter dies. Reset clears projectiles, summons and pending actions. Window closure or heartbeat expiry stops the arena process.

## Desktop process and resources

Electron starts its own server in a utility process, obtains local HTTP/WebSocket addresses, and configures the game window. Its request allowlist limits renderer network access to the owned local endpoints. Packaged resources contain gameplay and inference code, visual assets and policy seeds; training mutation tools and audio are excluded. Missing user policy seeds are copied without overwriting existing policies. Selection and logs live in per-user data.

## Limits

Custom scripted skills and ownership transfers need correct source metadata for complete attribution. Historical logs can reflect older implementations. Statistics alone cannot determine whether very low summon damage is a weak model, failed skill execution or missing attribution. The dodge planner cannot predict arbitrary future script behavior that is not exposed as a hazard.
