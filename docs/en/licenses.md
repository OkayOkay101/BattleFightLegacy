# Licenses and Redistribution Evidence

[ภาษาไทย](../th/licenses.md) · [Documentation](index.md) · [Component inventory](license-inventory.md)

Snapshot: **2026-10-20**. This is a source/evidence register, not a declaration that every game asset is cleared for redistribution. Existing licenses are preserved; this documentation neither changes them nor assigns rights to custom content.

## Separate the rights by component

| Component | Evidence and scope | Distribution |
|---|---|---|
| Upstream Taro code | Repository `LICENSE`: MIT, copyright 2020 Mod Studio Inc. Preserve the original notice; do not extend this evidence to unrelated artwork | Source server and packaged gameplay engine |
| BattleFight content/custom changes/model weights | **Owned by the project owner** (owner statement, 2026-10-20) | Source game and bundled policy seeds/content |
| npm dependencies | Exact locked/installed versions and original local texts in the inventory; direct/transitive runtime/development roles are separate | Some runtime dependencies in app.asar, others source/development only |
| Browser vendor | Copy mappings identify actual local JS/CSS and the supplying package | Source browser assets and desktop resources |
| Electron and Chromium | Electron MIT notice plus the runtime's third-party `LICENSES.chromium.html`; Chromium dependencies are not all MIT | Windows portable runtime |
| Font Awesome Free 5.15.4 | Local package text: code MIT; web/desktop fonts OFL-1.1; SVG/JS icon files CC-BY-4.0. Classify actual file types, not the whole package as MIT | CSS/webfonts copied to desktop; icon files only where actually used |
| Torch/NumPy and Python dependencies | Installed `.dist-info` metadata and original license/notice files; pinned inputs and installed versions are separate evidence | Training/development; excluded from standalone |
| Development Node, Python interpreter and Tcl/Tk | Notices collected in `docs/licenses/texts/tool-runtimes`: Python `LICENSE.txt` and Tcl/Tk `license.terms` from the installed interpreter, Node.js `LICENSE` for the installed version | Source server/training/GUI tools; not included in standalone |
| Imported sprites, tilesets and UI images | **Public domain**, per the project owner (statement, 2026-10-20) | Source game and desktop resources |
| `arcade.ttf` | Arcade Alternate by Abdul Muizz bin Haji Kasim ([dafont](https://www.dafont.com/arcade-alternate.font)): free for personal and commercial use with credit; credited in `THIRD-PARTY-NOTICES.md` | Copied by desktop preparation |
| `verdana_12pt.png` | **Removed on 2026-10-21.** Bitmap of Verdana glyphs inherited from the Isogenic Engine with unconfirmed provenance; it was loaded but never rendered | Not shipped |
| Audio | Some historical manifest entries exist; standalone preparation removes audio and its references. Removing an asset does not establish a license for any copy elsewhere | Excluded from the current offline standalone |

Phaser is declared in package dependencies. A declaration alone does not prove that browser gameplay executes it; inspect runtime imports/vendor mappings separately. The current browser renderer uses Pixi. No dependency upgrade/removal is performed by this documentation task.

Custom Unit/Weapon records are names and numeric presets referencing existing visuals and mechanics; the editor does not upload new images or execute user scripts. They are local user data, not portable seed assets. Creating a preset does not establish a new license for the reused art or grant additional redistribution rights.

## Original notices and provenance

- [Original notice index](../licenses/README.md) links verbatim copies, including Taro, npm/Python packages and Electron runtime notices. Texts are not translated into substitutes for the originals.
- [Machine-readable component register](../licenses/inventory.json) records versions, source URLs, text-copy paths and hashes, vendor mappings, embedded header evidence and unresolved items.
- [Per-file asset register](../licenses/asset-inventory.json) records available source paths, SHA256, size and recorded origin URLs. Duplicate files at different paths remain separate entries; appearance in a manifest is not license proof.
- The generator is `node docs/generate-license-inventory.cjs`. It reads local evidence and writes only documentation. It does not fetch unknown licenses or modify game/training/build output.

Metadata-only entries are marked explicitly. Installed package metadata can differ from the lockfile; both versions and the match flag are retained. The inventory currently contains **769 npm package locations**, **12 installed Python distributions**, **2,834 available image/font/media files** and **14 embedded header records**. **31 npm entries** have metadata but no collected local license text. These counts are locations/files, not unique authors or assets. Refresh the dated register after dependency or asset changes.

Embedded engine/browser headers are listed separately because bundled code can have attribution independent of the npm graph. Header snippets are clues, not automatic assignment of a full license. Upstream source notices must be inspected in context, especially physics and vendored code.

## Practical notice requirements

MIT text requires keeping its copyright/permission notice with copies or substantial portions; see the [official SPDX MIT text](https://spdx.org/licenses/MIT). Other components retain their own conditions. For Font Awesome, read the copied category-specific grant and the [official Free license](https://fontawesome.com/license/free); do not remove attribution or treat fonts/icons as MIT code.

Do not remove original credits, claim provider endorsement, or infer ownership from AI-development credits. No blanket conclusion about commercial redistribution is made for unknown assets. Request the creator/source, exact version, license text or permission, applicable attribution, and permission to distribute modified/offline copies from the project owner where evidence is missing.

## Notices shipped with the standalone

From 2026-10-20 the desktop preparer writes a `licenses/` folder into `desktop-data`: the Taro `LICENSE`, the original license of each copied browser library (including Font Awesome), license texts for bundled npm packages that ship none (`npm/<package>@<version>/` with `SOURCE.txt`), [THIRD-PARTY-NOTICES.md](../licenses/THIRD-PARTY-NOTICES.md) and [CHARACTER-CREDITS.md](../licenses/CHARACTER-CREDITS.md). Electron/Chromium notices stay at the application root. The full `docs/licenses` collection (27 MB) is not bundled.

All 31 npm packages that ship no license file now have a collected text: 16 from the upstream repository, 6 from the package README license section and 9 as the standard text of the license declared in `package.json` (no upstream file exists). See [the index](../licenses/texts/npm-upstream/index.json).

Resolved on 2026-10-21: Sukune and Tenkai are Len'en Project fan content made under JynX's derivative works guidelines (the CC BY-SA 4.0 notice found earlier is the Len'en Wiki text license, not the characters'); Morphling, Malevolent Orchid and the Corkmaster names were renamed to Morph, Orchid and Cork (skills Shot, Blow, Bait, Block); Dual Assassin is used with its co-creator's permission for this game only.

Still open: Touhou fan-content distribution channel (the guidelines do not list GitHub) (the GitHub release is a draft until the project owner decides). `verdana_12pt.png` was removed on 2026-10-21.

Same-path presence in the asset inventory does not detect every renamed/transformed asset. `packagedNodeModule` checks each locked location in app.asar, not every possible hoisted path or Chromium binary dependency. Full notice coverage needs the original texts, vendor mapping and runtime notice file together.
