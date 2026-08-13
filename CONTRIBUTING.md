# Contributing to Claude Usage Widget

Thank you for your interest in contributing! This guide will help you set up your development environment and understand the codebase.

## Development Setup

### Prerequisites
- Node.js 18+ ([Download](https://nodejs.org))
- npm (comes with Node.js)
- Git

### Getting Started

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-usage-widget.git
   cd claude-usage-widget
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm start
   ```
   This will:
   - Launch the widget with DevTools open
   - Enable hot-reload for debugging
   - Show console logs in terminal

### First Run Testing

1. Widget appears (frameless window)
2. Click "Login to Claude"
3. Browser window opens to claude.ai
4. Login with your credentials
5. Widget automatically captures session
6. Usage data displays

**Features to test:**
- Drag widget around screen
- Refresh button updates data
- Minimize to system tray (Windows/Linux) or Dock (macOS)
- Right-click tray icon shows menu
- System tray usage indicators (dual icons on Windows)
- Progress bars animate smoothly
- Timers count down correctly
- Organization selector (if you have Teams + Personal)
- Settings panel (thresholds, time format, theme)

## Project Structure

```
claude-usage-widget/
├── main.js                      # Electron main process
├── preload.js                   # IPC bridge (secure context)
├── package.json                 # Dependencies & build config
├── src/
│   ├── fetch-via-window.js      # Login flow handler
│   └── renderer/
│       ├── index.html           # Widget UI
│       ├── app.js               # Frontend logic
│       └── chart-setup.js       # Chart.js configuration
├── assets/
│   ├── icon.ico                 # Windows app icon
│   ├── icon.icns                # macOS app icon
│   ├── icon.png                 # Linux app icon
│   ├── tray-icon.png            # Windows/Linux tray icon
│   └── tray-icon-mac.png        # macOS tray icon (template)
└── .github/
    └── workflows/
        └── build.yml            # Automated builds
```

## Building

**Platform-specific builds:**
```bash
npm run build:win    # Windows installer + portable exe
npm run build:mac    # macOS DMG (requires macOS, signed builds need Apple Developer ID)
npm run build:linux  # Linux AppImage
npm run build        # All platforms (cross-compile where possible)
```

**Output locations:**
- Windows: `dist/Claude-Usage-Widget-{version}-win-Setup.exe` & `-portable.exe`
- macOS: `dist/Claude-Usage-Widget-{version}-macOS-{arch}.dmg`
- Linux: `dist/Claude-Usage-Widget-{version}-linux-{arch}.AppImage`

## Development Tips

### Enable/Disable DevTools
DevTools auto-open in development. To disable, edit `main.js`:
```javascript
if (process.env.NODE_ENV === 'development') {
  // Comment out this line:
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
}
```

### Debug Authentication
Check terminal console for:
- Cookie capture events
- Organization ID extraction
- API responses
- Session key validation

### Test Organization Selector
The org selector only appears if you have multiple Claude organizations (Personal + Teams). To test:
1. Log in with a Teams account that also has Personal access
2. Open Settings (⚙️)
3. Organization dropdown should appear

### Test Tray Icons (Windows)
Tray stats feature shows dual icons with usage percentages:
- Left icon (blue): Weekly usage
- Right icon (purple): Session usage
- Red X appears at 99-100% usage

Force specific percentages in `main.js` for testing:
```javascript
const weeklyIcon = generatePercentageIcon(99, weeklyColor); // Test Red X
```

### Mock API Response
For testing UI without live API calls, add to `fetchUsageData()` in `app.js`:
```javascript
const mockData = {
  five_hour: { utilization: 45.5, resets_at: "2025-12-13T20:00:00Z" },
  seven_day: { utilization: 78.2, resets_at: "2025-12-17T07:00:00Z" },
  seven_day_sonnet: { utilization: 12.5, resets_at: "2025-12-17T07:00:00Z" },
  extra_usage: { utilization: 5.0, max_messages: 1000, used_messages: 50 }
};
updateUI(mockData);
return;
```

### Change Update Frequency
Edit `app.js` (default: 5 minutes):
```javascript
const UPDATE_INTERVAL = 1 * 60 * 1000; // 1 minute for testing
```

## Code Style

- Use `const` and `let`, avoid `var`
- Semicolons required
- 2-space indentation
- Descriptive variable names
- Comments for non-obvious logic
- Error handling with try/catch

## Adding Features

### Example: Add a notification alert
```javascript
// In app.js, inside updateUI():
if (weeklyUtilization >= 90 && !alertShown) {
  new Notification('Claude Usage Alert', {
    body: `You're at ${Math.round(weeklyUtilization)}% of weekly limit!`
  });
  alertShown = true;
}
```

### Example: Add a keyboard shortcut
```javascript
// In main.js:
const { globalShortcut } = require('electron');

app.whenReady().then(() => {
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
});
```

## Testing

### Manual Testing Checklist
- [ ] Clean install on target OS
- [ ] Login flow works
- [ ] Data refreshes correctly
- [ ] Tray icons display properly
- [ ] Settings persist across restarts
- [ ] Logout clears session
- [ ] Auto-update check works
- [ ] Window position/size persists
- [ ] Compact mode works
- [ ] Usage graph displays
- [ ] Organization switching (if applicable)

### Platform-Specific Testing
- **Windows:** Test on Windows 10 and 11
- **macOS:** Test on Intel and Apple Silicon
- **Linux:** Test AppImage on Ubuntu, Fedora, Arch

## Debugging

### Console Logs
- **Main process:** Terminal where you ran `npm start`
- **Renderer process:** DevTools console (automatically opens in dev mode)

### Network Requests
DevTools → Network tab shows all API calls to Claude.ai

### Electron Storage
Check stored data:
```javascript
// In DevTools console:
await window.electronAPI.getCredentials()
```

## Common Issues

### White Screen on Launch
Usually caused by:
- JavaScript errors in `app.js` (check DevTools console)
- Missing file paths
- CSS not loading

### Login Window Not Capturing Session
Check `main.js` → `did-finish-load` event handler:
1. URL should contain 'chat' or 'new'
2. sessionKey cookie must be present
3. Organization ID extraction may fail on new account types

### API Returns 401 Unauthorized
Session expired. Test re-login flow from tray menu.

### Tray Icons Not Updating
- Check `updateTrayIcons()` is called after data fetch
- Verify `generatePercentageIcon()` returns valid NativeImage
- Windows: Icon cache may need refresh (restart Explorer)

## Submitting Contributions

### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow code style guidelines
   - Test thoroughly on your platform
   - Update documentation if needed

3. **Commit with clear messages**
   ```bash
   git commit -m "feat: add keyboard shortcuts for show/hide"
   ```

4. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request**
   - Describe what your PR does
   - Reference any related issues
   - Include screenshots/videos if UI changes
   - List platforms tested

### Commit Message Convention
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `chore:` Maintenance tasks
- `refactor:` Code refactoring
- `test:` Adding tests

### What Gets Merged
We merge contributions via feature branches (not PRs directly). This means:
1. Your PR is reviewed and approved
2. Changes are incorporated into a feature branch with `Co-authored-by` credit
3. Feature branch is merged to `develop`
4. You're added to README Contributors section

This process ensures proper attribution while maintaining a clean git history.

## Release Process

For maintainers only. See `RELEASE_PROCESS.md` for details.

## Questions?

- Open a [Discussion](https://github.com/SlavomirDurej/claude-usage-widget/discussions)
- Check existing [Issues](https://github.com/SlavomirDurej/claude-usage-widget/issues)
- Review [Changelog](CHANGELOG.md) for recent changes

---

Thank you for contributing! 🚀
