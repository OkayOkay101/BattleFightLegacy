# BattleFight

BattleFight is a local web game and offline Windows portable game built on the Taro engine, with team AI model selection, spectator cameras, a live kill feed, and English/Thai UI.

The updated game source and full documentation are on [codex/battlefight-bots](https://github.com/OkayOkay101/BattleFightPrivate/tree/codex/battlefight-bots). This main-branch page links to that edition.

## Documentation — English first

- [Documentation index](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/en/index.md)
- [Player guide](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/en/player-guide.md)
- [Architecture and combat](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/en/architecture.md)
- [AI and training](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/en/ai-training.md)
- [Development and standalone packaging](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/en/development.md)
- [Licenses and redistribution evidence](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/en/licenses.md)
- [Component inventory](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/en/license-inventory.md)
- [Credits](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/en/credits.md)

### AI-Assisted Development

BattleFight was developed with assistance from Gemini Flash and ChatGPT Sol.

This development credit is separate from the heuristic and Neural bots that run inside the game. It does not imply provider endorsement or assign ownership. Upstream engine credit and third-party licenses remain separate; see the license guide before assuming the game assets share the engine license.

โค้ดเกมและเอกสารล่าสุดอยู่ในสาขา [codex/battlefight-bots](https://github.com/OkayOkay101/BattleFightPrivate/tree/codex/battlefight-bots) หน้าหลักนี้ลิงก์ไปยังเวอร์ชันดังกล่าว

## เอกสารภาษาไทย

BattleFight เป็นเกมเว็บในเครื่องและเกม Windows แบบ portable ออฟไลน์ที่พัฒนาบน Taro มีระบบเลือกโมเดล AI แยกทีม กล้องผู้ชม kill feed สด และ UI อังกฤษ–ไทย

- [สารบัญเอกสาร](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/th/index.md)
- [คู่มือผู้เล่น](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/th/player-guide.md)
- [โครงสร้างและการต่อสู้](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/th/architecture.md)
- [AI และการฝึก](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/th/ai-training.md)
- [การพัฒนาและแพ็กเกจ standalone](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/th/development.md)
- [License และหลักฐานสิทธิ์เผยแพร่](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/th/licenses.md)
- [ทะเบียนส่วนประกอบ](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/th/license-inventory.md)
- [เครดิต](https://github.com/OkayOkay101/BattleFightPrivate/blob/codex/battlefight-bots/docs/th/credits.md)

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
