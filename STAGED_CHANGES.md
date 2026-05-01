# Staged Changes (Local Only)

Changes accumulating here are waiting to be merged into `develop`.
This file is gitignored — it never gets pushed to the remote repo.

---

## Branches Staged

| Branch | Description |
|--------|-------------|
| `fix/weekly-tray-click-duplicate` | Tray icon restore fixes |

---

## Changes

### fix/weekly-tray-click-duplicate

**Tray icon — duplicate click handler removed**
The `weeklyTray` click handler was registered twice in `createTray()`. When the
window was hidden and the weekly tray icon was clicked, both handlers fired in
sequence: the first restored the window, the second immediately hid it again,
causing the window to blink on screen and disappear.
Fix: removed the duplicate handler.

**Tray icon — double-blink on restore fixed (Windows)**
On Windows, showing a hidden transparent + frameless + alwaysOnTop window caused
two visible render flashes before the window settled. This is a Windows DWM
layered-window artifact: the compositor does an initial render pass, then a second
pass when Electron re-asserts the alwaysOnTop z-order.
Fix: added `showMainWindowClean()` helper that sets opacity to 0, calls `show()`,
then restores opacity to 1 after ~50ms once the DWM has composited the window.
Applies to Windows only (`process.platform === 'win32'`). macOS and Linux are
unaffected and continue to use a plain `show()` call.
Applied to both tray click handlers and the "Show Widget" context menu item.

---

*Add new entries above this line as additional branches are staged.*
