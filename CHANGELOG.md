# Changelog

All notable changes to Claude Usage Widget are documented here.
Newest releases at the top. Format inspired by [Keep a Changelog](https://keepachangelog.com).

---

## [Unreleased] — v1.8.0 (staged in `develop`)

### New Features
- Configurable auto-refresh interval — set polling frequency via settings (15s, 30s, 1min, 2min, 5min)
- Auto-refresh pauses when settings panel is open, resumes cleanly on Done
- Refresh button visible in compact mode with clockwise spin animation during refresh

### Enhancements
- Graph and expanded rows state persists across restarts — app reopens exactly as you left it
- Compact mode fully persists including graph/expanded state when toggling between modes

### Bug Fixes
- Settings save crash fixed — `refreshInterval` undefined was crashing electron-store on Done
- Compact mode no longer blows to full size on every data refresh
- Graph visibility correctly restored when exiting compact mode
- Settings overlay resize corrected to 288px
- Stop countdown timer on logout — prevents stale timers running after logout (code review Finding 2)
- Reset alert state on logout/relogin — new session no longer inherits suppressed alerts (code review Finding 4)
- In-flight fetch guard — overlapping refresh calls from manual, tray, timer, and reset triggers are now dropped rather than piling up (code review Finding 3)

### macOS
- Widget width 590px on macOS vs 560px on Windows/Linux — prevents date/time column clipping
- `NSHumanReadableCopyright` added to mac `extendInfo` for correct About dialog display

### Optimization
- Debounced window position writes on drag — reduces disk I/O churn
- Debounced compact mode and view state saves — eliminates lag during compact mode transition
- Settings panel layout consolidated into 2-column rows
- Dark mode disclaimer, dropdown option, and version label colors corrected

### Docs
- Updated screenshots for main view and settings panel

---

## [1.7.0-beta.2] — 2026-03-18 — Pre-release

Beta build for testing. Not intended for general use.

### Bug Fixes
- Stop countdown timer on logout — prevents stale timers running after session ends
- Reset alert state on logout/relogin — new session no longer inherits suppressed alerts
- In-flight fetch guard — overlapping refresh calls are now dropped rather than queued
- Settings save crash fixed — undefined `refreshInterval` no longer crashes electron-store on save

### macOS
- Widget width increased to 590px — prevents date/time column clipping
- `NSHumanReadableCopyright` corrected in About dialog

### Improvements
- Debounced window position writes on drag — reduces disk I/O
- Debounced compact mode and view state saves
- Settings panel layout consolidated into 2-column rows
- Dark mode colors corrected for disclaimer, dropdowns, and version label

### Build
- App version now correctly reflects beta tag in About dialog
- Pre-release flag set automatically based on tag name

---

## [1.7.0-beta] — 2026-03-18 — Pre-release

Beta build for testing. Not intended for general use.

### Included
- Configurable auto-refresh interval
- Refresh button visible in compact mode
- Auto-refresh pauses while settings is open
- Graph and expanded rows state persists across restarts
- Compact mode state fully persists
- Graph visibility fix when exiting compact mode
- Settings panel polish — consolidated layout, dark mode colors, correct version label

---

## [1.7.0] — 2026-03-15

### New Features
- **Usage History Graph** (contributed by cwil2072) — toggleable line graph showing up to 7 days
  of session and weekly usage history. Snapshots persisted locally so history survives restarts.
  Session and Weekly lines always shown; Sonnet and Extra Usage appear when those sections are visible.
  Graph button highlights purple when active. Tooltip shows exact timestamp and value on hover.
- **Currency support** — Extra Usage row now displays the correct currency symbol (€, £, $)
  based on the user's account billing currency. Falls back to ISO code for unmapped currencies.

### Improvements
- Refresh icon animation — refresh button now spins during both manual and automatic refreshes
- Always show widget when logged in — shows 0% and "Not started" when no active session exists
- macOS widget width increased from 530px to 560px to prevent date/time clipping on higher-DPI displays

### Bug Fixes
- macOS minimize/restore (contributed by cwil2072) — widget now minimizes to Dock and reliably
  restores when Dock icon is clicked. Windows behavior unchanged.
- Alert crash fix — missing `Notification` import in main.js caused uncaught ReferenceError
  and app crash whenever a usage alert fired
- Weekly limit always visible — fixed bug where widget showed "No Usage Yet" between session
  windows even when weekly usage data was present

---

## [1.6.0] — 2026-03-10

### New Features
- **Usage Alerts** — native OS desktop notifications when usage crosses configurable thresholds.
  Covers both Current Session and Weekly Limit. Smart startup seeding prevents surprise alerts
  on launch. Alerts reset automatically when a usage window resets. Enabled by default.
- **Compact Mode** — minimal view showing just the two progress bars.
  Collapse via ‹ chevron on left edge, expand via › chevron on right edge of compact view.
  Also toggleable from Settings panel. Mode persisted across restarts.

---

## [1.5.3] — 2026-03-09

### Improvements
- Improved update check frequency — now checks at startup, at each 5-hour session reset,
  and once every 24 hours as a background fallback. Previously only checked once at startup.

---

## [1.5.2] — 2026-03-09

### New Features
- **Linux support** — pre-built AppImage packages for x86_64 and arm64.
  No installation required. Compatible with most modern Linux distributions.

---

## [1.5.1] — 2026-03-07

### Improvements
- Extra Usage row now shows ON/OFF badge so users can see at a glance whether extra
  usage is enabled. Previously showed 0% with no explanation when disabled.

---

## [1.5.0] — 2026-03-07

### New Features
- **Update notifications** — widget checks for new releases at startup. Dismissible banner
  appears when a newer version is available. Current version shown in Settings panel.
- **Configurable date and time formats** — two new settings:
  - Time Format: 12h (3:59 PM) or 24h (15:59)
  - Date Format: Mar 13 / Fri Mar 13 / Fri Mar 13 + time

### Bug Fixes
- Fixed Extra Usage row alignment — now uses correct 5-column grid
- Update banner correctly expands/contracts widget height
- Settings panel height increased for new format options
- Extra Usage section spacing improved when expanded

---

## [1.4.0] — 2026-03-02

### New Features
- **macOS support** — native build with .icns icon, menu bar tray, Dock support,
  auto-start via Login Items, and DMG installer for arm64 and x64.
- **Settings panel** — launch at startup, always on top (now user-controlled), hide from
  taskbar, theme selector (Dark/Light/System), configurable warning thresholds.
- **Improved main widget layout** — 5-column grid with labeled headers. Elapsed column
  shows circular timer. Resets In shows countdown. Resets At shows local clock time.

### Improvements
- Rounded corners matching Windows 11 and macOS system window style
- Tray icon now uses app logo instead of default Electron robot icon
- Window position saved and restored automatically
- Fresh-user state shows "Not started" instead of ambiguous dashes

### Notes
- macOS users: if Gatekeeper shows "app is damaged", run `xattr -cr /Applications/Claude\ Usage\ Widget.app`
  This is a Gatekeeper issue, not file corruption. Notarization is on the roadmap.

---

## [1.3.0] — 2025-12-19

### New Features
- **Session auto-recovery** — when a session expires, the widget attempts silent reconnect
  via a hidden browser window using existing browser cookies. If successful within 15 seconds,
  the widget resumes without user interaction. Falls back to manual login if it fails.
- Auto-login status UI — shows spinner with status message during reconnect attempt.

---

## [1.2.0] — 2025-12-17

### New Features
- Window position remembered and restored on restart
- Clear messaging when usage data is unavailable

### Improvements
- New application icon
- Small UI refinements for smoother first-run experience
- More resilient handling of edge cases when fetching usage data

---

## [1.0.0] — 2025-12-15

Initial release.

### Features
- Real-time usage monitoring — current session (5-hour rolling window) and weekly (7-day) limit
- Visual progress bars with color-coded warnings (yellow at 75%, red at 90%)
- Live countdown timers — circular displays showing time until limit resets
- Auto-refresh every 5 minutes, auto-refresh when limits reset
- Always-on-top floating widget, minimize to system tray
- Draggable window positioning
- Clean dark theme, secure login via Claude.ai
- Settings panel with logout option and manual refresh button
- Windows 10+ support
