# Battle! Fight! Remake — Roadmap รายเฟส

> **For agentic workers:** แต่ละเฟสแตกเป็นแผนละเอียดของตัวเองใน `docs/superpowers/plans/` ก่อนลงมือ (เฟส 1 มีแล้ว: `2026-10-20-battlefight-remake-month1.md`) ใช้ superpowers:writing-plans สร้างแผนเฟสถัดไป และ superpowers:executing-plans / subagent-driven-development ตอนทำ

**Spec:** `docs/superpowers/specs/2026-10-20-battlefight-remake-design.md`
**Decision log:** `docs/superpowers/specs/2026-10-20-battlefight-remake-decisions.md`

## กติกาของ roadmap
- เวลาเป็น **ค่าประมาณ ไม่ใช่ deadline** — ปล่อยเมื่อเสร็จ (Q170); เลื่อนได้แต่ห้ามเพิ่มฟีเจอร์เข้าเฟส beta ระหว่างเลื่อน (Q156)
- ทุกเฟสจบด้วย: CI เขียว, replay test ผ่าน, รายงาน benchmark, อัปเดต `docs/superpowers/progress/`, ทบทวนแผนสิ้นเดือน (Q151, Q325)
- ทุกฟีเจอร์ผ่าน "ตรวจช่องโกง" ใน design template ก่อนทำ (Q474)
- งบ 0 บาท: ห้ามสมัครบริการเสียเงินโดยไม่ถามผู้ใช้ (Q146)
- งานที่ผู้ใช้ทำขนานไปด้วยระบุไว้ทุกเฟส; AI ใช้ค่าเดิมจาก `game.json` ระหว่างรอดีไซน์ (Q324)

---

## เฟส 0 — เตรียมการ (ก่อนเริ่มเดือนแรก)
- [ ] Commit/archive `taro-engine/` และ `BattleFight-export(1)/` ใน repo นี้ (ระวังไฟล์เสียงและ `node_modules` ตาม `.gitignore`) (Q27)
- [ ] ผู้ใช้เลือกตำแหน่ง repo ใหม่ `battlefight-ts` และสร้าง GitHub private repo (Q29, Q320)
- [ ] ผู้ใช้ติดต่อเจ้าของ Dual Assassin (Q294)

**จบเฟสเมื่อ:** repo ใหม่ว่างพร้อมใช้ และต้นฉบับเดิมไม่มีความเสี่ยงหาย

## เฟส 1 — เดือนที่ 1: Sim core + เล่นออฟไลน์ (แผนละเอียดมีแล้ว)
ส.1 repo/CI, schema+converter, โครง sim · ส.2 physics/combat core + CC/heat/buffer/queue · ส.3 renderer+input, Gavin+Nadia, Tiled+greybox, บอทกฎ · ส.4 spike แอนิเมชัน, Dual Assassin (ภายใน), benchmark, obs/action API (Q322)

**จบเฟสเมื่อ (Q323):** Gavin vs Nadia บน greybox 60 fps · replay deterministic · CI เขียว · รายงาน benchmark แรก
**ผู้ใช้:** template Gavin+Nadia, ออกแบบแผนที่แรก, ร่าง perk/ราคา

## เฟส 2 — เดือนที่ 2: เนื้อหาและระบบเกมเพลย์ครบชุด
- ตัวละครอีก 10 ตัวตาม design template ของผู้ใช้ (ผ่านเกณฑ์ตัวโจทย์ 40–60% — Q285)
- ร้านค้าในแมตช์ + ร้านบนแผนที่ + macro item (Q134–Q138, Q268–Q275)
- ระบบเลือกเป้า unit/point, ล็อกเป้าฝั่งเซิร์ฟ, magnetism item (Q373, Q386–Q395)
- สกิน pipeline + ตัวตรวจอัตโนมัติ (Q545) ตามผล spike แอนิเมชัน
- Interest management + เทสต์ข้อมูลเกิน (P3, Q364)
- แผนที่ 5v5 แผ่นแรกจริง + ตัวตรวจแผนที่ (Q309–Q310)
- i18n ไทย/อังกฤษ, คำอธิบายตัวละครจากแม่แบบ (Q26, Q199–Q211)

**จบเฟสเมื่อ:** เล่นออฟไลน์ 5v5 กับบอทกฎครบ 12 ตัว; ตาราง 12×12 รันได้
**ผู้ใช้:** ออกแบบ 10 ตัว, ราคา/perk, UI style, แผนที่แผ่นสอง

## เฟส 3 — เดือนที่ 3: ออนไลน์
- Colyseus server-authoritative, prediction/interpolation, lag comp เฉพาะ hitscan (Q8, Q359)
- คำสั่งซ้ำ 3–5 รอบ, ปฏิเสธคำสั่งเก่า, ลดอัตราส่งอัตโนมัติ, ไอคอนคุณภาพเน็ต (Q327–Q330, Q334)
- บัญชี: guest ID สุ่ม, Google/Apple/พอร์ทัล, httpOnly cookie, session, SQLite (Q43, Q47, Q527–Q535)
- จับคู่ quick match + ห้องรหัส + ปาร์ตี้ลิงก์ + บอทเติม (แจ้งก่อนเริ่ม) + R-5v5 + ตัวคู่ (Q434–Q441, Q466–Q468)
- Draft แบบปกติ, pause/auto-pause/โคลนแทน, โหวตเตะ+คนแทน, ping บนแผนที่ (Q339–Q356, Q353–Q355, Q429)
- Replay บนเซิร์ฟ + ลายเซ็น + killcam + ผู้ชมหน่วง (Q54–Q58, Q95, Q335)
- Anti-cheat ชั้นกติกา/ข้อมูล/เครือข่าย (§8 ของ spec)

**จบเฟสเมื่อ:** แมตช์ 5v5 ออนไลน์บนเครื่องผู้ใช้ (LAN/ทดสอบภายใน) 30 แมตช์ไม่ค้าง; network test ผ่าน (จำลองหน่วง/หลุด)

## เฟส 4 — เดือนที่ 4: บอท AI 5v5
- ต่อระบบฝึก Python เดิมเข้ากับ headless sim ใหม่ (Q25)
- Curriculum: 1v1 → 3v3 → 5v5; ต่อสู้ → ความร้อน → ร้าน → perk (เมื่อพร้อม) → ตัวคู่ (Q162, Q169, Q410, Q441)
- ONNX export, batch inference ทุก 2–3 tick, ระดับความยาก, โคลนแทนคนหลุด (Q167, Q171, Q357, Q361)
- วัดจำนวนห้องพร้อมกันบนเครื่องผู้ใช้ (Q171)

**จบเฟสเมื่อ:** บอทระดับกลางผ่านเกณฑ์ playtest; ถ้ายังไม่ถึง ใช้บอทกฎและ **เลื่อน** (ไม่ตัดฟีเจอร์ — Q150, Q170)

## เฟส 5 — ทดสอบวงปิดและเตรียม beta
- ทดสอบวงปิดกับคน Discord บนเครื่องผู้ใช้ (Q152, Q311)
- วัดความสนุก: funnel, อัตรากดเล่นอีก, สัญญาณหงุดหงิด, แบบสอบถาม, think-aloud (Q312–Q316, Q567)
- ผู้เล่นใหม่: บทสอน, บอทล้วน 1–2 แมตช์, กลุ่มผู้เล่นใหม่, คำแนะนำในเกม, ซื้อตามแนะนำ (Q559–Q563)
- ตรวจสิทธิ์ asset ทั้งหมดจาก `manifest.json`, เปลี่ยนชิ้นที่ไม่ผ่าน (Q11)
- ToS/Privacy/EULA + ผู้เชี่ยวชาญกฎหมาย, แผนรับมือข้อมูลรั่ว, `/security-review` (Q100, Q541, Q543)
- หน้าแอดมิน + บทบาท + 2FA + audit log (Q129, Q537); Sentry (Q109); press kit (Q574); Discord (Q96)

**จบเฟสเมื่อ:** ผ่านเกณฑ์ beta ครบ (spec §15)

## เฟส 6 — Beta สาธารณะ
- โฮสต์บน cloud free tier (ผู้ใช้ตัดสิน — Q16, Q152); PWA (Q153)
- ลง itch.io / พอร์ทัลฟรี (Q147); ตลาดไทยก่อน (Q569); คลิปไฮไลต์อัตโนมัติ + devlog (Q572–Q573)
- แพตช์บั๊กรายสัปดาห์, ตัวเลขทุก 2–4 สัปดาห์ (Q106); รายงานความโปร่งใส (Q427)

## เฟส 7+ — หลัง beta (เรียงตามความพร้อม ไม่ใช่วันที่)
| กลุ่ม | งาน | อ้างอิง |
|---|---|---|
| โหมด | FFA legacy map, arcade, ห้องทัวร์นาเมนต์ + Chronobreak + คู่มือกรรมการ | Q28, Q557, Q475–Q498 |
| เนื้อหา | ตัวละครใหม่ 1–2/เดือน (รวมหลายร่าง, healer, ย้อนเวลาทั้งเกม, กลไก lag) | Q240, Q239, Q499–Q526, Q360 |
| Story | solo 10–12 ด่าน + series bible → co-op | Q142–Q145, Q586 |
| Agent | Gym wrapper + เปิดซอร์ส sim → ตัวแยกคน/บอท → Open ladder → Standard (ONNX) → LLM commander → Gauntlet → Design Arena | Q82, Q298 |
| UGC | Custom Units (ค่า → ชิ้นส่วน → Lua ออฟไลน์ → Lua บนเซิร์ฟหลัง security review), แผนที่ Tiled | Q116–Q125 |
| ระบบผู้เล่น | ranked + ซีซัน + draft/ban (เมื่อคนพอ), รายชื่อเพื่อน, combo trial, สกินชุดแรก | Q92–Q93, Q442, Q564, Q546 |
| แพลตฟอร์ม | Tauri/Steam, Google Play/App Store (เมื่อมีงบ), WebTransport | Q147, Q153, Q326 |
| ขยายตลาด | ภาษาเพิ่ม, ภูมิภาคใหม่ตามข้อมูล, creator program, งานแข่ง agent | Q111–Q113, Q575–Q576 |
| ซีรีส์ | spike เครื่องมือ motion graphics → ตอนนำร่อง "Gavin vs Nadia" → ซีซัน 1 | Q590, Q593 |

## จุดตัดสินใจที่ต้องกลับมาถาม (ไม่ให้ AI ตัดสินเอง)
ผลแอนิเมชัน spike (ส.4) · hosting/Supabase (ก่อนเฟส 6) · perk/ลัง/fog of war/UI style (เมื่อผู้ใช้ออกแบบเสร็จ) · combo ธาตุ Gavin · เงินจริง (ไม่ใช่ตอนนี้) · การใช้ Dual Assassin นอกการทดสอบภายใน · เครื่องมือซีรีส์
