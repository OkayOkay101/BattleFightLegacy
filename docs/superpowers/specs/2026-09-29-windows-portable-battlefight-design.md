# Windows Portable BattleFight Desktop App Design

## Goal

Package BattleFight as a Windows x64 portable Electron executable that runs the game locally on this computer. The desktop build includes the game and its visual assets, contains no sound or music files, makes no runtime requests to fetch game assets from the internet, and lets the player choose the included AI policies for Blue and Red. The packaging step removes unneeded assets and packages code efficiently without lossy image conversion or changing the source assets. It does not include the Python/PyTorch trainer or match-training history.

## Confirmed Decisions

- Deliver a Windows x64 portable `.exe` built with Electron.
- Run the existing BattleFight game server as a child process and open its local web page in the Electron window.
- Bind the local HTTP and WebSocket listeners to loopback only. Choose available ports at launch and pass the actual ports to the window.
- Include the application source/runtime, required Node dependencies, local visual assets, and the current selectable AI policy files.
- Store writable policies, preferences, logs, and other runtime data under Electron's per-user `userData` directory, outside the packaged executable.
- Do not package match/training history, Python, PyTorch, or a usable training control surface. Training controls in the desktop build are disabled or omitted.
- Package no audio or music files and disable sound loading and playback in this desktop build.
- Do not use online/CDN asset fallback. All visual assets needed to play must be present locally.

## Current State and Packaging Evidence

- `npm run server` starts the standalone game server through `server/ige.js`; it currently uses HTTP port `80` and WebSocket port `2001`, and the client advertises `ws://localhost:2001`.
- `server/server.js` serves visual assets from `assets/` and also has CDN proxy routes for `cache.modd.io` and `modd.s3.amazonaws.com`. The desktop build must bypass these routes and fail clearly when a required local asset is missing.
- The game data references 1,200 distinct visual assets; the current `assets/` tree contains every referenced visual asset. The game data also contains 385 audio references, which must not cause preloads or network requests in the desktop build.
- Current source-tree sizes are approximately 38.5 MiB for `src/`, 8.3 MiB for `engine/`, 0.2 MiB for `server/`, and 41.8 MiB for `assets/`, before dependencies and Electron. These are baseline measurements, not a final executable-size promise.
- The 1,838 files under `assets/` total 43,835,795 bytes. Its 319 MP3 files and 144 M4A files account for 36,916,733 bytes (about 84.2%). Excluding those 463 audio files leaves 6,919,062 bytes of other assets (about 6.60 MiB), before filtering any unreferenced files.
- PNG and JPEG are already compressed image formats; avoid converting them to a lossy format or recompressing all of them blindly. Keep the source assets unchanged and only run a lossless optimizer on a build staging copy if it produces smaller output.
- `training-data/policies/` currently has 26 JSON policy files totaling about 8.9 MB. `training-data/matches.jsonl` is about 2.03 GB and is excluded along with other match logs, checkpoints, worker state, and training history.
- The server currently resolves training data relative to its source directory. The packaged app must instead keep immutable seed policies with the application and place writable policy/registry data in the per-user data directory.

## Application Structure

The Electron main process owns the desktop window and the game-server child process. At startup it resolves the packaged application directory, prepares the user's writable data directory and initial policy set, then launches the packaged Node runtime with `server/ige.js` as the entry point. The Node runtime and server files are packaged as application resources so startup does not depend on a separately installed Node.js or Python.

The server binds both listeners to `127.0.0.1` on operating-system-assigned free ports. Once HTTP and WebSocket listeners are both ready, it sends one structured readiness message to the Electron parent containing their ports. The parent opens the HTTP address in a restricted Electron window and supplies the WebSocket address through a narrow preload bridge. The client uses this supplied address rather than a hard-coded port. Readiness has a bounded timeout; malformed or missing readiness data is a startup failure with a readable log entry.

On normal app exit, the main process asks the game server to shut down, waits for a short bounded grace period, then terminates the child if it remains. On app quit, startup failure, or window closure, no detached server should remain running. The server handles shutdown signals by closing both listeners and releasing child resources.

The Electron renderer loads only the local game page. Disable Node integration, enable context isolation and renderer sandboxing, and expose only the local server endpoints required by the game through the preload. Prevent navigation and new windows from leaving the local app. Do not expose arbitrary IPC or filesystem operations to game-page code.

## Local Assets and No-Audio Build

The portable package contains the local visual assets used by the packaged game data. Asset URLs resolve to the local server's asset route. Desktop mode does not register CDN proxy routes, rewrite missing local files to a CDN, or permit the game client to download assets from an external host. A missing local visual asset is logged and surfaced as a local asset error instead of being fetched online.

Create the packaged asset tree from an allowlist of local visual files actually referenced by the desktop game. Exclude every audio/music file and every unreferenced asset from the portable package while leaving repository originals untouched. The current asset inventory indicates audio exclusion alone cuts the asset payload by about 84.2%; the final build should report its staged asset size and file count so future additions cannot silently inflate the package.

Use Electron's normal `asar` packaging for application files and the standard portable target compression. Do not force the `maximum` setting: electron-builder documents that it usually does not noticeably reduce package size and increases build time. PNG/JPEG visual assets are preserved as-is unless a lossless staging optimization measurably reduces their size. Compare the final artifact with the unfiltered input inventory and report the actual output size rather than promising a size based only on these source-tree measurements.

The build excludes audio and music files. In desktop mode it also skips `SoundComponent` setup, sound/music preloading, and sound playback handlers, including server-originated sound events. Audio references in source game data must be ignored or filtered by the desktop runtime before asset loading; they must not trigger network requests or block game startup. These packaging rules apply to the portable desktop product and do not require deleting source assets or changing the browser game's source distribution.

The desktop app is intended to play locally. It must not connect to a remote game server or CDN for game operation. Any non-game telemetry or update request is outside this design and must not be added implicitly.

## AI Policies and Writable Data

Include the current 26 policy JSON files as immutable seed data. On first launch, initialize the per-user policy directory from these seeds without overwriting existing user data on later launches. The game UI lists policies available to the packaged desktop app and allows separate Blue and Red selections. Changes to active selection or newly imported policies are written only under the per-user data directory.

Match recording, training history, worker output, and training checkpoints are not copied into the portable build. The desktop build does not start Python, PyTorch, or trainer workers. The existing game-training APIs and GUI controls are disabled or removed from this build so players cannot start jobs that are not packaged.

## Lifecycle, Ports, and Error Handling

- Bind both HTTP and WebSocket servers to `127.0.0.1`; never bind to a LAN or public interface.
- Select both ports dynamically and return the bound values only after both servers are ready.
- Validate the readiness message and ensure its addresses are loopback addresses before opening the renderer.
- Show a useful startup error and write diagnostic logs to the per-user data directory if the server exits early, either listener fails, readiness times out, or the game page cannot load.
- Keep logs bounded or rotated so repeated launches cannot consume unbounded disk space.
- Shut down the child process on every normal and abnormal app exit path; never leave it detached.
- If a required local visual asset is absent, report its local path and fail that asset request without trying a remote mirror.
- If policy seed initialization fails, report the failure without modifying the packaged policy files.

## Acceptance Criteria

- A Windows x64 portable executable starts the game without a separate Node.js or Python installation.
- The app starts its local server, waits for both listeners, connects the game UI to the selected WebSocket port, and shuts the server down when the app exits.
- Both listeners are loopback-only and use dynamically selected ports.
- Blue and Red can independently use policies included with the desktop app; user policy changes persist outside the executable.
- The package contains no audio/music files, and launching/playing does not preload or play sound.
- The packaged asset manifest includes all referenced visual assets and excludes audio plus unreferenced files; its staged size and file count are recorded.
- Packaging leaves repository source assets unchanged and does not use lossy image conversion.
- All required visual assets load from the package on an offline machine; no asset CDN request is made, including for missing assets.
- Training controls cannot start a trainer, and the package contains no match history, Python, or PyTorch.
- Renderer navigation and preload capabilities remain restricted to the local game.
- Startup failures produce a useful message and a diagnostic log, and do not leave a server process behind.

## Out of Scope

- macOS/Linux builds, LAN hosting, public deployment, auto-updates, online matchmaking, bundled Python/PyTorch training, model retraining, and migration of the multi-gigabyte training archive.
- Changing combat balance, game rules, AI policy behavior, or the browser version's general sound behavior.

## Official References

- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder Windows targets](https://www.electron.build/docs/win/)
- [electron-builder configuration and compression](https://www.electron.build/docs/configuration/)
