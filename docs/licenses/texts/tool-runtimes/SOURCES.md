# Development tool runtime notices

These tools run the source server, training and the trainer GUI. None of them is bundled in the Windows portable EXE; the EXE uses the Node.js runtime embedded in Electron, whose notices are in `LICENSE.electron.txt` and `LICENSES.chromium.html`.

| Runtime | Version | Notice | Source |
|---|---|---|---|
| Python | 3.14.7 (Windows x64) | `python-3.14.7/LICENSE.txt` | Copied from the installed interpreter's `LICENSE.txt` |
| Tcl | 9.0.4 | `tcl-9.0.4/license.terms` | Extracted from the interpreter's `tcl/libtcl9.0.4.zip` |
| Tk | 9.0.4 | `tk-9.0.4/license.terms` | Extracted from the interpreter's `tcl/libtk9.0.4.zip` |
| Node.js | v24.19.0 | `node-v24.19.0/LICENSE` | https://raw.githubusercontent.com/nodejs/node/v24.19.0/LICENSE |
