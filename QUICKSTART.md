# Quick Start Guide

Get up and running with Claude Usage Widget in under 2 minutes.

## Step 1: Download

Go to [Releases](https://github.com/SlavomirDurej/claude-usage-widget/releases) and download the latest version for your platform:

- **Windows:** `Claude-Usage-Widget-{version}-win-Setup.exe`
- **macOS:** `Claude-Usage-Widget-{version}-macOS-arm64.dmg` (Apple Silicon) or `-x64.dmg` (Intel)
- **Linux:** `Claude-Usage-Widget-{version}-linux-x86_64.AppImage`

## Step 2: Install

### Windows
1. Run the downloaded `.exe` installer
2. Follow the installation wizard
3. Launch from Start Menu

**Or use the portable version** (no installation):
Download `Claude-Usage-Widget-{version}-win-portable.exe` and run it directly.

### macOS
1. Open the `.dmg` file
2. Drag the app to your Applications folder
3. Launch from Applications

**Note:** The app is signed and notarized. If you see a warning, run:
```bash
xattr -cr /Applications/Claude\ Usage\ Widget.app
```

### Linux
1. Make the AppImage executable:
   ```bash
   chmod +x Claude-Usage-Widget-*.AppImage
   ```
2. Run it:
   ```bash
   ./Claude-Usage-Widget-*.AppImage
   ```

**Ubuntu 22.04+:** If it doesn't run, install libfuse2 first:
```bash
sudo apt install libfuse2
```

## Step 3: Login

1. **Launch the widget** - A small window appears
2. **Click "Login to Claude"** - Your browser opens
3. **Sign in** - Use your normal Claude.ai credentials
4. **Done!** - The widget automatically captures your session and displays usage

## What You'll See

After logging in, the widget shows:

- **Session Usage** - Your current 5-hour window progress (resets when you reach the limit or after 5 hours)
- **Weekly Usage** - Your 7-day rolling limit
- **Countdown Timers** - When each limit resets
- **System Tray Icons** (Windows) - Two small icons showing real-time usage percentages

## Daily Use

**Opening the widget:**
- Click the tray icon (Windows/Linux)
- Click the Dock icon (macOS)

**Refreshing data:**
- Auto-refreshes every 5 minutes
- Click the refresh button (🔄) for manual update

**Minimizing:**
- Click the minimize button (−)
- Widget hides to tray/dock

**Settings:**
- Click the gear icon (⚙️) to customize:
  - Warning thresholds (when bars turn orange/red)
  - Time/date format (12h vs 24h)
  - Theme (light/dark)
  - Auto-refresh interval
  - Organization (if you have Teams + Personal accounts)

## System Tray Icons (Windows)

Two small icons in your system tray show usage at a glance:

- **Left (blue):** Weekly usage percentage
- **Right (purple):** Session usage percentage
- **Red X:** Appears when usage reaches 99-100%

Hover over icons to see exact percentages.

## Logging Out

Right-click the tray icon → "Log Out" to clear your session.

## Need Help?

- **Installation issues:** See [INSTALL.md](INSTALL.md) for detailed platform-specific guides
- **Feature questions:** Check the [README](README.md)
- **Problems:** Open a [Support Discussion](https://github.com/SlavomirDurej/claude-usage-widget/discussions/categories/support)

---

**That's it!** You're now tracking your Claude usage. 🎉
