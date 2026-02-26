# Claude Usage Widget

A beautiful, standalone Windows desktop widget that displays your Claude.ai usage statistics in real-time.

![Claude Usage Widget - Main](assets/screenshot-main.png)

## What's New

### Settings Panel
A full settings overlay with persistent preferences via `electron-store`.

![Claude Usage Widget - Settings](assets/screenshot-settings.png)

- ⚙️ **Launch at startup** — Auto-start with Windows
- 🖥️ **Always on top** — Now user-controlled (was hardcoded on)
- 📌 **Hide from taskbar** — Tray-only mode
- 🎨 **Theme selector** — Dark / Light / System
- ⚠️ **Warning thresholds** — Configurable amber and red levels for usage bars

### Improved Layout
- **5-column grid** with labeled headers: Session Used / Elapsed / Resets In / Resets At
- **Elapsed** column shows a circular timer of how far through the current window you are
- **Resets In** shows the countdown separately so it's not confused with elapsed time
- **Resets At** shows the actual local clock time (session) or date (weekly reset)
- **Fresh-user state** shows "Not started" instead of ambiguous dashes when no session is active

### Quality of Life
- 🔵 **Rounded corners** matching Windows 11 system window style
- 🖼️ **Tray icon** fixed to use the app logo instead of the default Electron robot icon

![Claude Usage Widget - Tray](assets/screenshot-tray.png)

---

## Features

- 🎯 **Real-time Usage Tracking** - Monitor both session and weekly usage limits
- 📊 **Visual Progress Bars** - Clean, gradient progress indicators
- ⏱️ **Countdown Timers** - Circular timers showing time until reset
- 🔄 **Auto-refresh** - Updates every 5 minutes automatically
- 🎨 **Modern UI** - Sleek, draggable widget with dark theme
- 🔒 **Secure** - Encrypted credential storage
- 📍 **Always on Top** - Stays visible across all workspaces
- 💾 **System Tray** - Minimizes to tray for easy access

## Installation

### Download Pre-built Release
1. Download the latest `Claude-Usage-Widget-Setup.exe` from [Releases](https://github.com/SlavomirDurej/claude-usage-widget/releases)
2. Run the installer
3. Launch "Claude Usage Widget" from Start Menu

### Build from Source

**Prerequisites:**
- Node.js 18+ ([Download](https://nodejs.org))
- npm (comes with Node.js)

**Steps:**

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-usage-widget.git
cd claude-usage-widget

# Install dependencies
npm install

# Run in development mode
npm start

# Build installer for Windows
npm run build:win
```

The installer will be created in the `dist/` folder.

## Usage

### First Launch

1. Launch the widget
2. Click "Login to Claude" when prompted
3. A browser window will open - login to your Claude.ai account
4. The widget will automatically capture your session
5. Usage data will start displaying immediately

### Widget Controls

- **Drag** - Click and drag the title bar to move the widget
- **Refresh** - Click the refresh icon to update data immediately
- **Minimize** - Click the minus icon to hide to system tray
- **Close** - Click the X to minimize to tray (doesn't exit)

### System Tray Menu

Right-click the tray icon for:
- Show/Hide widget
- Refresh usage data
- Re-login (if session expires)
- Settings (coming soon)
- Exit application

## Understanding the Display

### Current Session
- **Progress Bar** - Shows usage from 0-100%
- **Timer** - Time remaining until 5-hour session resets
- **Color Coding**:
  - Purple: Normal usage (0-74%)
  - Orange: High usage (75-89%)
  - Red: Critical usage (90-100%)

### Weekly Limit
- **Progress Bar** - Shows weekly usage from 0-100%
- **Timer** - Time remaining until weekly reset (Wednesdays 7:00 AM)
- **Same color coding** as session usage

## Configuration

### Auto-start on Windows Boot

1. Press `Win + R`
2. Type `shell:startup` and press Enter
3. Create a shortcut to the widget executable in this folder

### Custom Refresh Interval

Edit `src/renderer/app.js`:
```javascript
const UPDATE_INTERVAL = 5 * 60 * 1000; // Change to your preference (in milliseconds)
```

## Troubleshooting

### "Login Required" keeps appearing
- Your Claude.ai session may have expired
- Click "Login to Claude" to re-authenticate
- Check that you're logging into the correct account

### Widget not updating
- Check your internet connection
- Click the refresh button manually
- Ensure Claude.ai is accessible in your region
- Try re-logging in from the system tray menu

### Widget position not saving
- Window position is now saved automatically when you drag it
- Position will be restored when you restart the app

### Build errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Privacy & Security

- Your session credentials are stored **locally only** using encrypted storage
- No data is sent to any third-party servers
- The widget only communicates with Claude.ai official API
- Session cookies are stored using Electron's secure storage
- **Logout** completely removes the session key from encrypted storage, clears all Claude.ai cookies, and wipes Electron session storage (localStorage, sessionStorage, cacheStorage) so nothing lingers on shared machines

### Session Key Storage Details

The `sessionKey` (a bearer token for Claude.ai) is stored in two places:

| Location | Purpose | Cleared on logout? |
|---|---|---|
| `%APPDATA%/claude-usage-widget/config.json` (encrypted via `electron-store`) | Persists credentials between app restarts | Yes |
| Electron in-memory session cookie (`.claude.ai` domain, `secure`, `httpOnly`) | Used by hidden BrowserWindow for API requests | Yes |

The encryption key is embedded in the application. This protects against casual file inspection but not against a determined attacker with access to the source code. For shared machines, always log out when finished.

## Technical Details

**Built with:**
- Electron 28.0.0
- Pure JavaScript (no framework overhead)
- Native Node.js APIs
- electron-store for secure storage

**API Endpoint:**
```
https://claude.ai/api/organizations/{org_id}/usage
```

**Storage Location:**
```
%APPDATA%/claude-usage-widget/config.json (encrypted)
```

**Debug Mode:**

To enable verbose logging, run with the `--debug` flag or set the `DEBUG_LOG=1` environment variable:
```bash
# Via flag
electron . --debug

# Via env var
DEBUG_LOG=1 npm start
```

## Roadmap

- [ ] macOS support
- [ ] Linux support
- [x] Custom themes
- [x] Notification alerts at usage thresholds
- [x] Remember window position
- [x] Settings panel
- [ ] Usage history graphs
- [ ] Multiple account support
- [ ] Keyboard shortcuts

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use and modify as needed.

## Disclaimer

This is an unofficial tool and is not affiliated with or endorsed by Anthropic. Use at your own discretion.

## Support

If you encounter issues:
1. Check the [Issues](issues) page
2. Create a new issue with details about your problem
3. Include your OS version and any error messages

---

Made with ❤️ for the Claude.ai community
