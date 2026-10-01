# การพัฒนาและแพ็กเกจ Standalone

[English](../en/development.md) · [สารบัญ](index.md)

## Prerequisites

ทำงานในรีโป `taro-engine` ที่ซ้อนอยู่ ไม่ใช่ parent หรือเกม export ข้างเคียง Release Windows ปัจจุบัน build ด้วย Node 24.19.0 และ Electron 44.3.0 นี่เป็นสภาพแวดล้อมที่ตรวจแล้ว ไม่ได้รับรองทุก Node version ตาม README ต้นฉบับ เมื่อตั้งเครื่องพัฒนาให้ใช้ `npm ci` ติดตั้งตาม lockfile ซึ่งอาจเรียกอินเทอร์เน็ต

Python จำเป็นเฉพาะการฝึก `training-python/environment.json` บันทึก Python 3.14.7, Torch 2.14.0+cpu และ NumPy 2.5.3 (ตรวจเมื่อ 2026-09-25) ส่วน `requirements.in` pin เวอร์ชัน Torch/NumPy ถ้าสร้าง environment ใหม่ให้ใช้ CPU wheels ที่เข้ากันได้จาก Torch index ทางการตามข้อมูลที่บันทึก Hardware/platform อื่นต้องหา wheels ที่รองรับและตรวจแยก GUI Python ต้องมี Tkinter ส่วน web controls เป็นทางเข้าอีกแบบ

## คำสั่ง

รันจาก root ของรีโป:

```powershell
npm run server
npm run demo
npm run train:status
npm run train:3v3 -- --neural on --neural-schema 3 --workers 4 --speed max
npm run train:stop
npm run train:gui
npm run desktop:build
```

คำสั่งเหล่านี้เป็นตัวเลือกตามงาน ไม่ใช่ script ที่ต้องรันต่อกัน `server`/`demo` เปิดเซิร์ฟเวอร์จากโค้ด โดย `demo` ขอ latest demo policy ตามการ resolve ของ runtime ให้ดูโมเดลที่ resolve จริงแทนสมมติว่า latest คือ champion `train:3v3` เริ่ม/ต่อการฝึก ค่า neural รุ่นใหม่เริ่มต้นคือ schema3 และสี่ workers โหมด max ต้องผ่าน parity preflight และอาจ fallback เป็น realtime เมื่อไม่ผ่าน ให้ตรวจ status/log ของ CLI

เซิร์ฟเวอร์จาก source ปัจจุบันเปิดเว็บที่ `http://127.0.0.1/` (HTTP พอร์ต 80) ส่วน WebSocket ใช้พอร์ต 2001 หรือ `PORT`; ตั้ง `PORT` ไม่ได้เปลี่ยน HTTP พอร์ต 80 ของ source Desktop ใช้ HTTP/WebSocket loopback ที่เลือกพอร์ตว่างอัตโนมัติ หากพอร์ตชนให้อ่าน startup output

`launch-ai-gui.bat` เป็น launcher Windows สำหรับ GUI/เซิร์ฟเวอร์ฝึก Portable ไม่ต้องใช้ไฟล์นี้ ห้ามเปลี่ยนโค้ด gameplay/schema/reward ขณะที่ production training ใช้ environment ที่ตรึงอยู่ และแยก diagnostics/fixtures ออกจาก optimizer/registry จริง

## Checkpoint และการหยุด

ตรวจ `train:status` ร่วมกับ PID จริง `supervisor.lock.json` timestamps และ checkpoint ตาม schema อย่าเปิด supervisor ซ้ำกับ data directory ที่มี lock สถานะ โมเดล optimizer และ match logs ใน `training-data` เป็น runtime data ในเครื่อง ไม่ใช่เอกสารหรือชุดฝึกที่จะฝังใน EXE

**พฤติกรรมสำคัญ:** `train:stop` หยุดรับงานใหม่และเริ่มรอแมตช์ปัจจุบัน แต่ daemon จะบังคับตัด workers หลัง **30 วินาที** จึงไม่รับประกันว่าแมตช์ยาวจะจบครบ ใช้ helper ที่มีอยู่สำหรับรอโดยไม่ตัดตาม timeout นี้:

```powershell
node tools/stop-training-after-evaluation.js
```

ระหว่างประเมิน helper รอผลรอบ candidate ปัจจุบันแล้วส่ง stop ถ้าอยู่ train จะส่ง stop ทันที เมื่อ supervisor รับ stop ที่ค้างสถานะแล้ว จะลบ request ที่ใช้ไปเพื่อไม่ให้ CLI บังคับตัดหลัง 30 วินาที และรอแมตช์ที่เริ่มแล้วจบ ตรวจ run/lock เดิมและไม่แตะ run อื่น มี deadline การติดตาม 20 นาที หากหมดเวลาต้องตรวจสถานะ ไม่เริ่มใหม่สุ่มสี่สุ่มห้า แมตช์จบที่รอใช้ถูกเก็บสำหรับ resume และอาจยังไม่ครบ batch PPO ต้องยืนยัน `stopped`, active ศูนย์, PID ออกและ lock ถูกลบ ห้ามยอมรับแมตช์ล้มเหลว/บางส่วนเป็น trajectory เต็ม

## Build ออฟไลน์

`desktop:build` เตรียม local resources แล้วใช้ electron-builder สร้าง Windows x64 portable ที่ `dist/portable/BattleFight-Portable-1.0.0.exe` ขั้นเตรียม rewrite URL ที่รองรับเป็นพาธท้องถิ่น optimize PNG และลบทั้งไฟล์/อ้างอิงเสียง ฝัง metadata ของ pointers ที่อนุมัติและ policies หมายเลขที่มีให้เลือกเอง ไม่ฝัง Python, optimizer/checkpoint/match data หรือเครื่องมือเปลี่ยนการฝึก Seed เริ่มต้นตาม champion ที่อนุมัติ ไม่ใช่ candidate หมายเลขสูงสุด

ภาพหายหรือ origin ที่ไม่รองรับอาจทำให้ preparation ล้มเหลว ไม่ควรเปลี่ยน error ให้พึ่งอินเทอร์เน็ตแบบเงียบ Browser vendor และ Font Awesome webfonts ถูกคัดลอกในเครื่อง แต่ README/license ต้นทางไม่ได้ถูกฝังอัตโนมัติเพียงเพราะอยู่ในรีโป ดู [ช่องว่าง notice](licenses.md)

## คำสั่งตรวจที่มีอยู่

ใช้เมื่อต้องการตรวจ implementation/release การเขียนเอกสารไม่ได้เปิดคำสั่งเหล่านี้:

```powershell
$env:TRAINING_PYTHON = (Resolve-Path training-python/.venv/Scripts/python.exe).Path
node --test test/*.test.js
npm run test:desktop:runtime
$env:BATTLEFIGHT_SMOKE_POLICY = 'n-000052'
$env:BATTLEFIGHT_SMOKE_SCHEMA = '3'
npm run test:desktop:game
```

Candidate ตัวอย่างต้องมีใน resources ที่เตรียมแล้ว ไม่ใช่คำแนะนำเปลี่ยน default champion ต้องใช้พาธ Python เต็มเพราะ subprocess เปลี่ยน working directory การตรวจ Electron จริงต้องมี Windows environment ที่เปิด UI ได้ การ build/archive ผ่านไม่แทนการเปิด portable ด้วยมือ [รายงาน release](../reports/standalone-2026-10-01.md) แยกขอบเขตที่ตรวจไว้
