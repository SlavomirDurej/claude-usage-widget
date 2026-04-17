# Installation Instructions

## For End Users

### Windows

**Option 1: Installer (Recommended)**
1. Download the latest `Claude-Usage-Widget-{version}-win-Setup.exe` from [Releases](https://github.com/SlavomirDurej/claude-usage-widget/releases)
2. Run the installer
3. Launch "Claude Usage Widget" from the Start Menu
4. Login when prompted

**Option 2: Portable (No Installation)**
1. Download the latest `Claude-Usage-Widget-{version}-win-portable.exe` from [Releases](https://github.com/SlavomirDurej/claude-usage-widget/releases)
2. Run the portable exe directly
3. No installation needed - runs from wherever you place it

**What Gets Installed (Installer Only):**
- Executable: `%LOCALAPPDATA%\Programs\claude-usage-widget\`
- Settings: `%APPDATA%\claude-usage-widget\` (encrypted)
- Start Menu shortcut
- Desktop shortcut (optional)

---

### macOS

**Installation Steps:**
1. Download the latest DMG for your Mac:
   - Apple Silicon (M1/M2/M3): `Claude-Usage-Widget-{version}-macOS-arm64.dmg`
   - Intel Mac: `Claude-Usage-Widget-{version}-macOS-x64.dmg`
   - Available from [Releases](https://github.com/SlavomirDurej/claude-usage-widget/releases)
2. Open the DMG file
3. Drag "Claude Usage Widget" to your Applications folder
4. Launch from Applications

**macOS Security Notice:**

The app is now signed and notarized with Apple Developer ID, so it should open without warnings on macOS 10.15+.

If you encounter "damaged or can't be opened" warnings (rare), run this in Terminal:
```bash
xattr -cr /Applications/Claude\ Usage\ Widget.app
```
Then launch the app again.

**What Gets Installed:**
- Application: `/Applications/Claude Usage Widget.app`
- Settings: `~/Library/Application Support/claude-usage-widget/` (encrypted)

---

### Linux

**Installation Steps:**
1. Download the latest AppImage for your architecture:
   - Intel/AMD (64-bit): `Claude-Usage-Widget-{version}-linux-x86_64.AppImage`
   - ARM (64-bit): `Claude-Usage-Widget-{version}-linux-arm64.AppImage`
   - Available from [Releases](https://github.com/SlavomirDurej/claude-usage-widget/releases)
2. Make it executable:
   ```bash
   chmod +x Claude-Usage-Widget-*.AppImage
   ```
3. Run it:
   ```bash
   ./Claude-Usage-Widget-*.AppImage
   ```

**Ubuntu 22.04+ Dependency:**

If the AppImage doesn't run, install libfuse2:
```bash
sudo apt install libfuse2
```

**Optional: Desktop Launcher & Autostart**

For desktop integration (application menu icon, auto-start on login), see the detailed guide in the [Linux Setup Section](#linux-desktop-launcher--autostart-optional) below.

**What Gets Created:**
- Settings: `~/.config/claude-usage-widget/` (encrypted)
- Desktop launcher (if configured): `~/.local/share/applications/claude-usage-widget.desktop`
- Autostart entry (if configured): `~/.config/autostart/claude-usage-widget.desktop`

---

## First Time Setup (All Platforms)

1. **Launch the widget** - A frameless window appears
2. **Click "Login to Claude"** - Browser window opens
3. **Login to Claude.ai** - Use your normal credentials
4. **Widget activates** - Usage data appears automatically
5. **Minimize to tray** - Click the minus icon (Windows/Linux) or minimize button (macOS)

---

## System Requirements

**All Platforms:**
- RAM: 200 MB
- Disk: 100 MB
- Internet: Required for Claude.ai API

**Platform-Specific:**
- **Windows:** Windows 10 or later (64-bit)
- **macOS:** macOS 10.15 Catalina or later
- **Linux:** Any modern distribution with AppImage support

---

## Linux: Desktop Launcher & Autostart (Optional)

*Contributed by [@sergkuzn](https://github.com/sergkuzn)*

This section shows how to integrate the AppImage into your Linux desktop environment with an application menu icon and auto-start on login.

### Step 1: Place the AppImage

Move the AppImage to a permanent location:
```bash
mkdir -p ~/.local/bin
mv Claude-Usage-Widget-*.AppImage ~/.local/bin/claude-usage-widget.AppImage
```

### Step 2: Create Desktop Launcher

Create `~/.local/share/applications/claude-usage-widget.desktop`:
```ini
[Desktop Entry]
Name=Claude Usage Widget
Comment=Monitor Claude.ai usage
Exec=/home/YOUR_USERNAME/.local/bin/claude-usage-widget.AppImage
Icon=/home/YOUR_USERNAME/.local/share/icons/claude-usage-widget.png
Terminal=false
Type=Application
Categories=Utility;
```

**Important:** Replace `YOUR_USERNAME` with your actual username.

### Step 3: Add an Icon (Optional)

Download an icon and place it at:
```bash
mkdir -p ~/.local/share/icons
# Place your icon file as:
# ~/.local/share/icons/claude-usage-widget.png
```

The icon will appear in your application menu.

### Step 4: Enable Autostart (Optional)

Create `~/.config/autostart/claude-usage-widget.desktop`:
```bash
mkdir -p ~/.config/autostart
cp ~/.local/share/applications/claude-usage-widget.desktop ~/.config/autostart/
```

The widget will now launch automatically when you log in.

**Desktop Environment Notes:**
- **GNOME:** Icon may not appear in app grid immediately - log out/in to refresh
- **KDE Plasma:** Should appear instantly in application launcher
- **XFCE:** Icon appears in Whisker Menu after refresh

---

## Build from Source (All Platforms)

**Prerequisites:**
- Node.js 18+ ([Download](https://nodejs.org))
- npm (comes with Node.js)

**Build Steps:**
```bash
git clone https://github.com/SlavomirDurej/claude-usage-widget.git
cd claude-usage-widget
npm install
npm start
```

**Platform-Specific Builds:**
```bash
npm run build:win    # Windows installer + portable
npm run build:mac    # macOS DMG (requires macOS)
npm run build:linux  # Linux AppImage
```

---

## Uninstallation

### Windows (Installer)
- Use "Add or Remove Programs" in Windows Settings
- Or run the uninstaller from the Start Menu folder

### Windows (Portable)
- Simply delete the executable

### macOS
- Drag "Claude Usage Widget" from Applications to Trash
- Optionally delete settings: `~/Library/Application Support/claude-usage-widget/`

### Linux
- Delete the AppImage file
- Optionally delete settings: `~/.config/claude-usage-widget/`
- Remove desktop launcher: `rm ~/.local/share/applications/claude-usage-widget.desktop`
- Remove autostart entry: `rm ~/.config/autostart/claude-usage-widget.desktop`

---

## Troubleshooting

**"Login Required" keeps appearing**  
Session may have expired. Click "Login to Claude" to re-authenticate.

**Widget not updating**  
Check internet connection, click refresh manually, or try re-logging in from the tray menu.

**Build errors**  
Clean reinstall resolves most issues:
```bash
rm -rf node_modules package-lock.json
npm install
```

**macOS: App won't open after update**  
Run: `xattr -cr /Applications/Claude\ Usage\ Widget.app`

**Linux: AppImage won't run**  
Install libfuse2: `sudo apt install libfuse2`

If issues persist, open a [Support Discussion](https://github.com/SlavomirDurej/claude-usage-widget/discussions/categories/support) with your OS, Node.js version, and full error output.
