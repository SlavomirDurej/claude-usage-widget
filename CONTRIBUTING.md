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
- Minimize tucks away (taskbar/tray icon stays visible as the way back in, unless "Hide from taskbar" is on)
- Close (X, Alt+F4, or "Close window") fully quits the app
- Right-click tray icon shows menu, "Exit" fully quits
- System tray usage indicators (dual icons on Windows)
- Taskbar usage icon (Windows, opt-in — split session/weekly panels on the taskbar icon)
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

### Test Taskbar Icon (Windows)
Opt-in feature (Settings → "Show taskbar stats", off by default). Single icon on the main window's own taskbar button (`mainWindow.setIcon()`) — no second window, no separate AppUserModelID. Split into left (session) and right (weekly) panels with a divider between them.

Force specific percentages for testing via `generateTaskbarIcon(sessionPercent, weeklyPercent, warnThreshold, dangerThreshold)`, same threshold-color/99%-X-glyph logic as the tray icons, drawn at full 128px so both panels stay legible after Windows downscales to real taskbar size.

Known gotchas if you're working in this area:
- Drawn at 128x128 deliberately — a tray-sized (20px) icon upscaled to taskbar size would be blurry; drawing large and letting Windows downscale keeps both panels legible across DPI settings.
- If Windows taskbar icons look stuck, wrong-sized, or a test window won't behave, a stale Explorer process from a prior bad state is a common cause — Task Manager → Windows Explorer → Restart before concluding it's a code bug.
- See the "Windows Taskbar/AppUserModelID Icon Corruption (general)" note further down if an icon refuses to update no matter what the code does.

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
- [ ] Taskbar icon displays properly (Windows, if enabled)
- [ ] Close (X/Alt+F4) fully quits; minimize keeps a tray/taskbar icon as the way back in
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

### Windows Taskbar/AppUserModelID Icon Corruption (general)
Not specific to any current feature — this can affect `mainWindow`'s own taskbar icon, since it carries an AUMID (`app.setAppUserModelId()`) regardless of any per-feature icon drawing.

- If icons look visually stuck or wrong-sized, restart Explorer before assuming it's a code issue.
- If a taskbar icon refuses to update no matter what the code does — `setIcon()` completes without throwing, but the taskbar button shows a stale or generic default icon regardless — and a reboot, `ie4uinit -ClearIconCache`, and Explorer restart *all* fail to fix it, the cause is likely stale Windows Shell state cached against that window's AppUserModelID specifically (Jump List "Automatic Destinations" data persists separately from the general icon cache and doesn't get cleared by any of the above). Confirm and fix in one step with `--reset-aumid` (see README's "Recovering a Stuck Taskbar Icon" section) — it saves a fresh, never-before-seen AUMID for the target profile; if the icon comes back clean on the next launch, that confirms the cause.
- **Confirmed working against a real corrupted install** (Aug 2026): a default-profile install stuck showing Windows' generic fallback icon — not just visually wrong-sized, but unresolvable — was fixed by `--reset-aumid` followed by a normal relaunch. Root cause of *why* an identity's Shell state gets into this state is still not confirmed (see caveat below), but the reset itself is now a proven fix for the symptom, not just a diagnostic theory.
- **Caveat, still open:** the app previously shipped a fix based on this theory (scoping the AUMID per `--profile`, and guarding a periodic `setAlwaysOnTop()` interval that was hammering the icon ~720x/hour). The same symptom recurred on a long-running profile with that fix in place, so what triggers the corruption in the first place is still not confirmed — only that resetting the identity resolves it once it's happened. Don't assume a specific trigger (the interval, taskbar-stats refreshes, uptime, etc.) without fresh evidence; `--reset-aumid` is the reliable fix regardless of which trigger turns out to be responsible.
- **Worth watching, not a new risk:** `mainWindow`'s AUMID was never removed — it's baseline app identity (Jump Lists, taskbar grouping), unrelated to any taskbar-stats feature and present whether or not taskbar stats are on. What *is* new is the taskbar-stats feature calling `mainWindow.setIcon()` on every usage refresh (default every 5 minutes) via `updateTaskbarIcon()` — far less frequent than the ~720x/hour interval that was hammering it before, and without the extra per-window AUMID (`win.setAppDetails()`) the two-window version added for its second window. If taskbar-icon corruption is reported again, check whether it correlates with taskbar stats being enabled before assuming it's unrelated — but don't conflate this with "AUMID usage was reintroduced," since it never left.

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
