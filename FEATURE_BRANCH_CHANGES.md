# Feature Branch: feature/single-window-api-calls

## Branch Information
- Base Branch: develop
- Version: 1.7.3-dev
- Commits: 5
- Files Changed: 3 (main.js, src/fetch-via-window.js, src/renderer/app.js)
- Lines Changed: +297, -116

## Summary
Performance optimization branch that reduces memory overhead and API calls through smart window reuse and conditional polling.

## Changes

### 1. Single-Window API Optimization (Commit: 7730631)
**File:** main.js, src/fetch-via-window.js

- Added fetchMultipleViaWindow() to reuse one BrowserWindow for all 3 API endpoints
- Replaced parallel fetch (3 separate windows) with sequential fetch (1 reused window)
- Extracted parseResponseBody() helper for DRY code
- Memory savings: 3 window create/destroy cycles → 1 window per poll

### 2. Tray Icon Blink Fix (Commit: f856d0b)
**File:** main.js

- Added showMainWindowClean() function to prevent Windows DWM blink artifact
- Uses opacity masking (0 → 1 transition) to hide compositor re-entry
- Removed duplicate weeklyTray.on('click') handler
- Updated both tray icons and menu to use showMainWindowClean()
- Fixes: Weekly tray icon only flashing instead of showing window

### 3. Conditional API Polling (Commit: c1abe78)
**File:** main.js, src/renderer/app.js, src/fetch-via-window.js

- Smart polling: only fetches overage/prepaid when expand panel is visible
- Checks expandedOpen setting before building URL array
- Typical reduction: 3 API calls → 1 call when panel collapsed (~66% savings)
- On-demand fetch when user expands panel for fresh data
- Added timing instrumentation (DEBUG-gated) to verify optimization

### 4. Conditional Logic Fix (Commit: 8c1b691)
**File:** main.js

- Corrected logic: shouldFetchExtended = expandedOpen (was: expandedOpen || !compactMode)
- Only fetches overage/prepaid when panel is actually visible, not in normal mode

### 5. Currency Formatting Fix (Commit: f9cf8a8)
**File:** src/renderer/app.js

- Changed toFixed(0) → toFixed(2) for currency amounts
- Now displays: \.00 instead of \

## Performance Impact

**Before:**
- 3 BrowserWindow instances per poll (~2000ms total)
- Always fetches overage/prepaid regardless of visibility
- Visible blink when restoring window on Windows

**After:**
- 1 BrowserWindow for all endpoints (~600-2000ms depending on panel state)
- Skips overage/prepaid when panel collapsed (typical: ~600ms)
- Smooth window restoration on Windows
- Shows currency with 2 decimal places

## Testing Done
- Verified timing with DEBUG mode (~2s for 3 endpoints, ~600ms for 1)
- Tested expand/collapse triggers immediate fetch
- Confirmed tray blink eliminated
- Validated currency formatting shows .00

## Next Steps
- Test on macOS and Linux
- Monitor for edge cases in conditional polling
- Consider removing timing code after release (currently DEBUG-gated)
