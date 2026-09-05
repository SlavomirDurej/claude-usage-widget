# Release Process

## Branch Rules (Non-Negotiable)

- **`main`** — only touched during a formal release. Never commit directly. Never merge from develop except at release time.
- **`develop`** — integration branch. All feature/fix branches merge here first.
- **Feature/fix branches** — always cut from `develop`, always merge back to `develop`.
- **RC builds** — tagged from `develop`. Main is never involved.

---

## RC / Pre-Release Build

Use this when you want to produce real installable artifacts for testing without cutting a formal release.

**Prerequisites:** feature branch already merged to `develop` and pushed to origin.

1. **Documentation review — do this as its own pass, before tagging anything:**
   - Full read-through of `STAGED_CHANGES.md` for the cycle: stale "in progress"/"not yet confirmed" language on anything since confirmed, missing branch-table rows for any merged branch (every merged branch gets one), and outdated caveats elsewhere in `README.md`/`CONTRIBUTING.md`/`QUICKSTART.md` (platform/signing status, close/minimize behavior descriptions, etc.).
   - **Contributor credit check:** every code/design contributor this cycle (opened a PR, even if adapted rather than merged verbatim) has a `README.md` Contributors line and `Co-authored-by` on the relevant commit. Every bug/issue/discussion reporter who contributed no code is credited in prose only (`STAGED_CHANGES.md` + the GitHub reply to them) and is **not** added to the Contributors list — see `CLAUDE.md`'s "Contributor Credit" section for the full policy and the quick test for which bucket someone falls into.
   - Fix anything found on its own small `docs/*` branch, merge to `develop`, before moving to step 2.

2. **Tag `develop` directly:**
   ```
   git checkout develop
   git tag -a vX.Y.Z-rc.N -m "vX.Y.Z-rc.N - RC build for <feature description>"
   git push origin vX.Y.Z-rc.N
   ```

3. **Verify CI triggers** on all three platform workflows from the tag push.

4. **GitHub will create a pre-release** — confirm it is marked `prerelease: true` and `draft: false`.

5. **Wait for the build to complete successfully before writing anything.** Don't draft release notes while CI is still running — RC builds have failed and needed deleting/re-tagging often enough that notes written against a build that gets scrapped are wasted effort. Once green:
   - Confirm all expected assets are present, **including `.blockmap` files — keep these, do not delete them.** They're differential-update data `electron-updater` needs to ship people a delta instead of a full re-download; removing them (as was done, unknowingly, for every release before this note existed) silently makes every update a full download for no benefit.
   - Write the release description using [RELEASE_CANDIDATE_PROCESS.md](RELEASE_CANDIDATE_PROCESS.md)'s template, then save it to the release.

6. **Test the builds** — download and test Windows (installer + portable), macOS, Linux.

7. **If issues found:**
   - Fix on a new branch off `develop`, merge back to `develop`
   - Delete the GitHub release first (UI)
   - Delete the tag: `git push origin :refs/tags/vX.Y.Z-rc.N && git tag -d vX.Y.Z-rc.N`
   - Increment RC number and repeat from step 2 (documentation review from step 1 doesn't need re-running unless the fix itself touched docs)

8. **`main` is never touched during this process.**

---

## Formal Release

Only after RC testing passes and enough changes have accumulated on `develop` to justify a release. Version number agreed upon before starting.

1. **Merge `develop` → `main` locally:**
   ```
   git checkout main
   git merge --no-ff develop -m "release: merge develop into main for vX.Y.Z"
   ```

2. **Delete `STAGED_CHANGES.md` from `main`.** Its purpose is tracking what's accumulating *toward* a release on `develop` — once merged, "staged" no longer means anything, and its content already lives permanently in `RELEASE_NOTES_1.7.X.md` (see step 7 below). Leaving it on `main` is a stale, redundant duplicate of information that belongs in the release notes instead.
   ```
   git rm STAGED_CHANGES.md
   git commit -m "chore: remove STAGED_CHANGES.md from main (content now in RELEASE_NOTES_1.7.X.md)"
   ```
   This is expected to merge cleanly on every future release with no conflict, *because* of step 6 below: syncing `develop` with `main` right after each release pulls this deletion back into `develop`'s own history before `develop` recreates the file fresh. By the next release, the deletion is a shared ancestor between both branches, so `git merge develop → main` re-adds the file cleanly rather than hitting a modify/delete conflict.

3. **Bump version in `package.json`** to `X.Y.Z` (remove `-dev` suffix).

4. **Push `main` and verify CI passes** (no tag yet):
   ```
   git push origin main
   ```

5. **Once CI is green, create and push the annotated release tag:**
   ```
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

6. **Tag push triggers the three platform builds.** Monitor Actions.

7. **After release, bump `develop` to the next cycle's RC version:**
   ```
   git checkout develop
   git merge main --no-edit   # sync develop with main (fast-uri fixes, docs, and the STAGED_CHANGES.md deletion from step 2 above)
   # Update package.json version to X.Y.(Z+1)-rc.1 (no -dev placeholder — we cut straight to rc.1)
   git add package.json package-lock.json
   git commit -m "chore: start vX.Y.(Z+1)-rc.1 cycle on develop"
   git push origin develop
   ```

8. **Recreate `STAGED_CHANGES.md`** on `develop` with its empty template — step 7's merge just deleted it (inherited from `main`), and its previous entries live permanently in `RELEASE_NOTES_1.7.X.md`.

9. **Clean up superseded RC releases and tags.** Claude should proactively remind you of this step at formal release time — don't wait to be asked:
   - Confirm the new stable release built and published successfully first.
   - You delete each superseded `vX.Y.Z-rc.N` release in the GitHub UI (Claude doesn't have delete access there).
   - Claude then deletes the matching tags: `git push origin :refs/tags/vX.Y.Z-rc.N && git tag -d vX.Y.Z-rc.N` for each.
   - Order matters: release before tag, same as the mid-cycle cleanup above, to avoid orphaned drafts.

---

## Important Notes

- **RC tags never notify stable users** — the update checker ignores any version with a pre-release suffix (rc, beta, alpha).
- **Never push to `main` for an RC build** — RC tags live on `develop`.
- **Never commit directly to `main` or `develop`** — always via a branch merge.
- **Push order for formal releases:** `main` push first to verify CI, then the tag — avoids accumulating failed release job runs.
- **Orphaned drafts:** If a release job misfires, delete the GitHub release before deleting the tag — otherwise orphaned drafts persist.
- **BOM-free writes:** Always use `[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))` when writing files via PowerShell — never `Out-File -Encoding utf8`.
- **`.blockmap` files are required, not cleanup candidates.** They're `electron-updater`'s differential-update data — without them, an update falls back to a full re-download for that version's upgrade path instead of a smaller delta.
- **`STAGED_CHANGES.md`** accumulates entries per branch on `develop` only. It's deleted from `main` at every formal release (step 2) since its content is redundant with `RELEASE_NOTES_1.7.X.md` once shipped, then recreated empty on `develop` (step 8) for the next cycle.
