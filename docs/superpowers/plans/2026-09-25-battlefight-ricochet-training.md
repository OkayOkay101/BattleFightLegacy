# BattleFight Ricochet Tactics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้บอทพิจารณายิงกระสุนที่ชิ่งกำแพงได้จริงและเก็บสถิติชิ่ง โดยไม่ปลดการบังกำแพงให้อาวุธทั่วไปหรือสร้างดาเมจจากกำแพง

**Architecture:** Resolve projectile ที่สคริปต์ของ item สร้างจริง ตรวจ collision/restitution/lifespan แล้วสร้างตัวเลือกทางยิงชิ่งหนึ่งครั้งจากแผนที่ ตัวเลือกถูกส่งให้สมองบอท/นโยบาย neural ภายหลัง ส่วน hit/damage มาจาก Planck และ `Unit.inflictDamage` จริงเท่านั้น

**Tech Stack:** Node.js 24, Taro item/projectile scripts, Planck, `node:test`

**Spec:** `docs/superpowers/specs/2026-09-25-battlefight-3v3-training-design.md`

## Global Constraints

- ทำหลัง core plan; อาวุธตัวอย่างจาก runtime JSON คือ Bouncing Bullet `LaeedATycr` สร้าง projectile `ICKyoWSGCI`
- Eligibility ต้องอ่าน projectile ของสคริปต์จริง ไม่ใช้ `_defaultProjectile` ของ item ที่ถูก scripted use แทน
- เสนอทางยิงชิ่งมากสุดหนึ่งครั้งและเลือกยิงเฉพาะเมื่อวิถีไม่ชนกำแพงอื่นก่อนเป้า
- การชนกำแพงไม่ใช่ hit/damage; นับ damage เฉพาะการลด health จริงหลังชิ่ง
- ไม่เปลี่ยน restitution, collision mask, lifetime หรือค่าดาเมจของอาวุธ

## Review Focus

- Item ที่มี default projectile ชิ่งได้แต่ scripted projectile ชนแล้วตายต้องไม่เปิดชิ่ง: Task 1
- มุมเฉียด/ชนปลายกำแพงไม่ทำให้เส้นทางทะลุ tile: Task 2
- เป้าหมายเคลื่อนที่ทำให้จุดสะท้อนที่หมดอายุถูกปฏิเสธ: Task 2
- ชิ่งหลายครั้งแต่โดนหนึ่งเป้า ให้นับ shot/use หนึ่งและ damage ตามเลือดลด: Task 3
- Projectile เพื่อนร่วมทีมไม่สร้าง friendly-fire stats: Task 3

---

### Task 1: ระบุอาวุธชิ่งจาก projectile ที่ถูกสร้างจริง

**Files:**
- Create: `taro-engine/src/gameClasses/components/unit/BattleBotProjectileProfile.js`
- Modify: `taro-engine/src/gameClasses/components/GameComponent.js:204-256`
- Test: `taro-engine/test/battlebot-projectile-profile.test.js`

**Interfaces:**
- Produces: `resolveProjectileProfile(itemStats, getProjectileType) -> {typeId, speedPxPerSecond, lifeSpanMs, wallBounceRestitution, canBounceWall}`

- [ ] **Step 1: เขียน failing test** โหลด runtime JSON จริง: Bouncing Bullet resolve เป็น `ICKyoWSGCI`, `canBounceWall===true`, lifespan 12000ms; Arcane Inferno resolve เป็น `2RorkyQ4ta`, `canBounceWall===false`; item ที่ไม่มี script projectile ใช้ default projectile ได้
- [ ] **Step 2: รัน** `node --test test/battlebot-projectile-profile.test.js`; ต้อง FAIL เพราะ resolver ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
function canBounceWall(projectile) {
  const body = projectile && projectile.bodies && Object.values(projectile.bodies)[0];
  const fixture = body && body.fixtures && body.fixtures[0];
  return !!(body && body.collidesWith && body.collidesWith.walls &&
    projectile.destroyOnContactWith && projectile.destroyOnContactWith.walls === false &&
    Number(fixture && fixture.restitution) > 0);
}
```

  Resolve `createProjectileAtPosition.projectileType` จาก item script ที่ trigger `itemIsUsed` และสร้าง projectile ที่ชนยูนิตได้ ไม่ใช้ default เมื่อ item use เป็น script-driven; ใช้ profile นี้แทนระยะ/ความเร็วเดาเดิม
- [ ] **Step 4: รัน test ใหม่และ `node --test test/battlebot-ai.test.js`**; คาด PASS
- [ ] **Step 5: commit** `feat: resolve true ricochet projectile profiles`

### Task 2: สร้างและประเมินวิถีชิ่งหนึ่งครั้ง

**Files:**
- Create: `taro-engine/src/gameClasses/components/unit/BattleBotRicochet.js`
- Modify: `taro-engine/src/gameClasses/components/unit/AIComponent.js:17-100`
- Modify: `taro-engine/src/gameClasses/components/GameComponent.js:275-365`
- Test: `taro-engine/test/battlebot-ricochet.test.js`

**Interfaces:**
- Consumes: `resolveProjectileProfile`; Produces: `findRicochetOptions({map, origin, target, targetVelocity, speed, lifeSpanMs, restitution, radius}) -> [{aim, bouncePoint, flightMs, score}]`; `chooseBattleBotAttack` เปรียบเทียบ direct/ricochet/no-shot

- [ ] **Step 1: เขียน failing test** กำแพงแนวนอนตรงกลาง: direct ถูกบังแต่ยิงไปจุดสะท้อนหนึ่งครั้งถึงเป้าได้; ไม่มี wall หรือ restitution=0 คืน []; จุดชนที่มุม tile, วิถีชนกำแพงที่สอง, `flightMs>lifeSpanMs` คืน []; เป้าหมายเคลื่อนที่ใช้ตำแหน่งคาดการณ์
- [ ] **Step 2: รัน** `node --test test/battlebot-ricochet.test.js`; ต้อง FAIL เพราะ planner ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
function reflectPointAcrossHorizontalWall(target, wallY) {
  return { x: target.x, y: 2 * wallY - target.y };
}
function reflectPointAcrossVerticalWall(target, wallX) {
  return { x: 2 * wallX - target.x, y: target.y };
}
```

  สร้าง candidate จากด้านกำแพงที่ใกล้และอยู่ในช่วง projectile; หาจุดตัดกับเส้นจาก origin ไป reflected target, ตรวจ segment ก่อน/หลังจุดชนด้วย wall raycast ที่คำนึง radius แล้วคำนวณ flight time โดยใช้ restitution กับ component ความเร็วหลังชน; จำกัดจำนวน candidates ต่อ tick และใช้ข้อมูลที่บอทสังเกตได้เท่านั้น
- [ ] **Step 4: รัน test ใหม่และ deterministic scenario กับ Planck จริง**; คาดการยิงชิ่งที่จำลองมีโอกาสโดน แต่ไม่ถือว่า raycast prediction สร้าง damage เอง
- [ ] **Step 5: commit** `feat: let battle bots aim one-wall ricochets`

### Task 3: ผูก bounce กับ hit/damage ที่เกิดจริง

**Files:**
- Modify: `taro-engine/src/gameClasses/components/script/TriggerComponent.js:37-240,300-330`
- Modify: `taro-engine/server/training/TrainingStats.js`
- Test: `taro-engine/test/training-ricochet-stats.test.js`

**Interfaces:**
- Produces: `recordWallBounce({eventId, projectileId, sourceId, at})`; `recordHealthChange` จาก core รับ `projectileId` แล้วเพิ่ม `ricochetHits/ricochetDamage` เมื่อ projectile มี bounce ก่อน hit

- [ ] **Step 1: เขียน failing test** bounce สองครั้งแล้ว health ลด 8 -> `wallBounces=2`, `ricochetHits=1`, `ricochetDamage=8`; bounce อย่างเดียว -> damage=0; hit เพื่อน -> damage=0; contact event ซ้ำ -> bounce ไม่ซ้ำ
- [ ] **Step 2: รัน** `node --test test/training-ricochet-stats.test.js`; ต้อง FAIL เพราะ bounce hook ยังไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
recordWallBounce({ eventId, projectileId }) {
  if (this.seenEvents.has(eventId)) return;
  this.seenEvents.add(eventId);
  this.projectiles.get(projectileId).wallBounces++;
}
```

  ใน `projectileTouchesWall` บันทึก bounce เฉพาะ projectile ที่ยังมีชีวิตและไม่ถูกทำลายเมื่อชน; ใช้ `sourceProjectileId` ที่ไหลถึง damage event เพื่อผูก hit ภายหลัง, ไม่เพิ่ม `hits` ที่ contact กับ wall
- [ ] **Step 4: รัน test ใหม่, real-physics bounce smoke, compatibility และ normal smoke**; คาดผล damage ตรง health delta
- [ ] **Step 5: commit** `feat: attribute real damage after ricochets`
