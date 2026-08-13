# Staged Changes

Changes accumulating here have already been merged into `develop`.
We keep track of these changes/fixes/features and when we have enough for a new release we decide on the next version number.

This file is tracked in the repo and visible to everyone.

---

## Branches Staged

| Branch | Description |
|--------|-------------|
| `feature/taskbar-stats-dual-window` | Add per-percentage Windows taskbar icons (session + weekly), each as its own taskbar button; also overhauls close/minimize/exit behavior app-wide — see full writeup below |

---

## Changes

- **Day-Month date format options (Discussion #116):** @austempest reported the Weekly Resets column only offered US-style Month-Day formats (`Mar 13`), which doesn't match how most of the world writes dates. Added three parallel Day-Month options — `13 Mar`, `Fri 13 Mar`, `Fri 13 Mar + time` — as a second `optgroup` in the same dropdown, directly below the existing Month-Day group. `formatResetsAt()` gained matching `date-dmy` / `date-day-dmy` / `date-day-time-dmy` branches; no other logic changed since settings load/save already reads the dropdown value generically. Tested locally on Windows.

- **Taskbar stats — per-percentage session/weekly icons on the Windows taskbar (Discussion #32 / PR #115):** originally submitted as PR #115 (@bastionecho) using one 128x128 icon split into two half-width panels. Testing showed the split was illegible at real taskbar size (24px) whenever session and weekly landed on opposite sides of the 1-vs-2-digit boundary (e.g. session=9%, weekly=10% — a large "9" next to a barely-readable "10"). Rebuilt using two windows instead: the main window's own taskbar button shows session, and a second window — invisible, 1x1-turned-full-size, created once at startup and kept alive for the app's lifetime, toggled via `setSkipTaskbar()` rather than destroyed/recreated — gets its own taskbar button for weekly. Each icon gets the full 128x128 width, fixing the legibility problem outright. Reused as-is from PR #115 (Co-authored-by credit in the commit): the pixel-drawing helpers (`fillRect`, `drawCharScaled`, `drawXGlyph`) and the threshold-color/99%-X-glyph logic, adapted from half-width to full-width panels. Settings row layout: `Compact mode | Show taskbar stats`, `Usage Alerts | Organization`, `Theme | (empty)`. New setting `showTaskbarStats`, default **off** for new installs and pre-existing configs alike — requires an explicit opt-in, and turning "Hide from taskbar" back off does not silently re-enable it either; the user has to turn it back on manually each time. Two distinct Windows taskbar buttons required their own AppUserModelID (`setAppDetails`) or Windows groups them into one button regardless of the "combine buttons" setting.

  **Also overhauled close/minimize/exit behavior app-wide**, since the two-taskbar-button model exposed real gaps in the old single-tray-icon assumptions:
  - **Close (X, Alt+F4, or "Close window" from either taskbar button's right-click menu) now always quits the app outright.** Previously it conditionally hid to tray only when a tray icon existed; that logic didn't know a taskbar button is *also* a valid way back in, so it could silently and fully quit the app when only taskbar stats (no tray) were enabled.
  - **Minimize (the app's own − button) is now the sole way to tuck the app away while keeping a tray/taskbar icon as the way back in** — unchanged from existing behavior, just now the *only* thing that does it, which is the intended, cleaner split.
  - **Tray "Exit" and both taskbar buttons' "Close window"** all now force-destroy every window/tray icon and hard-exit the process directly (`app.exit(0)`), rather than relying on the `close`/`before-quit`/`window-all-closed` event cascade to resolve correctly — bulletproof by construction rather than by hoping the event chain behaves.
  - **Documentation:** README/CONTRIBUTING/QUICKSTART updated to match the new close/minimize behavior and document the taskbar-stats feature — done, see the docs merge in this same cycle.

  Known, accepted cosmetic trade-off: a brief flash on the weekly icon's taskbar-button restore click — Windows begins its own native restore animation before Electron's `restore` event even fires, so there's no JS-level hook to suppress it; would need a native Win32/DWM call outside Electron's public API to eliminate entirely. Not blocking.

  Tested extensively over several days: tray-only, taskbar-only, and tray+taskbar together; portable and default userData persistence both confirmed to correctly remember the setting across restarts.

  **Post-merge fixes, same feature (three follow-up commits after initial merge):**
  - **Weekly taskbar button ignoring the "Show taskbar stats" setting on startup:** `createWeeklyTaskbarWindow()` defaulted `skipTaskbar:false` in its constructor and additionally called `setSkipTaskbar(false)` unconditionally right after creation — since the window is created once, unconditionally, at every startup regardless of the setting, its taskbar button became visible immediately on creation, before `updateTaskbarIcon()` ever got a chance to check the real setting and hide it. Fixed by defaulting to hidden and removing the unconditional show call; visibility is now controlled exclusively by `updateTaskbarIcon()`/`resetTaskbarIcon()`.
  - **mainWindow's taskbar icon permanently stuck on a stale/default icon, confirmed not fixable in code:** extensive debugging (see below) traced this to Windows Shell caching state against the app's AppUserModelID (`com.claudeusage.widget`) — specifically Jump List "Automatic Destinations" data, which persists separately from the general icon cache and survives a full reboot, `ie4uinit -ClearIconCache`, and Explorer restarts. Confirmed by process of elimination: dev vs packaged build, single-instance check, transparency, taskbar pinning, and multiple code-level timing theories were all individually ruled out with direct evidence before landing on AUMID history as the cause. Giving the window a genuinely new AUMID immediately fixed it. **Troubleshooting note for future contributors:** if a Windows taskbar icon refuses to update no matter what the code does, and reboot/cache-clear don't help either, try a brand-new AppUserModelID as a diagnostic — if that fixes it, the cause is stale per-AUMID shell state, not application code.
  - **Real fix for the above, not just a workaround:** the app's AUMID (and the weekly window's own AUMID) are now scoped per `--profile` instance (`com.claudeusage.widget.profile-<name>`) instead of being one hardcoded string shared by every launch. This also fixes a real latent bug: two `--profile` instances running simultaneously would previously have had their taskbar buttons grouped together by Windows, the same clustering problem the weekly window's separate AUMID was originally built to solve for session vs weekly.
  - **Root cause of the AUMID corruption, and the actual fix:** traced to a pre-existing periodic `setInterval` (unrelated to this feature, older code) that re-asserted `mainWindow.setAlwaysOnTop(true, 'floating')` unconditionally every 5 seconds, forever — roughly 720 calls/hour regardless of whether the window had actually been knocked off top. This correlates with mainWindow's taskbar icon degrading over a long-running session; only mainWindow is subject to this interval, and it was the only taskbar icon that ever showed the symptom. Fixed by checking `mainWindow.isAlwaysOnTop()` first and only calling `setAlwaysOnTop()` when actually needed, plus redrawing the taskbar icon immediately after any re-assertion that does fire as defense-in-depth. Confirmed stable over multiple hours of continuous runtime and repeated icon-button clicks after the fix, on a fresh profile.

  **Follow-up work, explicitly not part of this branch:** a credits-usage display fix (session meter can read stuck below 100% while `extra_usage`/`spend` on the same API response show money actively being spent — plan is to force the display to 100%/critical once credit-dollar totals increase between polls while the reported percentage is already >95%, gated on that threshold specifically to avoid false-triggering on a teammate's usage on shared org credits). Design is agreed, not yet built.

*Add new entries above this line as additional branches are staged.*
