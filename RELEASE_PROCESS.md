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

5. **Test the builds** — download and test Windows (installer + portable), macOS, Linux.

6. **If issues found:**
   - Fix on a new branch off `develop`, merge back to `develop`
   - Delete the GitHub release first (UI)
   - Delete the tag: `git push origin :refs/tags/vX.Y.Z-rc.N && git tag -d vX.Y.Z-rc.N`
   - Increment RC number and repeat from step 2 (documentation review from step 1 doesn't need re-running unless the fix itself touched docs)

7. **`main` is never touched during this process.**

---

## Formal Release

Only after RC testing passes and enough changes have accumulated on `develop` to justify a release. Version number agreed upon before starting.

1. **Merge `develop` → `main` locally:**
   ```
   git checkout main
   git merge --no-ff develop -m "release: merge develop into main for vX.Y.Z"
   ```

2. **Bump version in `package.json`** to `X.Y.Z` (remove `-dev` suffix).

3. **Push `main` and verify CI passes** (no tag yet):
   ```
   git push origin main
   ```

4. **Once CI is green, create and push the annotated release tag:**
   ```
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

5. **Tag push triggers the three platform builds.** Monitor Actions.

6. **After release, bump `develop` to the next cycle's RC version:**
   ```
   git checkout develop
   git merge main --no-edit   # sync develop with main (fast-uri fixes, docs, etc.)
   # Update package.json version to X.Y.(Z+1)-rc.1 (no -dev placeholder — we cut straight to rc.1)
   git add package.json package-lock.json
   git commit -m "chore: start vX.Y.(Z+1)-rc.1 cycle on develop"
   git push origin develop
   ```

7. **Reset `STAGED_CHANGES.md`** back to its empty template now that its entries live permanently in `RELEASE_NOTES_1.7.X.md`.

8. **Clean up superseded RC releases and tags.** Claude should proactively remind you of this step at formal release time — don't wait to be asked:
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
- **`STAGED_CHANGES.md`** accumulates entries per branch. Clear it after each formal release.
