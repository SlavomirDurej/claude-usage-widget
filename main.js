const { app, BrowserWindow, ipcMain, Tray, Menu, session, shell, Notification, safeStorage, nativeImage, screen } = require('electron');
const path = require('path');
const https = require('https');
const Store = require('electron-store');
const { fetchViaWindow, fetchMultipleViaWindow } = require('./src/fetch-via-window');
const { normalizeUsageLimits } = require('./src/normalize-usage-limits');

const GITHUB_OWNER = 'SlavomirDurej';
const GITHUB_REPO = 'claude-usage-widget';

// Required for Windows taskbar features (notifications, Jump List tasks) to register
// reliably under one stable identity — without this, dev (npm start) and packaged
// builds show up as generic "Electron" and custom Jump List tasks may not appear.
// Matches package.json build.appId so dev and packaged runs share the same identity.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.claudeusage.widget');
}


// Profile isolation: --profile=<name> launches a fully separate instance with its own
// session, cookies, and settings. Must be set before anything reads app.getPath('userData').
const fs = require('fs');
const os = require('os');
const profileArg = process.argv.find(a => a.startsWith('--profile='));
if (profileArg) {
  const profileName = profileArg.split('=')[1].replace(/[^a-zA-Z0-9_-]/g, '_');
  const profilePath = path.join(app.getPath('userData'), 'profiles', profileName);
  app.setPath('userData', profilePath);
  // Always logged (not gated behind DEBUG_LOG) so multi-instance bug reports can be
  // triaged from terminal output alone: confirms which profile resolved to which
  // userData root, distinguishing profile-folder isolation from org-ID isolation.
  console.log(`[Profile] Using profile "${profileName}" -> userData: ${profilePath}`);
}

// Migration: Handle old encrypted config files from v1.7.0 and earlier
// Must happen BEFORE creating Store instance to prevent parse errors.
// Skipped for profile instances — they are always fresh installs.
if (!profileArg) {
  let configPath;
  if (process.platform === 'darwin') {
    configPath = path.join(os.homedir(), 'Library', 'Application Support', 'claude-usage-widget', 'config.json');
  } else if (process.platform === 'win32') {
    configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'claude-usage-widget', 'config.json');
  } else {
    // Linux
    configPath = path.join(os.homedir(), '.config', 'claude-usage-widget', 'config.json');
  }

  try {
    if (fs.existsSync(configPath)) {
      const rawData = fs.readFileSync(configPath, 'utf-8');
      // Check if file looks encrypted (contains non-JSON garbage or doesn't start with {)
      if (rawData.includes('\u0000') || !rawData.trim().startsWith('{')) {
        console.log('[Migration] Detected old encrypted config from v1.7.0, deleting for fresh start');
        fs.unlinkSync(configPath);
      }
    }
  } catch (err) {
    console.error('[Migration] Error checking config file:', err.message);
    // If we can't read it, try to delete it
    try {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    } catch {}
  }
}

// Non-sensitive settings storage (no encryption needed)
const store = new Store();

// Debug mode: set DEBUG_LOG=1 env var or pass --debug flag to see verbose logs.
// Regular users will only see critical errors in the console.
const DEBUG = process.env.DEBUG_LOG === '1' || process.argv.includes('--debug');
function debugLog(...args) {
  if (DEBUG) console.log('[Debug]', ...args);
}

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let mainWindow = null;
let sessionTray = null;  // Tray icon for Session usage
let weeklyTray = null;   // Tray icon for Weekly usage

// Set on 'before-quit', which fires before any window's 'close' event on
// every genuine quit path (Exit menu item, Cmd+Q, OS shutdown). Without
// this, app.quit() can't be told apart from a user clicking the close
// button to just minimize -- both arrive as the same window 'close' event.
let isQuitting = false;

// Single source of truth for "is there a recovery surface to bring the
// window back via". Hiding/minimizing-to-tray is only ever safe when this
// is true; otherwise it must behave like a normal close/minimize so the
// taskbar (or the act of relaunching) can still reach it.
function hasTrayIcon() {
  return (sessionTray && !sessionTray.isDestroyed()) || (weeklyTray && !weeklyTray.isDestroyed());
}

const WIDGET_WIDTH = process.platform === 'darwin' ? 590 : 560;
const WIDGET_HEIGHT = 155;
const COMPACT_WIDTH = 290;
const COMPACT_HEIGHT = 105;
const COMPACT_ROW_HEIGHT = 28; // extra height per optional row (Fable, Spend)
const COMPACT_CHEVRON_HEIGHT = 15; // the always-visible spend toggle chevron
const COMPACT_BANNER_HEIGHT = 28; // matches BANNER_HEIGHT in the renderer's resizeWidget()
const HISTORY_RETENTION_DAYS = 8;

// Compact mode always shows Session + Weekly plus the spend chevron; grows by
// one row when the account has a scoped Fable weekly limit
// (data.seven_day_fable, populated by normalize-usage-limits.js), by another
// when the user has toggled the spend row open (settings.compactSpendOpen),
// and by the banner height when an update is available (updateBannerVisible,
// set by the check-for-update handler below — compact mode has no separate
// update-check path of its own, it shares this one).
function getCompactHeight() {
  const data = store.get('latestUsageData');
  let height = COMPACT_HEIGHT + COMPACT_CHEVRON_HEIGHT;
  if (data?.seven_day_fable) height += COMPACT_ROW_HEIGHT;
  if (store.get('settings.compactSpendOpen', false)) height += COMPACT_ROW_HEIGHT;
  if (store.get('updateBannerVisible', false)) height += COMPACT_BANNER_HEIGHT;
  return height;
}
const CHART_DAYS = 7;
const MAX_HISTORY_SAMPLES = 10000; // Cap total samples to prevent unbounded growth

function storeUsageHistory(data) {
  // Skip write if the session is invalid — a live session always has resets_at timestamps.
  // Absent timestamps mean the API returned empty/zeroed data (dead session, removed device, etc.)
  if (!data.five_hour?.resets_at && !data.seven_day?.resets_at) {
    debugLog('[History] Skipping write — no reset timestamps, likely invalid session data');
    return;
  }

  const organizationId = store.get('organizationId');
  const historyKey = organizationId ? `usageHistory_${organizationId}` : 'usageHistory';

  const timestamp = Date.now();
  let history = store.get(historyKey, []);

  history.push({
    timestamp,
    session: data.five_hour?.utilization || 0,
    weekly: data.seven_day?.utilization || 0,
    sonnet: data.seven_day_sonnet?.utilization || 0,
    opus: data.seven_day_opus?.utilization || 0,
    fable: data.seven_day_fable?.utilization || 0, // requires feature/fable-usage (normalize-usage-limits.js)
    cowork: data.seven_day_cowork?.utilization || 0,
    design: data.seven_day_omelette?.utilization || 0,
    oauthApps: data.seven_day_oauth_apps?.utilization || 0,
    extraUsage: data.extra_usage?.utilization || 0
  });

  // Rotation: apply both time-based and count-based limits
  const cutoff = timestamp - (HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  history = history.filter((entry) => entry.timestamp > cutoff);

  if (history.length > MAX_HISTORY_SAMPLES) {
    history = history.slice(history.length - MAX_HISTORY_SAMPLES);
  }

  store.set(historyKey, history);
}

// Migrate legacy single-key history to the per-org namespaced key at startup,
// so get-usage-history reads from the right place before any fetch has run.
function migrateUsageHistoryKey() {
  const organizationId = store.get('organizationId');
  if (!organizationId) return;
  const historyKey = `usageHistory_${organizationId}`;
  if (store.has(historyKey)) return;
  const legacy = store.get('usageHistory', []);
  if (legacy.length > 0) {
    store.set(historyKey, legacy);
    store.delete('usageHistory');
    debugLog('[History] Migrated legacy usageHistory →', historyKey);
  }
}

// Prune all per-org history keys at startup. Trims entries older than the retention
// window and deletes the key entirely if nothing remains — cleans up abandoned accounts.
function pruneStaleHistoryKeys() {
  const cutoff = Date.now() - (HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const allKeys = Object.keys(store.store);
  for (const key of allKeys) {
    if (!key.startsWith('usageHistory_') && key !== 'usageHistory') continue;
    const history = store.get(key, []);
    const fresh = history.filter((entry) => entry.timestamp > cutoff);
    if (fresh.length === 0) {
      store.delete(key);
      debugLog('[History] Deleted stale key:', key);
    } else if (fresh.length < history.length) {
      store.set(key, fresh);
      debugLog('[History] Pruned', history.length - fresh.length, 'old entries from', key);
    }
  }
}

// Set session-level User-Agent to avoid Electron detection
app.on('ready', () => {
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);
});

// Set sessionKey as a cookie in Electron's session
async function setSessionCookie(sessionKey) {
  await session.defaultSession.cookies.set({
    url: 'https://claude.ai',
    name: 'sessionKey',
    value: sessionKey,
    domain: '.claude.ai',
    path: '/',
    secure: true,
    httpOnly: true
  });
  debugLog('sessionKey cookie set in Electron session');
}

// Returns true if a rect at (x, y) with the given width/height overlaps
// at least one currently connected display's work area. Used to recover
// from saved window positions left over from a different monitor setup
// (e.g. switching from an ultrawide to a laptop-only display).
function isPositionOnScreen(x, y, width, height) {
  const rect = { x, y, width, height };
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      rect.x < area.x + area.width &&
      rect.x + rect.width > area.x &&
      rect.y < area.y + area.height &&
      rect.y + rect.height > area.y
    );
  });
}

// Centered position on the primary display's work area, for the given window size.
function getCenteredPosition(width, height) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2)
  };
}

// True only if the window is actually shown AND within some display's bounds.
// Electron's isVisible() alone is true even when the window is fully
// off-screen, which previously made the tray click-to-hide toggle treat an
// invisible-to-the-user off-screen window as "currently shown."
function isMainWindowShownOnScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!mainWindow.isVisible() || mainWindow.isMinimized()) return false;
  const bounds = mainWindow.getBounds();
  return isPositionOnScreen(bounds.x, bounds.y, bounds.width, bounds.height);
}

// Implicit/automatic triggers (tray left-click, taskbar left-click/restore,
// app activate, "Show Widget" menu item). Re-validates the window's current
// position against connected displays first and only moves it if it's
// actually off-screen — a valid custom position is left untouched. This is
// the single recovery path for the whole app; any future trigger that brings
// the window forward should route through here too.
function showMainWindowSmart() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    updateTaskbarIcon(store.get('latestUsageData'));
    return;
  }
  const bounds = mainWindow.getBounds();
  if (!isPositionOnScreen(bounds.x, bounds.y, bounds.width, bounds.height)) {
    const { x, y } = getCenteredPosition(bounds.width, bounds.height);
    debugLog('[Window] Recentering off-screen window from', bounds, 'to', { x, y });
    mainWindow.setPosition(x, y);
    store.set('windowPosition', { x, y });
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  // Redraw both taskbar icons immediately on restore — needed because hiding
  // to tray (mainWindow.on('minimize')/weekly click handler, when a tray icon
  // exists) tears the weekly window down entirely, and otherwise it wouldn't
  // reappear until the next periodic usage refresh.
  updateTaskbarIcon(store.get('latestUsageData'));
}

function createMainWindow() {
  let savedPosition = store.get('windowPosition');
  if (savedPosition && !isPositionOnScreen(savedPosition.x, savedPosition.y, WIDGET_WIDTH, WIDGET_HEIGHT)) {
    debugLog('[Window] Saved position', savedPosition, 'is off-screen on current display setup; centering instead');
    savedPosition = null;
  }
  const windowOptions = {
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    icon: path.join(__dirname, process.platform === 'darwin' ? 'assets/icon.icns' : process.platform === 'linux' ? 'assets/logo.png' : 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.loadFile('src/renderer/index.html');
  // Overrides index.html's <title> for taskbar hover text specifically —
  // "Claude Usage Widget" doesn't distinguish it from the weekly window.
  // loadFile() is async, so the page's own <title> would otherwise overwrite
  // this once it finishes loading — block that instead of racing it.
  mainWindow.setTitle('Claude Usage: Daily');
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });
  // Belt-and-suspenders: reapply once the page actually finishes loading too,
  // in case something else reasserts the page title before the listener above
  // is attached, or the title needs to be present before then for the taskbar
  // to pick it up.
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.setTitle('Claude Usage: Daily');
  });

  let positionSaveTimer = null;
  mainWindow.on('move', () => {
    if (positionSaveTimer) clearTimeout(positionSaveTimer);
    positionSaveTimer = setTimeout(() => {
      const position = mainWindow.getBounds();
      store.set('windowPosition', { x: position.x, y: position.y });
    }, 300);
  });

  // Close (X button, Alt+F4, or "Close window" from either taskbar button's
  // right-click menu — all send the same close signal) always quits the app
  // outright now. Minimize (the app's own − button) is the dedicated way to
  // tuck it away while keeping a tray/taskbar icon as the way back in.
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    destroyWeeklyTaskbarWindow();
    destroyTrayIcons();
    mainWindow.destroy();
    app.exit(0);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Taskbar left-click restore (Windows) lands here. Re-validate position —
  // covers the case where the window was minimized before a monitor change
  // and is now restoring to coordinates that no longer exist.
  mainWindow.on('restore', () => {
    showMainWindowSmart();
  });

  // Taskbar left-click on an off-screen-but-not-minimized window fires
  // 'focus' without ever firing 'restore' (Electron's isVisible() is true
  // even when fully off-screen, so the window was never "minimized" in the
  // first place). This is what makes the very first click self-correct
  // instead of needing a focus -> minimize -> restore cycle first. Cheap
  // check, only acts when actually off-screen, so no effect on normal use.
  mainWindow.on('focus', () => {
    showMainWindowSmart();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/**
 * Determine background color based on thresholds
 */
function getBackgroundColor(percent, isSession, warnThreshold, dangerThreshold) {
  if (percent >= dangerThreshold) {
    // Red #ef4444
    return { r: 239, g: 68, b: 68 };
  } else if (percent >= warnThreshold) {
    // Amber/Orange #f59e0b
    return { r: 245, g: 158, b: 11 };
  } else {
    // Default colors
    if (isSession) {
      // Purple #8b5cf6
      return { r: 139, g: 92, b: 246 };
    } else {
      // Blue #3b82f6
      return { r: 59, g: 130, b: 246 };
    }
  }
}

/**
 * Bold 8x11 bitmap font for numbers 0-9 (2-pixel strokes for bold look)
 * Each number is represented as an array of 11 rows, each row is 8 bits
 */
const BITMAP_FONT = {
  '0': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b11000011,
    0b11000011,
    0b11000011,
    0b11000011,
    0b11000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '1': [
    0b00011000,
    0b00111000,
    0b01111000,
    0b00011000,
    0b00011000,
    0b00011000,
    0b00011000,
    0b00011000,
    0b00011000,
    0b01111110,
    0b01111110
  ],
  '2': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b00000011,
    0b00000110,
    0b00011100,
    0b00111000,
    0b01110000,
    0b11100000,
    0b11111111,
    0b11111111
  ],
  '3': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b00000011,
    0b00000110,
    0b00111100,
    0b00000110,
    0b00000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '4': [
    0b00000110,
    0b00001110,
    0b00011110,
    0b00110110,
    0b01100110,
    0b11111111,
    0b11111111,
    0b00000110,
    0b00000110,
    0b00000110,
    0b00000110
  ],
  '5': [
    0b11111111,
    0b11111111,
    0b11000000,
    0b11000000,
    0b11111100,
    0b00000110,
    0b00000011,
    0b00000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '6': [
    0b00111100,
    0b01111110,
    0b11100000,
    0b11000000,
    0b11111100,
    0b11100110,
    0b11000011,
    0b11000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '7': [
    0b11111111,
    0b11111111,
    0b00000011,
    0b00000110,
    0b00001100,
    0b00011000,
    0b00110000,
    0b00110000,
    0b01100000,
    0b01100000,
    0b01100000
  ],
  '8': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b11000011,
    0b01111110,
    0b00111100,
    0b01111110,
    0b11000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '9': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b11000011,
    0b11000011,
    0b01111111,
    0b00111111,
    0b00000011,
    0b00000111,
    0b01111110,
    0b00111100
  ]
};

/**
 * Narrow 6x11 bitmap font for 3-digit numbers (100%)
 * Bold version to match
 */
const BITMAP_FONT_NARROW = {
  '0': [
    0b011110,
    0b111111,
    0b110011,
    0b110011,
    0b110011,
    0b110011,
    0b110011,
    0b110011,
    0b110011,
    0b111111,
    0b011110
  ],
  '1': [
    0b001100,
    0b011100,
    0b111100,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
    0b111111,
    0b111111
  ]
};

/**
 * Draw a crisp bitmap character at position (x, y) in the buffer
 */
function drawChar(buffer, width, height, char, x, y, color, useNarrow = false) {
  const bitmap = useNarrow ? BITMAP_FONT_NARROW[char] : BITMAP_FONT[char];
  if (!bitmap) return useNarrow ? 6 : 8;
  
  const charWidth = useNarrow ? 6 : 8;
  const charHeight = 11;
  const maxCol = useNarrow ? 5 : 7;
  
  for (let row = 0; row < charHeight; row++) {
    for (let col = 0; col < charWidth; col++) {
      if (bitmap[row] & (1 << (maxCol - col))) {
        const px = x + col;
        const py = y + row;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const offset = (py * width + px) * 4;
          buffer[offset] = color.b;
          buffer[offset + 1] = color.g;
          buffer[offset + 2] = color.r;
          buffer[offset + 3] = color.a;
        }
      }
    }
  }
  return charWidth;
}

/**
 * Generate a single percentage badge icon with colored background and bitmap text
 * @param {number} percent - Usage percentage (0-100)
 * @param {object} bgColor - Background color {r, g, b}
 * @returns {NativeImage} Generated tray icon
 */
function generatePercentageIcon(percent, bgColor) {
  const width = 20;  // Back to 20x20
  const height = 20;
  const buffer = Buffer.alloc(width * height * 4);
  
  // Draw filled square background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      buffer[offset] = bgColor.b;
      buffer[offset + 1] = bgColor.g;
      buffer[offset + 2] = bgColor.r;
      buffer[offset + 3] = 255;
    }
  }
  
  // Draw white text
  const percentText = Math.round(percent).toString();
  const textColor = { r: 255, g: 255, b: 255, a: 255 };
  
  // Use narrow font for 3-digit numbers (100%)
  const useNarrow = percentText.length >= 3;
  const charWidth = useNarrow ? 6 : 8;
  const charHeight = 11;
  const gap = percentText.length >= 3 ? 0 : 1; // 1px gap for 1-2 digits, no gap for 100
  const totalWidth = percentText.length * charWidth + (percentText.length - 1) * gap;
  let startX = Math.floor((width - totalWidth) / 2);
  const startY = Math.floor((height - charHeight) / 2);
  
  // Draw each digit
  for (let i = 0; i < percentText.length; i++) {
    drawChar(buffer, width, height, percentText[i], startX, startY, textColor, useNarrow);
    startX += charWidth + gap;
  }
  
  return nativeImage.createFromBuffer(buffer, { width, height });
}

/**
 * Generate a Red X icon for 99-100% usage (maxed out)
 * @returns {NativeImage} Generated red X tray icon
 */
function generateRedXIcon() {
  const width = 20;
  const height = 20;
  const buffer = Buffer.alloc(width * height * 4);
  
  // Red background
  const red = { r: 220, g: 53, b: 69 }; // #dc3545
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      buffer[offset] = red.b;
      buffer[offset + 1] = red.g;
      buffer[offset + 2] = red.r;
      buffer[offset + 3] = 255;
    }
  }
  
  // Draw white X (2 pixel thick lines)
  const white = { r: 255, g: 255, b: 255, a: 255 };
  
  // Diagonal line from top-left to bottom-right
  for (let i = 0; i < 11; i++) {
    const x1 = 5 + i;
    const y1 = 5 + i;
    // Draw 2x2 pixel for thickness
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const px = x1 + dx;
        const py = y1 + dy;
        if (px < width && py < height) {
          const offset = (py * width + px) * 4;
          buffer[offset] = white.b;
          buffer[offset + 1] = white.g;
          buffer[offset + 2] = white.r;
          buffer[offset + 3] = white.a;
        }
      }
    }
  }
  
  // Diagonal line from top-right to bottom-left
  for (let i = 0; i < 11; i++) {
    const x1 = 15 - i;
    const y1 = 5 + i;
    // Draw 2x2 pixel for thickness
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const px = x1 + dx;
        const py = y1 + dy;
        if (px < width && py < height) {
          const offset = (py * width + px) * 4;
          buffer[offset] = white.b;
          buffer[offset + 1] = white.g;
          buffer[offset + 2] = white.r;
          buffer[offset + 3] = white.a;
        }
      }
    }
  }
  
  return nativeImage.createFromBuffer(buffer, { width, height });
}

/**
 * Single-icon taskbar geometry. Each of the two taskbar buttons (main window
 * for session, the paired invisible window for weekly) gets the full 128x128
 * icon to itself, rather than splitting one icon in half — a single digit and
 * a double digit both get the full available width, so they render at a
 * consistent size instead of the mismatched scaling a split icon produces.
 * Ported from bastionecho's PR #115 pixel-drawing helpers (fillRect,
 * drawCharScaled, drawXGlyph, drawTaskbarPanel), adapted for single-panel use.
 */
const TASKBAR_ICON_SIZE = 128;
const TASKBAR_PANEL_PADDING = 3;
const TASKBAR_MAX_GLYPH_SCALE = 4.5;

/**
 * Fill a rectangle in a BGRA buffer, clipping to the buffer bounds
 */
function fillRect(buffer, width, height, x, y, w, h, color, alpha = 255) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(width, Math.round(x + w));
  const y1 = Math.min(height, Math.round(y + h));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const offset = (py * width + px) * 4;
      buffer[offset] = color.b;
      buffer[offset + 1] = color.g;
      buffer[offset + 2] = color.r;
      buffer[offset + 3] = alpha;
    }
  }
}

/**
 * Draw a bitmap character scaled by an arbitrary (possibly fractional) factor.
 * Nearest-neighbour sampling is fine here because the 128px master is always
 * resampled by Windows before it reaches the screen.
 */
function drawCharScaled(buffer, width, height, char, x, y, scale, color, useNarrow = false) {
  const charWidth = useNarrow ? 6 : 8;
  const bitmap = useNarrow ? BITMAP_FONT_NARROW[char] : BITMAP_FONT[char];
  if (!bitmap) return charWidth * scale;

  const charHeight = 11;
  const maxCol = charWidth - 1;
  const destWidth = Math.round(charWidth * scale);
  const destHeight = Math.round(charHeight * scale);
  const originX = Math.round(x);
  const originY = Math.round(y);

  for (let dy = 0; dy < destHeight; dy++) {
    const row = Math.min(charHeight - 1, Math.floor(dy / scale));
    for (let dx = 0; dx < destWidth; dx++) {
      const col = Math.min(charWidth - 1, Math.floor(dx / scale));
      if (!(bitmap[row] & (1 << (maxCol - col)))) continue;

      const px = originX + dx;
      const py = originY + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const offset = (py * width + px) * 4;
      buffer[offset] = color.b;
      buffer[offset + 1] = color.g;
      buffer[offset + 2] = color.r;
      buffer[offset + 3] = color.a;
    }
  }
  return charWidth * scale;
}

/**
 * Draw an X glyph centered on (cx, cy), matching the tray's maxed-out icon
 */
function drawXGlyph(buffer, width, height, cx, cy, radius, thickness, color) {
  const halfThickness = thickness / 2;
  const steps = Math.max(1, Math.round(radius * 2));

  for (let i = 0; i <= steps; i++) {
    const offset = -radius + (i / steps) * radius * 2;
    const x = cx + offset;
    fillRect(buffer, width, height, x - halfThickness, cy + offset - halfThickness, thickness, thickness, color);
    fillRect(buffer, width, height, x - halfThickness, cy - offset - halfThickness, thickness, thickness, color);
  }
}

/**
 * Draw a single-panel taskbar icon: fills the whole 128x128 square with the
 * threshold color and the percentage, full-width — no half-icon split.
 */
function drawTaskbarPanel(buffer, size, percent, bgColor) {
  fillRect(buffer, size, size, 0, 0, size, size, bgColor);

  const white = { r: 255, g: 255, b: 255, a: 255 };

  // 99%+ shows an X instead of a number, same as the tray icons
  if (percent >= 99) {
    const radius = (size - TASKBAR_PANEL_PADDING * 2) / 2.6;
    drawXGlyph(buffer, size, size, size / 2, size / 2, radius, Math.max(2, radius / 2.5), white);
    return;
  }

  const text = Math.round(percent).toString();
  const useNarrow = text.length >= 3;
  const glyphWidth = useNarrow ? 6 : 8;
  const gapUnits = 1;

  // Scale digits to fill the full icon width now, rather than half of it —
  // this is what fixes the illegible-at-real-size problem the split icon had.
  const units = text.length * glyphWidth + (text.length - 1) * gapUnits;
  const usableWidth = size - TASKBAR_PANEL_PADDING * 2;
  const scale = Math.min(usableWidth / units, TASKBAR_MAX_GLYPH_SCALE);

  let x = (size - units * scale) / 2;
  const y = (size - 11 * scale) / 2;

  for (const char of text) {
    drawCharScaled(buffer, size, size, char, x, y, scale, white, useNarrow);
    x += (glyphWidth + gapUnits) * scale;
  }
}

/**
 * Generate a single-number taskbar icon (session OR weekly, not split).
 * @param {number} percent - Usage percentage (0-100)
 * @param {boolean} isSession - true for session (purple), false for weekly (blue)
 * @param {number} warnThreshold - Percentage at which the icon turns amber
 * @param {number} dangerThreshold - Percentage at which the icon turns red
 * @returns {NativeImage} Generated taskbar icon
 */
function generateSingleTaskbarIcon(percent, isSession, warnThreshold, dangerThreshold) {
  const size = TASKBAR_ICON_SIZE;
  const buffer = Buffer.alloc(size * size * 4);
  const maxedColor = { r: 220, g: 53, b: 69 }; // #dc3545, same red as the tray X

  const color = percent >= 99
    ? maxedColor
    : getBackgroundColor(percent, isSession, warnThreshold, dangerThreshold);

  drawTaskbarPanel(buffer, size, percent, color);

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

/**
 * Second, invisible taskbar window paired with the main window. Its only
 * purpose is to hold a second taskbar button for the weekly-usage icon —
 * Windows only grants a taskbar button per top-level window, so a second
 * icon needs a second (real, if content-less) window behind it.
 */
let weeklyTaskbarWindow = null;

function createWeeklyTaskbarWindow() {
  if (weeklyTaskbarWindow && !weeklyTaskbarWindow.isDestroyed()) return;

  weeklyTaskbarWindow = new BrowserWindow({
    // Not 1x1: Windows sizes the hover-flyout preview box to match the
    // window's actual dimensions, so a 1x1 window produces a tiny flyout
    // that truncates the title text. Larger (but still never actually shown
    // — always minimized immediately below) gives the flyout room to render
    // "Claude Usage: Weekly" in full.
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    frame: false,
    show: false,
    // Starts hidden from the taskbar, not visible — updateTaskbarIcon() is
    // what decides whether to actually show it, based on the real setting.
    // Defaulting to visible-then-hide-later left a startup window (and any
    // moment updateTaskbarIcon() hadn't yet run) where the button showed
    // regardless of whether "Show taskbar stats" was even on.
    skipTaskbar: true,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Claude Usage: Weekly',
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  weeklyTaskbarWindow.loadURL('data:text/html,<title>Claude Usage: Weekly</title>');
  // No setSkipTaskbar(false) here — visibility is controlled exclusively by
  // updateTaskbarIcon()/resetTaskbarIcon() based on the actual setting, not
  // by creation. This line used to unconditionally show it immediately,
  // which defeated the constructor's skipTaskbar:true default above.
  weeklyTaskbarWindow.webContents.once('did-finish-load', () => {
    if (weeklyTaskbarWindow && !weeklyTaskbarWindow.isDestroyed()) {
      weeklyTaskbarWindow.setTitle('Claude Usage: Weekly');
    }
  });

  // Windows groups taskbar buttons by AppUserModelID, not by window — both
  // windows otherwise inherit the app-wide AUMID set via setAppUserModelId()
  // at startup, so they'd cluster into one grouped button no matter what the
  // system's "combine buttons" setting is. Giving this window its own AUMID
  // splits it into a genuinely separate button. The main window is left on
  // the original app-wide AUMID so a pinned taskbar shortcut still matches it.
  if (process.platform === 'win32') {
    try {
      weeklyTaskbarWindow.setAppDetails({ appId: 'com.claudeusage.widget.weekly' });
    } catch (error) {
      console.error('Failed to set weekly taskbar window AppUserModelID:', error);
    }
  }

  // Created once and kept alive for the app's whole lifetime — never
  // destroyed/recreated during normal toggling (see setSkipTaskbar calls in
  // resetTaskbarIcon/updateTaskbarIcon below), since destroy-then-recreate
  // was the direct cause of a repeated visible flash. Calling minimize()
  // directly, without ever calling show() first, creates it already in a
  // minimized state — Windows still grants it a taskbar button (minimized
  // windows are WS_VISIBLE, just iconified), but no restored frame is ever
  // painted, so there's nothing to flash on screen at any point, including
  // app startup.
  weeklyTaskbarWindow.minimize();

  // Clicking its taskbar button fires 'restore'. Re-minimize via setTimeout(0)
  // — this is the confirmed-working, tested version. A synchronous minimize()
  // call inside the same 'restore' tick caused a rapid restore/minimize loop
  // (many toggles per second) during testing; the brief cosmetic flash this
  // defer allows is a much smaller cost than that loop.
  let handlingRestore = false;
  weeklyTaskbarWindow.on('restore', () => {
    if (handlingRestore) return;
    handlingRestore = true;

    setTimeout(() => {
      if (weeklyTaskbarWindow && !weeklyTaskbarWindow.isDestroyed()) {
        weeklyTaskbarWindow.minimize();
      }
      handlingRestore = false;
    }, 0);

    if (isMainWindowShownOnScreen()) {
      // hide() removes mainWindow's own taskbar button entirely, unlike
      // minimize() — only worth doing when tray icons exist as the way
      // back in; otherwise minimize keeps both taskbar buttons visible,
      // matching how clicking the session icon natively already behaves.
      if (hasTrayIcon()) {
        mainWindow.hide();
      } else {
        mainWindow.minimize();
      }
    } else {
      showMainWindowSmart();
    }
  });

  // "Close window" from this button's own right-click menu should quit the
  // whole app too, not just this window — otherwise mainWindow would be left
  // running orphaned with no obvious way to reach it.
  weeklyTaskbarWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    destroyWeeklyTaskbarWindow();
    destroyTrayIcons();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
    app.exit(0);
  });

  weeklyTaskbarWindow.on('closed', () => {
    weeklyTaskbarWindow = null;
  });
}

function destroyWeeklyTaskbarWindow() {
  if (weeklyTaskbarWindow && !weeklyTaskbarWindow.isDestroyed()) {
    weeklyTaskbarWindow.destroy();
  }
  weeklyTaskbarWindow = null;
}

function createTray() {
  // Respect the tray stats setting even when createTray is called from generic refresh paths.
  if (!store.get('settings.showTrayStats', false)) {
    destroyTrayIcons();
    return;
  }

  // Rebuild from a clean state if only one of the two stats tray icons survived.
  const hasSessionTray = sessionTray && !sessionTray.isDestroyed();
  const hasWeeklyTray = weeklyTray && !weeklyTray.isDestroyed();
  if (hasSessionTray && hasWeeklyTray) return;
  if (hasSessionTray || hasWeeklyTray) destroyTrayIcons();

  try {
    const staticIconPath = path.join(__dirname, process.platform === 'darwin' ? 'assets/tray-icon-mac.png' : process.platform === 'linux' ? 'assets/tray-icon-linux.png' : 'assets/tray-icon.png');
    
    // Create Weekly tray icon FIRST (left position, blue)
    weeklyTray = new Tray(staticIconPath);
    weeklyTray.setToolTip('Weekly Usage');
    
    // Create Session tray icon SECOND (right position, purple)
    sessionTray = new Tray(staticIconPath);
    sessionTray.setToolTip('Session Usage');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Widget',
        click: () => {
          showMainWindowSmart();
        }
      },
      {
        label: 'Refresh',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('refresh-usage');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Log Out',
        click: async () => {
          store.delete('sessionKey');
          store.delete('organizationId');
          // Clear all Claude.ai cookies and session storage
          const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
          for (const cookie of cookies) {
            await session.defaultSession.cookies.remove('https://claude.ai', cookie.name);
          }
          await session.defaultSession.clearStorageData({
            storages: ['localstorage', 'sessionstorage', 'cachestorage'],
            origin: 'https://claude.ai'
          });
          if (mainWindow) {
            mainWindow.webContents.send('session-expired');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          // Bypasses the normal close/before-quit/window-all-closed event
          // cascade entirely rather than relying on it to resolve correctly —
          // force-destroy everything directly, then hard-exit the process.
          isQuitting = true;
          destroyWeeklyTaskbarWindow();
          destroyTrayIcons();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.destroy();
          }
          app.exit(0);
        }
      }
    ]);

    sessionTray.setContextMenu(contextMenu);
    weeklyTray.setContextMenu(contextMenu);

    // Click handlers - swapped order
        weeklyTray.on('click', () => {
      if (isMainWindowShownOnScreen()) {
        mainWindow.hide();
      } else {
        showMainWindowSmart();
      }
    });
    
        sessionTray.on('click', () => {
      if (isMainWindowShownOnScreen()) {
        mainWindow.hide();
      } else {
        showMainWindowSmart();
      }
    });
  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

function destroyTrayIcons() {
  // Centralized tray cleanup keeps Linux appindicator hosts from showing stale icons.
  const trays = [sessionTray, weeklyTray];
  sessionTray = null;
  weeklyTray = null;

  for (const tray of trays) {
    if (!tray || tray.isDestroyed()) continue;

    try {
      tray.removeAllListeners();
      tray.setContextMenu(null);
      tray.setToolTip('');

      // On Linux, some appindicator hosts repaint stale tray entries lazily.
      // Clearing the image before destroy gives the host an explicit update.
      if (process.platform === 'linux') {
        tray.setImage(nativeImage.createEmpty());
      }
    } catch (error) {
      console.error('Failed to clear tray icon:', error);
    }

    try {
      tray.destroy();
    } catch (error) {
      console.error('Failed to destroy tray icon:', error);
    }
  }
}

/**
 * Format reset time for tray tooltip
 * @param {string} resetsAt - ISO timestamp string
 * @param {string} timeFormat - '12h' or '24h'
 * @param {boolean} includeDate - Whether to include the date (for weekly resets)
 * @returns {string} Formatted time string
 */
function formatResetTime(resetsAt, timeFormat, includeDate = false) {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  
  const formatTime = () => {
    if (timeFormat === '24h') {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else {
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${ampm}`;
    }
  };
  
  if (includeDate) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStr = months[date.getMonth()];
    const dayNum = date.getDate();
    return `${monthStr} ${dayNum}, ${formatTime()}`;
  } else {
    return formatTime();
  }
}

/**
 * Update tray icons with current usage data
 * @param {Object} usageData - Usage data object containing session and weekly percentages
 */
function updateTrayIcon(usageData) {
  const showTrayStats = store.get('settings.showTrayStats', false);
  
  if (!showTrayStats) {
    // Destroy only weeklyTray, keeping sessionTray alive as a persistent restore
    // icon. Without it, hide() on Windows leaves no way to restore the window.
    // Apply the same Linux appindicator cleanup that destroyTrayIcons() uses.
    if (weeklyTray && !weeklyTray.isDestroyed()) {
      try {
        weeklyTray.removeAllListeners();
        weeklyTray.setContextMenu(null);
        weeklyTray.setToolTip('');
        if (process.platform === 'linux') weeklyTray.setImage(nativeImage.createEmpty());
        weeklyTray.destroy();
      } catch (_) {}
      weeklyTray = null;
    }
    return;
  }

  // Recreate tray icons if they were destroyed
  if (!sessionTray || sessionTray.isDestroyed() || !weeklyTray || weeklyTray.isDestroyed()) {
    createTray();
  }

  if ((!sessionTray || sessionTray.isDestroyed()) && (!weeklyTray || weeklyTray.isDestroyed())) return;

  // Get threshold settings and time format
  const warnThreshold = store.get('settings.warnThreshold', 75);
  const dangerThreshold = store.get('settings.dangerThreshold', 90);
  const timeFormat = store.get('settings.timeFormat', '12h');

  // Extract percentages and reset times from usage data
  const sessionPercent = usageData?.five_hour?.utilization || 0;
  const sessionResetsAt = usageData?.five_hour?.resets_at;
  const weeklyPercent = usageData?.seven_day?.utilization || 0;
  const weeklyResetsAt = usageData?.seven_day?.resets_at;

  try {
    // Generate Weekly icon (blue background) - LEFT position
    let weeklyIcon;
    if (weeklyPercent >= 99) {
      weeklyIcon = generateRedXIcon();
    } else {
      const weeklyColor = getBackgroundColor(weeklyPercent, false, warnThreshold, dangerThreshold);
      weeklyIcon = generatePercentageIcon(weeklyPercent, weeklyColor);
    }
    if (weeklyTray && !weeklyTray.isDestroyed()) {
      weeklyTray.setImage(weeklyIcon);
      let weeklyTooltip = `Weekly: ${Math.round(weeklyPercent)}%`;
      const weeklyResetTime = formatResetTime(weeklyResetsAt, timeFormat, true);
      if (weeklyResetTime) {
        weeklyTooltip += `\nResets: ${weeklyResetTime}`;
      }
      weeklyTray.setToolTip(weeklyTooltip);
    }
    
    // Generate Session icon (purple background) - RIGHT position
    let sessionIcon;
    if (sessionPercent >= 99) {
      sessionIcon = generateRedXIcon();
    } else {
      const sessionColor = getBackgroundColor(sessionPercent, true, warnThreshold, dangerThreshold);
      sessionIcon = generatePercentageIcon(sessionPercent, sessionColor);
    }
    if (sessionTray && !sessionTray.isDestroyed()) {
      sessionTray.setImage(sessionIcon);
      let sessionTooltip = `Session: ${Math.round(sessionPercent)}%`;
      const sessionResetTime = formatResetTime(sessionResetsAt, timeFormat, false);
      if (sessionResetTime) {
        sessionTooltip += `\nResets: ${sessionResetTime}`;
      }
      sessionTray.setToolTip(sessionTooltip);
    }
  } catch (error) {
    console.error('Failed to update tray icons:', error);
  }
}

/**
 * Restore the bundled application icon on the main window's taskbar button,
 * and hide the weekly window's taskbar button (it stays alive, just hidden).
 */
function resetTaskbarIcon() {
  if (process.platform !== 'win32') return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setIcon(path.join(__dirname, 'assets/icon.ico'));
    } catch (error) {
      console.error('Failed to reset taskbar icon:', error);
    }
  }
  // Hide (not destroy) the weekly window's taskbar button — it stays alive,
  // already-minimized, for the app's whole lifetime. Destroying and
  // recreating it on every toggle was the direct cause of a repeated visible
  // flash; setSkipTaskbar is fully reversible without ever showing it again.
  if (weeklyTaskbarWindow && !weeklyTaskbarWindow.isDestroyed()) {
    weeklyTaskbarWindow.setSkipTaskbar(true);
  }
}

/**
 * Update the two Windows taskbar buttons with current usage: session on the
 * main window's own button, weekly on the paired invisible window's button.
 * Windows only — setIcon() is a no-op on macOS, and Linux desktops generally
 * take the taskbar icon from the .desktop entry rather than the window.
 * @param {Object} usageData - Usage data object containing session and weekly percentages
 */
function updateTaskbarIcon(usageData) {
  if (process.platform !== 'win32') return;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // "Hide from taskbar" removes the main window's taskbar button entirely, so
  // there is nothing to draw on for either icon — tear both down.
  const hiddenFromTaskbar = store.get('settings.minimizeToTray', false);
  if (hiddenFromTaskbar || !store.get('settings.showTaskbarStats', false)) {
    resetTaskbarIcon();
    return;
  }

  // Keep the default icon until there is something real to draw
  if (!usageData) return;

  createWeeklyTaskbarWindow();
  if (weeklyTaskbarWindow && !weeklyTaskbarWindow.isDestroyed()) {
    weeklyTaskbarWindow.setSkipTaskbar(false);
  }

  const warnThreshold = store.get('settings.warnThreshold', 75);
  const dangerThreshold = store.get('settings.dangerThreshold', 90);
  const sessionPercent = usageData?.five_hour?.utilization || 0;
  const weeklyPercent = usageData?.seven_day?.utilization || 0;

  try {
    mainWindow.setIcon(generateSingleTaskbarIcon(sessionPercent, true, warnThreshold, dangerThreshold));
    if (weeklyTaskbarWindow && !weeklyTaskbarWindow.isDestroyed()) {
      weeklyTaskbarWindow.setIcon(generateSingleTaskbarIcon(weeklyPercent, false, warnThreshold, dangerThreshold));
    }
  } catch (error) {
    console.error('Failed to update taskbar icons:', error);
  }
}


// IPC Handlers
ipcMain.handle('get-credentials', () => {
  let sessionKey = null;
  // Try safeStorage first (OS keychain)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {
        console.error('[Keychain] Failed to decrypt session key:', err.message);
      }
    }
  } else {
    // Fallback: plain storage (legacy or safeStorage unavailable)
    sessionKey = store.get('sessionKey');
  }
  return {
    sessionKey,
    organizationId: store.get('organizationId')
  };
});

ipcMain.handle('save-credentials', async (event, { sessionKey, organizationId }) => {
  // Store session key in OS keychain if available
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(sessionKey);
    store.set('sessionKey_encrypted', encrypted.toString('base64'));
    store.delete('sessionKey'); // Remove legacy plain storage
  } else {
    // Fallback: plain storage
    store.set('sessionKey', sessionKey);
  }
  if (organizationId) {
    store.set('organizationId', organizationId);
  }
  // Also set cookie in Electron session for window-based fetching
  await setSessionCookie(sessionKey);
  return true;
});

ipcMain.handle('delete-credentials', async () => {
  store.delete('sessionKey');
  store.delete('sessionKey_encrypted');
  store.delete('organizationId');
  // Remove all Claude.ai cookies
  const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
  for (const cookie of cookies) {
    await session.defaultSession.cookies.remove('https://claude.ai', cookie.name);
  }
  // Clear any cached data from the Electron session (storage, cache)
  // so nothing lingers on shared machines
  await session.defaultSession.clearStorageData({
    storages: ['localstorage', 'sessionstorage', 'cachestorage'],
    origin: 'https://claude.ai'
  });
  return true;
});

// Validate a sessionKey by fetching org ID via hidden BrowserWindow
ipcMain.handle('validate-session-key', async (event, sessionKey) => {
  debugLog('Validating session key:', sessionKey.substring(0, 20) + '...');
  try {
    // Set the cookie in Electron's session first
    await setSessionCookie(sessionKey);

    // Fetch organizations using hidden BrowserWindow (bypasses Cloudflare)
    const data = await fetchViaWindow('https://claude.ai/api/organizations');

    if (data && Array.isArray(data) && data.length > 0) {
      // Filter to orgs with 'chat' capability (excludes API-only orgs)
      const chatOrgs = data.filter(org => 
        org.capabilities && org.capabilities.includes('chat')
      );

      if (chatOrgs.length === 0) {
        return { success: false, error: 'No chat-enabled organizations found' };
      }

      // Prioritize Teams org if present, otherwise use first chat org
      const defaultOrg = chatOrgs.find(org => org.raven_type === 'team') || chatOrgs[0];
      const orgId = defaultOrg.uuid || defaultOrg.id;
      
      debugLog(`Session key validated, found ${chatOrgs.length} chat org(s), default org ID:`, orgId);
      
      return { 
        success: true, 
        organizationId: orgId,
        organizations: chatOrgs.map(org => ({
          id: org.uuid || org.id,
          name: org.name,
          isTeam: org.raven_type === 'team'
        }))
      };
    }

    // Check if it's an error response
    if (data && data.error) {
      return { success: false, error: data.error.message || data.error };
    }

    return { success: false, error: 'No organization found' };
  } catch (error) {
    console.error('Session key validation failed:', error.message);
    // Clean up the invalid cookie
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
    return { success: false, error: error.message };
  }
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    if (process.platform === 'darwin') {
      mainWindow.minimize();
    } else {
      const minimizeToTray = store.get('settings.minimizeToTray', false);
      if (minimizeToTray && hasTrayIcon()) {
        mainWindow.hide();
      } else {
        mainWindow.minimize();
      }
    }
  }
});

// Delegates to the mainWindow 'close' handler, which is the single source of
// truth for hide-vs-quit (checks hasTrayIcon()). Keeps that decision in one
// place instead of duplicating it here and risking the two drifting apart.
ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.on('resize-window', (event, height) => {
  if (mainWindow) {
    mainWindow.setContentSize(WIDGET_WIDTH, height);
  }
});

ipcMain.handle('get-window-position', () => {
  if (mainWindow) {
    return mainWindow.getBounds();
  }
  return null;
});

ipcMain.handle('set-window-position', (event, { x, y }) => {
  if (mainWindow) {
    mainWindow.setPosition(x, y);
    return true;
  }
  return false;
});

ipcMain.on('open-external', (event, url) => {
  // Trust boundary enforcement: duplicate allowlist check in main process
  const allowedDomains = ['claude.ai', 'github.com', 'paypal.me'];
  try {
    const parsedUrl = new URL(url);
    const isAllowed = allowedDomains.some(domain => 
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
    );
    if (isAllowed) {
      shell.openExternal(url);
    } else {
      console.warn(`[Security] Blocked openExternal call to disallowed domain: ${parsedUrl.hostname}`);
    }
  } catch (err) {
    console.warn(`[Security] Blocked openExternal call with invalid URL: ${url}`);
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-usage-history', () => {
  const organizationId = store.get('organizationId');
  const historyKey = organizationId ? `usageHistory_${organizationId}` : 'usageHistory';
  const history = store.get(historyKey, []);
  const cutoff = Date.now() - (CHART_DAYS * 24 * 60 * 60 * 1000);
  return history
    .filter((entry) => entry.timestamp > cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);
});

// Show a native OS desktop notification (Windows toast, macOS NC, Linux libnotify)
ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.show();
  }
});

// Resize window for compact vs normal mode
// Compact: 290px wide, normal: 530px wide. Height stays managed by renderer.
ipcMain.on('set-compact-mode', (event, compact) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    const width = compact ? COMPACT_WIDTH : WIDGET_WIDTH;
    const height = compact ? getCompactHeight() : WIDGET_HEIGHT;
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width, height });
  }
});

// Settings handlers
ipcMain.handle('get-settings', () => {
  return {
    autoStart: store.get('settings.autoStart', false),
    minimizeToTray: store.get('settings.minimizeToTray', false),
    alwaysOnTop: store.get('settings.alwaysOnTop', true),
    theme: store.get('settings.theme', 'dark'),
    warnThreshold: store.get('settings.warnThreshold', 75),
    dangerThreshold: store.get('settings.dangerThreshold', 90),
    timeFormat: store.get('settings.timeFormat', '12h'),
    weeklyDateFormat: store.get('settings.weeklyDateFormat', 'date'),
    usageAlerts: store.get('settings.usageAlerts', true),
    compactMode: store.get('settings.compactMode', false),
    refreshInterval: store.get('settings.refreshInterval', '300'),
    graphVisible: store.get('settings.graphVisible', false),
    expandedOpen: store.get('settings.expandedOpen', false),
    compactSpendOpen: store.get('settings.compactSpendOpen', false),
    showTrayStats: store.get('settings.showTrayStats', false),
    showTaskbarStats: store.get('settings.showTaskbarStats', false)
  };
});

ipcMain.handle('save-settings', (event, settings) => {
  const supportsLoginItems = process.platform !== 'linux';
  const autoStart = supportsLoginItems ? settings.autoStart : false;

  store.set('settings.autoStart', autoStart);
  store.set('settings.minimizeToTray', settings.minimizeToTray);
  store.set('settings.alwaysOnTop', settings.alwaysOnTop);
  store.set('settings.theme', settings.theme);
  store.set('settings.warnThreshold', settings.warnThreshold);
  store.set('settings.dangerThreshold', settings.dangerThreshold);
  store.set('settings.timeFormat', settings.timeFormat);
  store.set('settings.weeklyDateFormat', settings.weeklyDateFormat);
  store.set('settings.usageAlerts', settings.usageAlerts);
  store.set('settings.compactMode', settings.compactMode);
  store.set('settings.refreshInterval', settings.refreshInterval);
  store.set('settings.graphVisible', settings.graphVisible);
  store.set('settings.expandedOpen', settings.expandedOpen);
  // Guarded: settings objects cached by the renderer before this field
  // existed would otherwise overwrite the stored value with undefined.
  if (settings.compactSpendOpen !== undefined) {
    store.set('settings.compactSpendOpen', settings.compactSpendOpen);
  }
  store.set('settings.showTrayStats', settings.showTrayStats);
  store.set('settings.showTaskbarStats', settings.showTaskbarStats !== false);

  const isPortable = process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_FILE;

  // openAtLogin is not supported on Linux — Electron silently ignores it.
  // Skip the call entirely to avoid misleading behaviour.
  // Also skip for portable builds — autorun via registry is unreliable when the
  // exe path changes with each version. Users should use shell:startup instead.
  if (supportsLoginItems && !isPortable) {
    app.setLoginItemSettings({
      openAtLogin: autoStart,
      ...(process.platform !== 'darwin' && { path: app.getPath('exe') })
    });
  }

  if (mainWindow) {
    if (process.platform === 'darwin') {
      if (settings.minimizeToTray) { app.dock.hide(); } else { app.dock.show(); }
    } else {
      mainWindow.setSkipTaskbar(settings.minimizeToTray);
    }
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
  }

  const latestUsageData = store.get('latestUsageData');

  if (!settings.showTrayStats) {
    // Remove tray icons immediately when the setting is turned off from the UI.
    destroyTrayIcons();
  } else {
    // Refresh tray icons immediately with new threshold settings
    if (latestUsageData) {
      updateTrayIcon(latestUsageData);
    } else {
      // Create empty tray icons now; the next usage refresh will draw the stats.
      createTray();
    }
  }

  // Apply the taskbar icon change (or tear down the weekly window) without
  // waiting for the next refresh. Also handles "Hide from taskbar" hiding both.
  updateTaskbarIcon(latestUsageData);

  return true;
});

// Open a visible BrowserWindow for the user to log in to Claude.ai.
//
// Why we don't embed login directly in the app:
// Claude.ai (via Cloudflare) detects and blocks Electron-embedded logins.
// Instead, we open a standalone browser window, let the user authenticate
// normally, then capture the sessionKey cookie once login completes.
// Do NOT attempt to "fix" this back to an embedded login without verifying
// that Claude.ai/Cloudflare no longer blocks it.
//
// SECURITY: Navigation is restricted to trusted domains (claude.ai and OAuth
// providers) to prevent phishing attacks. Popup windows are blocked. Current
// URL is displayed in the window title bar for transparency.
ipcMain.handle('detect-session-key', async () => {
  // Clear any leftover sessionKey cookie
  try {
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
  } catch (e) { /* ignore */ }

  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Claude Login - https://claude.ai/login',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    let resolved = false;

    // Security: restrict navigation to trusted domains only
    const allowedLoginDomains = [
      'claude.ai',
      'accounts.google.com',
      'appleid.apple.com',
      'login.microsoftonline.com'
    ];

    loginWin.webContents.on('will-navigate', (event, url) => {
      try {
        const hostname = new URL(url).hostname;
        const isAllowed = allowedLoginDomains.some(domain =>
          hostname === domain || hostname.endsWith('.' + domain)
        );
        if (!isAllowed) {
          event.preventDefault();
          console.warn('[Security] Blocked login navigation to untrusted domain:', url);
        } else {
          // Update title bar to show current URL (read-only)
          loginWin.setTitle(`Claude Login - ${url}`);
        }
      } catch (err) {
        event.preventDefault();
        console.warn('[Security] Blocked login navigation with invalid URL:', url);
      }
    });

    // Update title on OAuth redirects and in-page navigation
    loginWin.webContents.on('did-navigate', (event, url) => {
      loginWin.setTitle(`Claude Login - ${url}`);
    });

    loginWin.webContents.on('did-navigate-in-page', (event, url) => {
      loginWin.setTitle(`Claude Login - ${url}`);
    });

    // Security: block popup windows from login page
    loginWin.webContents.setWindowOpenHandler(() => {
      console.warn('[Security] Blocked popup window attempt from login page');
      return { action: 'deny' };
    });

    // Listen for sessionKey cookie being set after login
    const onCookieChanged = (event, cookie, cause, removed) => {
      if (
        cookie.name === 'sessionKey' &&
        cookie.domain.includes('claude.ai') &&
        !removed &&
        cookie.value
      ) {
        resolved = true;
        session.defaultSession.cookies.removeListener('changed', onCookieChanged);
        loginWin.close();
        resolve({ success: true, sessionKey: cookie.value });
      }
    };

    session.defaultSession.cookies.on('changed', onCookieChanged);

    loginWin.on('closed', () => {
      session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      if (!resolved) {
        resolve({ success: false, error: 'Login window closed' });
      }
    });

    loginWin.loadURL('https://claude.ai/login');
  });
});

// Fetches and JSON-parses a GitHub API path. Resolves null on any failure
// (network error, timeout, non-JSON body) rather than rejecting, so callers
// can treat "couldn't check" the same as "nothing new" without a try/catch.
function fetchGithubJson(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'claude-usage-widget',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 5000
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// Check GitHub releases for a newer version. Runs the stable-release check
// for everyone; if the local build is itself a pre-release and no stable
// update supersedes it, also checks for a newer pre-release specifically —
// GitHub's /releases/latest endpoint never returns pre-releases, so that
// requires a second call to the plural /releases endpoint, which returns
// every release (stable and pre-release) with a "prerelease" boolean.
ipcMain.handle('check-for-update', async () => {
  const current = app.getVersion();

  const latest = await fetchGithubJson(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
  const latestTag = (latest?.tag_name || '').replace(/^v/, '');
  if (latestTag && isNewerVersion(latestTag, current)) {
    store.set('updateBannerVisible', true);
    return { hasUpdate: true, version: latestTag };
  }

  // 'dev' is the constant placeholder version checked into develop itself —
  // not a numbered pre-release track like rc/beta. A dev-branch runner is
  // always at least as new as whatever RC was last cut from develop, so
  // "there's a newer pre-release" would be backwards information for them.
  const localVersion = parseVersion(current);
  if (localVersion.preRelease !== null && localVersion.preReleaseLabel !== 'dev') {
    const all = await fetchGithubJson(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`);
    const newestPreRelease = Array.isArray(all) ? all.find((r) => r.prerelease) : null;
    const preTag = (newestPreRelease?.tag_name || '').replace(/^v/, '');
    if (preTag && isNewerPreRelease(preTag, current)) {
      store.set('updateBannerVisible', true);
      return { hasUpdate: true, version: preTag };
    }
  }

  store.set('updateBannerVisible', false);
  return { hasUpdate: false, version: null };
});

// Parses "1.7.6-rc.10" into comparable parts. preReleaseNum is parsed as an
// integer specifically so "rc.10" sorts after "rc.9" — comparing the raw
// preRelease string ("rc.10" vs "rc.9") breaks past single digits.
function parseVersion(ver) {
  const [mainVer, preRelease] = ver.split('-');
  const parts = mainVer.split('.').map(Number);
  let preReleaseLabel = null;
  let preReleaseNum = 0;
  if (preRelease) {
    const match = preRelease.match(/^([a-zA-Z]+)\.?(\d+)?$/);
    if (match) {
      preReleaseLabel = match[1];
      preReleaseNum = match[2] ? parseInt(match[2], 10) : 0;
    } else {
      preReleaseLabel = preRelease; // unrecognized suffix format — fall back to raw string
    }
  }
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    preRelease: preRelease || null,
    preReleaseLabel,
    preReleaseNum
  };
}

// Returns 1 if a > b, -1 if a < b, 0 if equal. A stable version (no
// preRelease) outranks any pre-release of the same major.minor.patch.
function compareVersions(a, b) {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  if (a.preRelease === null && b.preRelease === null) return 0;
  if (a.preRelease === null) return 1;
  if (b.preRelease === null) return -1;
  if (a.preReleaseLabel !== b.preReleaseLabel) {
    return a.preReleaseLabel > b.preReleaseLabel ? 1 : -1; // e.g. rc vs beta — not currently used, but won't crash
  }
  return a.preReleaseNum > b.preReleaseNum ? 1 : (a.preReleaseNum < b.preReleaseNum ? -1 : 0);
}

// Used for the stable-release check that runs for every user. Never
// surfaces a pre-release as an update, regardless of what the local build is.
function isNewerVersion(remote, local) {
  try {
    const r = parseVersion(remote);
    if (r.preRelease !== null) return false;
    return compareVersions(r, parseVersion(local)) > 0;
  } catch { return false; }
}

// Only meaningful when the local build is itself a pre-release. Compares
// remote against local including the pre-release number, so an rc.2 user is
// correctly notified about rc.3 (numeric comparison, not string comparison —
// see parseVersion). Also correctly surfaces a newer pre-release for a later
// major/minor/patch, not just a higher rc number on the same base version.
function isNewerPreRelease(remote, local) {
  try {
    const l = parseVersion(local);
    if (l.preRelease === null) return false;
    return compareVersions(parseVersion(remote), l) > 0;
  } catch { return false; }
}

ipcMain.handle('fetch-usage-data', async (event, options = {}) => {
  // Use the same credential retrieval logic as get-credentials
  let sessionKey = null;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {
        console.error('[Keychain] Failed to decrypt session key:', err.message);
      }
    }
  } else {
    sessionKey = store.get('sessionKey');
  }

  const organizationId = store.get('organizationId');

  if (!sessionKey || !organizationId) {
    throw new Error('Missing credentials');
  }

  // Ensure cookie is set
  await setSessionCookie(sessionKey);

  // Conditional API polling: Only fetch overage/prepaid if the expand panel is open
  // or if compact mode is disabled (normal mode). This reduces API calls when the
  // user won't see the extra usage data anyway.
  // If forceExtended is passed (e.g., when user clicks expand), use that instead of saved setting
  const expandedOpen = options.forceExtended !== undefined ? options.forceExtended : store.get('settings.expandedOpen', false);
  const compactMode = store.get('settings.compactMode', false);
  // Compact mode forces the main expanded panel closed, so spend/credit
  // endpoints are additionally polled while the compact spend row is toggled
  // open. Collapsed compact mode does not poll the extended endpoints at all.
  const compactSpendOpen = compactMode && store.get('settings.compactSpendOpen', false);
  const shouldFetchExtended = expandedOpen || compactSpendOpen;

  const usageUrl = `https://claude.ai/api/organizations/${organizationId}/usage`;
  const overageUrl = `https://claude.ai/api/organizations/${organizationId}/overage_spend_limit`;
  const prepaidUrl = `https://claude.ai/api/organizations/${organizationId}/prepaid/credits`;

  // Build URL array based on UI state
  const urls = [usageUrl];
  if (shouldFetchExtended) {
    urls.push(overageUrl, prepaidUrl);
    debugLog('[Conditional Polling] Fetching extended data (overage + prepaid) - panel is visible');
  } else {
    debugLog('[Conditional Polling] Skipping extended data - panel not visible');
  }

  // Fetch endpoints sequentially using a single reused BrowserWindow.
  // This reduces memory overhead compared to creating 3 separate windows.
  // Usage is always required; overage and prepaid are conditional based on UI state.
  let usageResult, overageResult, prepaidResult;
  
  try {
    const results = await fetchMultipleViaWindow(urls);
    
    // Always have usage result (first in array)
    usageResult = { status: 'fulfilled', value: results[0] };
    
    // Conditionally map overage/prepaid results
    if (shouldFetchExtended) {
      overageResult = { status: 'fulfilled', value: results[1] };
      prepaidResult = { status: 'fulfilled', value: results[2] };
    } else {
      // Mark as skipped (not an error, just not fetched)
      overageResult = { status: 'skipped', reason: 'UI panel not visible' };
      prepaidResult = { status: 'skipped', reason: 'UI panel not visible' };
    }
  } catch (error) {
    // If any fetch fails, determine which one and set appropriate result statuses
    // For now, if the batch fails, treat usage as failed (required endpoint)
    usageResult = { status: 'rejected', reason: error };
    overageResult = { status: 'rejected', reason: error };
    prepaidResult = { status: 'rejected', reason: error };
  }

  // Usage endpoint is mandatory
  if (usageResult.status === 'rejected') {
    const error = usageResult.reason;
    debugLog('API request failed:', error.message);
    const isBlocked = error.message.startsWith('CloudflareBlocked')
      || error.message.startsWith('CloudflareChallenge')
      || error.message.startsWith('UnexpectedHTML');
    if (isBlocked) {
      store.delete('sessionKey');
      store.delete('organizationId');
      if (mainWindow) {
        mainWindow.webContents.send('session-expired');
      }
      throw new Error('SessionExpired');
    }
    throw error;
  }

  const data = usageResult.value;

  // Normalize per-model weekly limits (e.g. Fable) from the `limits` array into
  // synthetic seven_day_<name> top-level fields BEFORE they are stored to
  // history or returned to the renderer, so both consumers share one source of
  // truth. Must run before storeUsageHistory() and before `return data`.
  normalizeUsageLimits(data);

  // Merge overage spending data into data.extra_usage
  if (overageResult.status === 'fulfilled' && overageResult.value) {
    const overage = overageResult.value;
    const limit = overage.monthly_credit_limit ?? overage.spend_limit_amount_cents;
    const used = overage.used_credits ?? overage.balance_cents;
    const enabled = overage.is_enabled !== undefined ? overage.is_enabled : (limit != null);

    if (enabled && typeof limit === 'number' && limit > 0 && typeof used === 'number') {
      data.extra_usage = {
        utilization: (used / limit) * 100,
        resets_at: null,
        used_cents: used,
        limit_cents: limit,
        is_enabled: true,
        currency: overage.currency || 'USD',
      };
    } else if (!enabled) {
      // Extra usage is off — still pass the flag so the renderer can show status
      if (!data.extra_usage) data.extra_usage = {};
      data.extra_usage.is_enabled = false;
      data.extra_usage.currency = overage.currency || 'USD';
    }
  } else {
    debugLog('Overage fetch skipped or failed:', overageResult.reason?.message || 'no data');
  }

  // Merge prepaid balance into data.extra_usage
  if (prepaidResult.status === 'fulfilled' && prepaidResult.value) {
    const prepaid = prepaidResult.value;
    if (typeof prepaid.amount === 'number') {
      if (!data.extra_usage) data.extra_usage = {};
      data.extra_usage.balance_cents = prepaid.amount;
      // Use prepaid currency if overage didn't already set one
      if (!data.extra_usage.currency && prepaid.currency) {
        data.extra_usage.currency = prepaid.currency;
      }

      // Credit clarity: split promotional vs purchased tranches so the
      // renderer can show "money at risk" and expiry warnings.
      const sumTranches = (arr) => Array.isArray(arr)
        ? arr.reduce((s, t) => s + (t.remaining_amount_minor_units || 0), 0)
        : null;
      const promoCents = sumTranches(prepaid.promo_tranches);
      const paidCents = sumTranches(prepaid.tranches);
      if (promoCents != null) data.extra_usage.promo_cents = promoCents;
      if (paidCents != null) data.extra_usage.paid_cents = paidCents;

      if (prepaid.next_expires_at) {
        data.extra_usage.next_expires_at = prepaid.next_expires_at;
        // Amount expiring at that date = sum of all tranches sharing it
        const allTranches = [
          ...(Array.isArray(prepaid.promo_tranches) ? prepaid.promo_tranches : []),
          ...(Array.isArray(prepaid.tranches) ? prepaid.tranches : []),
        ];
        data.extra_usage.next_expiry_cents = allTranches
          .filter((t) => t.expires_at === prepaid.next_expires_at)
          .reduce((s, t) => s + (t.remaining_amount_minor_units || 0), 0);
      }
    }
  } else {
    debugLog('Prepaid fetch skipped or failed:', prepaidResult.reason?.message || 'no data');
  }

  storeUsageHistory(data);

  // Store latest usage data for settings refresh
  store.set('latestUsageData', data);

  // Update tray and taskbar icons with current usage data
  updateTrayIcon(data);
  updateTaskbarIcon(data);

  // Keep the compact window sized correctly if the Fable row just appeared/disappeared
  if (mainWindow && !mainWindow.isDestroyed() && store.get('settings.compactMode', false)) {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: COMPACT_WIDTH, height: getCompactHeight() });
  }

  // Re-assert always-on-top after hidden BrowserWindows from fetchViaWindow
  // are destroyed — creating/destroying BrowserWindows can temporarily disrupt
  // the main window's z-order on some OS/window manager combinations.
  if (mainWindow && !mainWindow.isDestroyed()) {
    const alwaysOnTop = store.get('settings.alwaysOnTop', true);
    if (alwaysOnTop) {
      mainWindow.setAlwaysOnTop(true, 'floating');
    }
  }

  return data;
});

// App lifecycle
app.whenReady().then(async () => {
  // Restore session cookie if we have stored credentials
  let sessionKey = null;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {
        console.error('[Keychain] Failed to decrypt session key on startup:', err.message);
      }
    }
  } else {
    sessionKey = store.get('sessionKey');
  }

  if (sessionKey) {
    await setSessionCookie(sessionKey);
  }

  migrateUsageHistoryKey();
  pruneStaleHistoryKeys();

  createMainWindow();
  // Avoid creating temporary tray icons during startup when tray stats are disabled.
  if (store.get('settings.showTrayStats', false)) {
    createTray();
  }
  // Created once, unconditionally, regardless of the taskbar-stats setting —
  // it stays alive for the app's whole lifetime; updateTaskbarIcon() right
  // below decides whether its taskbar button is actually visible.
  if (process.platform === 'win32') {
    createWeeklyTaskbarWindow();
  }
  // Show the last known usage on the taskbar immediately instead of waiting
  // for the first refresh to come back.
  updateTaskbarIcon(store.get('latestUsageData'));

  // Clear any stale Jump List tasks from earlier builds (the removed
  // taskbar "Center App" task). Windows caches setUserTasks() entries
  // against the AppUserModelID independently of whether the app still
  // calls it, so simply removing the code that set it isn't enough.
  if (process.platform === 'win32') {
    app.setUserTasks([]);
  }

  // Apply persisted settings
  const minimizeToTray = store.get('settings.minimizeToTray', false);
  const alwaysOnTop = store.get('settings.alwaysOnTop', true);
  if (mainWindow) {
    if (process.platform === 'darwin') {
      if (minimizeToTray) app.dock.hide();
    } else {
      if (minimizeToTray) mainWindow.setSkipTaskbar(true);
    }
    mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
  }

  // Periodic always-on-top re-assertion to recover from z-order disruptions
  // (hidden window spawns, window manager shortcuts, alt-tab, etc.)
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const alwaysOnTopSetting = store.get('settings.alwaysOnTop', true);
      if (alwaysOnTopSetting) {
        mainWindow.setAlwaysOnTop(true, 'floating');
      }
    }
  }, 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Safety net: the 'close' handler above is the primary gate, but if
    // something else ever destroys the window without going through it,
    // don't leave a headless zombie process with no tray icon to recover
    // through. Keep running only when a tray icon actually exists.
    if (!hasTrayIcon()) {
      app.quit();
    }
  }
});

// Fires before any window's 'close' event on every genuine quit path.
// Without this flag, the mainWindow 'close' handler can't tell a real
// quit apart from a click on the close button to just minimize.
app.on('before-quit', () => {
  isQuitting = true;
  // window-all-closed only fires once zero BrowserWindow instances remain,
  // regardless of hidden/minimized state — the invisible weekly-stats window
  // has to go down on every real quit path too, or it would silently keep
  // the app alive with no visible window and no way back in.
  destroyWeeklyTaskbarWindow();
});

app.on('activate', () => {
  showMainWindowSmart();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindowSmart();
  });
}
