# BattleFight 3v3 Training Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** รัน self-play 3v3 ของบอทหกตัวในโปรเซสแยกหลาย worker พร้อมคะแนนที่ถูกต้อง สถิติดิบ checkpoint และคำสั่งควบคุม โดยยังไม่เร่งเวลาและยังไม่ใช้ neural policy

**Architecture:** Supervisor ของ Node สร้าง worker หนึ่งโปรเซสต่อแมตช์ เพราะ `ige` เป็น singleton แต่ละ worker ใช้ Taro/Planck เดิมแบบ headless แล้วส่งผลผ่าน IPC กลับมา ผู้เขียนไฟล์ถาวรมีเพียง supervisor ส่วนเกมปกติไม่เข้าสู่ training branch

**Tech Stack:** Node.js 24, Taro/Planck ที่มีใน repo, `node:test`, JSONL/JSON, PowerShell บน Windows

**Spec:** `docs/superpowers/specs/2026-09-25-battlefight-3v3-training-design.md`

## Global Constraints

- เกมจริงอ่าน `taro-engine/src/game.json`; ห้ามแก้ export แทน runtime โดยไม่ตรวจ
- ฝึกบอท 3v3 ล้วนจาก roster ตัวละครหลัก 44 แบบตามสเปก (รวม Rhythm Assassin, Engineer, Emo & Sky และ Casker) กติกา/สกิล/คูลดาวน์/ทรัพยากรเท่าเกมปกติ
- Worker ใช้โปรเซสแยก ไม่ยึดพอร์ต 80/2001 และห้ามสร้างบอทสองตัวแบบแมตช์ปกติ
- `--workers` เริ่มต้น `min(4, max(1, availableParallelism - 1))`, รับ `1..8`; คำสั่งหยุดต้องไม่ฆ่าเซิร์ฟเวอร์เกมปกติ
- ผลแพ้ชนะทีมเป็นเป้าหมายหลัก; damage คือ `max(0, healthBefore - healthAfter)` หลังการลดเลือดจริง
- Match result และ policy/version ต้องอยู่รอดหลังรีสตาร์ต; `auto-update` เริ่มต้น `off`
- ทุกงานทำ test-first แล้วรัน `node --test test/battlebot-ai.test.js test/script-compat.test.js` และ `node test/battlefight-smoke.js` เมื่อพอร์ตว่าง

## Review Focus

- บอทแดงโจมตีบอทน้ำเงินใน training mode แต่บอทเกมปกติยังไม่โจมตีกัน: ทดสอบใน Task 2
- roster ฝึกอ่านสคริปต์เลือกตัวจริง 44 แบบและรายงานรายการที่ถูกกันออก: ทดสอบใน Task 1
- การตายซ้ำ/ดาเมจพื้นที่ทำให้คะแนนและ kill เพิ่มครั้งเดียว: ทดสอบใน Task 3
- Worker พังหลังส่ง result แต่ก่อน ACK ไม่เพิ่มแมตช์ซ้ำ: ทดสอบใน Task 5
- `train:stop` หยุดเฉพาะ supervisor ที่ lock ระบุ และไม่แตะ PID เกมปกติ: ทดสอบใน Task 6
- ไฟล์ policy เสียไม่ทำให้เกมปกติล้ม และ auto-update ไม่เปลี่ยนรุ่นกลางแมตช์: ทดสอบใน Task 7

---

### Task 1: แยกจุดเริ่มเกมฝึกและสร้างบอทหกช่อง

**Files:**
- Create: `taro-engine/server/training/TrainingRuntime.js`
- Create: `taro-engine/server/training/TrainingRoster.js`
- Modify: `taro-engine/server/server.js:398-560`
- Modify: `taro-engine/src/gameClasses/components/GameComponent.js:35-100`
- Test: `taro-engine/test/training-runtime.test.js`
- Test: `taro-engine/test/training-roster.test.js`

**Interfaces:**
- Produces: `TrainingRuntime.install(ige, config)` ติดตั้ง `ige.training` ก่อน `ige.game.start()`; `ige.training.spawnBots(game)` สร้างหกบอทที่ `trainingTeamId` เป็น `blue|red`; `ige.training.isTrainingMode === true`

- [ ] **Step 1: เขียน failing test** ใช้ fake game ที่เก็บ `createPlayer` calls: `install(fakeIge, { seed: 7 }); spawnBots(fakeGame)` ต้องมีหกคน ทีมละสาม, `isBattleBot: true`, `controlledBy: 'computer'`, `playerJoined: true`; เกมปกติยังเรียก `_spawnBattleBots()` สองช่องตามเดิม
- [ ] **Step 2: รัน** `node --test test/training-runtime.test.js` จาก `taro-engine`; ต้อง FAIL เพราะ module/branch ยังไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
// server/training/TrainingRuntime.js: expose one installation point.
function install(ige, config) {
  ige.training = {
    isTrainingMode: true,
    config,
    spawnBots(game) {
      for (const teamId of ['blue', 'red']) {
        for (let slot = 0; slot < 3; slot++) {
          game.createPlayer({ name: `Training ${teamId} ${slot + 1}`,
            controlledBy: 'computer', isBattleBot: true, playerJoined: true,
            trainingTeamId: teamId, unitIds: [] });
        }
      }
    }
  };
  return ige.training;
}
module.exports = { install };
```

  ต่อ `GameComponent.start()` ให้เรียก `ige.training.spawnBots(this)` แทน `_spawnBattleBots()` เฉพาะโหมดฝึก; ใช้เส้นทางสร้างยูนิต/attributes เดิมของ `_spawnBattleBotUnit` สำหรับทั้งหกช่อง ห้ามเปิด listener HTTP/network ใน worker ฝึก
- [ ] **Step 4: รัน test ใหม่และ smoke เดิม** คาดว่า PASS; ทดสอบ worker กับเกมปกติพร้อมกันโดยเกมปกติยังตอบ HTTP 200
- [ ] **Step 5: commit เฉพาะไฟล์งานนี้** `feat: isolate six-bot training matches`

### Task 2: ความสัมพันธ์ทีมและสิทธิ์ทำดาเมจ

**Files:**
- Modify: `taro-engine/src/gameClasses/Player.js:322-356`
- Modify: `taro-engine/src/gameClasses/Unit.js:1274-1345`
- Modify: `taro-engine/src/gameClasses/components/GameComponent.js:192-205`
- Test: `taro-engine/test/training-teams.test.js`

**Interfaces:**
- Consumes: `ige.training.isTrainingMode`, `player._stats.trainingTeamId`
- Produces: `ige.training.isOpponent(a, b)`; ค่าทีมถูกอ่านโดย relations, damage guard และ target selector

- [ ] **Step 1: เขียน failing test** ใช้ player blue1/blue2/red1, ทดสอบ `blue1.isHostileTo(red1)===true`, `blue1.isFriendlyTo(blue2)===true`, ดาเมจ red ต่อ blue ลด health, red ต่อ red ไม่ลด และ normal-mode bot ต่อ bot ยังไม่ลด
- [ ] **Step 2: รัน** `node --test test/training-teams.test.js`; ต้อง FAIL ที่ relation/damage guard ปัจจุบัน
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
// TrainingRuntime.isOpponent: only six joined combat participants.
isOpponent(a, b) {
  return !!(a && b && a !== b && a._stats.isBattleBot && b._stats.isBattleBot &&
    a._stats.playerJoined && b._stats.playerJoined &&
    a._stats.trainingTeamId && b._stats.trainingTeamId &&
    a._stats.trainingTeamId !== b._stats.trainingTeamId);
}
```

  ใน `Player.isHostileTo/isFriendlyTo` และ `Unit.inflictDamage` ให้ใช้ branch นี้ก่อน bot-vs-human branch เดิมเมื่อ `ige.training?.isTrainingMode`; `_selectBattleBotTarget` ฝึกเลือก unit ของ owner ฝั่งตรงข้ามเท่านั้น
- [ ] **Step 4: รัน test ใหม่และ `node --test test/battlebot-ai.test.js test/script-compat.test.js`**; คาด PASS ทั้ง normal/training
- [ ] **Step 5: commit** `feat: apply team hostility to training bots`

### Task 3: วงจรแมตช์และผลทีมที่นับครั้งเดียว

**Files:**
- Create: `taro-engine/server/training/TrainingMatch.js`
- Modify: `taro-engine/src/gameClasses/components/GameComponent.js:365-397`
- Modify: `taro-engine/src/gameClasses/components/script/VariableComponent.js:1775-1790`
- Test: `taro-engine/test/training-match.test.js`

**Interfaces:**
- Produces: `TrainingMatch.recordDeath({ lifeId, victimTeamId, killerTeamId, at })`; `TrainingMatch.finish(now)` คืน `{ matchId, winner, scores, status }` โดย winner เป็น `blue|red|null`; รับ `matchId`, `startedAt`, `maxDurationMs=300000`

- [ ] **Step 1: เขียน failing test** `recordDeath` สองครั้งด้วย `lifeId` เดียวเพิ่มคะแนนครั้งเดียว; suicide/environment ไม่ให้แต้มฝ่ายตรงข้าม; score blue=2/red=1 เมื่อครบ 300000ms ให้ blue ชนะ; คะแนนเท่ากันให้เสมอ; ghost/NPC ไม่เป็น participant
- [ ] **Step 2: รัน** `node --test test/training-match.test.js`; ต้อง FAIL เพราะ `TrainingMatch` ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
recordDeath({ lifeId, victimTeamId, killerTeamId }) {
  if (this.deadLives.has(lifeId)) return false;
  this.deadLives.add(lifeId);
  if (killerTeamId && killerTeamId !== victimTeamId) this.scores[killerTeamId]++;
  return true;
}
```

  ผูกกับ death context ต่อชีวิต ไม่อ่าน `ige.game.lastAttackingUnitId` หลังหน่วงเวลา; ตรวจว่าคะแนน TDM ของเกมไม่ถูกนับซ้ำจากสคริปต์ เมื่อครบเวลาอ่านคะแนนทีมชุดเดียวแล้วจบ worker
- [ ] **Step 4: รัน test ใหม่, compatibility และ smoke**; คาด PASS รวมกรณีตายพร้อมกัน/เกิดใหม่
- [ ] **Step 5: commit** `feat: finish isolated 3v3 matches once`

### Task 4: เก็บสถิติจริงของชีวิต อาวุธ และดาเมจ

**Files:**
- Create: `taro-engine/server/training/TrainingStats.js`
- Modify: `taro-engine/src/gameClasses/Item.js:250-310`
- Modify: `taro-engine/src/gameClasses/Unit.js:1274-1350`
- Modify: `taro-engine/src/gameClasses/components/unit/AttributeComponent.js`
- Modify: `taro-engine/src/gameClasses/components/script/ActionComponent.js:2204`
- Modify: `taro-engine/src/gameClasses/components/script/TriggerComponent.js:260-330`
- Test: `taro-engine/test/training-stats.test.js`

**Interfaces:**
- Produces: `recordItemUse({eventId, actorId, itemTypeId})`, `recordHealthChange({eventId, projectileId, itemTypeId, sourceId, targetId, before, after, at})`, `recordDeath(...)`, `finish(result)`; ทุก hook ทำงานเฉพาะ `ige.training.isTrainingMode`

- [ ] **Step 1: เขียน failing test** ยิงหนึ่งครั้งโดนสองเป้า `uses=1`, `hits=2`, damage เท่าผลเลือดลดหลัง armor; ชนกำแพงอย่างเดียว `hits=0, damage=0`; ซ้ำ `eventId` ไม่เพิ่ม; ผู้ช่วยทำ damage ใน 10 วินาทีก่อนตายได้ assist หนึ่งครั้ง
- [ ] **Step 2: รัน** `node --test test/training-stats.test.js`; ต้อง FAIL เพราะตัวเก็บสถิติยังไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
recordHealthChange(event) {
  if (this.seenEvents.has(event.eventId)) return;
  this.seenEvents.add(event.eventId);
  const damage = Math.max(0, Number(event.before) - Number(event.after));
  if (damage === 0) return;
  const source = this.players.get(event.sourceId);
  const target = this.players.get(event.targetId);
  if (source) source.damageDealt += damage;
  if (target) target.damageTaken += damage;
  const weapon = this.weapons.get(`${event.sourceId}:${event.itemTypeId}`);
  if (weapon) weapon.damage += damage;
}
```

  อ่านก่อน/หลังที่ `Unit.inflictDamage` และ `AttributeComponent.update` ซึ่งสคริปต์เรียกผ่าน `ActionComponent`; ระบุ `sourceId=null` สำหรับสภาพแวดล้อมหรือสคริปต์ที่ระบุผู้โจมตีไม่ได้ และผูก event เดียวกันไม่ให้นับซ้ำเมื่อผ่านทั้งสอง hook; telemetry ไม่ควบคุมกฎเกมและไม่สร้าง damage ใหม่ ใช้ `Item.use` หลังผ่าน cooldown/cost จริงนับหนึ่งครั้ง
- [ ] **Step 4: รัน test ใหม่และ smoke**; คาด PASS และข้อมูล damage ตรง health delta
- [ ] **Step 5: commit** `feat: collect combat stats from real effects`

### Task 5: คลังผลถาวรและการส่งออก tier-list

**Files:**
- Create: `taro-engine/server/training/TrainingStore.js`
- Create: `taro-engine/server/training/TrainingExport.js`
- Modify: `taro-engine/.gitignore`
- Test: `taro-engine/test/training-store.test.js`

**Interfaces:**
- Produces: `store.appendMatch(result)` แบบ idempotent ด้วย `matchId`; `store.saveCheckpoint(policy)` เขียน temp+rename; `exportStats(matches, format)` คืน JSON/CSV แยก policy version, character, side, composition, sample count

- [ ] **Step 1: เขียน failing test** append `matchId` เดิมสองครั้งได้หนึ่งแถว, โหลด checkpoint หลังจำลอง crash ก่อน rename ได้รุ่นก่อน, CSV มี `policyVersion,characterId,games,wins,losses,draws,damageDealt,damageTaken,kills,deaths,assists`, training/validation แยกชุด
- [ ] **Step 2: รัน** `node --test test/training-store.test.js`; ต้อง FAIL เพราะ store/export ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
async function saveCheckpoint(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(temp, JSON.stringify(value));
  await fs.promises.rename(temp, file);
}
```

  เก็บใน `taro-engine/training-data/`, validate schema/checksum ตอนโหลด, ใช้ไฟล์ JSONL ของผลและ index `matchId` เมื่อ resume; writer มีเพียง supervisor; เพิ่ม ignore เฉพาะ training-data
- [ ] **Step 4: รัน test ใหม่และเปิด/ปิด store ซ้ำ**; คาดอ่านข้อมูลเดิมได้โดยไม่ซ้ำ
- [ ] **Step 5: commit** `feat: persist training results and export tier stats`

### Task 6: Supervisor หลาย worker, CLI และ heuristic candidate

**Files:**
- Create: `taro-engine/server/training/TrainingSupervisor.js`
- Create: `taro-engine/server/training/MatchWorker.js`
- Create: `taro-engine/server/training/TrainingCli.js`
- Create: `taro-engine/server/training/HeuristicPolicy.js`
- Modify: `taro-engine/package.json`
- Test: `taro-engine/test/training-supervisor.test.js`

**Interfaces:**
- Consumes: `TrainingMatch`, `TrainingStats`, `TrainingStore`; child IPC `{type:'run', matchId, seed, bluePolicy, redPolicy, roster}` / `{type:'result', matchId, result}`
- Produces: `TrainingSupervisor.start({workers, dataDir})`, `.stop()`, `.status()`; CLI `train:3v3`, `train:stop`, `train:status`, `train:export`

- [ ] **Step 1: เขียน failing test** fake worker สองตัวรับ matchId ไม่ซ้ำ, สลับฝั่งเป็นคู่, worker ส่ง result ซ้ำถูก dedupe, worker crash retry ไม่เกินสองครั้ง, stop ไม่มอบหมายงานใหม่และไม่ฆ่า process PID นอก lock
- [ ] **Step 2: รัน** `node --test test/training-supervisor.test.js`; ต้อง FAIL เพราะ supervisor ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
function workerCount(requested, available) {
  const count = requested === undefined ? Math.min(4, Math.max(1, available - 1)) : Number(requested);
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new RangeError('workers must be 1..8');
  return count;
}
```

  Scheduler จับคู่ seed/roster แบบสลับฝั่ง; mutation เฉพาะค่ากลยุทธ์ใน schema; candidate แข่งกับ champion และ archive โดย train/validation แยก; promotion หลัง 30 paired seeds พร้อม paired-bootstrap lower 95% > 0.5 และ baseline ไม่ถอย; เก็บรุ่นเก่าก่อน promote
- [ ] **Step 4: รัน unit tests และแมตช์ 3v3 แบบ 1/2 worker**; คาด status มี throughput จริง ผลถาวร และเกมปกติยังตอบ HTTP 200
- [ ] **Step 5: commit** `feat: coordinate parallel 3v3 self-play`

### Task 7: เปิด/ปิด auto-update และใช้ policy ในเกมปกติ

**Files:**
- Create: `taro-engine/server/training/PolicyRegistry.js`
- Modify: `taro-engine/server/training/TrainingCli.js`
- Modify: `taro-engine/src/gameClasses/components/GameComponent.js:258-365`
- Test: `taro-engine/test/training-policy-registry.test.js`

**Interfaces:**
- Produces: `registry.setAutoUpdate(boolean)`, `.activate(version)`, `.rollback()`, `.policyForNewMatch()`; `ige.trainingPolicy` เป็น snapshot อ่านอย่างเดียวของแมตช์ที่กำลังเล่น

- [ ] **Step 1: เขียน failing test** auto-update เริ่ม `off`; promote ระหว่างแมตช์ไม่เปลี่ยน snapshot ปัจจุบัน; แมตช์ใหม่เมื่อ `on` ได้ champion ใหม่; เมื่อ `off` ต้อง activate; corrupt policy fallback baseline ไม่ throw; rollback ได้รุ่นก่อน
- [ ] **Step 2: รัน** `node --test test/training-policy-registry.test.js`; ต้อง FAIL เพราะ registry ยังไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
policyForNewMatch() {
  const requested = this.config.autoUpdate ? this.checkpoint.championVersion : this.config.activeVersion;
  return this.loadValidated(requested) || this.loadValidated(this.config.previousVersion) || this.baseline();
}
```

  เชื่อม `_thinkBattleBot` กับ policy snapshot เฉพาะตอนสร้างบอท/เริ่มรอบ; ไม่แก้ค่ากลางชีวิต; CLI `train:auto`, `train:activate`, `train:rollback` เขียน config atomic
- [ ] **Step 4: รัน test ทั้งชุด, smoke, match 1/2 worker อย่างน้อย 15 นาที**; ตรวจ process/ยูนิต/งานหน่วงเวลาไม่สะสมและไม่มี port conflict
- [ ] **Step 5: commit** `feat: activate validated bot policies safely`

## Handoff

เมื่อ core ผ่านครบแล้วจึงทำแผน `2026-09-25-battlefight-virtual-time.md`, `2026-09-25-battlefight-ricochet-training.md`, และ `2026-09-25-battlefight-neural-policy.md` ตามลำดับ แต่ละแผนมี test gate ของตัวเอง; ห้ามนับผล `max` หรือ neural ใน promotion ก่อน gate ของแผนนั้นผ่าน
