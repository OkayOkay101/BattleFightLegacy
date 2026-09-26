# BattleFight Neural Self-Play Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ฝึก MLP neural policy จาก self-play 3v3 ต่อเนื่องและบันทึกข้ามรีสตาร์ต โดยใช้จริงเฉพาะรุ่นที่ชนะ heuristic/champion ตามเกณฑ์ validation เดิม

**Architecture:** Node workers สร้าง observation และ legal tactical options ทุก 100ms ของเวลาจำลอง โมเดลให้คะแนนแต่ละ option แล้วส่งคำสั่งผ่านระบบบอท/อาวุธเดิม Trajectory ส่งไป optimizer Python/PyTorch แบบ PPO; publish น้ำหนักเป็น JSON versioned สำหรับ inference pure-JS เพื่อไม่ต้องเรียก Python ทุก tick

**Tech Stack:** Node.js 24, Python 3/PyTorch ใน venv แยก, `node:test`, Python `unittest`, JSON/IPC

**Spec:** `docs/superpowers/specs/2026-09-25-battlefight-3v3-training-design.md`

## Global Constraints

- ทำหลัง core, virtual-time และ ricochet plans; ผล `max` ที่ parity ไม่ผ่านห้ามส่ง optimizer หรือ promotion
- `python` ใน shell Codex ปัจจุบันยังไม่พบ แม้ผู้ใช้แจ้งว่าติดตั้งแล้ว: preflight ต้องรับ `TRAINING_PYTHON` เป็น absolute path และแสดงทางแก้ PATH ไม่เดา path
- PyTorch ใช้ release ที่รองรับ Python/Windows ของเครื่องตาม official install selector; บันทึก exact installed versions/checksums ใน environment manifest
- Neural policy ใช้ข้อมูลที่บอทสังเกตได้และ legal options เท่านั้น ไม่แก้เลือด ดาเมจ ความเร็วหรือคูลดาวน์
- Promotion ใช้ self-play validation กับ heuristic/champion/archived opponents, อย่างน้อย 30 คู่แมตช์สลับฝั่ง, paired-bootstrap lower 95% > 0.5
- หาก neural โหลดไม่ได้, inference ไม่ตรง, หรือผลไม่ดีกว่า baseline ให้ใช้ heuristic ต่อโดยไม่ล้มเกม

## Review Focus

- Interpreter อยู่ใน PATH ของ user แต่ไม่อยู่ในโปรเซส Codex: preflight รับ absolute path และไม่เริ่มฝึกผิด environment: Task 1
- Enemy/ally หายไปหรือ character คนละชนิดไม่ทำให้ observation index เปลี่ยน: Task 2
- Mask ตัดอาวุธ cooldown/กระสุนหมดและทางชิ่งที่ไม่มีจริงก่อน softmax: Task 2
- Node inference กับ PyTorch ต่างเกิน tolerance ต้อง block promotion: Task 3
- Trajectory จาก policy version เก่าหลัง publish snapshot ห้ามปน batch PPO ใหม่: Task 4

---

### Task 1: ตรวจ Python runtime และล็อกสภาพแวดล้อม optimizer

**Files:**
- Create: `taro-engine/server/training/NeuralPreflight.js`
- Create: `taro-engine/training-python/requirements.in`
- Create: `taro-engine/training-python/preflight.py`
- Test: `taro-engine/test/neural-preflight.test.js`

**Interfaces:**
- Produces: `resolvePython({env, spawnSync}) -> {executable, version}`; `runNeuralPreflight()` ตรวจ Python, torch, version manifest; CLI `train:3v3` ยังเริ่ม heuristic ได้หาก neural ปิด แต่ `--neural` ต้อง fail ชัดเมื่อ preflight ไม่ผ่าน

- [ ] **Step 1: เขียน failing test** เมื่อ `TRAINING_PYTHON=C:\\Python312\\python.exe` ให้ spawn path นั้น; เมื่อ `python` ไม่พบและไม่มี override ให้ error ที่ระบุคำสั่งตรวจ `python --version`/วิธีระบุ absolute path; เมื่อ torch import ไม่ได้ให้ error แยกจาก PATH
- [ ] **Step 2: รัน** `node --test test/neural-preflight.test.js`; ต้อง FAIL เพราะ preflight ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
function resolvePython({ env, spawnSync }) {
  const executable = env.TRAINING_PYTHON || 'python';
  const result = spawnSync(executable, ['-c', 'import sys; print(sys.version.split()[0])'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Python unavailable: ${executable}; set TRAINING_PYTHON to an absolute python.exe path`);
  return { executable, version: result.stdout.trim() };
}
```

  `requirements.in` ระบุ `torch` และ `numpy`; เมื่อติดตั้งจริงใช้ official PyTorch selector ให้ตรง Windows/Python/CPU-or-CUDA แล้วบันทึก exact versions ใน `training-data/environment.json` พร้อมคำสั่งติดตั้งซ้ำ; ไม่ใช้ Python จาก Codex bundled runtime เป็น dependency ของเกม
- [ ] **Step 4: รัน `node --test test/neural-preflight.test.js` และ Python preflight ด้วย executable ที่พบจริง**; คาดแสดง interpreter/torch version หรือ blocker ที่ระบุได้
- [ ] **Step 5: commit** `feat: preflight neural training runtime`

### Task 2: Observation schema และ legal tactical actions

**Files:**
- Create: `taro-engine/server/training/NeuralObservation.js`
- Create: `taro-engine/server/training/NeuralActions.js`
- Modify: `taro-engine/src/gameClasses/components/GameComponent.js:258-365`
- Test: `taro-engine/test/neural-observation.test.js`

**Interfaces:**
- Produces: `buildObservation(snapshot) -> Float32Array(82)` สำหรับ roster 44 แบบที่ตรึงด้วย schema version และ `enumerateLegalActions(snapshot) -> Array<{features: Float32Array(13), action}>` จำกัด 16 options; `action` ใช้ `{targetId, movement, slot, aimMode}` โดย `aimMode=direct|ricochet`

- [ ] **Step 1: เขียน failing test** เวกเตอร์ 82 ช่องตามลำดับ: self `[health,x,y,vx,vy]` (5), ally สองคน `[dx,dy,health]` (6), enemy สามคน `[dx,dy,vx,vy,health]` (15), projectile ใกล้สุดสองลูก `[dx,dy,vx,vy]` (8), weapon-ready 4 ช่อง, character one-hot 44 ช่อง; ไม่ครบให้ pad 0; sort entity ID ก่อนเลือกรายการเมื่อระยะเท่ากัน
- [ ] **Step 2: รัน** `node --test test/neural-observation.test.js`; ต้อง FAIL เพราะ schema/action builder ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
const FEATURE_COUNT = 82;
function buildObservation(snapshot) {
  const out = new Float32Array(FEATURE_COUNT);
  let offset = 0;
  const append = (values, width) => {
    for (let i = 0; i < width; i++) out[offset++] = values?.[i] ?? 0;
  };
  append([snapshot.self.health, snapshot.self.x, snapshot.self.y,
    snapshot.self.vx, snapshot.self.vy], 5);
  for (let i = 0; i < 2; i++) append(snapshot.allies[i]?.features, 3);
  for (let i = 0; i < 3; i++) append(snapshot.enemies[i]?.features, 5);
  for (let i = 0; i < 2; i++) append(snapshot.projectiles[i]?.features, 4);
  append(snapshot.weaponReady, 4);
  append(snapshot.characterOneHot, 44);
  return out;
}
```

  ก่อนเรียก `buildObservation` ให้ snapshot คัดกรองสิ่งที่สังเกตได้ เรียง ally/enemy/projectile ตามระยะแล้วตาม entity ID และแปลงค่าเป็น normalized features ที่ตรึงด้วยขนาดแผนที่/ค่าสถานะจริง; บันทึก schema version; action features 13 ช่องคือ target one-hot 3, movement one-hot 4, weapon one-hot 4, aim one-hot 2; enumerate ผ่าน rule engine เดิมเท่านั้น, mask cooldown/resource/friendly-fire/LOS/ricochet-ineligible, prune เหลือ 16 อันดับแรกด้วย heuristic score เพื่อคุม CPU
- [ ] **Step 4: รัน test ใหม่พร้อมกรณี enemy หาย, projectile นอกสายตา, อาวุธหมด, และไม่มี legal attack**; คาดได้ action `move/hold` อย่างน้อยหนึ่งตัวเสมอ
- [ ] **Step 5: commit** `feat: expose legal tactical observations for neural bots`

### Task 3: MLP inference ใน Node และ golden vectors จาก PyTorch

**Files:**
- Create: `taro-engine/server/training/NeuralInference.js`
- Create: `taro-engine/training-python/model.py`
- Create: `taro-engine/training-python/export_model.py`
- Test: `taro-engine/test/neural-inference.test.js`
- Test: `taro-engine/training-python/test_model.py`

**Interfaces:**
- Produces: `scoreActions(weights, observation82, options13) -> {logits, value}`; exported weight JSON มี `{schemaVersion, observationSchemaVersion, rosterHash, layers, checksum}`

- [ ] **Step 1: เขียน failing tests** โมเดล 95→64→64→1 สำหรับ action logit และ 82→64→1 สำหรับ value; golden-vector fixture จาก PyTorch ต้องตรง Node tolerance `1e-5`; dimension/checksum/roster hash ผิดต้อง reject; masked option ไม่มีทางถูกเลือก
- [ ] **Step 2: รัน** `node --test test/neural-inference.test.js` และ `python -m unittest training-python/test_model.py`; ต้อง FAIL เพราะ inference/model ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
function dense(input, weights, bias, rows, cols) {
  const output = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let value = bias[r];
    for (let c = 0; c < cols; c++) value += weights[r * cols + c] * input[c];
    output[r] = value;
  }
  return output;
}
```

  ใช้ ReLU ชั้นซ่อน, Python export row-major float32 และ golden inputs/outputs; ไม่ใช้สุ่มใน inference; ป้องกัน NaN/Infinity, มี fallback heuristic เมื่อโหลดไม่ผ่าน
- [ ] **Step 4: รันสองชุด test พร้อม golden-vector และ smoke เกมปกติ**; คาด parity และ fallback ผ่าน
- [ ] **Step 5: commit** `feat: run validated neural weights in Node`

### Task 4: Trajectory, reward และ PPO optimizer

**Files:**
- Create: `taro-engine/server/training/TrainingTrajectory.js`
- Create: `taro-engine/training-python/ppo.py`
- Create: `taro-engine/training-python/train.py`
- Modify: `taro-engine/server/training/MatchWorker.js`
- Modify: `taro-engine/server/training/TrainingSupervisor.js`
- Test: `taro-engine/test/training-trajectory.test.js`
- Test: `taro-engine/training-python/test_ppo.py`

**Interfaces:**
- Produces: trajectory records `{policyVersion, rosterHash, observation82, options13, chosenIndex, logProb, value, reward, done, simulatedAt}`; `train_batch(batch, checkpoint)` คืน weight snapshot ใหม่ที่ยังไม่ใช่ champion

- [ ] **Step 1: เขียน failing tests** version ของทุก transition ใน batch ต้องเหมือนกัน; terminal team win +1/-1/draw0; shaping damage/assist/survival รวมต่อแมตช์ถูก cap ในช่วง [-0.1,0.1]; invalid/aborted match ไม่มี trajectory เข้า optimizer; PPO update บน fixed tiny batch ลด loss โดยไม่เกิด NaN
- [ ] **Step 2: รัน** `node --test test/training-trajectory.test.js` และ Python `-m unittest training-python/test_ppo.py`; ต้อง FAIL เพราะ collector/PPO ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```python
ratio = torch.exp(new_log_prob - old_log_prob)
clipped = torch.clamp(ratio, 0.8, 1.2) * advantage
policy_loss = -torch.minimum(ratio * advantage, clipped).mean()
loss = policy_loss + 0.5 * value_loss - 0.01 * entropy.mean()
```

  ใช้ `gamma=0.99`, `GAE lambda=0.95`, learning rate `3e-4`, 4 epochs/batch, batch ≥8192 bot decisions; optimizer อ่านเฉพาะ complete training matches, snapshot นโยบายตรึงตลอด match, publish weights ใหม่แบบ atomic หลัง update และบันทึก RNG/optimizer state เพื่อ resume
- [ ] **Step 4: รัน unit tests, 1/2 worker training batches และ resume หลังหยุด**; คาดจำนวน steps/รุ่นถูกต้อง ไม่มี batch ปน, loss finite
- [ ] **Step 5: commit** `feat: train neural tactics with self-play PPO`

### Task 5: Validation, promotion และ auto-update ที่ปลอดภัย

**Files:**
- Modify: `taro-engine/server/training/TrainingSupervisor.js`
- Modify: `taro-engine/server/training/PolicyRegistry.js`
- Modify: `taro-engine/server/training/TrainingCli.js`
- Test: `taro-engine/test/neural-promotion.test.js`

**Interfaces:**
- Consumes: core `PolicyRegistry` และ candidate weights; Produces: champion neural version เมื่อผ่าน paired self-play validation, ไม่เช่นนั้นเก็บ candidate และ heuristic champion เดิม

- [ ] **Step 1: เขียน failing test** neural candidate ชนะ 30 paired seeds แต่ parity fail -> ไม่ promote; ชนะพร้อม lower 95% >0.5 และไม่ถอยต่อ archived baseline -> promote; loss NaN/checksum invalid -> reject; auto-update off ไม่เปลี่ยนเกมปกติ; on เปลี่ยนรอบใหม่เท่านั้น
- [ ] **Step 2: รัน** `node --test test/neural-promotion.test.js`; ต้อง FAIL เพราะ neural promotion branch ไม่มี
- [ ] **Step 3: ลง implementation ขั้นต่ำ**

```js
function canPromote(candidate, validation) {
  return candidate.checksumValid && validation.pairedMatches >= 30 &&
    validation.parityPassed && validation.lower95 > 0.5 &&
    validation.archivedBaselineRegressed === false;
}
```

  สร้างคู่ทดสอบสลับฝั่งกับ heuristic/champion และ archived policies, ไม่ใช้ seed validation ฝึก; เก็บ champion/previous/candidate versioned; รายงานผล self-play เท่านั้น ไม่กล่าวอ้างชนะมนุษย์
- [ ] **Step 4: รัน test ทุกแผน, smoke/compatibility, ฝึกหลาย worker อย่างน้อย 15 นาที และตรวจ checkpoint หลัง restart**; คาด fallback/rollback และสถิติ tier-list แยก `policyKind`/version ถูกต้อง
- [ ] **Step 5: commit** `feat: promote neural bots only after self-play validation`
