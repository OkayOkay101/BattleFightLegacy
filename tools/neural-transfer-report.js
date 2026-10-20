const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../training-data/diagnostics/transfer-042-043');
const result = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json')));
if (result.totalCompleted !== 40 || result.comparisons.length !== 20) throw new Error('Comparison is incomplete');
const a = result.summary['n-000042'], b = result.summary['n-000043'];
const f = (value, places = 2) => Number(value).toFixed(places);
const reference = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../transfer-reproduction-check.json')));
if (reference.matched !== 20 || reference.mismatch.length) throw new Error('Production replay did not match');
const lines = [
	'# ผลเปรียบเทียบ n-000042 ก่อนฝึก กับ n-000043 หลังฝึก', '',
	'วันที่1 ตุลาคม2026 — การวินิจฉัยแยกจากการฝึกและการเลื่อนแชมป์', '',
	'## เงื่อนไข', '',
	'- รุ่นละ20 แมตช์กับแชมป์ n-000027,10 seed เดียวกัน1000000090..1000000099 และสลับ Blue/Red ทั้งสองฝั่ง',
	'- แมตช์ละ300000ms จำลองเต็มเกม,เลือกคำสั่งแบบ deterministic argmax ทั้งสองรุ่น,รันเกมจริงผ่าน MatchWorker',
	'- ใช้ schema3 และ frozen environment เดียวกัน; n-000042 คือโมเดลที่ย้ายมาจาก n-000027 ก่อน PPO, n-000043 คือหลัง PPO ชุดแรก11แมตช์/4epochs',
	'- Diagnostic preload เรียก controller เดิมแล้วนับผลเท่านั้น ไม่แก้คำสั่งหรือสุ่มเพิ่ม',
	'- ผล n-000043 ที่ replay ใหม่ตรงกับผล production เดิม20/20 แมตช์ ทั้งผู้ชนะและคะแนน ไม่มีผล mismatch',
	'- ข้อมูลอยู่ training-data/diagnostics/transfer-042-043 ไม่ถูกส่งเข้า optimizer หรือใช้ promotion;การฝึกหลักทำงานต่อ', '',
	'## ผลครบชุด', '',
	'| สถิติ | n-000042 ก่อนฝึก | n-000043 หลังฝึก |',
	'|---|---:|---:|',
	`| ชนะ/เสมอ/แพ้ | ${a.wins}/${a.draws}/${a.losses} | ${b.wins}/${b.draws}/${b.losses} |`,
	`| Win rate | ${f(a.winRate * 100)}% | ${f(b.winRate * 100)}% |`,
	`| คะแนนเฉลี่ย ทีมเรา/คู่แข่ง | ${f(a.averageScore)}/${f(a.averageOpponentScore)} | ${f(b.averageScore)}/${f(b.averageOpponentScore)} |`,
	`| K/D/A รวมทีมทุกแมตช์ | ${a.kills}/${a.deaths}/${a.assists} | ${b.kills}/${b.deaths}/${b.assists} |`,
	`| KDA=(kills+assists)/deaths | ${f(a.kda)} | ${f(b.kda)} |`,
	`| Damage dealt เฉลี่ยต่อแมตช์ | ${f(a.meanDamageDealt)} | ${f(b.meanDamageDealt)} |`,
	`| Damage taken เฉลี่ยต่อแมตช์ | ${f(a.meanDamageTaken)} | ${f(b.meanDamageTaken)} |`,
	`| การตัดสินใจทั้งหมด | ${a.decisions} | ${b.decisions} |`,
	`| เลือกเดินวนซ้าย | ${f(a.leftStrafeFraction * 100)}% | ${f(b.leftStrafeFraction * 100)}% |`,
	`| เลือกคำสั่งทิศหลบใหม่ | ${a.explicitEscapes} | ${b.explicitEscapes} |`,
	`| ตัดสินใจขณะมีภัยตาม planner | ${a.dangerDecisions} | ${b.dangerDecisions} |`,
	`| คำสั่งยิง/การตัดสินใจที่มีตัวเลือกยิง | ${a.fired}/${a.shootable} | ${b.fired}/${b.shootable} |`, '',
	'## ข้อสรุปและขอบเขต', '',
	`- ทั้งสองรุ่นยังแพ้แชมป์เป็นส่วนใหญ่ รุ่นก่อน PPO อ่อนอยู่แล้ว จึงไม่ใช่หลักฐานว่าความสามารถหายทั้งหมดเพราะ PPO ชุดแรก`,
	`- การเปลี่ยนผลต่างคะแนนเฉลี่ยหลังลบก่อน=${f(result.scoreMarginChange.meanAfterMinusBefore)} คะแนน; seed-cluster bootstrap90% interval=[${result.scoreMarginChange.bootstrap90PercentInterval.map(value => f(value)).join(', ')}],2000 resamples,10 seed pairs. ช่วงนี้คร่อมศูนย์ จึงยังไม่ยืนยันว่า PPO ช่วยหรือทำให้แย่ลงโดยทั่วไป`,
	'- ตัวเลือกทิศหลบใหม่แทบไม่ถูกเลือกตอนประเมิน;จำนวนนี้เป็น requested explicit dodge ไม่ใช่จำนวนการหลบกระสุนสำเร็จจริง',
	'- ทุกครั้งที่มีตัวเลือกยิง ทั้งสองรุ่นขอสั่งยิง จึงไม่พบการเลือกงดยิงโดยเจตนาในชุดนี้;คำสั่งยิงไม่เท่ากับจำนวนกระสุนหรือจำนวน hit',
	'- Controlled single-decision probe ใช้ศัตรูระยะ600/ปืนระยะ200 ใน3ตัวละคร: n-000027 มีตัวเลือกเดียว approach; n-000042/n-000043 มี6ตัวเลือกและเลือก strafe_left ทุกครั้ง จึงยืนยันว่ากฎการเลือกคำสั่งบางส่วนเปลี่ยนก่อน PPO แม้คัดลอกน้ำหนักเดิมถูกต้อง',
	'- ยังไม่ได้ทดลองแยกแก้ fallback movement หรือการช่วยหลบเพื่อวัดว่าแต่ละจุดเพิ่ม winrateเท่าไร ไม่แก้ frozen training environment ในงานเปรียบเทียบนี้', '',
	'## Artifact / rerun', '',
	'- tools/neural-transfer-compare.js และ tools/neural-transfer-probe.js:การแข่งขันและตัวนับเฉพาะการวินิจฉัย',
	'- tools/neural-transfer-summary.js:สรุปผลและ seed-cluster bootstrap',
	'- tools/neural-transfer-production-check.js:ตรวจ replay เทียบกับผล production เดิม',
	'- tools/neural-transfer-interface-probe.js:controlled out-of-range snapshot',
	'- training-data/diagnostics/transfer-042-043/results.json,summary.json,interface-probe.json,production-043-reference.json:หลักฐาน',
	'- รัน probe/summary/check ซ้ำได้;ไม่รันการแข่งขันเต็มซ้ำโดยไม่ตั้งใจ เพราะมี40เกมจำลอง5นาที',
	'- ไม่มี commit,push,deploy หรือเปลี่ยน champion จากงานนี้', ''
];
const destination = path.resolve(__dirname, '../docs/superpowers/plans/2026-10-01-neural-transfer-comparison.md');
fs.writeFileSync(destination, lines.join('\n'));
console.log(destination);
