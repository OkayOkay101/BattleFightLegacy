# Licenses and Redistribution Evidence

[ภาษาไทย](../th/licenses.md) · [Documentation](index.md) · [Component inventory](license-inventory.md)

Snapshot: **2026-10-01**. This is a source/evidence register, not a declaration that every game asset is cleared for redistribution. Existing licenses are preserved; this documentation neither changes them nor assigns rights to custom content.

## Separate the rights by component

| Component | Evidence and scope | Distribution |
|---|---|---|
| Upstream Taro code | Repository `LICENSE`: MIT, copyright 2020 Mod Studio Inc. Preserve the original notice; do not extend this evidence to unrelated artwork | Source server and packaged gameplay engine |
| BattleFight content/custom changes/model weights | **License evidence not found** for a separate content grant or rights assignment; confirm owner/terms rather than inferring from package metadata | Source game and bundled policy seeds/content |
| npm dependencies | Exact locked/installed versions and original local texts in the inventory; direct/transitive runtime/development roles are separate | Some runtime dependencies in app.asar, others source/development only |
| Browser vendor | Copy mappings identify actual local JS/CSS and the supplying package | Source browser assets and desktop resources |
| Electron and Chromium | Electron MIT notice plus the runtime's third-party `LICENSES.chromium.html`; Chromium dependencies are not all MIT | Windows portable runtime |
| Font Awesome Free 5.15.4 | Local package text: code MIT; web/desktop fonts OFL-1.1; SVG/JS icon files CC-BY-4.0. Classify actual file types, not the whole package as MIT | CSS/webfonts copied to desktop; icon files only where actually used |
| Torch/NumPy and Python dependencies | Installed `.dist-info` metadata and original license/notice files; pinned inputs and installed versions are separate evidence | Training/development; excluded from standalone |
| Development Node, Python interpreter and Tcl/Tk | Tool versions/environment are recorded; complete local interpreter/Tcl/Tk notices were not found in inspected installation locations. Electron's bundled runtime is covered by its own collected notices | Source server/training/GUI tools; external Python/Tk excluded from standalone |
| Imported sprites, tilesets and UI images | **License evidence not found** where no associated grant is present; cache/S3 URLs identify location, not permission | See per-file asset inventory and packaged-path evidence |
| `arcade.ttf`, `verdana_12pt.png` | **License evidence not found** for these specific files | Explicitly copied by desktop preparation |
| Audio | Some historical manifest entries exist; standalone preparation removes audio and its references. Removing an asset does not establish a license for any copy elsewhere | Excluded from the current offline standalone |

Phaser is declared in package dependencies. A declaration alone does not prove that browser gameplay executes it; inspect runtime imports/vendor mappings separately. The current browser renderer uses Pixi. No dependency upgrade/removal is performed by this documentation task.

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

## Current standalone notice gaps

The inspected 2026-10-01 unpacked release retains `LICENSE.electron.txt` and `LICENSES.chromium.html` at the application root. The repository Taro `LICENSE` is **not copied into desktop-data** by the current preparer; root app.asar contains desktop code/package/dependencies rather than the repository documentation tree. No standalone vendor `LICENSE` files were found beneath the copied `assets/desktop-vendor` tree during this inspection. Individual JS/CSS headers and module notices may remain, but they are not a complete aggregated notice audit.

The new `docs/licenses` collection is **not automatically included in the existing EXE**. A later packaging change should carry the applicable upstream/game/dependency/font notices and resolve unknown asset rights before claiming a fully cleared redistributable package. This task records that gap; it does not rebuild or change the package.

Same-path presence in the asset inventory does not detect every renamed/transformed asset. `packagedNodeModule` checks each locked location in app.asar, not every possible hoisted path or Chromium binary dependency. Full notice coverage needs the original texts, vendor mapping and runtime notice file together.
