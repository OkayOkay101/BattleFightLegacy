# Windows Portable BattleFight Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a Windows x64 portable Electron executable that runs BattleFight locally, works without internet access, includes selectable AI policies, and contains no audio.

**Architecture:** Electron's main process starts a staged Node utility process, waits for its loopback HTTP and WebSocket listeners, and opens the game in a locked-down renderer. A build staging step copies the server, engine, game source, referenced visual assets, local browser libraries, and policy seeds into `build/desktop-resources/`. It removes audio from staged game data and runtime pathways, recompresses PNGs losslessly when smaller, and leaves repository sources untouched. electron-builder packages the staged tree as ordinary resources and includes the production Node dependencies with the Electron shell.

**Tech Stack:** Existing Node.js/EJS game server, Electron `utilityProcess`, Electron `contextBridge`/IPC, electron-builder portable Windows target, Node.js `fs` and `zlib` for staging and PNG recompression.

**Spec:** `docs/superpowers/specs/2026-09-29-windows-portable-battlefight-design.md`

## Global Constraints

- Deliver a Windows x64 portable `.exe` built with Electron.
- Bind the local HTTP and WebSocket listeners to loopback only. Choose available ports at launch and pass the actual ports to the window.
- Include no audio in the desktop product: no audio files, game-data references, sound event definitions or handlers, sound engine, preload path, or playback path.
- Do not use online/CDN asset fallback. All visual assets needed to play must be present locally.
- Store writable policies, preferences, logs, and other runtime data under Electron's per-user `userData` directory, outside the packaged executable.
- Do not package match/training history, Python, PyTorch, or a usable training control surface. Training controls in the desktop build are disabled or omitted.
- Keep repository source assets unchanged. Apply PNG recompression only to a staging copy and keep the recompressed file only when it is smaller.
- Use Electron's normal `asar` packaging and portable-target compression. Do not force the `maximum` setting.
- The browser build must retain its current external services and sound behavior; desktop-specific changes are gated by an explicit desktop mode.

## Review Focus

- External JavaScript, CSS, font, game-data, and video-chat requests must either resolve from packaged local files or be omitted; the desktop window blocks all other network requests.
- HTTP and WebSocket ports must be the actual ephemeral ports, and the game process must close both listeners on shutdown or startup failure.
- Sound references and action data must be removed from the staged game data, and no client or server event path may load or play audio.
- First-run policy copying must preserve later user changes and must not copy match history or training output.
- Files with image extensions but invalid image payloads must not enter the optimized visual-asset manifest; the named game-cover record must use a local fallback or be omitted if it is metadata-only.

## File Map

- `desktop/main.js` — Electron app lifecycle, child-process control, local request allowlist, and BrowserWindow creation.
- `desktop/preload.js` — narrow bridge for returning the verified local WebSocket URL to the game renderer.
- `server/desktop-entry.js` — desktop-only environment setup and parent IPC for readiness and shutdown.
- `server/server.js` — loopback HTTP binding, desktop resource roots, local-only routes, policy APIs, and training-route gating.
- `engine/components/network/net.io/IgeNetIoServer.js` — loopback WebSocket binding and reporting the actual bound port.
- `src/client.js` — desktop endpoint selection, local game-data and image URLs, and disabling client audio setup under a separate `window.isDesktopApp` flag.
- `src/ClientConfig.js`, `server/ServerConfig.js`, `engine/CoreConfig.js`, and `engine/core/IgeEntity.js` — staged loader/runtime lists and removal of audio component and playback paths.
- `src/index.ejs`, `src/templates/menu.ejs`, and `src/templates/videochat.ejs` — local vendor loading, desktop mode UI, and removal of remote video-chat scripts.
- `src/gameClasses/Unit.js` — remove the staged unit audio playback/update path.
- `server/server.js` and `src/gameClasses/components/script/ActionComponent.js` — remove staged server audio wiring and game-action network emission.
- `assets/css/common.css` and `assets/css/custom.css` — remove remote font imports from the desktop package.
- `tools/prepare-desktop-package.js` — creates `build/desktop-resources/`, strips audio data and playback pathways, copies policy seeds and local browser libraries, filters assets, and losslessly recompresses PNGs.
- `electron-builder.yml`, `package.json`, and `package-lock.json` — portable target, build scripts, and pinned desktop/browser-vendor dependencies.
- `README.md` — Windows portable build command, output location, and per-user data behavior.

The main process and server changes are one integrated deliverable: the executable cannot start correctly without the server's readiness/port contract, and the server cannot use its packaged assets or policies without the staging layout. Keep this as one implementation plan.

---

### Task 1: Add the Electron Shell and Package Configuration

**Files:**
- Create: `desktop/main.js`
- Create: `desktop/preload.js`
- Create: `electron-builder.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `desktop/main.js` starts the game child with `utilityProcess.fork()` and resolves startup only after receiving `{ type: 'battlefight-ready', httpPort: number, wsPort: number }`.
- `desktop/main.js` exposes IPC handler `desktop:get-connection-config`; it returns `{ webSocketUrl: string }` only after validating that the host is `127.0.0.1` and `wsPort` is in `1..65535`.
- `desktop/preload.js` exposes only `window.battleFightDesktop.getConnectionConfig(): Promise<{ webSocketUrl: string }>`; it does not expose raw `ipcRenderer`, Node, or filesystem APIs.

- [x] Add `electron@44.3.0` and `electron-builder@26.17.0` as exact development dependencies and a `desktop:build` script that runs the staging tool followed by `electron-builder --win portable --x64`.
- [x] Set the Electron package entry to `desktop/main.js` through `electron-builder.yml` `extraMetadata.main`, leaving the repository's existing `npm run server` entry behavior intact. Package only the Electron shell in `app.asar`; add staged game runtime files through `extraResources`.
- [x] Create `desktop/main.js` with `app.whenReady()`, a utility-process reference, a startup timeout, one `BrowserWindow`, and a single `stopGameServer()` path used by `before-quit` and window closure.
- [x] Create `desktop/preload.js` with context isolation and a single `getConnectionConfig` wrapper around `ipcRenderer.invoke('desktop:get-connection-config')`.
- [x] Configure the BrowserWindow with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and the preload path; deny navigation outside the current local HTTP origin and deny new windows.
- [x] Configure electron-builder for `win.target: portable`, `x64`, `asar: true`, `compression: normal`, `extraResources` from `build/desktop-resources/` to `desktop-data/`, and output `dist/portable/BattleFight-Portable-${version}.exe`.
- [x] Commit the shell and package configuration as `feat: add BattleFight Electron desktop shell`.

### Task 2: Add Dynamic Loopback Server Startup and Shutdown

**Files:**
- Create: `server/desktop-entry.js`
- Modify: `desktop/main.js`
- Modify: `server/ige.js`
- Modify: `server/server.js`
- Modify: `engine/components/network/net.io/IgeNetIoServer.js`

**Interfaces:**
- The Electron parent starts `server/desktop-entry.js` from the staged resource tree, sets its working directory to that tree, and passes `BATTLEFIGHT_DESKTOP=1`, `BATTLEFIGHT_RESOURCE_ROOT`, and `BATTLEFIGHT_USER_DATA` in its environment.
- The server child sends exactly one readiness object over `process.parentPort` after both servers have bound: `{ type: 'battlefight-ready', httpPort, wsPort }`.
- The parent sends `{ type: 'battlefight-shutdown' }` to request graceful shutdown. The child closes HTTP and WebSocket listeners and then exits; the parent calls `child.kill()` after a bounded grace period if it has not exited.

- [x] Create `server/desktop-entry.js` to set `ENV=standalone`, resolve the resource and user-data roots from environment variables, listen for the shutdown message, and then load `server/ige.js`.
- [x] Change `server/server.js` desktop HTTP startup to use `http.createServer(app).listen(0, '127.0.0.1')`, retain the returned server handle, and expose its assigned port from `server.address().port`.
- [x] Change `engine/components/network/net.io/IgeNetIoServer.js` and `engine/components/network/net.io/net.io-server/index.js` desktop startup to bind its WebSocket listener to `127.0.0.1:0` and expose the actual bound port from the underlying listener after its listening event.
- [x] Change the desktop startup path in `server/ige.js`/`server/server.js` to wait for both bound-port values before sending the readiness message; keep existing non-desktop startup ports and behavior unchanged.
- [x] Add `server/server.js` shutdown handling that closes the retained HTTP listener and NetIO listener when it receives the desktop shutdown request or a termination signal.
- [x] Change `desktop/main.js` to validate the readiness message, install the local-origin allowlist before loading the page, reject early child exit or timeout with a readable log in `userData`, rotate the log at a fixed size limit, and open `http://127.0.0.1:<httpPort>` only after readiness.
- [x] Commit the startup protocol as `feat: manage local BattleFight server lifecycle`.

### Task 3: Make Every Runtime Dependency Local

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/index.ejs`
- Modify: `src/templates/videochat.ejs`
- Modify: `src/client.js`
- Modify: `assets/css/common.css`
- Modify: `assets/css/custom.css`
- Modify: `server/server.js`
- Modify: `desktop/main.js`

**Interfaces:**
- The desktop page loads browser libraries only from local `/assets/desktop-vendor/` URLs generated in Task 4.
- `server/server.js` supplies `desktopMode: boolean` to EJS templates and emits `window.isDesktopApp`; existing `window.isStandalone` behavior remains separate. Browser-only CDN and video-chat behavior remains gated to non-desktop mode.
- The Electron session permits only `http://127.0.0.1:<httpPort>` and `ws://127.0.0.1:<wsPort>` requests; all other renderer requests are canceled.

- [x] Add pinned browser-resource packages matching the current CDN versions: `jquery@3.6.0`, `jquery-ui-dist@1.12.1`, `jquery-contextmenu@2.9.2`, `@popperjs/core@2.11.2`, `bootstrap@5.1.3`, `lz-string@1.4.4`, `lodash@4.17.21`, `sweetalert2@11.4.0`, `pixi.js-legacy@6.2.2`, and `@fortawesome/fontawesome-free@5.15.4`.
- [x] Replace the desktop branch's CDN script and stylesheet tags in `src/index.ejs` with local vendor URLs and load the local vendor files before `src/client.js`.
- [x] Remove Google Fonts `@import` statements from desktop CSS and use the existing local font texture plus the CSS system-font fallback.
- [x] Omit the `videochat.ejs` include and its two remote script tags when `desktopMode` is true; keep video chat unchanged in the browser build.
- [x] In desktop mode, set the client host to the empty string, load the game definition from `/src/game.json`, and load the coin image from `/assets/images/coin.png` rather than `www.modd.io`; use `window.isDesktopApp` so the existing browser standalone mode is unchanged.
- [x] In desktop mode, do not register the CDN proxy routes in `server/server.js`.
- [x] Add the Electron session `webRequest.onBeforeRequest` allowlist before `loadURL`; allow only the exact loopback HTTP and WebSocket origins received from the child.
- [x] Commit local dependency loading as `feat: bundle BattleFight browser dependencies locally`.

### Task 4: Stage a Sound-Free, Losslessly Optimized Asset Tree

**Files:**
- Create: `tools/prepare-desktop-package.js`
- Modify: `electron-builder.yml`
- Modify: `src/index.ejs`
- Modify: `src/client.js`
- Modify: `src/gameClasses/ClientNetworkEvents.js`
- Modify: `src/gameClasses/components/EffectComponent.js`
- Modify: `src/gameClasses/Unit.js`
- Modify: `src/gameClasses/components/script/ActionComponent.js`
- Modify: `src/gameClasses/ClientNetworkEvents.js`
- Modify: `src/ClientConfig.js`
- Modify: `server/ServerConfig.js`
- Modify: `engine/CoreConfig.js`
- Modify: `engine/core/IgeEntity.js`
- Modify: `server/server.js`

**Interfaces:**
- `prepareDesktopPackage({ repoRoot, stagingRoot })` writes only inside `build/desktop-resources/` and returns `{ visualFileCount, sourceBytes, stagedBytes, pngBytesSaved, policyFileCount, policyBytes }`.
- The staging tool derives the allowlist from `src/assets/manifest.json` plus game-data visual references, writes a local asset manifest under `build/desktop-resources/assets/desktop-asset-manifest.json`, and never changes files in `src/`, `assets/`, or `training-data/`.
- The staged tree preserves the relative layout for `server`, `engine`, `src`, `assets`, and `training-data`; the utility process runs with that tree as `cwd`. electron-builder packages it as ordinary resources under `resources/desktop-data/`. Production dependencies are packaged once with the app and exposed to the child through `NODE_PATH`.
- Desktop-mode renderer startup reads the prepared game definition and asset manifest only from the staged local tree.

- [x] Create `tools/prepare-desktop-package.js`; resolve `stagingRoot` and refuse to delete or overwrite it unless it is the exact ignored path `build/desktop-resources` under `repoRoot`.
- [x] Copy `server`, `engine`, and `src` runtime files into the staging tree. Exclude Python, trainer implementation, caches, logs, and virtual environments; keep only `server/training/PolicyRegistry.js` and its required runtime helpers. Copy current `training-data/policies/*.json` files into `build/desktop-resources/training-data/policies/`; do not copy `matches.jsonl`, checkpoints, logs, or worker state.
- [x] Copy each pinned browser package's distribution files into `build/desktop-resources/assets/desktop-vendor/` at the exact URL paths used by the desktop branch of `src/index.ejs`.
- [x] Generate staged `src/game.json` and the asset manifest from the source copies; remove every audio/music file entry, audio URL, sound/music field, and sound event definition from the staged data. In staged client/runtime sources, remove sound component setup, audio preload, sound-event registration/handlers, and server audio-action emission paths while leaving browser sources untouched.
- [x] Exclude every MP3, M4A, WAV, OGG, FLAC, AAC, and other audio file extension from the staged tree; exclude the two 325-byte XML `NoSuchKey` payloads whose filenames end in `.png`, and remove `game.data.settings.images.cover` from staged metadata because that optional thumbnail points to an invalid payload.
- [x] Copy only local visual and required UI files referenced by the staged game; preserve their relative URLs and reject any manifest URL whose origin is not one of the known asset hosts.
- [x] Fail staging with the exact local path for any required visual asset referenced by staged game data but absent from the source asset tree.
- [x] Implement PNG IDAT recompression with Node's built-in `zlib` at level 9 in the staging copy. Preserve all non-IDAT chunks, regenerate the IDAT CRC, and keep the original bytes whenever the recompressed PNG is not smaller or the source PNG is malformed.
- [x] Change desktop-mode client startup to skip `SoundComponent`, sound/music preloads, and sound network-event registration. Change the staged server/action code so audio actions emit no network messages and cannot call an absent sound component.
- [x] Record original/staged asset counts and byte totals in `desktop-asset-manifest.json`; use the measured PNG benchmark (about 577 KB estimated savings across valid current PNGs) as a comparison, not as a promised build result.
- [x] Commit staging and audio removal as `feat: prepare optimized sound-free desktop assets`.

### Task 5: Keep AI Selection While Removing Training Controls

**Files:**
- Modify: `desktop/main.js`
- Modify: `server/server.js`
- Modify: `src/templates/menu.ejs`
- Modify: `electron-builder.yml`

**Interfaces:**
- The main process copies the 26 staged seed policies into `path.join(app.getPath('userData'), 'training-data', 'policies')` only when the destination file does not already exist.
- The game continues to use `GET /api/training/policies`, `GET /api/demo/status`, and `POST /api/demo/policies` for the Blue/Red policy selectors and demo status.
- Desktop mode keeps only `GET /api/training/policies` for model selection; it returns HTTP 404 for training status, start, stop, worker adjustment, activation, auto-update, and match sync endpoints.

- [x] Initialize the per-user policy directory before starting the child; copy only missing seed JSON files so updated and user-imported policies survive later launches.
- [x] Pass the per-user training-data path to `server/desktop-entry.js` through `BATTLEFIGHT_USER_DATA` and make `server/server.js` construct `PolicyRegistry` with that path.
- [x] Keep policy listing, demo status, and Blue/Red selection routes active; remove eager `TrainingCli` loading from desktop startup and return 404 from training mutation/sync routes in desktop mode.
- [x] In `src/templates/menu.ejs`, retain the Blue/Red policy selectors, demo scores, and AI statistics while hiding training status, worker controls, and start/stop buttons in desktop mode; skip the training-status polling loop.
- [x] Return HTTP 404 from `/api/training/status`, `/api/training/start`, `/api/training/stop`, `/api/training/workers`, `/api/training/activate`, `/api/training/auto`, `/api/training/sync/export-bundle`, and `/api/training/sync/import-bundle` in desktop mode; keep `/api/training/policies` read-only for selection.
- [x] Exclude all training history and trainer source/data from the staged package; keep only the 26 seed policies and runtime policy registry code.
- [x] Commit local policy support as `feat: retain AI selection without desktop training`.

### Task 6: Produce the Windows Portable Executable and Document It

**Files:**
- Modify: `electron-builder.yml`
- Modify: `package.json`
- Modify: `README.md`
- Output: `dist/portable/BattleFight-Portable-1.0.0.exe` (versioned from `package.json`)

- [x] Configure `electron-builder.yml` to package the Electron shell and its production dependencies in `app.asar`; add the staged server, engine, game source, assets, and policy seeds from `build/desktop-resources/` as ordinary files under `resources/desktop-data/`. Set `NODE_PATH` to the app's packaged `node_modules` when starting the staged utility process.
- [x] Exclude original `training-data`, raw `assets`, `src`, `engine`, `server`, backups, logs, `tools/__pycache__`, `.git`, and source-only Python/trainer files from `app.asar`; the staged tree is the only packaged game runtime and includes only policy seeds.
- [x] Set the artifact name to `BattleFight-Portable-${version}.exe`, target only Windows x64 portable, and write output under the ignored `dist/portable/` directory.
- [x] Add README instructions for the desktop build command, output path, no-audio/offline behavior, first-run policy copy, and per-user writable data path.
- [x] Run `npm run desktop:build` to create the requested executable and report the actual `.exe` size and staged asset savings.
- [x] Commit the packaging and usage documentation as `build: package BattleFight as portable Windows app`.

## References

- [Electron utility process API](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron web request API](https://www.electronjs.org/docs/latest/api/web-request)
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder Windows targets](https://www.electron.build/docs/win/)
- [electron-builder configuration and compression](https://www.electron.build/docs/configuration/)
