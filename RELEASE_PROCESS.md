# Release Process

## Pre-Release Testing (Staging)

1. **Create a release candidate tag:**
   ```bash
   git tag v1.7.1-rc.1
   git push origin v1.7.1-rc.1
   ```

2. **GitHub Actions will build all platforms** automatically

3. **Mark the GitHub Release as "Pre-release":**
   - Go to the release on GitHub
   - Check "This is a pre-release" checkbox
   - This prevents user notifications

4. **Test the builds:**
   - Download and test Windows, macOS, Linux builds
   - Verify code signing on macOS
   - Check for runtime errors

5. **If issues found:**
   - Fix locally
   - Delete the pre-release tag: `git tag -d v1.7.1-rc.1 && git push origin :refs/tags/v1.7.1-rc.1`
   - Delete the GitHub Release
   - Increment RC number: `v1.7.1-rc.2`
   - Repeat from step 1

## Final Release

1. **Only after all RC builds pass testing:**
   ```bash
   git tag v1.7.1
   git push origin v1.7.1
   ```

2. **Create the final GitHub Release:**
   - **DO NOT** check "This is a pre-release"
   - Paste release notes from CHANGELOG.md
   - Users will be notified of this version only

## Important Notes

- **Pre-release tags do not notify users** if marked as pre-release on GitHub
- **Final tags notify all users** watching the repo
- **Never delete and re-push final tags** — use RC tags for testing
- **Always test locally** with `npm start` before pushing any tags
