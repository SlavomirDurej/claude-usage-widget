const { app, BrowserWindow, ipcMain, Tray, Menu, session, shell, Notification, safeStorage, nativeImage } = require('electron');
const path = require('path');
const https = require('https');
const Store = require('electron-store');
const { fetchViaWindow, fetchMultipleViaWindow } = require('./src/fetch-via-window');

const GITHUB_OWNER = 'SlavomirDurej';
const GITHUB_REPO = 'claude-usage-widget';

const fs = require('fs');
const os = require('os');

let configPath;
if (process.platform === 'darwin') {
  configPath = path.join(os.homedir(), 'Library', 'Application Support', 'claude-usage-widget', 'config.json');
} else if (process.platform === 'win32') {
  configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'claude-usage-widget', 'config.json');
} else {
  configPath = path.join(os.homedir(), '.config', 'claude-usage-widget', 'config.json');
}

try {
  if (fs.existsSync(configPath)) {
    const rawData = fs.readFileSync(configPath, 'utf-8');
    if (rawData.includes('\u0000') || !rawData.trim().startsWith('{')) {
      console.log('[Migration] Detected old encrypted config from v1.7.0, deleting for fresh start');
      fs.unlinkSync(configPath);
    }
  }
} catch (err) {
  console.error('[Migration] Error checking config file:', err.message);
  try {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  } catch {}
}

const store = new Store();

const DEBUG = process.env.DEBUG_LOG === '1' || process.argv.includes('--debug');
function debugLog(...args) {
  if (DEBUG) console.log('[Debug]', ...args);
}

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let mainWindow = null;
let sessionTray = null; // Single menu bar icon

const WIDGET_WIDTH = process.platform === 'darwin' ? 590 : 560;
const WIDGET_HEIGHT = 155;
const HISTORY_RETENTION_DAYS = 30;
const CHART_DAYS = 7;
const MAX_HISTORY_SAMPLES = 10000;

function storeUsageHistory(data) {
  const timestamp = Date.now();
  let history = store.get('usageHistory', []);
  history.push({
    timestamp,
    session: data.five_hour?.utilization || 0,
    weekly: data.seven_day?.utilization || 0,
    sonnet: data.seven_day_sonnet?.utilization || 0,
    extraUsage: data.extra_usage?.utilization || 0
  });
  const cutoff = timestamp - (HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  history = history.filter((entry) => entry.timestamp > cutoff);
  if (history.length > MAX_HISTORY_SAMPLES) {
    history = history.slice(history.length - MAX_HISTORY_SAMPLES);
  }
  store.set('usageHistory', history);
}

app.on('ready', () => {
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);
});

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

// Position popup just below the tray icon
function positionWindowBelowTray(trayRef) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const trayBounds = trayRef.getBounds();
  const windowBounds = mainWindow.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 2);
  mainWindow.setPosition(x, y, false);
}

function createMainWindow() {
  const windowOptions = {
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false, // Hidden on launch — appears on tray click
    icon: path.join(__dirname, process.platform === 'darwin' ? 'assets/icon.icns' : process.platform === 'linux' ? 'assets/logo.png' : 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.loadFile('src/renderer/index.html');

  // Hide popup when user clicks anywhere outside it
  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function getBackgroundColor(percent, isSession, warnThreshold, dangerThreshold) {
  if (percent >= dangerThreshold) {
    return { r: 239, g: 68, b: 68 };
  } else if (percent >= warnThreshold) {
    return { r: 245, g: 158, b: 11 };
  } else {
    if (isSession) {
      return { r: 139, g: 92, b: 246 };
    } else {
      return { r: 59, g: 130, b: 246 };
    }
  }
}

const BITMAP_FONT = {
  '0': [0b00111100,0b01111110,0b11100111,0b11000011,0b11000011,0b11000011,0b11000011,0b11000011,0b11100111,0b01111110,0b00111100],
  '1': [0b00011000,0b00111000,0b01111000,0b00011000,0b00011000,0b00011000,0b00011000,0b00011000,0b00011000,0b01111110,0b01111110],
  '2': [0b00111100,0b01111110,0b11100111,0b00000011,0b00000110,0b00011100,0b00111000,0b01110000,0b11100000,0b11111111,0b11111111],
  '3': [0b00111100,0b01111110,0b11100111,0b00000011,0b00000110,0b00111100,0b00000110,0b00000011,0b11100111,0b01111110,0b00111100],
  '4': [0b00000110,0b00001110,0b00011110,0b00110110,0b01100110,0b11111111,0b11111111,0b00000110,0b00000110,0b00000110,0b00000110],
  '5': [0b11111111,0b11111111,0b11000000,0b11000000,0b11111100,0b00000110,0b00000011,0b00000011,0b11100111,0b01111110,0b00111100],
  '6': [0b00111100,0b01111110,0b11100000,0b11000000,0b11111100,0b11100110,0b11000011,0b11000011,0b11100111,0b01111110,0b00111100],
  '7': [0b11111111,0b11111111,0b00000011,0b00000110,0b00001100,0b00011000,0b00110000,0b00110000,0b01100000,0b01100000,0b01100000],
  '8': [0b00111100,0b01111110,0b11100111,0b11000011,0b01111110,0b00111100,0b01111110,0b11000011,0b11100111,0b01111110,0b00111100],
  '9': [0b00111100,0b01111110,0b11100111,0b11000011,0b11000011,0b01111111,0b00111111,0b00000011,0b00000111,0b01111110,0b00111100]
};

const BITMAP_FONT_NARROW = {
  '0': [0b011110,0b111111,0b110011,0b110011,0b110011,0b110011,0b110011,0b110011,0b110011,0b111111,0b011110],
  '1': [0b001100,0b011100,0b111100,0b001100,0b001100,0b001100,0b001100,0b001100,0b001100,0b111111,0b111111]
};

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

function generatePercentageIcon(percent, bgColor) {
  const width = 20;
  const height = 20;
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      buffer[offset] = bgColor.b;
      buffer[offset + 1] = bgColor.g;
      buffer[offset + 2] = bgColor.r;
      buffer[offset + 3] = 255;
    }
  }
  const percentText = Math.round(percent).toString();
  const textColor = { r: 255, g: 255, b: 255, a: 255 };
  const useNarrow = percentText.length >= 3;
  const charWidth = useNarrow ? 6 : 8;
  const charHeight = 11;
  const gap = percentText.length >= 3 ? 0 : 1;
  const totalWidth = percentText.length * charWidth + (percentText.length - 1) * gap;
  let startX = Math.floor((width - totalWidth) / 2);
  const startY = Math.floor((height - charHeight) / 2);
  for (let i = 0; i < percentText.length; i++) {
    drawChar(buffer, width, height, percentText[i], startX, startY, textColor, useNarrow);
    startX += charWidth + gap;
  }
  return nativeImage.createFromBuffer(buffer, { width, height });
}

function generateRedXIcon() {
  const width = 20;
  const height = 20;
  const buffer = Buffer.alloc(width * height * 4);
  const red = { r: 220, g: 53, b: 69 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      buffer[offset] = red.b;
      buffer[offset + 1] = red.g;
      buffer[offset + 2] = red.r;
      buffer[offset + 3] = 255;
    }
  }
  const white = { r: 255, g: 255, b: 255, a: 255 };
  for (let i = 0; i < 11; i++) {
    const x1 = 5 + i; const y1 = 5 + i;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const px = x1 + dx; const py = y1 + dy;
        if (px < width && py < height) {
          const offset = (py * width + px) * 4;
          buffer[offset] = white.b; buffer[offset + 1] = white.g;
          buffer[offset + 2] = white.r; buffer[offset + 3] = white.a;
        }
      }
    }
  }
  for (let i = 0; i < 11; i++) {
    const x1 = 15 - i; const y1 = 5 + i;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const px = x1 + dx; const py = y1 + dy;
        if (px < width && py < height) {
          const offset = (py * width + px) * 4;
          buffer[offset] = white.b; buffer[offset + 1] = white.g;
          buffer[offset + 2] = white.r; buffer[offset + 3] = white.a;
        }
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width, height });
}

function showMainWindowClean() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (process.platform === 'win32') {
    mainWindow.setOpacity(0);
    mainWindow.show();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(1);
    }, 50);
  } else {
    mainWindow.show();
  }
}

function createTray() {
  try {
    const staticIconPath = path.join(__dirname,
      process.platform === 'darwin' ? 'assets/tray-icon-mac.png' :
      process.platform === 'linux'  ? 'assets/tray-icon-linux.png' :
                                       'assets/tray-icon.png');

    // Single icon in the menu bar
    sessionTray = new Tray(staticIconPath);
    sessionTray.setToolTip('Claude Usage');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Widget',
        click: () => {
          if (mainWindow) {
            positionWindowBelowTray(sessionTray);
            showMainWindowClean();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        }
      },
      {
        label: 'Refresh',
        click: () => {
          if (mainWindow) mainWindow.webContents.send('refresh-usage');
        }
      },
      { type: 'separator' },
      {
        label: 'Log Out',
        click: async () => {
          store.delete('sessionKey');
          store.delete('organizationId');
          const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
          for (const cookie of cookies) {
            await session.defaultSession.cookies.remove('https://claude.ai', cookie.name);
          }
          await session.defaultSession.clearStorageData({
            storages: ['localstorage', 'sessionstorage', 'cachestorage'],
            origin: 'https://claude.ai'
          });
          if (mainWindow) mainWindow.webContents.send('session-expired');
        }
      },
      { type: 'separator' },
      { label: 'Exit', click: () => app.quit() }
    ]);

    // Left click — toggle popup
    sessionTray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        positionWindowBelowTray(sessionTray);
        showMainWindowClean();
        mainWindow.focus();
      }
    });

    // Right click — context menu
    sessionTray.on('right-click', () => {
      sessionTray.popUpContextMenu(contextMenu);
    });

  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

// Update the tray icon with current usage percentage.
// When showTrayStats is false, keep the static icon so there's always a menu bar icon.
function updateTrayIcon(usageData) {
  if (!sessionTray || sessionTray.isDestroyed()) return;

  const showTrayStats = store.get('settings.showTrayStats', false);
  const staticIconPath = path.join(__dirname,
    process.platform === 'darwin' ? 'assets/tray-icon-mac.png' :
    process.platform === 'linux'  ? 'assets/tray-icon-linux.png' :
                                     'assets/tray-icon.png');

  if (!showTrayStats) {
    sessionTray.setImage(staticIconPath);
    sessionTray.setToolTip('Claude Usage');
    return;
  }

  const warnThreshold   = store.get('settings.warnThreshold', 75);
  const dangerThreshold = store.get('settings.dangerThreshold', 90);
  const sessionPercent  = usageData?.five_hour?.utilization || 0;

  try {
    let icon;
    if (sessionPercent >= 99) {
      icon = generateRedXIcon();
    } else {
      const color = getBackgroundColor(sessionPercent, true, warnThreshold, dangerThreshold);
      icon = generatePercentageIcon(sessionPercent, color);
    }
    sessionTray.setImage(icon);
    sessionTray.setToolTip(`Session: ${Math.round(sessionPercent)}%`);
  } catch (error) {
    console.error('Failed to update tray icon:', error);
  }
}

// IPC Handlers
ipcMain.handle('get-credentials', () => {
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
  return { sessionKey, organizationId: store.get('organizationId') };
});

ipcMain.handle('save-credentials', async (event, { sessionKey, organizationId }) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(sessionKey);
    store.set('sessionKey_encrypted', encrypted.toString('base64'));
    store.delete('sessionKey');
  } else {
    store.set('sessionKey', sessionKey);
  }
  if (organizationId) store.set('organizationId', organizationId);
  await setSessionCookie(sessionKey);
  return true;
});

ipcMain.handle('delete-credentials', async () => {
  store.delete('sessionKey');
  store.delete('sessionKey_encrypted');
  store.delete('organizationId');
  const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
  for (const cookie of cookies) {
    await session.defaultSession.cookies.remove('https://claude.ai', cookie.name);
  }
  await session.defaultSession.clearStorageData({
    storages: ['localstorage', 'sessionstorage', 'cachestorage'],
    origin: 'https://claude.ai'
  });
  return true;
});

ipcMain.handle('validate-session-key', async (event, sessionKey) => {
  debugLog('Validating session key:', sessionKey.substring(0, 20) + '...');
  try {
    await setSessionCookie(sessionKey);
    const data = await fetchViaWindow('https://claude.ai/api/organizations');
    if (data && Array.isArray(data) && data.length > 0) {
      const chatOrgs = data.filter(org => org.capabilities && org.capabilities.includes('chat'));
      if (chatOrgs.length === 0) return { success: false, error: 'No chat-enabled organizations found' };
      const defaultOrg = chatOrgs.find(org => org.raven_type === 'team') || chatOrgs[0];
      const orgId = defaultOrg.uuid || defaultOrg.id;
      debugLog(`Session key validated, found ${chatOrgs.length} chat org(s), default org ID:`, orgId);
      return {
        success: true,
        organizationId: orgId,
        organizations: chatOrgs.map(org => ({ id: org.uuid || org.id, name: org.name, isTeam: org.raven_type === 'team' }))
      };
    }
    if (data && data.error) return { success: false, error: data.error.message || data.error };
    return { success: false, error: 'No organization found' };
  } catch (error) {
    console.error('Session key validation failed:', error.message);
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
    return { success: false, error: error.message };
  }
});

// Minimize hides the popup — no Dock to minimize to
ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('close-window', () => { app.quit(); });

ipcMain.on('resize-window', (event, height) => {
  if (mainWindow) mainWindow.setContentSize(WIDGET_WIDTH, height);
});

ipcMain.handle('get-window-position', () => {
  if (mainWindow) return mainWindow.getBounds();
  return null;
});

ipcMain.handle('set-window-position', (event, { x, y }) => {
  if (mainWindow) { mainWindow.setPosition(x, y); return true; }
  return false;
});

ipcMain.on('open-external', (event, url) => {
  const allowedDomains = ['claude.ai', 'github.com', 'paypal.me'];
  try {
    const parsedUrl = new URL(url);
    const isAllowed = allowedDomains.some(domain =>
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain));
    if (isAllowed) {
      shell.openExternal(url);
    } else {
      console.warn(`[Security] Blocked openExternal call to disallowed domain: ${parsedUrl.hostname}`);
    }
  } catch (err) {
    console.warn(`[Security] Blocked openExternal call with invalid URL: ${url}`);
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-usage-history', () => {
  const history = store.get('usageHistory', []);
  const cutoff = Date.now() - (CHART_DAYS * 24 * 60 * 60 * 1000);
  return history.filter((entry) => entry.timestamp > cutoff).sort((a, b) => a.timestamp - b.timestamp);
});

ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.show();
  }
});

ipcMain.on('set-compact-mode', (event, compact) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    const width  = compact ? 290 : WIDGET_WIDTH;
    const height = compact ? 105 : WIDGET_HEIGHT;
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width, height });
  }
});

ipcMain.handle('get-settings', () => ({
  autoStart:        store.get('settings.autoStart', false),
  minimizeToTray:   store.get('settings.minimizeToTray', false),
  alwaysOnTop:      store.get('settings.alwaysOnTop', true),
  theme:            store.get('settings.theme', 'dark'),
  warnThreshold:    store.get('settings.warnThreshold', 75),
  dangerThreshold:  store.get('settings.dangerThreshold', 90),
  timeFormat:       store.get('settings.timeFormat', '12h'),
  weeklyDateFormat: store.get('settings.weeklyDateFormat', 'date'),
  usageAlerts:      store.get('settings.usageAlerts', true),
  compactMode:      store.get('settings.compactMode', false),
  refreshInterval:  store.get('settings.refreshInterval', '300'),
  graphVisible:     store.get('settings.graphVisible', false),
  expandedOpen:     store.get('settings.expandedOpen', false),
  showTrayStats:    store.get('settings.showTrayStats', false)
}));

ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings.autoStart',        settings.autoStart);
  store.set('settings.minimizeToTray',   settings.minimizeToTray);
  store.set('settings.alwaysOnTop',      settings.alwaysOnTop);
  store.set('settings.theme',            settings.theme);
  store.set('settings.warnThreshold',    settings.warnThreshold);
  store.set('settings.dangerThreshold',  settings.dangerThreshold);
  store.set('settings.timeFormat',       settings.timeFormat);
  store.set('settings.weeklyDateFormat', settings.weeklyDateFormat);
  store.set('settings.usageAlerts',      settings.usageAlerts);
  store.set('settings.compactMode',      settings.compactMode);
  store.set('settings.refreshInterval',  settings.refreshInterval);
  store.set('settings.graphVisible',     settings.graphVisible);
  store.set('settings.expandedOpen',     settings.expandedOpen);
  store.set('settings.showTrayStats',    settings.showTrayStats);

  if (process.platform !== 'linux') {
    app.setLoginItemSettings({
      openAtLogin: settings.autoStart,
      ...(process.platform !== 'darwin' && { path: app.getPath('exe') })
    });
  }

  // Dock stays hidden on macOS always (menu bar app)
  if (mainWindow && process.platform !== 'darwin') {
    mainWindow.setSkipTaskbar(settings.minimizeToTray);
  }
  if (mainWindow) mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating');

  const latestUsageData = store.get('latestUsageData');
  if (latestUsageData) updateTrayIcon(latestUsageData);

  return true;
});

ipcMain.handle('detect-session-key', async () => {
  try {
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
  } catch (e) {}

  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Claude Login - https://claude.ai/login',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    let resolved = false;
    const allowedLoginDomains = ['claude.ai','accounts.google.com','appleid.apple.com','login.microsoftonline.com'];

    loginWin.webContents.on('will-navigate', (event, url) => {
      try {
        const hostname = new URL(url).hostname;
        const isAllowed = allowedLoginDomains.some(d => hostname === d || hostname.endsWith('.' + d));
        if (!isAllowed) {
          event.preventDefault();
          console.warn('[Security] Blocked login navigation to untrusted domain:', url);
        } else {
          loginWin.setTitle('Claude Login - ' + url);
        }
      } catch (err) {
        event.preventDefault();
        console.warn('[Security] Blocked login navigation with invalid URL:', url);
      }
    });

    loginWin.webContents.on('did-navigate',         (event, url) => loginWin.setTitle('Claude Login - ' + url));
    loginWin.webContents.on('did-navigate-in-page', (event, url) => loginWin.setTitle('Claude Login - ' + url));
    loginWin.webContents.setWindowOpenHandler(() => {
      console.warn('[Security] Blocked popup window attempt from login page');
      return { action: 'deny' };
    });

    const onCookieChanged = (event, cookie, cause, removed) => {
      if (cookie.name === 'sessionKey' && cookie.domain.includes('claude.ai') && !removed && cookie.value) {
        resolved = true;
        session.defaultSession.cookies.removeListener('changed', onCookieChanged);
        loginWin.close();
        resolve({ success: true, sessionKey: cookie.value });
      }
    };

    session.defaultSession.cookies.on('changed', onCookieChanged);
    loginWin.on('closed', () => {
      session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      if (!resolved) resolve({ success: false, error: 'Login window closed' });
    });

    loginWin.loadURL('https://claude.ai/login');
  });
});

ipcMain.handle('check-for-update', () => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases/latest',
      method: 'GET',
      headers: { 'User-Agent': 'claude-usage-widget', 'Accept': 'application/vnd.github+json' },
      timeout: 5000
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const tag = (data.tag_name || '').replace(/^v/, '');
          const current = app.getVersion();
          if (tag && isNewerVersion(tag, current)) {
            resolve({ hasUpdate: true, version: tag });
          } else {
            resolve({ hasUpdate: false, version: null });
          }
        } catch {
          resolve({ hasUpdate: false, version: null });
        }
      });
    });
    req.on('error', () => resolve({ hasUpdate: false, version: null }));
    req.on('timeout', () => { req.destroy(); resolve({ hasUpdate: false, version: null }); });
    req.end();
  });
});

function isNewerVersion(remote, local) {
  try {
    const parseVersion = (ver) => {
      const [mainVer, preRelease] = ver.split('-');
      const parts = mainVer.split('.').map(Number);
      return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0, preRelease: preRelease || null };
    };
    const r = parseVersion(remote);
    const l = parseVersion(local);
    if (r.major !== l.major) return r.major > l.major;
    if (r.minor !== l.minor) return r.minor > l.minor;
    if (r.patch !== l.patch) return r.patch > l.patch;
    if (r.preRelease === null && l.preRelease !== null) return true;
    if (r.preRelease !== null && l.preRelease === null) return false;
    return false;
  } catch { return false; }
}

ipcMain.handle('fetch-usage-data', async (event, options = {}) => {
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
  if (!sessionKey || !organizationId) throw new Error('Missing credentials');

  await setSessionCookie(sessionKey);

  const expandedOpen = options.forceExtended !== undefined ? options.forceExtended : store.get('settings.expandedOpen', false);
  const shouldFetchExtended = expandedOpen;

  const usageUrl   = 'https://claude.ai/api/organizations/' + organizationId + '/usage';
  const overageUrl = 'https://claude.ai/api/organizations/' + organizationId + '/overage_spend_limit';
  const prepaidUrl = 'https://claude.ai/api/organizations/' + organizationId + '/prepaid/credits';

  const urls = [usageUrl];
  if (shouldFetchExtended) {
    urls.push(overageUrl, prepaidUrl);
    debugLog('[Conditional Polling] Fetching extended data');
  } else {
    debugLog('[Conditional Polling] Skipping extended data');
  }

  let usageResult, overageResult, prepaidResult;
  try {
    const results = await fetchMultipleViaWindow(urls);
    usageResult = { status: 'fulfilled', value: results[0] };
    if (shouldFetchExtended) {
      overageResult = { status: 'fulfilled', value: results[1] };
      prepaidResult = { status: 'fulfilled', value: results[2] };
    } else {
      overageResult = { status: 'skipped', reason: 'UI panel not visible' };
      prepaidResult = { status: 'skipped', reason: 'UI panel not visible' };
    }
  } catch (error) {
    usageResult = { status: 'rejected', reason: error };
    overageResult = { status: 'rejected', reason: error };
    prepaidResult = { status: 'rejected', reason: error };
  }

  if (usageResult.status === 'rejected') {
    const error = usageResult.reason;
    debugLog('API request failed:', error.message);
    const isBlocked = error.message.startsWith('CloudflareBlocked')
      || error.message.startsWith('CloudflareChallenge')
      || error.message.startsWith('UnexpectedHTML');
    if (isBlocked) {
      store.delete('sessionKey');
      store.delete('organizationId');
      if (mainWindow) mainWindow.webContents.send('session-expired');
      throw new Error('SessionExpired');
    }
    throw error;
  }

  const data = usageResult.value;

  if (overageResult.status === 'fulfilled' && overageResult.value) {
    const overage = overageResult.value;
    const limit = overage.monthly_credit_limit ?? overage.spend_limit_amount_cents;
    const used  = overage.used_credits ?? overage.balance_cents;
    const enabled = overage.is_enabled !== undefined ? overage.is_enabled : (limit != null);
    if (enabled && typeof limit === 'number' && limit > 0 && typeof used === 'number') {
      data.extra_usage = { utilization: (used / limit) * 100, resets_at: null, used_cents: used, limit_cents: limit, is_enabled: true, currency: overage.currency || 'USD' };
    } else if (!enabled) {
      if (!data.extra_usage) data.extra_usage = {};
      data.extra_usage.is_enabled = false;
      data.extra_usage.currency = overage.currency || 'USD';
    }
  }

  if (prepaidResult.status === 'fulfilled' && prepaidResult.value) {
    const prepaid = prepaidResult.value;
    if (typeof prepaid.amount === 'number') {
      if (!data.extra_usage) data.extra_usage = {};
      data.extra_usage.balance_cents = prepaid.amount;
      if (!data.extra_usage.currency && prepaid.currency) data.extra_usage.currency = prepaid.currency;
    }
  }

  storeUsageHistory(data);
  store.set('latestUsageData', data);
  updateTrayIcon(data);

  if (mainWindow && !mainWindow.isDestroyed()) {
    const alwaysOnTop = store.get('settings.alwaysOnTop', true);
    if (alwaysOnTop) mainWindow.setAlwaysOnTop(true, 'floating');
  }

  return data;
});

// App lifecycle
app.whenReady().then(async () => {
  // Hide from Dock permanently — this is a menu bar app
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

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
  if (sessionKey) await setSessionCookie(sessionKey);

  createMainWindow();
  createTray();

  const alwaysOnTop = store.get('settings.alwaysOnTop', true);
  if (mainWindow) {
    if (process.platform !== 'darwin') {
      const minimizeToTray = store.get('settings.minimizeToTray', false);
      if (minimizeToTray) mainWindow.setSkipTaskbar(true);
    }
    mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
  }

  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const alwaysOnTopSetting = store.get('settings.alwaysOnTop', true);
      if (alwaysOnTopSetting) mainWindow.setAlwaysOnTop(true, 'floating');
    }
  }, 5000);
});

app.on('window-all-closed', () => {
  // Keep running in tray on all platforms
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
