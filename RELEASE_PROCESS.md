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

1. **Tag `develop` directly:**
   ```
   git checkout develop
   git tag -a vX.Y.Z-rc.N -m "vX.Y.Z-rc.N - RC build for <feature description>"
   git push origin vX.Y.Z-rc.N
   ```

2. **Verify CI triggers** on all three platform workflows from the tag push.

3. **GitHub will create a pre-release** — confirm it is marked `prerelease: true` and `draft: false`.

4. **Test the builds** — download and test Windows (installer + portable), macOS, Linux.

5. **If issues found:**
   - Fix on a new branch off `develop`, merge back to `develop`
   - Delete the GitHub release first (UI)
   - Delete the tag: `git push origin :refs/tags/vX.Y.Z-rc.N && git tag -d vX.Y.Z-rc.N`
   - Increment RC number and repeat from step 1

6. **`main` is never touched during this process.**

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

6. **After release, bump `develop` to next dev version:**
   ```
   git checkout develop
   # Update package.json version to X.Y.(Z+1)-dev
   git add package.json
   git commit -m "chore: mark develop as X.Y.(Z+1)-dev"
   git push origin develop
   ```

---

## Important Notes

- **RC tags never notify stable users** — the update checker ignores any version with a pre-release suffix (rc, beta, alpha).
- **Never push to `main` for an RC build** — RC tags live on `develop`.
- **Never commit directly to `main` or `develop`** — always via a branch merge.
- **Push order for formal releases:** `main` push first to verify CI, then the tag — avoids accumulating failed release job runs.
- **Orphaned drafts:** If a release job misfires, delete the GitHub release before deleting the tag — otherwise orphaned drafts persist.
- **BOM-free writes:** Always use `[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))` when writing files via PowerShell — never `Out-File -Encoding utf8`.
- **`STAGED_CHANGES.md`** accumulates entries per branch. Clear it after each formal release.
