# License และหลักฐานสิทธิ์เผยแพร่

[English](../en/licenses.md) · [สารบัญ](index.md) · [ทะเบียนส่วนประกอบ](license-inventory.md)

ข้อมูล ณ **2026-10-09** นี่เป็นทะเบียนหลักฐานจากไฟล์ ไม่ใช่การยืนยันว่าแอสเซ็ตทั้งหมดผ่านสิทธิ์แจกจ่ายแล้ว เก็บ license เดิมไว้ เอกสารนี้ไม่เปลี่ยนเงื่อนไขหรือกำหนดสิทธิ์ให้เนื้อหาที่แก้ไข

## แยกสิทธิ์ตามส่วนประกอบ

| ส่วนประกอบ | หลักฐานและขอบเขต | การใช้/แจกจ่าย |
|---|---|---|
| โค้ด Taro ต้นฉบับ | `LICENSE` ในรีโปเป็น MIT, copyright 2020 Mod Studio Inc. ต้องเก็บ notice เดิม ไม่ขยายหลักฐานนี้ไปถึงภาพอื่น | เซิร์ฟเวอร์จาก source และ engine ที่แพ็ก |
| เนื้อหา BattleFight/ส่วนแก้ไข/model weights | **ไม่พบหลักฐาน license** สำหรับสิทธิ์เนื้อหาแยกหรือการมอบสิทธิ์ ต้องยืนยันเจ้าของ/เงื่อนไข ไม่อนุมานจาก package metadata | เกม source และ content/seed policies ที่ฝัง |
| npm dependencies | เวอร์ชัน lock/ติดตั้งจริงและข้อความต้นฉบับในทะเบียน แยก direct/transitive และ runtime/development | บางส่วนอยู่ใน app.asar บางส่วนเฉพาะ source/development |
| Browser vendor | Mapping ระบุ JS/CSS ที่คัดลอกและ package ต้นทาง | Browser assets จาก source และ desktop resources |
| Electron/Chromium | MIT notice ของ Electron และ `LICENSES.chromium.html` ของ runtime; dependencies ของ Chromium ไม่ได้เป็น MIT ทั้งหมด | Runtime Windows portable |
| Font Awesome Free 5.15.4 | ข้อความใน package แยกโค้ด MIT, web/desktop fonts OFL-1.1 และ SVG/JS icons CC-BY-4.0 ต้องดูชนิดไฟล์ ไม่เรียกทั้ง package ว่า MIT | คัดลอก CSS/webfonts สู่ desktop; ไอคอนตามไฟล์ที่ใช้จริง |
| Torch/NumPy และ Python dependencies | Metadata `.dist-info` ที่ติดตั้งและ license/notice ต้นฉบับ แยก requirements ที่ pin กับเวอร์ชันติดตั้งจริง | ฝึก/พัฒนา ไม่รวมใน standalone |
| Node สำหรับพัฒนา, Python interpreter และ Tcl/Tk | บันทึกเวอร์ชัน/environment ของเครื่องมือ แต่ไม่พบ notices ท้องถิ่นครบของ interpreter/Tcl/Tk ในตำแหน่งติดตั้งที่ตรวจ ส่วน runtime ที่ฝังใน Electron มี notices ที่รวบรวมแยกไว้ | เครื่องมือเซิร์ฟเวอร์ source/ฝึก/GUI; Python/Tk ภายนอกไม่รวมใน standalone |
| Sprite, tileset และ UI ที่นำเข้า | **ไม่พบหลักฐาน license** ในส่วนที่ไม่มี grant คู่กัน URL cache/S3 บอกที่เก็บ ไม่ใช่สิทธิ์ | ดู inventory รายไฟล์และหลักฐานพาธในแพ็กเกจ |
| `arcade.ttf`, `verdana_12pt.png` | **ไม่พบหลักฐาน license** ของไฟล์เหล่านี้ | Desktop preparer คัดลอกโดยตรง |
| เสียง | มีรายการใน manifest เก่า แต่ standalone ลบเสียงและอ้างอิง การนำออกไม่ได้ยืนยัน license ของสำเนาที่อยู่ที่อื่น | ไม่รวมใน standalone ออฟไลน์ปัจจุบัน |

Phaser ถูกประกาศใน dependencies แต่การประกาศอย่างเดียวไม่พิสูจน์ว่าเกมบน browser เรียกใช้ ต้องตรวจ imports/vendor แยก Renderer ปัจจุบันใช้ Pixi งานเอกสารนี้ไม่ upgrade หรือลบ dependency

ข้อมูลยูนิต/อาวุธ custom เป็นชื่อและชุดค่าตัวเลขที่อ้างภาพกับกลไกเดิม Editor ไม่อัปโหลดภาพใหม่หรือรันสคริปต์จากผู้ใช้ เป็น user-data ในเครื่อง ไม่ใช่แอสเซ็ต seed ของ portable การสร้างชุดค่าไม่กำหนด license ใหม่ให้ภาพที่นำมาใช้หรือเพิ่มสิทธิ์แจกจ่าย

## Notice ต้นฉบับและที่มา

- [สารบัญ notice](../licenses/README.md) ลิงก์สำเนาแบบไม่แก้ไข รวม Taro, npm/Python และ Electron runtime ไม่แปลแทนข้อความต้นฉบับ
- [ทะเบียนส่วนประกอบ JSON](../licenses/inventory.json) มีเวอร์ชัน source URLs พาธ/แฮชข้อความที่คัดลอก vendor mappings หลักฐาน header และรายการยังยืนยันไม่ได้
- [ทะเบียนแอสเซ็ตรายไฟล์](../licenses/asset-inventory.json) มีพาธที่มีจริง SHA256 ขนาดและ origin URL ที่บันทึก ไฟล์ซ้ำคนละพาธยังเป็นคนละรายการ การอยู่ใน manifest ไม่ใช่หลักฐาน license
- สร้างทะเบียนใหม่ด้วย `node docs/generate-license-inventory.cjs` ซึ่งอ่านหลักฐานในเครื่องและเขียนเฉพาะเอกสาร ไม่ค้นหา license ที่ไม่ทราบหรือเปลี่ยนเกม/การฝึก/build output

รายการที่มีเพียง metadata ระบุไว้ชัดเจน Metadata ที่ติดตั้งอาจต่างจาก lockfile จึงเก็บทั้งสองเวอร์ชันและ flag ที่ตรงกัน ทะเบียนนี้มี **769 ตำแหน่ง npm packages**, **12 Python distributions ที่ติดตั้ง**, **2,834 ไฟล์ภาพ/ฟอนต์/media ที่มีจริง** และ **14 รายการ header** มี **31 npm entries** ที่มี metadata แต่ไม่มีข้อความ license ท้องถิ่นที่รวบรวมได้ จำนวนเหล่านี้ไม่ใช่จำนวนเจ้าของหรือแอสเซ็ตที่ไม่ซ้ำ ควร refresh รายงานเมื่อ dependencies/แอสเซ็ตเปลี่ยน

แยก header ของ engine/browser เพราะโค้ดที่ฝังอาจมีเครดิตนอก npm graph ข้อความ header เป็นเบาะแส ไม่ใช่การกำหนด license เต็มอัตโนมัติ ต้องอ่าน notices ต้นทางตามบริบท โดยเฉพาะฟิสิกส์และโค้ด vendored

## การเก็บ notice

ข้อความ MIT กำหนดให้เก็บ copyright/permission notice กับสำเนาหรือส่วนสำคัญของซอฟต์แวร์ ดู [ข้อความ SPDX MIT ทางการ](https://spdx.org/licenses/MIT) ส่วนประกอบอื่นมีเงื่อนไขของตัวเอง สำหรับ Font Awesome ให้อ่าน grant ตามชนิดไฟล์ที่คัดลอกและ [Free license ทางการ](https://fontawesome.com/license/free) อย่าลบเครดิตหรือถือว่าฟอนต์/ไอคอนเป็นโค้ด MIT

อย่าลบเครดิตเดิม อ้างผู้ให้บริการรับรอง หรืออนุมานเจ้าของจากเครดิต AI ช่วยพัฒนา ไม่สรุปรวมว่าแอสเซ็ตที่ไม่ทราบสิทธิ์ใช้แจกจ่ายเชิงพาณิชย์ได้ สำหรับรายการที่ขาดหลักฐาน ต้องขอผู้สร้าง/ต้นทาง เวอร์ชัน ข้อความ license หรือหนังสืออนุญาต เครดิตที่ต้องแสดง และสิทธิ์แจกจ่ายสำเนาที่แก้ไข/ออฟไลน์จากเจ้าของโปรเจกต์

## ช่องว่าง notice ของ standalone ปัจจุบัน

Release ที่ unpack ไว้วันที่ 2026-10-09 มี `LICENSE.electron.txt` และ `LICENSES.chromium.html` ที่ application root แต่ preparer ปัจจุบัน **ไม่คัดลอก Taro `LICENSE` ลง desktop-data** ส่วน root app.asar มี desktop code/package/dependencies แทนเอกสารทั้งรีโป จากการตรวจไม่พบไฟล์ vendor `LICENSE` ใต้ `assets/desktop-vendor` ที่คัดลอก Header ใน JS/CSS และ module notice บางส่วนอาจยังอยู่ แต่ไม่ใช่ audit notices รวมที่สมบูรณ์

เอกสาร `docs/licenses` ที่เพิ่มครั้งนี้ **ไม่ได้ถูกฝังใน EXE เดิมอัตโนมัติ** งาน packaging ถัดไปควรแนบ notices ของ engine/เกม/dependencies/ฟอนต์ที่เกี่ยวข้องและแก้สิทธิ์แอสเซ็ตที่ยังไม่ทราบ ก่อนอ้างว่าแพ็กเกจผ่านสิทธิ์เผยแพร่ครบ งานนี้บันทึกช่องว่าง ไม่ rebuild หรือเปลี่ยนแพ็กเกจ

การพบพาธเดียวกันใน asset inventory ไม่ครอบคลุมไฟล์ที่เปลี่ยนชื่อ/แปลง `packagedNodeModule` ตรวจตำแหน่งตาม lock ใน app.asar ไม่ใช่ทุก hoisted path หรือ binary dependency ของ Chromium การตรวจ notice ครบต้องใช้ต้นฉบับ vendor mapping และ notice runtime ร่วมกัน
