# วิธีปรับ neural AI ของ BattleFight ให้เก่งขึ้น

ตรวจเมื่อ 30 กันยายน 2026 จาก checkout `taro-engine` สาขา `codex/battlefight-bots` และงานวิจัยต้นฉบับ ข้อมูล training ที่อ่านเป็น snapshot ซึ่งบันทึกเมื่อ 27 กันยายน 2026 รายงานนี้เป็นข้อเสนอจากหลักฐาน ยังไม่ได้ทดลองผลของการปรับแต่งหรือเริ่มฝึกใหม่

## ข้อเสนอหลัก

ควรทำตามลำดับ: แก้ความถูกต้องของกระสุน/การตาย/คะแนน → แยกชุดประเมินจริง → เริ่มจาก checkpoint ที่ผ่านการประเมินและยังเข้ากับ schema → เพิ่มโอกาสให้ neural เลือก action → ทำ reward และระยะเวลาที่ให้เครดิตให้เหมาะกับเกม → เพิ่มคู่แข่งและ curriculum → ปรับ PPO จาก telemetry ที่ครบ การเพิ่มขนาด network เป็นงานท้ายลำดับ เพราะหลักฐานปัจจุบันชี้ว่าระบบมักไม่มีทางเลือกและแทบไม่มีรางวัลระหว่างเกม ดูรายละเอียดและหลักฐานด้านล่าง

คำว่า “ผลสูง” ในตารางหมายถึงโอกาสแก้คอขวดที่พบในโค้ด ไม่ใช่ผล win rate ที่ทดลองแล้ว ต้นทุนเป็นการประเมินงานพัฒนาสัมพัทธ์ ไม่ใช่ระยะเวลาหรือค่าใช้จ่ายที่ยืนยันแล้ว

| ลำดับ | งานที่ควรทำ | ผลที่คาดหวัง | ต้นทุน | เหตุผลจาก checkout |
|---|---|---|---|---|
| P0 | จบงานแก้กระสุน/kill และบันทึกเวอร์ชัน environment | จำเป็นต่อความน่าเชื่อถือ | ต่ำ–กลาง | รางวัลและผลแข่งอาศัย damage/death/winner จึงต้องใช้ gameplay ที่ถูกต้องก่อนเก็บข้อมูลใหม่ |
| P0 | แยก train/selection/test seeds และรายงานตาม opponent | สูงต่อคุณภาพการเลือกโมเดล | ต่ำ–กลาง | ปัจจุบันแต่ละ phase เริ่ม seed จาก `pairIndex + 1` และใช้ชุด validation เดิมซ้ำ |
| P1 | รองรับ warm start จาก best checkpoint ที่เข้ากันได้ | กลาง–สูง | ต่ำ–กลาง | optimizer โหลดรุ่นใน manifest ล่าสุด ซึ่งอาจยังไม่ผ่าน promotion |
| P1 | เพิ่มความหลากหลายของ legal options และวัด action ที่ถูก execute | สูง | กลาง | ตัวอย่างเกมมี single-option 76.8%; heuristic ตัดเหลือ top 16; path/dodge สามารถเปลี่ยนทิศที่ policy เลือก |
| P1 | ให้ reward ระหว่างเกมและปรับ credit horizon | สูง | กลาง | รางวัลไม่เป็นศูนย์เพียงท้าย match; `gamma=0.99`, `lambda=0.95` ที่ตัดสินใจทุกประมาณ 100 ms |
| P2 | self-play กับกลุ่ม champion/รุ่นเก่า/heuristic | สูงในระยะยาว | กลาง | training ปกติเจอ champion ตัวเดียว; archive ถูกใช้เฉพาะ validation |
| P2 | เพิ่ม observations ที่ช่วยตัดสินใจและสร้าง curriculum | กลาง–สูง | กลาง–สูง | observations ไม่มี cooldown แบบต่อเนื่อง, ammo/resource, terrain, identity ของศัตรู หรือสถานะ path |
| P2 | PPO telemetry, shuffle และทดลองค่าทีละกลุ่ม | กลาง | ต่ำ–กลาง | minibatch เรียงตามลำดับเดิม; metrics เก็บแค่ minibatch สุดท้าย; ไม่มี KL stop |
| P3 | network ใหญ่ขึ้น / memory / team critic | ยังไม่แน่ชัด | สูง | ต้องพิสูจน์ก่อนว่าข้อจำกัดข้อมูลและ action ถูกแก้แล้ว |

## ระบบที่มีอยู่จริง

Policy ปัจจุบันเป็น actor ที่ให้คะแนน legal options แต่ละอัน: `103 → 64 → 64 → 1` โดย concatenation ระหว่าง observation 86 ค่าและ option 17 ค่า ส่วน critic เป็น `86 → 64 → 1` ไม่ใช่ AI ที่สร้างคำสั่งอะไรก็ได้โดยตรง [model.py:10](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/model.py:10)

Observation มี self 5 ค่า, เพื่อน 2 คน × 3, ศัตรู 3 คน × 5, กระสุน 4 นัด × 4, weapon ready 4 และ character one-hot ของตัวเอง 40 ค่า ตำแหน่งถูก normalize ตามขนาดแผนที่ และ velocity หารด้วย 1000 ตั้งแต่สร้าง snapshot จึงมี normalization เบื้องต้นอยู่แล้ว [NeuralObservation.js:7](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralObservation.js:7), [GameComponent.js:365](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:365), [GameComponent.js:420](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:420)

Controller สุ่มจาก softmax ระหว่าง training และเลือก argmax ระหว่าง validation/การแสดงเกม ระบบเก็บ log probability กับ value ของ behavior policy และป้องกัน batch ที่ปน policy versions หรือ roster hashes ซึ่งเป็นฐานที่เหมาะกับ PPO ควรรักษาข้อจำกัดนี้ไว้ [NeuralController.js:15](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralController.js:15), [TrainingRuntime.js:27](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingRuntime.js:27), [NeuralTrainer.js:48](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralTrainer.js:48), [PPO paper, Algorithm 1](https://arxiv.org/pdf/1707.06347)

## หลักฐานจาก validation ที่บันทึกไว้

อ่าน `matches.jsonl` แบบ stream และ parse ทีละ JSON record พบ 2,417 records การคำนวณด้านล่างใช้ `win + 0.5 × draw` หารจำนวนเกม ดังนั้นค่าที่ UI ตั้งชื่อว่า win rate เป็น **คะแนนเฉลี่ยเมื่อเสมอได้ครึ่งคะแนน** ไม่ใช่สัดส่วนชนะอย่างเดียว [candidateScore](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/HeuristicPolicy.js:22), [status calculation](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingSupervisor.js:56), [matches.jsonl](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/matches.jsonl:1)

| Candidate | Opponent | เกม | W / D / L | คะแนนเฉลี่ย | คู่สลับฝั่งครบ | Lower bound ตาม bootstrap ใน repo |
|---|---|---:|---|---:|---:|---:|
| n-000024 | n-000003 | 60 | 37 / 0 / 23 | 61.7% | 30 | 51.7% |
| n-000024 | n-000001 | 60 | 35 / 0 / 25 | 58.3% | 30 | 48.3% |
| n-000025 | n-000024 | 49 | 15 / 4 / 30 | 34.7% | 24 | ยังไม่ครบเกณฑ์ 30 คู่ |

แถวแรกอ้างอิงกลุ่ม records เริ่มที่ [matches.jsonl:2245](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/matches.jsonl:2245), แถวสองเริ่มที่ [matches.jsonl:2304](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/matches.jsonl:2304), แถวสามเริ่มที่ [matches.jsonl:2369](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/matches.jsonl:2369) lower bound คำนวณใหม่ด้วยวิธีเดียวกับ repo: bootstrap 2,000 ครั้งจากคะแนนเฉลี่ยต่อคู่และใช้ quantile 5% [pairedLowerBound](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/HeuristicPolicy.js:26)

`registry.json` บันทึก champion เป็น n-000024 และ previous เป็น n-000003 ส่วน manifest optimizer เป็น n-000025 ซึ่งเก็บ entropy 0.3258 และ 65,114 eligible decisions ใน update ล่าสุด `status.json` บันทึก state `stopped`, completed 1,560, failed 2 และ n-000025 ประเมินครบคู่ 24 คู่/48 เกม ได้คะแนน 33.3% ที่ต่างจาก 34.7% ในตารางเกิดจากอีก 1 เกมที่คู่ยังไม่ครบ จึงไม่ถูกนำมาคิดใน UI [registry.json](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/registry.json:1), [manifest.json](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/neural/manifest.json:1), [status.json](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/status.json:1), [checkpoint.json](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/neural-state/checkpoint.json:1)

ผลเหล่านี้เป็นหลักฐานของระบบและ gameplay ในวันที่เก็บข้อมูล ไม่ยืนยันผลหลัง bugfix ที่กำลังทำ และยังไม่ได้ตรวจ process liveness ในงานวิจัยนี้ รุ่น n-000025 ที่มีข้อมูลเพียงบางส่วนยังสรุปไม่ได้ว่าแย่กว่าอย่างถาวร ส่วน 60% รวมของ n-000024 เป็นการชนะคู่แข่งสองรุ่นบนชุด seed เดิม ไม่ใช่ความเก่งกับผู้เล่นหรือสถานการณ์ทั่วไป

## 1. ความถูกต้องของ environment และการวัดผล

ก่อน retrain ต้องจบงานแก้กระสุน/kill ที่กำลังดำเนินการ แล้วตรวจว่า damage, death, assist, team score และ winner สอดคล้องกับการเล่นจริง เหตุผลคือ terminal reward ใช้ winner และ shaping ใช้ damage/assist จาก stats โดยตรง [TrainingTrajectory.js:45](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingTrajectory.js:45) การจำลองเร็วกับ realtime ให้ผลเหมือนกันยังอาจเป็นการจำลองบั๊กเดียวกัน จึงต้องมีทั้งความถูกต้องของ gameplay และ parity

ควรใส่ `environmentVersion` หรือ hash ของกติกา/ข้อมูลอาวุธ/แผนที่/โค้ดสำคัญลงใน match, checkpoint และผล validation แล้วห้ามรวมข้อมูลจากคนละเวอร์ชันโดยอัตโนมัติ ปัจจุบัน `rosterHash` hash เฉพาะลำดับ character IDs จึงไม่เปลี่ยนเมื่อแก้คุณสมบัติกระสุนหรือกติกาคะแนน [NeuralObservation.js:8](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralObservation.js:8)

ระบบมี paired side swap, parity gate และ bootstrap promotion อยู่แล้ว ควรรักษาไว้ แต่แยก opponent groups บน dashboard และในเกณฑ์ promotion ปัจจุบันคะแนนหน้า status รวมทั้ง champion และ archive; champion ใช้ seed 1–30, archive ใช้ 31–60 จึงเทียบความยากของ opponent สองกลุ่มโดยตรงไม่ได้ [TrainingSupervisor.js:154](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingSupervisor.js:154), [TrainingSupervisor.js:236](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingSupervisor.js:236)

แยกสามชุด seed ที่ไม่ทับกัน: train สำหรับเก็บ gradients, selection สำหรับเลือก checkpoint/ค่าฝึก, final test สำหรับประเมินครั้งสุดท้ายหลังตรึงโมเดล ปัจจุบัน train และ validation ใช้ `pairIndex + 1` เหมือนกัน และ `phaseIndex` กลับไป 0 ทุก update แม้ validation rows ไม่เข้าฝึก การคัดรุ่นซ้ำจาก seed เดิมก็เสี่ยงเลือกโมเดลที่เข้ากับชุดประเมินนั้น [TrainingSupervisor.js:165](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingSupervisor.js:165), [TrainingSupervisor.js:244](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingSupervisor.js:244), [TrainingTrajectory.js:38](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingTrajectory.js:38)

ข้อเสนอการประเมินหลังแก้ระบบ:

- ใช้ seed คู่เดียวกันและ roster/spawn เดียวกันเมื่อเปรียบเทียบ candidate กับ opponent แต่แยกชุด seed ตาม split; เก็บ `seed`, roster, side และ environment version ให้ตรวจย้อนหลังได้
- แสดง W/D/L, คะแนนเฉลี่ย, confidence interval, จำนวนคู่ครบ, opponent และผลแยกตาม character/role; ใช้ match/seed pair เป็นหน่วย bootstrap ไม่ใช้ decisions นับเป็นตัวอย่างอิสระ
- ใช้ selection เป็นชุดคัดรุ่น และใช้ final test ใหม่ที่ไม่เคยใช้เลือก hyperparameters เพื่อยืนยันผล ป้องกันการลองหลาย checkpoint แล้วเลือกผลที่สูงเพราะความบังเอิญ
- เพิ่ม archive gate แบบ non-inferiority ที่กำหนด margin ล่วงหน้า เช่น lower bound ของคะแนน candidate ต้องมากกว่า `0.5 - δ` กับ anchor ที่กำหนด ปัจจุบัน archive gate เพียง reject เมื่อพิสูจน์ได้ว่า opponent ชนะเกิน 50%; การไม่พบว่าแย่กว่ามีความแน่ชัดยังไม่ยืนยันว่าไม่ถดถอย [NeuralPromotion.js:14](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralPromotion.js:14)
- ทดลองหลาย training seeds และรายงานทุก run; 3 seeds เหมาะกับ screening เบื้องต้น แต่ไม่ควรอ้างความแน่นอนจากค่าเฉลี่ยเล็ก ๆ เพียงอย่างเดียว งาน RLiable แนะนำการรายงานช่วงความไม่แน่นอนและสรุปผลที่ทนต่อความแปรปรวน [paper](https://arxiv.org/abs/2108.13264), [author repository](https://github.com/google-research/rliable)

Parity snapshot ที่บันทึกไว้ทดสอบ seed 1–3 แค่ 3,000 simulated ms ต่อกรณี หลังเปลี่ยน environment ควรประเมิน parity ใหม่ให้ครอบคลุมการชน, kill, respawn และจังหวะ cooldown สำคัญ ไม่ใช้ผลเดิมยืนยันทั้ง match 300,000 ms [status.json](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/status.json:1), [TrainingParity.js:7](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingParity.js:7)

## 2. Warm start จาก best checkpoint

`train.py` ใช้ manifest ล่าสุดโหลด model, Adam state และ PyTorch RNG; หาก manifest มีอยู่ `initialize()` จะคืนรุ่นนั้น ไม่มีตัวเลือกให้เริ่มจาก champion โดยอัตโนมัติ ส่วนหลัง candidate ไม่ผ่าน promotion supervisor กลับไปเก็บ train data จาก candidate ต่อโดยไม่ย้อน optimizer ไป champion [train.py:38](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/train.py:38), [train.py:57](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/train.py:57), [TrainingSupervisor.js:239](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingSupervisor.js:239)

ควรเพิ่มความสามารถเลือก `resume latest` และ `branch from best` เป็นโหมดชัดเจน เก็บ run lineage, parent checkpoint, hyperparameters และเหตุผลในการ reset optimizer สำหรับสภาพปัจจุบัน n-000024 เป็นจุดเริ่มเปรียบเทียบที่มีเหตุผล เพราะผ่าน gate เดิมและยังมีทั้ง weights กับ optimizer บน disk แต่ต้องประเมินอีกครั้งบน environment ที่แก้แล้วก่อนเรียกว่า best ของเกมใหม่ [weights-n-000024.json](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/neural/weights-n-000024.json), [optimizer-n-000024.pt](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/neural/optimizer-n-000024.pt)

หาก schema และ objective เดิม สามารถ warm start model+optimizer+RNG เพื่อ resume; หากเปลี่ยน reward หรือ learning rate ควรทดลอง branch ที่ reset Adam เทียบ branch ที่ resume อย่างควบคุม ไม่ควรย้อนทุกครั้งที่แพ้ เพราะการเรียนรู้หลายขั้นจาก candidate ที่ยังไม่ผ่าน gate อาจช่วยออกจาก plateau ได้ นี่เป็นข้อเสนอทดลองสำหรับ checkout นี้ ไม่ใช่ข้อสรุปว่าการ rollback ดีกว่าเสมอ

เมื่อ observation/action semantics หรือขนาด input เปลี่ยน ต้อง version schema และแยก trajectory เก่า ปัจจุบัน Node ตรวจ schema เป็น 1 และ fix dimensions `103/86/64`, Python fix dimensions เช่นกัน ถ้าย้ายน้ำหนักอย่างถูกต้องไม่ได้ต้องเริ่มโมเดลใหม่; ถ้าจะ transfer ต้อง map ฟีเจอร์เก่าไปใหม่อย่างชัดเจนและสร้าง optimizer state ที่ตรงกับพารามิเตอร์ใหม่ การแก้ gameplay โดย schema เดิมไม่ได้บังคับให้ทิ้งน้ำหนักทั้งหมด แต่ต้อง revalidate [NeuralInference.js:21](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralInference.js:21), [model.py:14](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/model.py:14), [export_model.py:28](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/export_model.py:28)

## 3. ให้ AI มีทางเลือกและรู้ว่า action ทำอะไรจริง

`NeuralActions` สร้าง candidate combinations แล้ว sort ตาม heuristic ก่อนตัดเหลือ 16 การเรียงนี้ให้คะแนน target low health, lead aim, dodge และ kite จึงอาจตัด target/slot/movement อื่นที่มีประโยชน์ออกก่อน actor เห็น เมื่อไม่มีการยิงที่ถูกกติกา fallback มีเพียง approach หรือ strafe_left อันเดียว [NeuralActions.js:49](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralActions.js:49), [NeuralActions.js:58](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralActions.js:58), [NeuralActions.js:81](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralActions.js:81)

ตัวอย่าง `neural-n-000024-train-2` มี 16,437 decisions: 12,616 decisions มี option เดียว (**76.8%**) และไม่มี option feature ที่ซ้ำภายใน decision ที่อ่าน ใน decision ที่มีทางเดียว log probability และ entropy เป็นศูนย์ policy ไม่มีทางเปลี่ยนการเลือก; critic ยังเรียนรู้ได้ จึงต้องวัดสัดส่วน single-option ก่อนตีความว่า entropy ต่ำแปลว่า policy หยุดสำรวจ [match record](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/matches.jsonl:2368), [softmax choice](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralController.js:12), [PPO entropy](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/ppo.py:79)

งานแรกควรทดลองการสร้าง options ที่รักษาความหลากหลายภายใน budget เดิม: จองบาง slots ให้ movement ที่ถูกกติกาแม้ไม่มีอาวุธ ready และกระจายที่เหลือตาม target/weapon/aim แทน top 16 ตามคะแนนเดียว เก็บ histogram จำนวน options, coverage แต่ละ target/slot/movement และสัดส่วน action ที่ถูก filter ด้วยเหตุผลใด Mask ควรตัดคำสั่งที่ผิดกติกา; การคัดคำสั่งที่ดูไม่ดีด้วย heuristic เป็นข้อจำกัดการค้นหาคนละอย่าง งานต้นฉบับเรื่อง invalid action masking สนับสนุนการคง mask ที่ถูกต้อง [Huang and Ontañón](https://arxiv.org/abs/2006.14171)

ต้องเพิ่ม `fire` หรือความหมาย “ไม่ยิง” ที่ engine รับรู้จริง หากต้องการ action สำหรับรอ cooldown/หลบโดยไม่ยิง ปัจจุบัน `slot: null` ยังเข้า `_selectBattleBotWeapon` ด้วย profile ปกติและยิงได้เมื่อเลือก weapon สำเร็จ จึงยังใช้ null เป็น no-fire ไม่ได้ [GameComponent.js:485](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:485), [GameComponent.js:582](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:582)

บันทึกทั้ง requested action และ executed action พร้อมเหตุผลของ override เพราะ pathfinding สามารถแทนทิศ movement และระบบ dodge/stuck สามารถแทนคำสั่งภายหลัง policy เลือก ควรให้ policy เห็นสถานะเหล่านี้ หรือใช้ low-level controller ที่มีความหมายคงที่ เพื่อให้ผลของ action เรียนรู้ได้ง่ายขึ้น [GameComponent.js:525](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:525), [GameComponent.js:559](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:559), [GameComponent.js:563](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:563)

## 4. Reward และ credit horizon

ทุก trajectory row เริ่ม reward 0/done false; `finish()` ใส่ `win=1`, `loss=-1`, `draw=0` บวก damage/assist shaping ที่ clamp ภายใน ±0.1 ลงแค่ decision สุดท้ายของแต่ละ player ตัวอย่างข้างต้นมี reward ไม่เป็นศูนย์เพียง 6 จาก 16,437 decisions และ done คนละ 1 ครั้ง แม้ players มี deaths 10–22 ครั้งระหว่าง match [TrainingTrajectory.js:33](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingTrajectory.js:33), [TrainingTrajectory.js:47](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingTrajectory.js:47), [match record](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/matches.jsonl:2368)

PPO ใช้ gamma 0.99, GAE lambda 0.95 ขณะที่ bot think อย่างเร็วประมาณทุก 100 ms ถ้าตัวละครตัดสินใจต่อเนื่อง 5 นาทีจะประมาณ 3,000 decisions: ส่วนของ terminal reward ที่ discount ตรง ๆ เหลือ `0.99^3000 ≈ 8.05e-14`; น้ำหนัก GAE ของ TD residual ที่ห่าง 100 decisions เหลือ `(0.99 × 0.95)^100 ≈ 0.00217` และห่าง 300 decisions เหลือประมาณ `1.02e-8` นี่เป็นการคำนวณจากค่าที่ใช้อยู่ ไม่ใช่การวัด gradient ทั้งระบบ; critic bootstrap ยังช่วยได้ แต่การส่งเครดิตย้อนจาก terminal อย่างเดียวทำได้ยาก [ppo.py:9](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/ppo.py:9), [GameComponent.js:432](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:432), [GAE original paper](https://arxiv.org/abs/1506.02438)

ข้อเสนอ:

- เก็บ delta ของ damage, kills/deaths/assists และสถานะสำคัญต่อ decision เพื่อให้ทราบว่า action นั้นเกิดผลเมื่อใด; keep terminal outcome เป็นเป้าหมายหลัก และใช้ unshaped match outcome ในการประเมิน
- ทดลอง potential shaping `r'_t = r_task_t + α [γ_t Φ(s_{t+1}) - Φ(s_t)]` โดยเริ่มจาก Φ ที่ bounded ตาม team score/health advantage และตั้ง terminal potential ให้สอดคล้องกับการจบ episode หาก clamp แต่ละ shaping term โดยไม่รักษารูปสมการ จะอ้างการคง optimal policy จาก theorem ไม่ได้ ทฤษฎีต้นฉบับมีเงื่อนไข MDP/fixed dynamics; ไม่ได้ยืนยันผลของ PPO แบบหลายผู้เล่นที่ opponents เปลี่ยนตลอด [Ng, Harada, Russell, Theorem 1](https://people.eecs.berkeley.edu/~russell/papers/icml99-shaping.pdf)
- ถ้าใช้ event rewards เช่น damage/kill/death โดยตรง ต้องถือว่าเปลี่ยน objective และตรวจพฤติกรรมฟาร์ม damage/assist, แลกตาย, ถ่วงเวลาและหนีไม่สู้ เทียบกับ terminal-only baseline บน held-out games
- ทดลอง gamma ตามระยะเวลา เช่นช่วง `0.999–0.9997` สำหรับ decision 100 ms และทดลอง lambda แยกต่างหาก ค่านี้เป็นจุดตั้งต้นเพื่อค้นหา ไม่ใช่ค่าที่พิสูจน์ว่าดีที่สุดใน BattleFight; เริ่มหลังมี dense signal และ telemetry เพราะเพิ่ม horizon ทำให้ variance สูงขึ้นได้
- เก็บ `matchId`, `lifeId`, `simulatedAt` และ next value ให้ครบ ตัดสินใจให้ชัดว่าจะถือ death เป็น terminal ของหนึ่ง life หรือใช้ match เป็น episode ทั้งหมด ถ้าเป็น match ต้อง discount ตามช่วงเวลาที่ตาย/รอ respawn ด้วย; ถ้าแบ่ง rollout ก่อนจบต้อง bootstrap ที่ truncation แล้วแยก true terminal ปัจจุบัน `_advantages()` กลุ่มตาม playerId และนับ gamma หนึ่งครั้งต่อ row โดยไม่ใช้ระยะเวลา [ppo.py:10](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/ppo.py:10)

## 5. Self-play league และ curriculum

Training ปกติเล่น candidate กับ champion ตัวเดียว archive มีเฉพาะ validation เมื่อ candidate กับ champion เป็นเวอร์ชันเดียวกัน runtime เก็บได้ทั้งสองฝั่งเพราะ filter ด้วย policy version ซึ่งยังเป็น on-policy data แต่การเจอ distribution ของคู่แข่งแบบเดียวจำกัดความหลากหลาย [TrainingSupervisor.js:160](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingSupervisor.js:160), [TrainingRuntime.js:31](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingRuntime.js:31)

เริ่ม league ขนาดเล็กด้วย heuristic anchor, champion ล่าสุด และ frozen checkpoints ที่มีรูปแบบการเล่นต่างกัน 3–5 รุ่น สุ่ม opponent ตาม schedule ที่บันทึกได้ เช่น champion 50%, archive 30%, heuristic/คู่แข่งเฉพาะทาง 20% สัดส่วนนี้เป็นข้อเสนอเริ่มต้นและต้องทดสอบ ปรับน้ำหนักไปคู่แข่งที่เผยจุดอ่อน แต่เก็บ anchors ป้องกัน forgetting เก็บ gradients เฉพาะ current learner; ห้ามนำ trajectory ของ frozen opponent ต่างเวอร์ชันมาปนใน PPO batch เดิม [PPO paper](https://arxiv.org/pdf/1707.06347) แนวคิดใช้คู่แข่งหลายรูปแบบและ exploiters อ้างอิง league ของ AlphaStar แต่รายงานนี้ไม่ได้เสนอให้ใช้ทรัพยากรหรือสถาปัตยกรรมเท่าระบบนั้น [DeepMind original article](https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/)

Curriculum ที่เหมาะกับเกมนี้ควรเริ่มจากฉากยิงเป้า/lead aim ที่เชื่อถือได้ → 1v1 ในพื้นที่โล่ง → cover/ricochet/cooldown → 3v3 เต็มกติกา พร้อม mix ฉากยากและฉากเก่าเพื่อไม่ให้ลืม เพิ่มความยากตามเกณฑ์ held-out success และเปรียบเทียบกับการฝึกเต็มเกมตรง ๆ ห้ามสรุปความเก่งใน 3v3 จากคะแนนฉากง่าย แนวคิดเรียนจากง่ายไป distribution เป้าหมายมาจาก [Curriculum Learning original paper](https://ronan.collobert.com/pub/matos/2009_curriculum_icml.pdf); self-play สร้าง difficulty ที่เปลี่ยนตามความสามารถได้ตาม [Emergent Complexity via Multi-Agent Competition](https://arxiv.org/abs/1710.03748)

ไม่ควรใช้เพียงจำนวน decisions เป็นตัวแทน data diversity ข้อมูลที่อ่านพบว่าแต่ละรุ่นก่อน n-000024 เก็บ training เพียงประมาณ 4–5 matches ต่อ update แม้ได้หลักหมื่น decisions เพราะ decisions ภายใน match มีความสัมพันธ์กันและตัวเลือกซ้ำ [matches.jsonl](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/matches.jsonl:1), [NeuralTrainer.js:13](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralTrainer.js:13), [TrainingSupervisor.js:153](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/TrainingSupervisor.js:153) ควรกำหนดขั้นต่ำทั้ง decisions ที่มีหลายทางเลือก, จำนวน matches, unique seeds, roster/role coverage และ opponents

## 6. Richer observations และ PPO tuning

เพิ่ม observations ที่ตอบคำถามทางยุทธวิธีโดยตรงก่อนขยาย network: cooldown remaining, ammo/energy/cost, range/projectile speed/damage ของ slot, active slot, self/enemy character หรือ role, time remaining/score difference, line-of-sight/cover/path waypoint/stuck/dodge status และ time-to-impact ของกระสุน ระบุ missing-entity mask ให้ชัดและรักษาลำดับ target indices ระหว่าง options กับ observation ปัจจุบัน feature builder มีเพียง health/position/velocity/ready/own character และบอกข้อมูลอาวุธส่วนใหญ่ผ่านการมีหรือไม่มี option [NeuralObservation.js:24](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralObservation.js:24), [GameComponent.js:397](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:397)

ควรใช้ข้อมูลเดียวกับที่ policy ในเกมจริงมีสิทธิ์เห็น หากต้องการสมรรถนะภายใต้ fog/line-of-sight ต้องกำหนดกติกา visibility ให้เหมือนกันใน train/eval/play ปัจจุบัน snapshot รับตำแหน่งศัตรูจาก targets แล้วเก็บ visible เป็นเงื่อนไข action แต่ visible ไม่อยู่ใน observation 86 ค่า [GameComponent.js:355](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/src/gameClasses/components/GameComponent.js:355), [NeuralObservation.js:30](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralObservation.js:30)

ค่าปัจจุบันคือ Adam learning rate `3e-4`, 4 epochs, minibatch 1024, clip ratio ±0.2, value coefficient 0.5, entropy coefficient 0.01 และ gradient clip 0.5 ข้อจำกัดที่เห็นคือทุก epoch ใช้ `torch.arange` ลำดับเดิมและ metrics ถูก overwrite ด้วย minibatch สุดท้าย ยังไม่มี approximate KL, clip fraction, explained variance หรือ learning-rate schedule [train.py:51](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/train.py:51), [ppo.py:29](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/ppo.py:29), [ppo.py:69](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-python/ppo.py:69)

เพิ่มการ shuffle หลังคำนวณ GAE ตามลำดับเวลา, เก็บ metrics เฉลี่ยทั้ง update และเพิ่ม KL early stop เป็นงานต้นทุนต่ำ ตัว PPO clipping ไม่รับประกันว่าการ update จะเล็กเสมอ เอกสาร SB3 ระบุ `target_kl` เพื่อควบคุมกรณีนี้ [official PPO documentation](https://stable-baselines3.readthedocs.io/en/master/modules/ppo.html) เอกสารนี้เป็นแนวทางอ้างอิงการ implementation ไม่ใช่เหตุผลให้เปลี่ยน trainer ทั้งหมดเป็น SB3

ลำดับการทดลอง tuning ที่เสนอหลังแก้คอขวด:

1. ใช้ baseline เดิมที่เพิ่ม telemetry แล้วกำหนดงบเป็น eligible decisions และ unique matches เท่ากัน
2. ทดลอง learning rate เช่น `1e-4` เทียบ `3e-4`, epochs 2 เทียบ 4 และ target KL เช่น `0.01–0.03`; ค่าช่วงนี้เป็นสมมติฐานทดลอง
3. ทดลอง entropy coefficient/schedule โดยรายงาน entropy เฉพาะ states ที่มีหลาย options และ normalized entropy `H/log(K)` เมื่อ `K > 1` เพื่อแยก exploration ออกจากข้อจำกัด legal options
4. ทดลอง gamma/lambda และ minibatch size ทีละกลุ่ม แสดง learning curves ของ selection score, return, value error, KL, clip fraction, gradient norm และ coverage; ใช้ final test ที่แยกไว้ยืนยัน winner
5. ถ้าผลยังชี้ว่าต้องมี temporal memory จึงทดลอง frame stack หรือ recurrent policy และถ้า coordination ยังเป็นคอขวดจึงประเมิน team-aware critic ต้องแก้ exporter/Node inference/schema ให้รองรับก่อน

## แผนทดลองขั้นต่ำที่ตัดสินใจได้

| การทดลอง | เปรียบเทียบกับ | คำตอบที่ต้องได้ |
|---|---|---|
| A: gameplay ที่แก้แล้ว + seed split ใหม่ + best compatible checkpoint | รุ่นเดิมบน environment เดียวกัน | checkpoint เดิมยังมีประโยชน์หรือควรเริ่มใหม่ |
| B: diverse options + executed-action logging | A | single-option ลดลงและคะแนนบน unseen seeds ดีขึ้นจริงหรือไม่ |
| C: dense/potential reward + horizon | B | action ก่อนท้ายเกมเรียนรู้ได้ขึ้นหรือเกิด reward exploit |
| D: small opponent league + coverage quotas | C | ชนะคู่แข่งหลายรูปแบบโดยไม่ถดถอยกับ anchors หรือไม่ |
| E: curriculum / observations / PPO tuning ทีละอย่าง | D | ผลเพิ่มมาจากการเปลี่ยนใด และคุ้มงบจำลองหรือไม่ |

ทุกการทดลองควรตรึง environment/schema/evaluation protocol และเก็บ parent checkpoint, optimizer choice, seeds, reward coefficients และงบจริงก่อนเริ่ม ไม่เปลี่ยนหลายปัจจัยพร้อมกันแล้วอ้างว่าอย่างใดอย่างหนึ่งทำให้เก่งขึ้น รายงาน confidence intervals และผลทุก training run เป็นหลักตามแนวทาง [RLiable paper](https://arxiv.org/abs/2108.13264)

## ขอบเขตและสิ่งที่ยังไม่ยืนยัน

งานนี้อ่าน source, manifest/registry/checkpoint/status และคำนวณสถิติจาก log ที่มีอยู่; ไม่ได้แก้ product/training code, ไม่ได้เริ่ม training หรือ benchmark ใหม่, ไม่ได้ทดสอบ gameplay หลัง bugfix และไม่ได้ยืนยันว่า hyperparameters หรือ schedule ที่เสนอจะเพิ่มคะแนนกี่เปอร์เซ็นต์ การตัดสินว่าดีขึ้นต้องมาจากการทดลองบน environment ที่ถูกต้องและชุดประเมินที่แยกไว้

## การดำเนินการต่อหลังงานวิจัย

เริ่มฝึกตามคำสั่งผู้ใช้เมื่อ 30 กันยายน 2026 เวลา 22:22 น. (Asia/Bangkok) หลังแก้การโหลดภาพกระสุนและ kill attribution โดยโหลดทั้ง weights, Adam optimizer และ RNG จาก checkpoint `n-000024` ที่ตรวจว่า roster hash และผล export ตรงกับ champion แล้วสร้างรุ่นใหม่ `n-000026` ไม่เขียนทับ checkpoint เดิม มี backup และ environment hash ใน [warm-start.json](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/training-data/warm-starts/20260930T152129Z/warm-start.json:1)

คำสั่งคือ `npm run train:3v3 -- --neural on --workers 4 --speed max` การตรวจ parity ระหว่าง realtime กับ accelerated ผ่าน 3 seeds และพบ supervisor กับ 4 workers ทำงานจริง รุ่นแรกหลัง update คือ `n-000027` ยังต้องใช้ผล validation ครบตามเกณฑ์เดิมก่อนตัดสิน promotion ข้อมูลสถิติในส่วนงานวิจัยด้านบนเป็น snapshot ก่อนเริ่มรอบนี้

รอบนี้ใช้ warm start และ gameplay ที่แก้แล้ว ยังใช้ action schema, reward, seed schedule และ PPO settings เดิม ข้อเสนอเรื่อง diverse actions, held-out seeds, dense rewards และ opponent league ยังไม่ได้ติดตั้ง จึงไม่ควรสรุปว่าทดลองข้อเสนอเหล่านั้นแล้วหรือรับประกันว่าโมเดลใหม่จะเก่งขึ้น

ผล validation ของ `n-000027` ครบ 120 เกมและผ่าน promotion เป็น champion ของระบบฝึกแล้ว:

| คู่แข่ง | ชนะ / เสมอ / แพ้ | อัตราชนะ | คู่สลับฝั่ง | Bootstrap lower bound |
|---|---|---|---|---|
| `n-000024` | 37 / 0 / 23 | 61.7% | 30 | 51.7% |
| `n-000003` | 32 / 0 / 28 | 53.3% | 30 | 45.0% |

รวมชนะ 69/120 เกม หรือ 57.5% เกณฑ์กับ champion เดิมต้องมี lower bound มากกว่า 50%; ส่วน archive ต้องไม่พบหลักฐานตามเกณฑ์เดิมว่าแพ้ archive อย่างชัดเจน รุ่นนี้ผ่านทั้งสองเงื่อนไขและ parity [NeuralPromotion.js](C:/Users/Smart/Documents/antigravity/adventurous-kepler/taro-engine/server/training/NeuralPromotion.js:10) ผลนี้ยังใช้ชุด seeds เดิม ไม่ใช่ผล held-out test ตามข้อเสนอในรายงาน

ตรวจล่าสุดหลัง promotion: supervisor PID 3036 และ lock/run ID ตรงกัน กำลังประเมิน candidate `n-000028` ด้วย 4 workers, completed 133 และ failed 0 ค่า `activeVersion` ของเกมยังเป็น `n-000024` เพราะรอบนี้ไม่ได้เปิดการ activate โมเดลในเกมอัตโนมัติ สถานะและจำนวนเกมจะเปลี่ยนต่อระหว่างฝึก

การตรวจ gameplay และ standalone: ชุดทดสอบ 183 ข้อ ผ่าน 179 ข้อ ข้าม 4 ข้อ ไม่มีข้อที่ล้มเหลว; Electron utility process และ renderer ผ่านการตรวจการเชื่อมต่อ ยูนิต และภาพกระสุนทั้ง 6 แบบของ Tundus/Emo Sky สร้าง portable ใหม่เสร็จเมื่อ 22:44 น. ขนาด 123,552,936 bytes แอสเซ็ตครบ 826 ไฟล์ ไม่มีไฟล์เสียง ไม่มี trainer และรวมโมเดล 28 รุ่นที่มีอยู่ตอนเริ่มแพ็ก
