# Releasing the Windows Build

[ภาษาไทย](../th/releasing.md) · [Documentation](index.md)

How to build the portable EXE, check it, and publish it as a GitHub release. Run every command in the `taro-engine` folder.

## Editions

| Edition | Command | Output | Contents |
|---|---|---|---|
| Full | `npm run desktop:build` | `dist/portable/BattleFight-Portable-1.0.0.exe` | Every character |
| GitHub | `npm run desktop:build:github` | `dist/portable/BattleFight-Portable-1.0.0-no-touhou.exe` | Every character except Reimu & Marisa |

**Publish only the GitHub edition on GitHub.** The [Touhou Project fan-work guidelines](https://touhou-project.news/guideline/) (updated 2024-05-31) allow distribution only through channels that sell the original games or that ZUN permits, for example doujin events and shops, download stores that sell the original games, and indie game sites. GitHub is not listed. The full edition can go to a listed channel such as an indie game site.

The GitHub edition removes Reimu & Marisa's unit types, items, projectiles, animations, create script, menu option and music credits, and keeps anything another character still uses. It ships the source Neural roster frozen in `server/training/neural-roster.json`, so the trained policies still load. See [Development](development.md).

## 1. Build

```powershell
npm run desktop:build:github
```

The preparer prints a summary. Check that `fallbackUnitCount` and `missingSourceVisualCount` are `0`, and that `variantRemoval` lists Reimu & Marisa.

## 2. Test

```powershell
npm run test:desktop
npm run test:desktop:game
```

Then start the EXE and play a match. Check that the menu has no Reimu & Marisa, that Solo Test lists 44 characters, and that the Neural AI fights (kills and damage increase).

## 3. Record the file details

```powershell
Get-Item dist\portable\BattleFight-Portable-1.0.0-no-touhou.exe | Select-Object Length
Get-FileHash dist\portable\BattleFight-Portable-1.0.0-no-touhou.exe -Algorithm SHA256
```

Put the size and SHA256 in [Release notes](release-notes.md) and in the GitHub release description.

## 4. Push the source

A release points at a commit, so push it first.

```powershell
git push origin codex/battlefight-bots
```

## 5. Create a draft release

Tags follow the date: `standalone-YYYY-MM-DD`. An existing tag cannot be reused.

**Website:** open `https://github.com/OkayOkay101/BattleFightLegacy/releases/new`, choose a new tag, set the target branch, enter a title and description, drag the EXE into **Attach binaries**, wait for the upload, then click **Save draft**.

**Command line** (GitHub CLI, signed in with `gh auth login`):

```powershell
gh release create standalone-YYYY-MM-DD dist/portable/BattleFight-Portable-1.0.0-no-touhou.exe --repo OkayOkay101/BattleFightLegacy --draft --target codex/battlefight-bots --title "BattleFight - YYYY-MM-DD (GitHub edition)" --notes-file release-notes.md
```

A draft is visible only to people who can edit the repository. Replace its file after a rebuild with:

```powershell
gh release upload standalone-YYYY-MM-DD dist/portable/BattleFight-Portable-1.0.0-no-touhou.exe --repo OkayOkay101/BattleFightLegacy --clobber
```

The description should cover what changed, what was tested, the file size and SHA256, and the SmartScreen note below.

## 6. Publish

The repository is public: once published, anyone can download the file.

**Website:** on the Releases page, open the draft with **Edit**, check the tag, file and description, tick **Set as the latest release**, then click **Publish release**.

**Command line:**

```powershell
gh release edit standalone-YYYY-MM-DD --repo OkayOkay101/BattleFightLegacy --draft=false --latest
```

Afterwards, download the file from the release page and check that its SHA256 matches.

## Before publishing

- [ ] GitHub edition, not the full edition
- [ ] Desktop tests pass and a match was played in the EXE
- [ ] Size and SHA256 match in the release description and release notes
- [ ] `licenses/` in the EXE has the notices (`THIRD-PARTY-NOTICES.md`, `CHARACTER-CREDITS.md`, Taro, browser libraries, npm)
- [ ] Source commit is pushed

## SmartScreen

The EXE is not code-signed, so Windows may show "Windows protected your PC" on first launch. Players should check the SHA256 and then choose **More info → Run anyway**. Removing the warning requires signing with a trusted certificate (for example Azure Trusted Signing or an OV/EV certificate), which the project owner must obtain.

## Do not commit the EXE

The EXE is larger than GitHub's 100 MB file limit and `dist/` is ignored by git. Distribute it only as a release asset.
