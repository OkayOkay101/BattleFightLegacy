# BattleFight Accelerated Training Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ worker ฝึกจำลองเวลาเร็วกว่าเวลาจริงโดยคงลำดับสคริปต์ ฟิสิกส์ คูลดาวน์ และผลแมตช์เหมือนการเดิน fixed steps แบบ realtime

**Architecture:** ใช้ virtual clock เฉพาะ training worker และ manual `ige.engineStep` ที่ก้าวทีละ 1/60 วินาที แทนการใช้ `ige.timeScale()` อย่างเดียว แหล่งเวลาใน gameplay/script ที่เข้าถึงได้ถูกส่งผ่าน clock abstraction; supervisor เก็บเวลาโลกจริงแยกสำหรับควบคุมงานและวัด speedup

**Tech Stack:** Node.js 24, Taro `IgeEngine`, Planck fixed timestep, `node:test`

**Spec:** `docs/superpowers/specs/2026-09-25-battlefight-3v3-training-design.md`

## Global Constraints

- ทำหลัง core plan; ไม่เปลี่ยนความเร็วเกมปกติหรือ timestep ฟิสิกส์ 1/60 วินาที
- AI ตัดสินใจทุก 6 steps (10 Hz); simulation clock ใช้กับ projectile lifespan, cooldown, script timeout, respawn, regeneration และ match timeout
- `max` เป็นค่าเริ่มต้นได้ต่อเมื่อ parity gate ผ่าน; `realtime` ใช้เป็น baseline และ fallback
- ผล `max` ที่ parity ไม่ผ่านห้ามใช้ฝึก neural/heuristic หรือเลื่อนรุ่น
- รายงาน `simulated seconds / wall-clock second` จากการวัดจริง

## Review Focus

- Timeout สคริปต์ที่ซ้อนกันหรือ duration=0 ทำงานตามลำดับเดียวกัน: Task 1
- หยุด worker แล้วยกเลิก callback ของชีวิตเก่า ไม่เกิดใหม่ซ้ำ: Task 2
- คูลดาวน์ item และอายุ projectile เท่ากันเมื่อรัน `max`/`realtime`: Task 2
- ฟิสิกส์ชิ่ง/ชนกำแพงให้ผลตรงในสอง speed mode: Task 3
- หากผลลัพธ์ต่างกันแม้เล็กน้อย supervisor ไม่ใช้แมตช์นั้นเลื่อนรุ่น: Task 3

---

### Task 1: Virtual clock และคิว timer ที่ทดสอบได้

**Files:**
- Create: `taro-engine/server/training/TrainingClock.js`
- Test: `taro-engine/test/training-clock.test.js`

**Interfaces:**
- Produces: `new TrainingClock(startMs)`, `.now()`, `.schedule(callback, delayMs) -> timerId`, `.cancel(timerId)`, `.advanceTo(ms)`, `.dispose()`

- [ ] **Step 1: เขียน failing test** `schedule(A,100)`, `schedule(B,100)`, `schedule(C,0)`, `advanceTo(100)` ต้องได้ `C,A,B`; timer A ที่ schedule อีก timer duration=0 ต้องทำงานใน step เดียวกันหลัง B; cancel ไม่ยิง; dispose ยกเลิกทั้งหมด; เวลาไม่ย้อนกลับ
- [ ] **Step 2: รัน** `node --test test/training-clock.test.js`; ต้อง FAIL เพราะ module ยังไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
schedule(callback, delayMs) {
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError('invalid delay');
  const id = ++this.nextId;
  this.queue.push({ id, at: this.currentMs + delayMs, callback });
  return id;
}
advanceTo(ms) {
  if (ms < this.currentMs) throw new RangeError('clock cannot go backwards');
  while (true) {
    this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
    const next = this.queue[0];
    if (!next || next.at > ms) break;
    this.queue.shift(); this.currentMs = next.at; next.callback();
  }
  this.currentMs = ms;
}
```

  เพิ่มเพดาน callbacks ต่อ step เพื่อไม่ให้สคริปต์ duration=0 วนไม่จบ; เมื่อเกินเพดานให้ fail match พร้อมรายละเอียด ไม่ปล่อยคิวค้าง
- [ ] **Step 4: รัน test ใหม่**; คาด PASS ครบลำดับ, cancel, dispose และ guard
- [ ] **Step 5: commit** `feat: add deterministic training clock`

### Task 2: ขับ Taro และ gameplay timers ด้วย clock เดียว

**Files:**
- Create: `taro-engine/server/training/TrainingStepper.js`
- Modify: `taro-engine/engine/core/IgeEngine.js:1791-1822,1935-2020`
- Modify: `taro-engine/src/gameClasses/components/script/ActionComponent.js:69-79`
- Modify: `taro-engine/src/gameClasses/components/TimerComponent.js:70-145`
- Modify: `taro-engine/src/gameClasses/components/GameComponent.js:258-397`
- Modify: `taro-engine/src/gameClasses/Item.js:255-285`
- Test: `taro-engine/test/training-stepper.test.js`

**Interfaces:**
- Consumes: `TrainingClock`; Produces: `TrainingStepper.step()` เพิ่ม simulation 1000/60 ms หนึ่งครั้งและเรียก `ige.engineStep()` แบบ manual; `ige.training.clock` อ่านได้เฉพาะ worker ฝึก

- [ ] **Step 1: เขียน failing test** fake engine/physics ตรวจว่า 60 `step()` เพิ่มเวลา 1000ms, physics ได้ 60 ครั้งที่ 1000/60, AI 10 ครั้ง, script timeout 250ms ถูกเรียกหลัง 15 steps, projectile lifespan 1500ms ไม่ถูกทำลายก่อนเวลานั้น
- [ ] **Step 2: รัน** `node --test test/training-stepper.test.js`; ต้อง FAIL เพราะ clock bridge ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
step() {
  const next = this.clock.now() + 1000 / 60;
  this.clock.advanceTo(next);
  this.ige.engineStep(next); // _useManualTicks=true; engine reads ige.training.clock.now()
  this.steps++;
}
```

  เปลี่ยนเฉพาะ gameplay timing sites ที่ audit พบให้ใช้ `ige.training?.clock.now()`/`.schedule()` มิฉะนั้นใช้ `Date.now()`/`setTimeout()` เดิม; `TimerComponent.secondTick` ต้องถูก schedule ทุก 1000 simulated ms; เก็บ wall clock ไว้ใน supervisor เท่านั้น ห้าม patch `Date.now` ทั้งโปรเซส
- [ ] **Step 4: รัน test ใหม่และ normal smoke**; คาด `realtime` server เดิมไม่เปลี่ยน และ worker ใช้ manual steps ได้
- [ ] **Step 5: commit** `feat: step training gameplay on virtual time`

### Task 3: Parity gate และการรันแบบเร็วสุดที่ปลอดภัย

**Files:**
- Create: `taro-engine/server/training/TrainingParity.js`
- Modify: `taro-engine/server/training/MatchWorker.js`
- Modify: `taro-engine/server/training/TrainingSupervisor.js`
- Modify: `taro-engine/server/training/TrainingCli.js`
- Test: `taro-engine/test/training-parity.test.js`

**Interfaces:**
- Produces: `compareTrace(realtimeTrace, maxTrace) -> {ok, differences}`; `runParitySuite(seedSet)`; worker result มี `{speedMode, simulatedMs, wallMs, parityStatus}`

- [ ] **Step 1: เขียน failing test** trace เดียวกันต้องผ่าน; damage/score/death/order ต่างต้อง fail; ตำแหน่งต่างไม่เกิน `1e-4` ผ่าน; `parityStatus !== 'passed'` ทำให้ supervisor ไม่ส่ง result ให้ optimizer/promoter
- [ ] **Step 2: รัน** `node --test test/training-parity.test.js`; ต้อง FAIL เพราะ gate ยังไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
function compareTrace(a, b) {
  const fields = ['itemUses', 'contacts', 'healthChanges', 'deaths', 'scores', 'winner'];
  const differences = fields.filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
  return { ok: differences.length === 0, differences };
}
```

  ขยาย comparison ให้เทียบตำแหน่งด้วย tolerance `1e-4`; `--speed realtime` จำกัด step pacing ตามเวลาจริง, `--speed max` รัน fixed steps ต่อเนื่องและ yield event loop ทุก batch (เช่น 60 steps) เพื่อรับ stop/IPC; ทำ parity suite ที่ seed/roster/policy ตรึงก่อนเปิด `max` และหลังแก้ engine timing; หาก fail fallback `realtime` พร้อม status ชัดเจน
- [ ] **Step 4: รัน unit tests, parity integration และ benchmark 1/2 workers**; บันทึก speedup จริงและรัน normal smoke/compatibility
- [ ] **Step 5: commit** `feat: gate accelerated training on parity`
