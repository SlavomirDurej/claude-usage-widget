# Homebrew Cask Submission Guide

## What You Need

1. A released version on GitHub (you already have v1.7.1)
2. The SHA256 checksum of your DMG file
3. A GitHub account

## Step 1: Get SHA256 Checksum

Download your latest macOS release DMG and run:

```bash
shasum -a 256 Claude-Usage-Widget-1.7.1-macOS-arm64.dmg
```

This outputs something like:
```
a1b2c3d4e5f6... Claude-Usage-Widget-1.7.1-macOS-arm64.dmg
```

Copy that hash and update `claude-usage-widget.rb`, replacing `PLACEHOLDER_SHA256_ARM64` with the actual hash.

## Step 2: Test the Cask Locally (Optional)

```bash
# Install from local file
brew install --cask ./claude-usage-widget.rb

# Test it works
open "/Applications/Claude Usage Widget.app"

# Uninstall
brew uninstall --cask claude-usage-widget
```

## Step 3: Submit to Homebrew

### Fork the homebrew-cask repo

1. Go to https://github.com/Homebrew/homebrew-cask
2. Click "Fork" button (top right)
3. Wait for fork to complete

### Add your cask

```bash
# Clone YOUR fork
git clone https://github.com/Hackpig1974/homebrew-cask.git
cd homebrew-cask

# Create a new branch
git checkout -b claude-usage-widget

# Copy your cask file to the correct location
cp /path/to/claude-usage-widget.rb Casks/c/claude-usage-widget.rb

# Commit
git add Casks/c/claude-usage-widget.rb
git commit -m "Add claude-usage-widget 1.7.1"

# Push to your fork
git push origin claude-usage-widget
```

### Create Pull Request

1. Go to https://github.com/Hackpig1974/homebrew-cask
2. You'll see a banner: "claude-usage-widget had recent pushes"
3. Click "Compare & pull request"
4. Title: `claude-usage-widget 1.7.1 (new formula)`
5. Description: Just a one-liner like "Desktop widget for monitoring Claude.ai usage statistics"
6. Click "Create pull request"

### Wait for Review

- Homebrew bot will run automated tests
- A maintainer will review (usually within 24-48 hours)
- They may ask for minor changes
- Once approved, it merges automatically

## Step 4: After Merge

Users can install with:
```bash
brew install --cask claude-usage-widget
```

## Updating Later (Future Releases)

When you release v1.8.0:

1. Fork homebrew-cask again (or update your existing fork)
2. Edit `Casks/c/claude-usage-widget.rb`:
   - Update `version "1.8.0"`
   - Update sha256 with new DMG's hash
3. Submit PR with title: `claude-usage-widget 1.8.0`

## Notes

- **No attribution needed** — the cask just points to your GitHub releases
- **Donation buttons stay** — Homebrew doesn't inspect app contents
- **Auto-updates work** — livecheck automatically tracks new GitHub releases
- **Universal binaries** — if you later add universal binaries, update the URL to drop `-arm64`

## Troubleshooting

**"Cask not found"**
- Check file is in `Casks/c/` directory (alphabetical organization)
- File must be named exactly `claude-usage-widget.rb`

**"SHA256 mismatch"**
- Download the DMG again and recalculate the hash
- Make sure you're hashing the ARM64 build

**"URL not reachable"**
- Verify the GitHub release is public (not draft)
- Check the URL in a browser to confirm it downloads
