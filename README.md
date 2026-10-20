# BattleFight

BattleFight is a top-down team arena game built on the Taro engine. It runs as a local web game or as an offline Windows portable app. You can join the Blue team against AI, or watch heuristic and Neural bots fight each other. The UI is available in English and Thai.

Current source documentation: **2026-10-20**. See the [release and validation notes](docs/en/release-notes.md) for what changed and what was tested.

## Features

- **Play or spectate:** join the Blue team, or watch the bots fight with spectator cameras, a live kill feed and match statistics.
- **Team AI selection:** choose the AI model separately for Blue and Red.
- **Solo Test:** an isolated arena with no bots. Choose any of the 45 playable characters, add stationary target dummies, test death and respawn, and reset at any time.
- **Custom Units:** create a variant of any of the 44 supported characters and test it with player or heuristic control.
- **Custom Weapons:** build single, spread or burst weapons and equip them in any slot.
- **New character, Morrow:** Compass Bolt, a Banked shot that turns at a route marker, and Atlas, a line attack with a warning.

Custom content is saved locally and never enters Neural training.

## Play from source

```powershell
npm ci
npm run demo
```

Open [http://127.0.0.1/](http://127.0.0.1/). From the main page, join a fight, spectate, or open **Solo Test**, **Custom Units** or **Custom Weapons**.

Controls: **WASD** to move, the mouse to aim, left click to fire, **1–4** to switch equipment.

## Windows portable app

Run `dist/portable/BattleFight-Portable-1.0.0.exe`. It runs the game and its server on your computer, includes local visuals and AI inference, has no audio, and needs no Node.js, Python or internet connection. Your settings and custom content are kept in your per-user data folder, so they survive replacing the EXE.

To rebuild it:

```powershell
npm install
npm run desktop:build
```

See the [development guide](docs/en/development.md) for prerequisites and details.

## Documentation — English first

- [Documentation index](docs/en/index.md)
- [Player guide](docs/en/player-guide.md)
- [Architecture and combat](docs/en/architecture.md)
- [AI and training](docs/en/ai-training.md)
- [Development and standalone packaging](docs/en/development.md)
- [Custom Units and Custom Weapons](docs/en/custom-units.md)
- [Release and validation notes](docs/en/release-notes.md)
- [Licenses and redistribution evidence](docs/en/licenses.md)
- [Component inventory](docs/en/license-inventory.md)
- [Credits](docs/en/credits.md)

### AI-Assisted Development

BattleFight was developed with assistance from Gemini Flash and ChatGPT Sol.

This development credit is separate from the heuristic and Neural bots that run inside the game. It does not imply provider endorsement or assign ownership. Upstream engine credit and third-party licenses remain separate; see the license guide before assuming the game assets share the engine license.

## เอกสารภาษาไทย

BattleFight เป็นเกมต่อสู้เป็นทีมมุมมองจากด้านบน พัฒนาบนเอนจิน Taro เล่นได้ทั้งแบบเกมเว็บในเครื่องและแอป Windows แบบ portable ที่ไม่ต้องใช้อินเทอร์เน็ต ลงเล่นในทีมฟ้าสู้กับ AI หรือดูบอท heuristic และ Neural สู้กันเองก็ได้ UI มีทั้งภาษาอังกฤษและไทย

เอกสาร source ปัจจุบันอัปเดต **2026-10-20** ดูสิ่งที่เปลี่ยนและผลการทดสอบได้ที่ [บันทึกรุ่นและการตรวจรับ](docs/th/release-notes.md)

### ฟีเจอร์

- **เล่นหรือดู:** ลงเล่นทีมฟ้า หรือดูบอทสู้กันพร้อมกล้องผู้ชม kill feed สด และสถิติแมตช์
- **เลือก AI แยกทีม:** เลือกโมเดล AI แยกกันระหว่างทีมฟ้าและทีมแดง
- **Solo Test:** สนามแยกที่ไม่มีบอท เลือกได้ทุกตัวละครที่เล่นได้ทั้ง 45 ตัว เพิ่มหุ่นเป้านิ่ง ทดสอบการตายและเกิดใหม่ และเริ่มใหม่ได้ทุกเมื่อ
- **ยูนิตสร้างเอง:** สร้างตัวแปรจาก 44 ตัวละครที่รองรับ แล้วทดลองด้วยผู้เล่นหรือ heuristic
- **อาวุธสร้างเอง:** สร้างอาวุธยิงเดี่ยว กระจาย หรือเป็นชุด แล้วใส่ช่องไหนก็ได้
- **ตัวละครใหม่ Morrow:** Compass Bolt, Banked ที่เลี้ยวที่หมุดเส้นทาง และ Atlas ท่าโจมตีเป็นแนวที่มีเส้นเตือนก่อน

ข้อมูล custom บันทึกในเครื่องและไม่เข้าการฝึก Neural

### เล่นจาก source

รัน `npm ci` และ `npm run demo` จากโฟลเดอร์นี้ แล้วเปิด [http://127.0.0.1/](http://127.0.0.1/) จากหน้าหลักเลือกลงเล่น ดูบอทสู้กัน หรือเปิด **Solo Test**, **ยูนิตสร้างเอง** หรือ **อาวุธสร้างเอง**

การควบคุม: **WASD** เดิน, เมาส์เล็ง, คลิกซ้ายยิง, **1–4** เปลี่ยนอุปกรณ์

### แอป Windows แบบ portable

เปิด `dist/portable/BattleFight-Portable-1.0.0.exe` แอปรันทั้งเกมและเซิร์ฟเวอร์ในเครื่อง มีภาพและ AI inference ในตัว ไม่มีเสียง ไม่ต้องติดตั้ง Node.js หรือ Python และไม่ต้องต่ออินเทอร์เน็ต การตั้งค่าและข้อมูล custom เก็บไว้ในโฟลเดอร์ข้อมูลของผู้ใช้ จึงยังอยู่แม้เปลี่ยนไฟล์ EXE

build ใหม่ด้วย `npm install` และ `npm run desktop:build` ดู prerequisites และรายละเอียดใน [คู่มือพัฒนา](docs/th/development.md)

### เอกสาร

- [สารบัญเอกสาร](docs/th/index.md)
- [คู่มือผู้เล่น](docs/th/player-guide.md)
- [โครงสร้างและการต่อสู้](docs/th/architecture.md)
- [AI และการฝึก](docs/th/ai-training.md)
- [การพัฒนาและแพ็กเกจ standalone](docs/th/development.md)
- [ยูนิตและอาวุธสร้างเอง](docs/th/custom-units.md)
- [บันทึกรุ่นและการตรวจรับ](docs/th/release-notes.md)
- [License และหลักฐานสิทธิ์เผยแพร่](docs/th/licenses.md)
- [ทะเบียนส่วนประกอบ](docs/th/license-inventory.md)
- [เครดิต](docs/th/credits.md)

### การพัฒนาโดยใช้ AI ช่วย

BattleFight พัฒนาโดยใช้ Gemini Flash และ ChatGPT Sol ช่วยในการพัฒนา

เครดิตการพัฒนานี้แยกจากบอท heuristic และ Neural ในเกม ไม่สื่อถึงการรับรองจากผู้ให้บริการหรือกำหนดความเป็นเจ้าของ เครดิตเอนจินและ license ของส่วนประกอบอื่นยังคงแยกกัน โปรดอ่านคู่มือ license ก่อนตีความว่าภาพในเกมใช้สิทธิ์เดียวกับเอนจิน

---

## Original upstream documentation / เอกสาร Taro ต้นฉบับ

# Taro (Archived)

**⚠️ Important Notice: This Taro repository is now archived and no longer actively maintained.**

We are excited to announce that we have upgraded Taro to its new and improved version, Moddio2! 🚀

You can find the latest and actively maintained version of our project at the following repository:

👉 [Moddio2 Repository](https://github.com/moddio/moddio2)

Thank you for your support and continued interest in our project!


  <h2></h2>

<div align="center">
  <a href="https://modd.io">
    <img src="./assets/images/logo.png" width="400" alt="Taro Engine logo">
  </a>
</div>

<div align="center">
  <h2>HTML5 Game Engine</h2>
  <p>Taro is a multiplayer game engine. It can support up to 64 concurrent players hosted on a $5 / month VM while running Box2D physics. Join us on <a href="https://discord.gg/XRe8T7K">Discord</a> or support us on <a href="https://www.patreon.com/moddio">Patreon</a>.
</div>

<div align="center">
  <img src="https://img.shields.io/github/contributors/moddio/taro?style=for-the-badge&color=f01313">
  <img src="https://img.shields.io/github/last-commit/moddio/taro?style=for-the-badge&color=f01313">
  <img src="https://img.shields.io/github/languages/code-size/moddio/taro?style=for-the-badge&color=f01313">
</div>


<h3><a href="http://beta.modd.io/play/two-houses">Demo</a></h3>
<br>

## What's included in the box.
- Box2D Physics
- Netcode using UWS and LZ-string compression
- Inventory & item system
- Unit attributes (HP, Energy, etc)
- Weapon system (melee & projectile)
- Dialogues
- Shops
- Unit control (top-down WASD or platformer)
- Client-side predicted projectile + unit movement (optional)
- Basic AI
- Mobile controls
- and more!

## Node Version
Node Versions below [14](https://nodejs.org) are not supported due to package incompatibility and degraded performance.

## Running a game server
Taro engine will run games made using [modd.io](https://www.modd.io).

To run the game server, execute the following command:
```
npm run server --game=<gameID>
```
*if the gameID argument is not provided, then the engine will use game.json stored in root directory instead.

Your game's Game ID can be found in your modd.io's game's sandbox ([example](https://beta.modd.io/sandbox/game/two-houses/scripts)). Go to menu -> about.

<img src="./assets/images/gameid.png" width="600" alt="How to get game id">

## BattleFight portable Windows app

The Windows x64 portable Electron build runs the BattleFight game and its server on this computer. The packaged game assets and browser libraries are local, the app blocks renderer requests to non-local origins, and the standalone build contains no audio files or audio playback paths. Internet access is not required to play after the executable has been built.

To build it on Windows, install the repository dependencies and run:

```powershell
npm install
npm run desktop:build
```

The output is `dist/portable/BattleFight-Portable-1.0.0.exe` (the version follows `package.json`). The build stages a minimal runtime under `build/desktop-resources/` and uses lossless PNG recompression when the result is smaller; it does not modify the original game assets.

The app keeps the Blue and Red AI selectors and game statistics. Training controls and training history are not included. On first launch, the bundled policy seed files are copied to `%APPDATA%\BattleFight\training-data\policies`; existing files are never overwritten. To add a policy manually, put its `n-<number>.json` file in that folder and restart the app. The selected Blue and Red policy versions are saved in `%APPDATA%\BattleFight\desktop-selection.json`. These writable files stay outside the executable so they persist across app updates.

## Quick start example - Run "Two Houses" locally

Install [Node 14](https://nodejs.org) or later and then...

```
git clone https://github.com/moddio/taro.git
cd taro
npm install
npm run server --game=5a7fd59b1014dc000eeec3dd
```

## Connecting to the game server
Visit http://localhost:80 to start testing game.

## Compiling game.js for faster loading
Once you  make changes, run 
```
npm run build
```
and edit /src/index.ejs file, and comment
```
<script type="text/javascript" src="/engine/loader.js"></script>
```
and uncomment
```
<script type="text/javascript" src="./game.js"></script>
```

## How to customize game client UI
Game client's user interface is rendered by [/src/index.ejs](https://github.com/moddio/taro/blob/master/src/index.ejs) file and the theme files in [/src/templates/](https://github.com/moddio/taro/tree/master/src/templates)

## How to make games on modd.io
Please visit https://www.modd.io/tutorials for more information.

## We need contributors, and we are also hiring
Performance optimization is a hard problem that takes aeons to solve. We are always looking for more developers to help us. To be a contributor, please contact m0dE in our [Discord](https://discord.gg/XRe8T7K) If you find yourself enjoying working with us, then we should seriously consider working together.

Taro is completely free and open source under the MIT license.

Taro Engine was originally forked from [Isogenic Game Engine](https://www.isogenicengine.com/) back in 2016.
