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
