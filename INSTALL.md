# Installation Instructions

## For End Users

### Option 1: Download Installer (Recommended)

1. Download `Claude-Usage-Widget-Setup.exe` from releases
2. Run the installer
3. Launch from Start Menu
4. Login when prompted

### Option 2: Build from Source

```bash
# Install Node.js from https://nodejs.org (if not already installed)

# Clone or download this project
cd claude-usage-widget

# Install dependencies
npm install

# Run the widget
npm start

# Or build installer
npm run build:win
```

## First Time Setup

1. **Launch the widget** - A frameless window appears
2. **Click "Login to Claude"** - Browser window opens
3. **Login to Claude.ai** - Use your normal credentials
4. **Widget activates** - Usage data appears automatically
5. **Minimize to tray** - Click the minus icon

## System Requirements

- **OS:** Windows 10 or later (64-bit) / Mac OS 26.0 or Later
- **RAM:** 200 MB
- **Disk:** 100 MB
- **Internet:** Required for Claude.ai API

## What Gets Installed

- Executable: `%LOCALAPPDATA%\Programs\claude-usage-widget\`
- Settings: `%APPDATA%\claude-usage-widget\` (encrypted)
- Start Menu shortcut
- Desktop shortcut (optional)

## Uninstallation

**Windows:**

1. Settings → Apps → Claude Usage Widget → Uninstall
2. Or run `Uninstall Claude Usage Widget.exe` from install directory

**Manual cleanup:**

```
%APPDATA%\claude-usage-widget\
%LOCALAPPDATA%\Programs\claude-usage-widget\
```

## Troubleshooting Install Issues

### "Windows protected your PC"

1. Click "More info"
2. Click "Run anyway"
3. This is normal for unsigned apps

### Installer won't run

- Ensure you have admin rights
- Disable antivirus temporarily
- Download again (file may be corrupted)

### Can't find after install

- Check Start Menu → All Apps
- Search for "Claude Usage Widget"
- Check Desktop for shortcut

## Security Notes

✅ **Your data stays local** - credentials stored encrypted on your machine
✅ **Open source** - code is available for review
✅ **No telemetry** - no usage data sent anywhere
✅ **Direct API** - only communicates with claude.ai

---

For development setup, see [QUICKSTART.md](QUICKSTART.md)
For full documentation, see [README.md](README.md)
