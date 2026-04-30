# Claude Usage Widget v1.7.3

This release focuses on performance optimization, UI polish, and preventing accidental app hiding.

## What's New

### API Call Optimization & Memory Efficiency
**Single-Window Reuse**: Refactored API fetching to reuse a single BrowserWindow across sequential requests instead of creating/destroying three separate windows per poll cycle. This reduces memory overhead and improves stability during automated refresh cycles.

**Conditional Polling**: Extended usage data (overage costs, prepaid balance) is now fetched only when the expand panel is visible. When the panel is collapsed, only the primary usage endpoint is called, reducing API traffic by ~66% during typical usage. Opening the expand panel triggers an immediate fetch of the additional data.

### Currency Formatting Enhancement
All currency values now display with two decimal places (e.g., $2.00 instead of $2) for consistency with financial reporting standards and improved readability.

### Tray Icon Click Behavior (Windows)
Fixed tray icon click behavior on Windows where clicking the weekly usage tray icon would flash the window instead of properly showing it. The fix uses opacity masking to hide the DWM compositor blink during window restoration, ensuring smooth transitions when bringing the window to the foreground.

## Bug Fixes

### Prevent Accidental App Hiding
Implemented bidirectional toggle coupling between "Hide from Taskbar" and "Show Tray Stats" settings to prevent users from accidentally hiding the app completely:
- Enabling "Hide from Taskbar" automatically enables "Show Tray Stats" (ensures tray icon visibility)
- Disabling "Show Tray Stats" automatically disables "Hide from Taskbar" (prevents app from becoming inaccessible)

Changes take effect immediately in the Settings UI, providing clear visual feedback when toggles are coupled.

---

**Full Changelog**: [v1.7.2...v1.7.3](https://github.com/SlavomirDurej/claude-usage-widget/compare/v1.7.2...v1.7.3)
