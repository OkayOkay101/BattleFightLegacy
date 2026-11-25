# BattleFight

เกมต่อสู้เป็นทีม 2 มิติมุมมองจากด้านบนบนเอนจิน Taro พร้อมบอท heuristic และ Neural, ตัวละคร 45 ตัวในโหมด Solo Test, ระบบสร้างยูนิตและอาวุธเอง และรุ่น portable บน Windows แบบออฟไลน์

[English](README.md) · **ภาษาไทย**

## ฟีเจอร์

- **เล่นหรือดูบอทสู้กัน:** ลงเล่นทีมฟ้า หรือชมบอท heuristic และ Neural สู้กันพร้อม kill feed สดและสถิติแมตช์
- **Solo Test:** สนามฝึกแยกสำหรับทดลองเล่นทั้ง 45 ตัวละคร พร้อมหุ่นเป้านิ่ง
- **ยูนิตและอาวุธสร้างเอง:** ปรับแต่งยูนิต (รองรับ 44 ตัวละคร) และสร้างอาวุธยิงเดี่ยว กระจาย หรือยิงเป็นชุดบนเครื่อง
- **UI สองภาษา:** สลับภาษาอังกฤษและไทยได้ทั้งบนเบราว์เซอร์และแอป Windows แบบพกพา

## ข้อกำหนด

- Node.js และ npm (สำหรับรันจาก source code หรือ build แอปเดสก์ท็อป)
- Windows (สำหรับไฟล์ `BattleFight-Portable-1.0.0-no-touhou.exe`)

## การติดตั้งและเข้าเล่น

```powershell
npm ci
npm run demo
```

เปิด `http://127.0.0.1/` ในเบราว์เซอร์ การควบคุม: `WASD` เดิน, เมาส์เล็ง, คลิกซ้ายยิง, `1–4` เปลี่ยนอุปกรณ์

หรือดาวน์โหลด `BattleFight-Portable-1.0.0-no-touhou.exe` จาก [GitHub Releases](https://github.com/OkayOkay101/BattleFightLegacy/releases/latest) (ดูความต่างของแต่ละรุ่นใน[การปล่อยเกม](docs/th/releasing.md#รุ่นของเกม))

## การ build และทดสอบ

```powershell
npm install
npm run desktop:build
npm run test:desktop
```

## เอกสารและโครงสร้างโปรเจกต์

- [สารบัญเอกสาร](docs/th/index.md) · [คู่มือผู้เล่น](docs/th/player-guide.md) · [บันทึกรุ่นและการตรวจรับ](docs/th/release-notes.md)
- [โครงสร้างและการต่อสู้](docs/th/architecture.md) · [AI และการฝึก](docs/th/ai-training.md) · [คู่มือพัฒนา](docs/th/development.md)
- [Third-party notices](docs/licenses/THIRD-PARTY-NOTICES.md) · [เครดิตตัวละคร](docs/licenses/CHARACTER-CREDITS.md) · [สัญญาอนุญาต](LICENSE)
- `src/`, `server/`, `engine/`, `desktop/`, `test/`: โค้ดเกม, เซิร์ฟเวอร์, เอนจิน Taro, ตัวห่อ Electron และชุดทดสอบ
