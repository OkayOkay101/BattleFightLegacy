# การปล่อยเกมเวอร์ชัน Windows

[English](../en/releasing.md) · [สารบัญ](index.md)

วิธี build ไฟล์ EXE แบบ portable ตรวจสอบ แล้วปล่อยเป็น release บน GitHub ทุกคำสั่งให้รันในโฟลเดอร์ `taro-engine`

## รุ่นของเกม

| รุ่น | คำสั่ง | ไฟล์ที่ได้ | เนื้อหา |
|---|---|---|---|
| รุ่นเต็ม | `npm run desktop:build` | `dist/portable/BattleFight-Portable-1.0.0.exe` | ตัวละครครบทุกตัว |
| รุ่น GitHub | `npm run desktop:build:github` | `dist/portable/BattleFight-Portable-1.0.0-no-touhou.exe` | ครบทุกตัว ยกเว้น Reimu & Marisa |

**บน GitHub ให้ปล่อยเฉพาะรุ่น GitHub** เพราะ[แนวปฏิบัติแฟนเวิร์ก Touhou Project](https://touhou-project.news/guideline/) (อัปเดต 2024-05-31) อนุญาตให้เผยแพร่เฉพาะช่องทางที่ขายเกมต้นฉบับหรือที่ ZUN อนุญาต เช่น งานและร้านโดจิน ร้านดาวน์โหลดที่ขายเกมต้นฉบับ และเว็บไซต์เกมอินดี้ ไม่มี GitHub อยู่ในรายการ รุ่นเต็มให้ไปปล่อยในช่องทางที่อยู่ในรายการ เช่น เว็บไซต์เกมอินดี้

รุ่น GitHub ลบยูนิต อาวุธ กระสุน animation สคริปต์สร้างตัว ตัวเลือกในเมนู และเครดิตเพลงของ Reimu & Marisa แต่เก็บส่วนที่ตัวละครอื่นยังใช้ร่วมไว้ และแช่รายชื่อตัวละครของ Neural จาก source ไว้ใน `server/training/neural-roster.json` เพื่อให้ policy ที่ฝึกแล้วยังโหลดได้ ดู[คู่มือพัฒนา](development.md)

## 1. Build

```powershell
npm run desktop:build:github
```

ขั้นเตรียมจะพิมพ์สรุปออกมา ให้ตรวจว่า `fallbackUnitCount` และ `missingSourceVisualCount` เป็น `0` และ `variantRemoval` มีชื่อ Reimu & Marisa

## 2. ทดสอบ

```powershell
npm run test:desktop
npm run test:desktop:game
```

จากนั้นเปิด EXE แล้วลองเล่นหนึ่งแมตช์ ตรวจว่าเมนูไม่มี Reimu & Marisa, Solo Test มี 44 ตัว และ AI Neural สู้ได้ (kill และดาเมจเพิ่มขึ้น)

## 3. จดข้อมูลไฟล์

```powershell
Get-Item dist\portable\BattleFight-Portable-1.0.0-no-touhou.exe | Select-Object Length
Get-FileHash dist\portable\BattleFight-Portable-1.0.0-no-touhou.exe -Algorithm SHA256
```

ใส่ขนาดและ SHA256 ใน[บันทึกรุ่น](release-notes.md) และในคำอธิบาย release บน GitHub

## 4. Push โค้ด

release ผูกกับ commit จึงต้อง push ก่อน

```powershell
git push origin codex/battlefight-bots
```

## 5. สร้าง draft release

ตั้งชื่อ tag ตามวันที่ รูปแบบ `standalone-YYYY-MM-DD` ใช้ tag เดิมซ้ำไม่ได้

**ผ่านหน้าเว็บ:** เปิด `https://github.com/OkayOkay101/BattleFightLegacy/releases/new` เลือก tag ใหม่ ตั้ง branch เป้าหมาย ใส่ชื่อและคำอธิบาย ลากไฟล์ EXE ใส่ช่อง **Attach binaries** รอจนอัปโหลดเสร็จ แล้วกด **Save draft**

**ผ่านคำสั่ง** (GitHub CLI ที่ล็อกอินด้วย `gh auth login` แล้ว):

```powershell
gh release create standalone-YYYY-MM-DD dist/portable/BattleFight-Portable-1.0.0-no-touhou.exe --repo OkayOkay101/BattleFightLegacy --draft --target codex/battlefight-bots --title "BattleFight - YYYY-MM-DD (GitHub edition)" --notes-file release-notes.md
```

draft จะเห็นได้เฉพาะคนที่แก้ repo ได้ ถ้า build ใหม่แล้วต้องการเปลี่ยนไฟล์ ใช้:

```powershell
gh release upload standalone-YYYY-MM-DD dist/portable/BattleFight-Portable-1.0.0-no-touhou.exe --repo OkayOkay101/BattleFightLegacy --clobber
```

คำอธิบายควรมี: สิ่งที่เปลี่ยน ผลทดสอบ ขนาดไฟล์และ SHA256 และหมายเหตุเรื่อง SmartScreen ด้านล่าง

## 6. Publish

repo เป็น public พอ publish แล้วทุกคนดาวน์โหลดได้ทันที

**ผ่านหน้าเว็บ:** ที่หน้า Releases กด **Edit** ที่ draft ตรวจ tag ไฟล์ และคำอธิบาย ติ๊ก **Set as the latest release** แล้วกด **Publish release**

**ผ่านคำสั่ง:**

```powershell
gh release edit standalone-YYYY-MM-DD --repo OkayOkay101/BattleFightLegacy --draft=false --latest
```

publish แล้ว ให้ลองดาวน์โหลดไฟล์จากหน้า release และตรวจว่า SHA256 ตรงกัน

## เช็กก่อน publish

- [ ] เป็นรุ่น GitHub ไม่ใช่รุ่นเต็ม
- [ ] ทดสอบ desktop ผ่าน และลองเล่นใน EXE แล้ว
- [ ] ขนาดและ SHA256 ตรงกันทั้งในคำอธิบาย release และบันทึกรุ่น
- [ ] โฟลเดอร์ `licenses/` ใน EXE มี notice ครบ (`THIRD-PARTY-NOTICES.md`, `CHARACTER-CREDITS.md`, Taro, ไลบรารีเบราว์เซอร์, npm)
- [ ] push commit ของโค้ดแล้ว

## SmartScreen

EXE ยังไม่ได้เซ็นดิจิทัล Windows จึงอาจขึ้นหน้าต่าง "Windows protected your PC" ตอนเปิดครั้งแรก ผู้เล่นควรตรวจ SHA256 ก่อน แล้วกด **More info (ข้อมูลเพิ่มเติม) → Run anyway (เรียกใช้ต่อไป)** ถ้าจะให้คำเตือนหายไป ต้องเซ็นไฟล์ด้วยใบรับรองที่ Windows เชื่อถือ เช่น Azure Trusted Signing หรือใบรับรอง OV/EV ซึ่งเจ้าของโปรเจกต์ต้องสมัครเอง

## ห้าม commit ไฟล์ EXE

EXE ใหญ่เกินขีดจำกัดไฟล์ 100 MB ของ GitHub และ git ไม่รวม `dist/` อยู่แล้ว ให้ปล่อยไฟล์ผ่าน release เท่านั้น
