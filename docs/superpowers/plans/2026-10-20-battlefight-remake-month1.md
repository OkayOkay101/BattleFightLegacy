# Battle! Fight! Remake — เดือนที่ 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง sim core แบบ deterministic ใน repo ใหม่ `battlefight-ts` ที่เล่น Gavin vs Nadia ออฟไลน์บนแผนที่ greybox ได้ 60 fps, replay ให้ผลเหมือนเดิมทุกครั้ง, มี benchmark ฉบับแรก และ observation/action API สำหรับบอท/agent

**Architecture:** `packages/sim` เป็น TS ล้วนไม่พึ่งแพ็กเกจอื่นในโปรเจกต์ (ECS เบา, physics เอง, 30 Hz, RNG seed, serialize ทั้งหมด) ทุกระบบอื่นอ่าน/เขียนผ่าน API ของ sim เท่านั้น; `packages/data` ถือ schema Zod และข้อมูลที่แปลงจาก `game.json`; `packages/client` วาดด้วย PixiJS v8 และส่ง input เป็นคำสั่งเข้า sim; ยังไม่มีเซิร์ฟเวอร์/บัญชี/ออนไลน์

**Tech Stack:** Node LTS, TypeScript strict, pnpm workspaces, Vite, Vitest, Biome, Zod, PixiJS v8, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-10-20-battlefight-remake-design.md` · **Roadmap:** `docs/superpowers/plans/2026-10-20-battlefight-remake-roadmap.md`

## Global Constraints
- เส้นทางไฟล์ในแผนนี้อ้างจากราก repo ใหม่ `battlefight-ts/` (ผู้ใช้เลือกตำแหน่งในเฟส 0)
- `packages/sim` ห้าม import `packages/*` อื่น, ห้ามใช้ `Math.random`, `Date.now`, `performance.now`, DOM หรือ I/O — ทดสอบด้วย lint rule + test (P2)
- ทุกค่ากติกา/ตัวเลขอ่านจาก `packages/data` (P8); ห้าม hardcode ตัวเลขเกมเพลย์ในระบบ
- ทุก task ทำ test-first: เขียน test → รันให้ FAIL → implement ขั้นต่ำ → รันให้ PASS → commit (Q103)
- สถานะ sim ทุกชิ้นต้อง serialize/deserialize ได้ และ round-trip ได้ค่าเดิมทุกบิต (Q65)
- Dual Assassin เป็นของผู้สร้างคนอื่น: ข้อมูลอยู่ใต้ `packages/data/internal/` ใช้ได้เฉพาะ benchmark/test **ห้ามเข้า build ของ client** (Q288)
- Gavin = Archmage `r3dZTAf1qa`; Nadia = `Pko4SCDSlz`; Dual Assassin = `oLypCauaxT` (จาก `BattleFight-export(1)/game.json`)
- ตัวเลขเริ่มต้นแกะจาก `game.json` (รวมสคริปต์ "Use") ถ้าผู้ใช้ยังไม่ส่ง design template (Q221, Q324)
- คำสั่งตรวจรวมทุก task: `pnpm -r test && pnpm -r typecheck && pnpm lint`

## Review Focus
- determinism: รันแมตช์เดิมด้วย seed+คำสั่งเดิม 2 ครั้งได้ hash สถานะเท่ากันทุก tick — Task 3, 4
- serialize round-trip ครอบคลุมทุก component รวม CC/heat/buffer/queue — Task 3, 7–9
- กติกา overheat: ล้างได้เฉพาะ strong dispel, ล้างแล้วเกจไม่ลด, ภูมิคุ้มกันเวทกันไม่ได้ — Task 8
- คิวคำสั่งไม่เพิ่มความเร็วร่ายเกินเวลาร่ายปกติ และไม่ข้ามเกจความร้อน — Task 9
- Dual Assassin ไม่อยู่ใน bundle ของ `apps/web` — Task 17
- ลำดับชั้นการวาด: กระสุนศัตรูอยู่บนสุดและไม่มีเอฟเฟกต์ใดสว่างกว่า — Task 10

---

## สัปดาห์ที่ 1 — โครง repo, ข้อมูล, โครง sim

### Task 1: Scaffold monorepo + CI
**Files:** Create `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.github/workflows/ci.yml`, `packages/{sim,data,content-tools,client,benchmark}/package.json`, `apps/web/package.json`, `.gitignore` (ตัดไฟล์เสียง/`node_modules` แบบ repo เดิม)
- [ ] **Step 1:** เขียน test placeholder ใน `packages/sim/test/smoke.test.ts` ที่ import `packages/sim/src/index.ts` (ยังไม่มี) → FAIL
- [ ] **Step 2:** สร้าง workspace, TS strict, Vitest, Biome; เพิ่ม lint rule ห้าม `Math.random|Date.now|performance.now|window|document` ใน `packages/sim/src/**` และห้าม import `@bf/*` อื่นจาก sim
- [ ] **Step 3:** CI รัน `pnpm install --frozen-lockfile`, test, typecheck, lint, `pnpm audit` (Q540); เปิด secret scanning (Q538)
- [ ] **Step 4:** PASS → commit

### Task 2: Schema ข้อมูล + converter จาก game.json
**Files:** Create `packages/data/src/schema/{unit,skill,projectile,map,rules}.ts`, `packages/content-tools/src/convert.ts`, `packages/data/generated/{units,skills,projectiles,rules}.json`, `packages/data/internal/dual-assassin.json`; Test `packages/content-tools/test/convert.test.ts`
**Interfaces:** Produces `convertGame(gameJson): { units, skills, projectiles, maps, report }` — `report` ระบุฟิลด์ที่แปลงไม่ได้/สคริปต์ที่ต้องเขียนเอง
- [ ] **Step 1:** test: แปลง `game.json` แล้วได้ Gavin มี 4 สกิล (Arcane Inferno, Frost Blast, Wind Blade, Earth Shaker) พร้อม fireRate 50/2500/450/3000 ms, ระยะ 1300/1300/2000/1300, HP 100; Nadia HP 120 มี 4 สกิล; ผลผ่าน Zod; Dual Assassin ถูกเขียนไป `internal/` เท่านั้น → FAIL
- [ ] **Step 2:** เขียน schema Zod (ทุกฟิลด์เกมเพลย์ + แท็ก 1–5, ความยาก 1–3, heat ต่อสกิล, CC, telegraph, `internalOnly`)
- [ ] **Step 3:** เขียน converter อ่าน `unitTypes`, `itemTypes`, `projectileTypes`, สคริปต์ "Use" ของสกิล 3 ตัวละคร; ค่าที่ไม่มีให้ใส่ค่าเริ่มต้นจาก `rules.json` และบันทึกลง `report`
- [ ] **Step 4:** PASS → commit

### Task 3: โครง sim — world, tick, RNG, serialize
**Files:** Create `packages/sim/src/{world.ts,ecs.ts,rng.ts,serialize.ts,hash.ts,index.ts}`; Test `packages/sim/test/{determinism,serialize}.test.ts`
**Interfaces:** `createWorld(data, seed): World`; `step(world, commands: Command[]): void` (1 tick = 1/30 วิ); `serialize(world): Uint8Array`; `deserialize(bytes, data): World`; `hashWorld(world): string`
- [ ] **Step 1:** test: สร้าง world 2 ชุด seed เดียวกัน คำสั่งชุดเดียวกัน 900 tick → hash เท่ากันทุก tick; serialize→deserialize กลางทาง แล้วรันต่อ hash ยังเท่ากัน; seed ต่างกันได้ผลสุ่มต่างกัน → FAIL
- [ ] **Step 2:** ECS เบา (entity id, component store แบบ typed array), RNG PRNG มี state อยู่ใน world, fixed tick
- [ ] **Step 3:** serialize ครบทุก component + RNG state + tick
- [ ] **Step 4:** PASS → commit

### Task 4: Replay recorder/player + replay test harness
**Files:** Create `packages/sim/src/replay.ts`, `packages/benchmark/src/replay-check.ts`; Test `packages/sim/test/replay.test.ts`
**Interfaces:** `recordReplay(world, commandLog) → Replay { simVersion, seed, snapshots@20Hz, commands }`; `playReplay(replay, data) → World` ; `seek(replay, tick)`
- [ ] **Step 1:** test: บันทึกแมตช์ 60 วิ แล้วเล่นซ้ำได้ hash ตรงทุก snapshot; seek ไป tick ใดก็ได้แล้ว hash ตรง; `simVersion` ต่างกันแล้ว `canResume === false` แต่ดูได้ (Q66) → FAIL
- [ ] **Step 2:** implement snapshot 20 Hz (delta จาก snapshot ก่อนหน้า) + command log
- [ ] **Step 3:** เพิ่ม `pnpm replay:check` ใน CI รัน replay ตัวอย่างที่ commit ไว้ (Q14)
- [ ] **Step 4:** PASS → commit

## สัปดาห์ที่ 2 — Physics และ combat core

### Task 5: Physics เอง
**Files:** Create `packages/sim/src/physics/{shapes.ts,broadphase.ts,raycast.ts,resolve.ts}`; Test `packages/sim/test/physics.test.ts`
- [ ] **Step 1:** test: วงกลมชนกล่องหยุดถูกตำแหน่ง; raycast ตรงกับผลคำนวณมือ; กระสุนสะท้อนกำแพงเฉียงได้มุมถูก; ผลัก/ดึงระยะตายตัวและหยุดเมื่อชนกำแพงโดยไม่มีผลพิเศษ (Q246, Q217); hitbox = ขนาดภาพ (Q177) → FAIL
- [ ] **Step 2:** implement ด้วยเลขที่ deterministic (หลีกเลี่ยงฟังก์ชันตรีโกณที่ผลต่างกันข้ามเครื่อง — ใช้ตารางหรือ fixed-point ตามที่ test ยืนยัน)
- [ ] **Step 3:** PASS → commit

### Task 6: การเดิน กระสุน ดาเมจ ความตาย กติกา TDM
**Files:** Create `packages/sim/src/systems/{movement,projectile,damage,death,respawn,match}.ts`; Test `packages/sim/test/combat.test.ts`
- [ ] **Step 1:** test: ดาเมจ = `max(0, hpBefore - hpAfter)`; ไม่มี friendly fire; ตายแล้วเกิดใหม่ 3 วิพร้อมอมตะสั้น; แมตช์จบที่ 30 kills หรือ 5 นาที (ค่าจาก `rules.json`) (Q31, Q85) → FAIL
- [ ] **Step 2:** implement
- [ ] **Step 3:** PASS → commit

### Task 7: CC framework
**Files:** Create `packages/sim/src/systems/status.ts`; Test `packages/sim/test/cc.test.ts`
- [ ] **Step 1:** test: 10 ประเภท CC (Q241) ทำงานตามนิยาม; slow ซ้อนเต็มไม่มีขีดต่ำ (Q216, Q226); tenacity ค่าเริ่ม 0 (Q242); dispel basic/strong ตามระดับที่ CC กำหนด (Q244); super armor/อมตะ/ภูมิคุ้มกันเวท (Q243); round-trip serialize → FAIL
- [ ] **Step 2:** implement (blind เก็บเป็นสถานะใน sim; การกรองข้อมูลทำในเฟส 3)
- [ ] **Step 3:** PASS → commit

### Task 8: เกจความร้อน
**Files:** Create `packages/sim/src/systems/heat.ts`; Test `packages/sim/test/heat.test.ts`
- [ ] **Step 1:** test: สกิลเพิ่มความร้อนตามข้อมูล; หยุดลดช่วงสั้นแล้วค่อยลด (Q399); เต็มแล้ว overheat = silence เดินได้ (Q278, Q401); ล้างได้เฉพาะ strong dispel, tenacity ลดได้ ≤50%, ภูมิคุ้มกันเวทกันไม่ได้, **ล้างแล้วเกจไม่ลด** (Q411); ตายรีเซ็ต (Q400); การสลับเวทเพิ่มความร้อนเล็กน้อย (Q398) → FAIL
- [ ] **Step 2:** implement
- [ ] **Step 3:** PASS → commit

### Task 9: Skill buffer + คิวคำสั่ง
**Files:** Create `packages/sim/src/systems/{buffer,commandQueue}.ts`; Test `packages/sim/test/queue.test.ts`
- [ ] **Step 1:** test: กดระหว่างสลับ/ร่าย/โดน CC/ท้าย cooldown แล้วสกิลออกเมื่อพร้อม ภายใน window เวลาที่เหลือ + ~0.1–0.15 วิ (Q229–Q230); คำสั่งที่มี flag queue ต่อท้าย ไม่มีแทนที่ (Q259); เดิน/ไม่กด queue ยกเลิกคิว (Q261); คิวไม่ร่ายเร็วกว่าเวลาร่าย และหยุดเมื่อ overheat (Q262, Q407); มีเพดานทางเทคนิคความยาวคิว (Q261) → FAIL
- [ ] **Step 2:** implement
- [ ] **Step 3:** PASS → commit

## สัปดาห์ที่ 3 — เล่นได้

### Task 10: Renderer PixiJS ขั้นต่ำ
**Files:** Create `packages/client/src/render/{app.ts,layers.ts,teamColor.ts,interp.ts}`, `apps/web/src/main.ts`; Test `packages/client/test/layers.test.ts`
- [ ] **Step 1:** test: ลำดับชั้น ฉาก < เอฟเฟกต์ไม่อันตราย < ตัวละคร < กระสุนทีมเรา < กระสุนศัตรู; สีทีมจากมุมผู้เล่น (ฟ้า/แดง) ใช้ขอบสีทีมกับธาตุ (Q173–Q175, Q215); กระสุนทีมเราจาง 40–60% → FAIL
- [ ] **Step 2:** implement WebGPU → WebGL2 fallback, interpolation ระหว่าง tick, ตัวนับ fps
- [ ] **Step 3:** PASS → commit

### Task 11: Input คีย์บอร์ด/เมาส์ → คำสั่ง
**Files:** Create `packages/client/src/input/{keyboardMouse.ts,bindings.ts}`; Test `packages/client/test/input.test.ts`
- [ ] **Step 1:** test: WASD/เมาส์สร้าง `Command` ที่ถูกต้อง; **ทุกตัวละครใช้ 4 ปุ่มสั่ง 4 สกิลโดยตรง** (Q596) ยกเว้น Gavin ที่ปุ่ม 1–4/ลูกล้อสลับเวทแล้วยิงปุ่มเดียว (Q212, Q224); Shift ค้าง = queue flag; ตั้งปุ่มใหม่ได้ (Q62) → FAIL
- [ ] **Step 2:** implement (จอย/จอสัมผัสเป็นเฟส 2)
- [ ] **Step 3:** PASS → commit

### Task 12: Gavin, the Archmage
**Files:** Create `packages/sim/src/kits/gavin.ts`; Test `packages/sim/test/kits/gavin.test.ts`
- [ ] **Step 1:** test ตาม spec §3.3: 4 เวทสลับ 0.2–0.3 วิ, cooldown เวทที่ไม่ได้ถือนับต่อ, Frost/Earth ทำให้ช้า (ซ้อนได้), Earth ผลัก, Inferno กระสุนแยกนัดจำนวนลดลงดาเมจต่อนัดเพิ่ม (Q220), ไม่มีท่าไม้ตาย; ตัวเลขมาจากข้อมูล → FAIL
- [ ] **Step 2:** implement (combo ธาตุยังไม่ทำ — รอ Q225)
- [ ] **Step 3:** PASS → commit

### Task 13: Nadia
**Files:** Create `packages/sim/src/kits/nadia.ts`; Test `packages/sim/test/kits/nadia.test.ts`
- [ ] **Step 1:** test ตามข้อมูลเดิม: Sword Slash **เป็น hitbox พื้นที่โค้งระยะประชิด ไม่ใช่กระสุน** (Q597), Frozen Dash **พุ่งระยะตายตัวตามทิศเคอร์เซอร์เสมอ (ไม่ขึ้นกับการยืนนิ่งหรือระยะเคอร์เซอร์) ชนกำแพงแล้วหยุด** (Q594), Teleportation หน่วงก่อนวาร์ปไปจุดเคอร์เซอร์ ไม่วาร์ปเข้ากำแพง (Q595), Elemental Freeze ทำให้ช้า + **ดาเมจรวมที่รับได้ไม่เกิน 30 ตลอด 2 วิ** (Q600) → FAIL
- [ ] **Step 2:** implement
- [ ] **Step 3:** PASS → commit

### Task 14: Tiled loader + แผนที่ greybox
**Files:** Create `packages/content-tools/src/tiled.ts`, `packages/data/maps/greybox-01.json`; Test `packages/content-tools/test/tiled.test.ts`
- [ ] **Step 1:** test: โหลด legacy map (80×80, layers floor/floor2/walls/trees) ได้กำแพงถูกตำแหน่ง; greybox ~40×24 สมมาตรหมุน 180° (ตรวจว่า tile (x,y) = tile (W-1-x, H-1-y)); มีจุดเกิด 2 ฝั่ง; ไฟล์ผิดรูปแบบถูกปฏิเสธ (Q372) → FAIL
- [ ] **Step 2:** implement; greybox เป็นของชั่วคราวจนผู้ใช้ส่งแผนที่จริง (Q302)
- [ ] **Step 3:** PASS → commit

### Task 15: บอทกฎ + แมตช์ออฟไลน์
**Files:** Create `packages/sim/src/bots/ruleBot.ts`, `apps/web/src/offlineMatch.ts`; Test `packages/sim/test/ruleBot.test.ts`
- [ ] **Step 1:** test: บอทกฎส่งคำสั่งผ่าน API เดียวกับผู้เล่น (P5); แมตช์ 1v1 Gavin vs Nadia บอทกับบอทจบได้ภายในกติกา; บอทติดป้าย (Q36) → FAIL
- [ ] **Step 2:** implement; เปิดหน้าเว็บเล่นกับบอทได้
- [ ] **Step 3:** PASS → commit

## สัปดาห์ที่ 4 — Spike, ตัวโจทย์, benchmark, API

### Task 16: Spike แอนิเมชัน (Q20, Q550)
**Files:** Create `docs/spikes/animation.md`, `packages/client/src/render/anim/{frameProcedural.ts,skeletal.ts}` (เฉพาะ spike)
- [ ] **Step 1:** ทำ Gavin ทั้งแบบ frame+procedural และ skeletal (DragonBones หรือ Spine — เช็ก license/ราคาก่อน ห้ามจ่ายเงิน)
- [ ] **Step 2:** วัด: ความมีชีวิต (ผู้ใช้ให้คะแนน), ขนาดไฟล์, fps มือถือรุ่นล่าง, เวลาผลิตต่อตัว, ต้นทุนทำสกิน
- [ ] **Step 3:** เขียนผลใน `docs/spikes/animation.md` แล้ว **หยุดถามผู้ใช้ตัดสิน** — ห้ามเลือกเอง
- [ ] **Step 4:** commit

### Task 17: Dual Assassin (ตัวโจทย์ภายใน)
**Files:** Create `packages/sim/src/kits/dualAssassin.ts`, `packages/sim/src/systems/clones.ts`; Test `packages/sim/test/kits/dualAssassin.test.ts`, `apps/web/test/bundle-exclusion.test.ts`
- [ ] **Step 1:** test: Death Prophecy โดนแล้วสร้างโคลน; Quick Thrust แดชระยะตายตัวตามทิศเคอร์เซอร์ (Q594) และสั่งโคลนโจมตี; Clean Swap ยิงกระสุนแบบเลือก point target หรือ unit target (กระสุนวิ่งตามโคลนที่เลือก) โดนโคลนแล้ววาร์ป และกระสุนยังถูกขวางได้ (Q604); Flawless Finisher วาร์ประยะสั้นไปจุดเป้าหมายทั้งตัวจริงและโคลน (Q595); **bundle ของ `apps/web` ไม่มีสตริง/ข้อมูลของ Dual Assassin** (Q288) → FAIL
- [ ] **Step 2:** implement ระบบโคลนแบบทั่วไป (ใช้ซ้ำกับตัวเรียกลูกน้องภายหลัง — Q235); ข้อมูลอ่านจาก `packages/data/internal/` เฉพาะใน benchmark/test
- [ ] **Step 3:** PASS → commit

### Task 18: Benchmark harness
**Files:** Create `packages/benchmark/src/{potential.ts,micro.ts,duel.ts,report.ts}`; Test `packages/benchmark/test/*.test.ts`
- [ ] **Step 1:** test: คำนวณ burst/sustained DPS ภายใต้เกจความร้อน, TTK, วินาที CC, ระยะ จากไฟล์ข้อมูล (Q249, Q409); micro-benchmark กฎตายตัว (ตีหุ่น, หลบชุดกระสุน); ดวล 1v1 ตัวโจทย์ 3 ตัว รายงานอัตราชนะ + เตือนเมื่อออกนอก 40–60% (Q285); mirror match ใกล้ 50% (Q250) → FAIL
- [ ] **Step 2:** implement + `pnpm bench:fast` (CI) และ `pnpm bench:full` (เครื่องผู้ใช้)
- [ ] **Step 3:** PASS → commit

### Task 19: Observation/action API
**Files:** Create `packages/sim/src/api/{observation.ts,action.ts}`; Test `packages/sim/test/api.test.ts`
- [ ] **Step 1:** test: observation มีเฉพาะสิ่งที่ผู้เล่นคนนั้นเห็น (ตัวเอง, ศัตรูในระยะซูมสูงสุดที่ไม่ถูกกำแพงบัง, CC/heat ที่แสดงบนจอ) (Q71, Q248, Q364); action = ชุดเดียวกับคำสั่งผู้เล่น; บอทกฎ (Task 15) ใช้ API นี้ได้ → FAIL
- [ ] **Step 2:** implement (ID ต่อผู้ดู Q413 ทำในเฟส 3 พร้อม interest management)
- [ ] **Step 3:** PASS → commit

### Task 20: ตรวจ definition of done + รายงาน
**Files:** Create `docs/superpowers/progress/2026-11-battlefight-remake-month1.md` (ใน repo วางแผนเดิมหรือ repo ใหม่ตามที่ผู้ใช้เลือก)
- [ ] **Step 1:** วัด fps Gavin vs Nadia บน greybox บน PC ผู้ใช้ (เป้า 60) และ Android รุ่นล่างถ้ามี (Q52)
- [ ] **Step 2:** รัน `pnpm replay:check`, `pnpm bench:fast`, `pnpm bench:full`; แนบรายงาน
- [ ] **Step 3:** สรุปสิ่งที่เสร็จ/ไม่เสร็จ, จุดที่ต้องให้ผู้ใช้ตัดสิน (ผล spike, ตัวเลขที่ยังใช้ค่าเดิม), แล้วทบทวนแผนเดือนถัดไปตาม roadmap (Q151)
- [ ] **Step 4:** commit

## สิ่งที่ห้ามทำในเดือนนี้
เซิร์ฟเวอร์/ออนไลน์, บัญชี, ร้านค้า, perk, ล็อกเป้า, UI สวย, สกิน, การเชื่อมระบบฝึก Python, สมัครบริการภายนอก, ตัดสินผล spike แทนผู้ใช้
