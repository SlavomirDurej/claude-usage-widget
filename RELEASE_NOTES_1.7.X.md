# Claude Usage Widget v1.7.X Release History

This document consolidates all release notes for the 1.7.x release series.

---

## v1.7.3

**Released:** April 30, 2026

This release focuses on performance optimization, UI polish, and preventing accidental app hiding.

### What's New

**API Call Optimization & Memory Efficiency**

**Single-Window Reuse**: Refactored API fetching to reuse a single BrowserWindow across sequential requests instead of creating/destroying three separate windows per poll cycle. This reduces memory overhead and improves stability during automated refresh cycles.

**Conditional Polling**: Extended usage data (overage costs, prepaid balance) is now fetched only when the expand panel is visible. When the panel is collapsed, only the primary usage endpoint is called, reducing API traffic by ~66% during typical usage. Opening the expand panel triggers an immediate fetch of the additional data.

**Currency Formatting Enhancement**: All currency values now display with two decimal places (e.g., $2.00 instead of $2) for consistency with financial reporting standards and improved readability.

**Tray Icon Click Behavior (Windows)**: Fixed tray icon click behavior on Windows where clicking the weekly usage tray icon would flash the window instead of properly showing it. The fix uses opacity masking to hide the DWM compositor blink during window restoration, ensuring smooth transitions when bringing the window to the foreground.

### Bug Fixes

**Prevent Accidental App Hiding**: Implemented bidirectional toggle coupling between "Hide from Taskbar" and "Show Tray Stats" settings to prevent users from accidentally hiding the app completely:
- Enabling "Hide from Taskbar" automatically enables "Show Tray Stats" (ensures tray icon visibility)
- Disabling "Show Tray Stats" automatically disables "Hide from Taskbar" (prevents app from becoming inaccessible)

Changes take effect immediately in the Settings UI, providing clear visual feedback when toggles are coupled.

**Expand Panel Immediate Polling**: Fixed issue where expanding the Extra Usage panel would show blank data until the next polling cycle. The panel now fetches extended data immediately when opened and preserves existing data while waiting for the fetch to complete.

---

## v1.7.2

**Released:** March 2026

This release brings multi-organization support, real-time system tray indicators, enhanced security, and improved platform documentation.

### What's New

**Multi-Organization Support**: Users with both Personal and Teams Claude accounts can now select which organization to monitor directly from Settings. The organization selector appears automatically when multiple chat-enabled organizations are detected, defaulting to Teams when available. Switching organizations triggers an immediate refresh of usage data.

**System Tray Usage Indicators**: Two compact tray icons provide at-a-glance monitoring of your Claude usage without opening the widget. The left icon (blue) displays Weekly usage; the right icon (purple) shows Session usage. Each icon renders percentage values using a crisp 8×11 bitmap font optimized for legibility at system tray scale. When usage reaches 99-100%—the realistic threshold where Claude API requests begin to fail—icons automatically switch to a red X indicator. Currently available on Windows; macOS and Linux support is planned for a future release.

**Enhanced Login Security**: Login flow now enforces strict navigation controls, restricting the login window to trusted authentication domains only (claude.ai, Google, Apple, Microsoft OAuth providers). Popup windows are blocked, and the current URL is displayed in the window title bar for full transparency. These measures prevent phishing attacks and login flow hijacking attempts.

**Expanded Platform Documentation**: Linux users now have access to comprehensive setup instructions for creating application launchers and configuring auto-start behavior, contributed by community member [@sergkuzn](https://github.com/sergkuzn).

### Bug Fixes

**Semantic Versioning Compliance**: Corrected update checker logic to properly handle pre-release version comparisons. The checker previously treated stable versions (e.g., 1.7.1) as newer than pre-release candidates (e.g., 1.7.2-rc.1), causing incorrect update notifications. Version comparison now strictly follows semantic versioning standards.

---

## v1.7.1

**Released:** March 2026

### Bug Fixes

Security and stability improvements.

---

## v1.7.0

**Released:** March 15, 2026

### New Features

**Currency Support**: Extra usage row now displays the correct currency symbol (€, £, $) based on the user's account billing currency. Falls back to the ISO code for any currency without a mapped symbol (e.g. 42 CHF).

**Usage History Graph** (contributed by cwil2072): A toggleable line graph showing up to 7 days of session and weekly usage history. Snapshots are persisted in local storage so history survives app restarts. Session and Weekly lines are always shown; Sonnet and Extra Usage lines appear only when those sections are visible. The graph button highlights purple when active. Graph tooltip shows exact timestamp and value on hover.

### Improvements

**Refresh Icon Animation**: The refresh button now spins during both manual and automatic background refreshes, giving a clear visual indication the app is updating.

**Always Show Widget When Logged In**: The widget now always displays session and weekly rows after login, showing 0% and "Not started" when no active session exists — consistent with Claude's own usage UI.

**macOS Window Width**: Increased widget width from 530px to 560px to prevent the "Resets At" date/time column from clipping on macOS due to higher-DPI font rendering.

### Bug Fixes

**macOS Minimize/Restore** (contributed by cwil2072): Fixed minimize button and Dock restore behavior on macOS. The widget now minimizes to the Dock (instead of vanishing) and reliably returns when the Dock icon is clicked. Windows behavior unchanged — minimize still hides to tray.

**Alert Crash Fix**: Fixed missing Notification import in main.js that caused an uncaught ReferenceError and app crash whenever a usage alert fired (e.g. at 90% threshold).

**Weekly Limit Always Visible**: Fixed a bug where the widget would show "No Usage Yet" between session windows even when weekly usage data was present.

---

**For older releases (v1.6.x and earlier), see:** https://github.com/SlavomirDurej/claude-usage-widget/releases
