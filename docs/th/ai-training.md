# AI และการฝึก

[English](../en/ai-training.md) · [สารบัญ](index.md)

## โมเดลและ schema

Heuristic ใช้กฎตามสถานะเกมแทนน้ำหนักที่เรียนรู้ Neural ให้คะแนนชุดคำสั่งที่ใช้ได้ ไม่ได้แก้ฟิสิกส์ HP หรือกฎสกิลโดยตรง Gemini Flash และ ChatGPT Sol เป็นผู้ช่วยพัฒนา ไม่ใช่บริการ inference ของบอทในเกม

อัปเดต 2026-10-09 ยูนิต/อาวุธ custom ใช้ผู้เล่นหรือ heuristic ในสนามแยก ไม่เข้า Neural training production Heuristic สนามอ่านระยะอาวุธ custom ที่เลือกและยิง burst ที่เริ่มไว้ให้จบก่อนเปลี่ยนอุปกรณ์ คำแนะนำสกิลเฉพาะตัวใช้ในสนามนั้น ไม่เปลี่ยน schema policy, checkpoint หรือเกณฑ์ Champion production

| Schema | Observation | Action features | Options สูงสุด | Actor | Critic |
|---|---:|---:|---:|---|---|
| V1 | 86 | 17 | 16 | 103 → 64 → 64 → 1 | 86 → 64 → 1 |
| V2 | 149 | 18 | 32 | 167 → 64 → 64 → 1 | 149 → 64 → 1 |
| V3 | 184 | 27 | 32 | 211 → 64 → 64 → 1 | 184 → 64 → 1 |

Actor ประเมิน observation ที่ต่อกับ action features ส่วน critic ประเมินค่า state จำนวน action features ไม่ใช่จำนวนสกิลหรือคำสั่งทั้งหมด V2 เพิ่ม cooldown/ammo/cost/range ของอาวุธ terrain visibility/presence navigation และสถานะแมตช์ V3 เพิ่มข้อมูลภัยสี่รายการ ความเสี่ยงเก้าเส้นทาง ความโล่งเก้าทิศและความเร็วตัวเอง ส่วน action เพิ่มตัวบ่งชี้เก้าทิศรวมยืนนิ่ง

เมื่อยิงได้ตามกฎ options รุ่นใหม่จับคู่ยิงกับการเดิน ระหว่าง cooldown หรือระยะ/ทรัพยากร/การมองเห็นทำให้ยิงไม่ได้ ยังอาจมี options เดินโดยไม่ยิง จำนวน options สูงสุดจำกัดความครอบคลุม Runtime ส่งคำสั่งผ่านกฎเกมปกติและบันทึกกรณีที่ execution เปลี่ยนจากคำขอ

## การหลบกระสุน

Planner คำนวณ collision แบบ swept จากการเคลื่อนที่สัมพัทธ์ด้วยขนาดและความเร็วจริง จัดลำดับภัยและตรวจยืนนิ่ง/แปดทิศว่าทางโล่งและเสี่ยงชนเพียงใด ใช้ข้อมูลการเด้ง ระเบิดและพื้นที่ดาเมจที่เปิดเผย พร้อมเลือกทิศเดิมช่วงสั้นเมื่อยังปลอดภัย V3 เลือกทิศหนีเจาะจงได้ Features ใหม่ไม่ได้รับประกันผลชนะสูงขึ้น และยังจำกัดกับภัย script ที่คาดเดาไม่ได้หรือกลไกสกิลเฉพาะตัว

## การฝึกและ reward

ค่าเริ่มต้นคือสี่ workers และใช้แมตช์เต็ม โดยปกติ 300 วินาทีจำลอง Batch PPO ต้องมีอย่างน้อย **8 แมตช์จบและ 8,192 decisions ที่ actor มีหลาย options** คำสั่งที่มี option เดียวยังใช้กับ critic/GAE แต่ไม่ใช้ฝึก actor/entropy คู่แข่งถูกตรึงตาม league: champion 50%, archive ที่อนุมัติ 30%, heuristic 20%

PPO/GAE คิดตามเวลาจำลองที่ผ่านไป (`gamma=0.999` ต่อ 100 ms, `lambda=0.95`) Reward รุ่นใหม่รวมผลแพ้/ชนะ/เสมอปลายเกมกับการเปลี่ยน potential ของคะแนน/HP ทีมแบบ discount การตายของยูนิตไม่จบ trajectory ผู้เล่น การเกิดใหม่ยังอยู่ episode แมตช์เดิม ข้อมูล optimizer ต้องตรงกับ policy/schema/environment/protocol ส่วน V1 คง reward/optimizer เดิม

ค่า PPO ปัจจุบันคือ Adam learning rate `3e-4`, สี่ epochs ที่ shuffle, minibatch 1,024, policy-ratio clip `0.2`, น้ำหนัก value loss `0.5`, entropy `0.01` และ gradient-norm cap `0.5` รุ่นใหม่หยุด update ก่อนกำหนดเมื่อ approximate KL เกิน `0.02` ซึ่งหยุด optimizer update ไม่ใช่ trainer ที่ฝึกต่อเนื่องทั้งระบบ Status มี loss, entropy, KL, clip fraction, decisions ที่ใช้ได้และ epochs ที่จบ

## ประเมินและเปลี่ยน Champion

1. Selection เล่น **10 คู่สลับฝั่งต่อคู่แข่ง** ได้แก่ champion, archive ก่อนหน้าและ heuristic รวม 60 เกม
2. หาก score ต่อ champion ไม่เกิน 0.5 จะข้าม final-test และฝึก cycle ถัดไป Score ให้เสมอครึ่งแต้ม แต่ raw win rate ไม่ให้
3. Final-test ใช้ **30 คู่ใหม่ต่อคู่แข่ง** รวม 180 เกม ด้วย seeds แยกจาก train/selection
4. Promotion ต้องมี bootstrap lower bound ต่อ champion **มากกว่า 0.5**, ไม่แพ้ archive/heuristic อย่างมีนัยสำคัญ และผ่าน runtime parity Bootstrap เดิมใช้ 2,000 resamples กับ quantile ล่างที่กำหนดไว้
5. เปลี่ยน champion pointers เฉพาะ promotion ที่ผ่านเกณฑ์ Candidate หมายเลขที่เลือกเล่นได้ไม่ได้แปลว่าอนุมัติแล้ว

## การบันทึกและอ่านผล

Policies หมายเลขไม่ถูกเขียนทับ แยก optimizer/state ตาม schema เพื่อคง V1/V2 (`neural-v3` และ `neural-state-v3` สำหรับ V3) Checkpoint เก็บ seed counters, references ของแมตช์จบที่รอใช้และความคืบหน้าประเมิน แมตช์เต็มที่รออยู่อาจยังไม่เกิด PPO update Migration คัดลอกน้ำหนักส่วนที่เข้ากันได้ เติม input columns ใหม่ด้วยศูนย์และ reset Adam แต่ไม่ได้คัดลอก guardrails ของ action/runtime เดิมทั้งหมด

ตรวจ production `status.json` ร่วมกับ lock, PID จริงและ checkpoint ไฟล์ JSON เก่าไม่ยืนยันว่ากำลังฝึก แยกผลประเมินจริงจาก diagnostics/smoke fixtures และห้ามใช้ fixture เป็นผล promotion ดู [คู่มือพัฒนา](development.md) สำหรับหยุดอย่างปลอดภัย และ [รายงานเปรียบเทียบที่ลงวันที่](../superpowers/plans/2026-10-01-neural-transfer-comparison.md) สำหรับเหตุผลที่น้ำหนักเดิมอย่างเดียวอาจไม่รักษาความเก่งเดิม
