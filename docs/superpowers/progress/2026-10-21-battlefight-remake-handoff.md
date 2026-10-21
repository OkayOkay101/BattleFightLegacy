# Handoff — Battle! Fight! Remake (planning)

**วันที่:** 2026-10-21 · **สถานะ:** วางแผนเสร็จ ยังไม่เขียนโค้ด
**Repo:** `C:\Users\Smart\Documents\antigravity\BattleFight` → remote `OkayOkay101/BattleFightPrivate`
**Branch:** `docs/remake-plan` (ยังไม่ push) — commit: `16feac3` แผนหลัก · `a93d885` แดช/วาร์ป · `ebb1864` สกิลจากข้อจำกัด engine · `c6be53c` fps/ขนาดไฟล์

## อ่านก่อนทำอะไร (ตามลำดับ)
1. `docs/superpowers/specs/2026-10-20-battlefight-remake-decisions.md` — decision log Q1–Q617 + R-5v5 (**แหล่งความจริง**; ข้อที่ใหม่กว่าแทนข้อเก่า เช่น Q34→Q352/Q373, Q9→Q43, Q450/Q456–Q465→R-5v5, Q502→Q513, Clean Swap ใน Q597→Q604)
2. `docs/superpowers/specs/2026-10-20-battlefight-remake-design.md` — spec สรุป (หลักห้ามละเมิด P1–P12 อยู่ §1.3)
3. `docs/superpowers/plans/2026-10-20-battlefight-remake-roadmap.md` — เฟส 0–7+
4. `docs/superpowers/plans/2026-10-20-battlefight-remake-month1.md` — 20 task แบบ TDD สำหรับเดือนแรก

## สรุปโปรเจกต์ในย่อหน้าเดียว
สร้าง "Battle! Fight!" (เกม modd.io เดิม ปัจจุบันรันบน Taro ใน `taro-engine/`) ใหม่เป็น TypeScript: sim core deterministic 30 Hz เขียนเอง (physics เอง, serialize ทั้งหมด), PixiJS v8, Colyseus server-authoritative, เว็บก่อน (PWA) แล้ว Tauri/Capacitor; 5v5 TDM เสมอ (บอทเติม แจ้งก่อนเริ่ม), roster v1 12 ตัว (Gavin the Archmage, Nadia, Berserker, Commander, Crackshot, Alchemist, Hidden Hand, Bush Man, Ming, Shinobi, Shadow Dancer, Sixth Diva); ระบบเด่น: เกจความร้อน/overheat (กัน macro), ล็อกเป้าฝั่งเซิร์ฟ, คิวคำสั่งแบบ Dota, fake telegraph, replay/Chronobreak, โหมด AI agent, บอทฝึกด้วย Python + ONNX; งบ 0 บาท; ปล่อยเมื่อเสร็จ

## สถานะงาน
- [x] Grilling/การตัดสินใจ (Q1–Q617)
- [x] Spec, roadmap, แผนเดือนแรก
- [ ] Push branch `docs/remake-plan` — รอผู้ใช้สั่ง
- [ ] เฟส 0 (roadmap) — ยังไม่เริ่ม
- [ ] เดือนแรก Task 1–20 — ยังไม่เริ่ม

## ข้อเท็จจริงที่ตรวจแล้วในเซสชันนี้
- `taro-engine/` เป็น git checkout แยก (remote เดียวกัน) อยู่ branch `codex/battlefight-bots` ซิงก์กับ remote แต่มีไฟล์แก้ไขยังไม่ commit 20 ไฟล์ (รวม `src/game.json`) + ไฟล์ untracked — **ผู้ใช้ยังไม่สั่งให้แตะ**
- `BattleFight-export(1)/` ยังไม่อยู่ใน git
- `game.json` (export): แผนที่ 1 แผ่น 80×80×64px; unit 116, item 242, projectile 423, script 132; เมนูเลือกตัวเดิม 41 ตัว; asset PNG 5.4 MB, mp3 15 MB, m4a 4.3 MB
- ID สำคัญ: Gavin/Archmage `r3dZTAf1qa`, Nadia `Pko4SCDSlz`, Dual Assassin `oLypCauaxT`
- เครื่องผู้ใช้: i7-1195G7 4C/8T, RAM 16 GB, Iris Xe (ไม่มี GPU แยก) → ฝึกด้วย CPU
- `gh` CLI ไม่มีใน Bash ของเครื่องนี้

## กติกาการทำงานกับผู้ใช้ (สำคัญ)
- ตอบภาษาไทย; **ห้ามแก้เอกสาร/ไฟล์โดยไม่ได้รับอนุญาต** — เมื่อผู้ใช้แค่ "บอกเฉยๆ" ให้รับทราบอย่างเดียว (เคยถูกเตือน)
- ถามก่อนบันทึก decision log และก่อน commit/push ทุกครั้ง
- ผู้ใช้ออกแบบเอง: ตัวละคร, แผนที่, perk, ร้าน, บาลานซ์, UI, บทซีรีส์ — AI เขียนโค้ด/ร่างตามที่ขอเท่านั้น
- วิธีถาม: แบบ grilling — เป็นรอบ เลขข้อ Q ต่อเนื่อง (ข้อถัดไปคือ **Q618**) พร้อมคำตอบที่แนะนำ
- ไม่ส่งข้อความ/โพสต์แทนผู้ใช้; ไม่สมัครบริการเสียเงิน
- Dual Assassin เป็นของผู้สร้างคนอื่น: ใช้ทดสอบภายในเท่านั้นจนกว่าได้รับอนุญาต

## เรื่องที่ยกเลิกแล้ว (อย่าเสนอซ้ำโดยไม่ถูกถาม)
- prompt injection เป็นกลไกเกม (Q605–Q612 ยกเลิก)
- การแบ่งงาน AI 3 ตัว (ChatGPT Sol 6.1 medium / Claude Opus 5.5 / Gemini Flash 3.8) — Q618–Q625 ที่ร่างไว้ถูกยกเลิก ยังไม่มีข้อตกลง

## เปิดค้าง — ผู้ใช้ตัดสิน/ออกแบบเอง
Perk (Q40) · fog of war (Q86) · ปรับสมดุลด้วยบอท (Q90) · ลังทำลายได้ (Q120–Q121) · สไตล์ UI (Q126) · กฎ counterplay/chain stun/TTK (Q195) · combo ธาตุ Gavin (Q225) · ความร้อน/ล็อกเป้าของตัวคู่ (Q437) · hosting/Supabase (Q16, Q49) · ผล spike แอนิเมชัน (Q20) · เครื่องมือ motion graphics ของ Claude สำหรับซีรีส์ (Q593) · ขออนุญาตเจ้าของ Dual Assassin (Q294) · ที่อยู่ repo ใหม่ `battlefight-ts` · แหล่ง `game.json` ที่ converter ใช้ (export หรือ `taro-engine/src/game.json`)

## ขั้นต่อไปที่แนะนำ (รอผู้ใช้สั่ง)
1. Push `docs/remake-plan` และเปิด PR เข้า branch เอกสารที่ผู้ใช้ต้องการ
2. เฟส 0: ผู้ใช้ตัดสินเรื่องงานค้างใน `taro-engine/`, ที่เก็บ `BattleFight-export(1)/`, ที่อยู่ repo ใหม่
3. เริ่ม Task 1 ของแผนเดือนแรก (scaffold monorepo + CI)
