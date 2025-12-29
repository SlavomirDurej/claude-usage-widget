const { app, BrowserWindow, ipcMain, Tray, Menu, session, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const axios = require('axios');

const store = new Store({
  encryptionKey: 'claude-widget-secure-key-2024'
});

let mainWindow = null;
let loginWindow = null;
let silentLoginWindow = null;
let settingsWindow = null;
let tray = null;
let iconGeneratorWindow = null;

// Tray icon state
let cachedUsageData = null;
let trayUpdateInterval = null;
let lastTrayUpdate = 0;

// Window configuration
const WIDGET_WIDTH = 480;
const WIDGET_HEIGHT = 140;
const SETTINGS_WIDTH = 500;
const SETTINGS_HEIGHT = 680;

function createMainWindow() {
  // Load saved position or use defaults
  const savedPosition = store.get('windowPosition');
  const windowOptions = {
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  // Apply saved position if it exists
  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('src/renderer/index.html');

  // Make window draggable
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true);

  // Save position when window is moved
  mainWindow.on('move', () => {
    const position = mainWindow.getBounds();
    store.set('windowPosition', { x: position.x, y: position.y });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Development tools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 800,
    height: 700,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  loginWindow.loadURL('https://claude.ai');

  let loginCheckInterval = null;
  let hasLoggedIn = false;

  // Function to check login status
  async function checkLoginStatus() {
    if (hasLoggedIn || !loginWindow) return;

    try {
      const cookies = await session.defaultSession.cookies.get({
        url: 'https://claude.ai',
        name: 'sessionKey'
      });

      if (cookies.length > 0) {
        const sessionKey = cookies[0].value;
        console.log('Session key found, attempting to get org ID...');

        // Fetch org ID from API
        let orgId = null;
        try {
          const response = await axios.get('https://claude.ai/api/organizations', {
            headers: {
              'Cookie': `sessionKey=${sessionKey}`,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            orgId = response.data[0].uuid || response.data[0].id;
            console.log('Org ID fetched from API:', orgId);
          }
        } catch (err) {
          console.log('API not ready yet:', err.message);
        }

        if (sessionKey && orgId) {
          hasLoggedIn = true;
          if (loginCheckInterval) {
            clearInterval(loginCheckInterval);
            loginCheckInterval = null;
          }

          console.log('Sending login-success to main window...');
          store.set('sessionKey', sessionKey);
          store.set('organizationId', orgId);

          if (mainWindow) {
            mainWindow.webContents.send('login-success', { sessionKey, organizationId: orgId });
            console.log('login-success sent');
          } else {
            console.error('mainWindow is null, cannot send login-success');
          }

          loginWindow.close();
        }
      }
    } catch (error) {
      console.error('Error in login check:', error);
    }
  }

  // Check on page load
  loginWindow.webContents.on('did-finish-load', async () => {
    const url = loginWindow.webContents.getURL();
    console.log('Login page loaded:', url);

    if (url.includes('claude.ai')) {
      await checkLoginStatus();
    }
  });

  // Also check on navigation (URL changes)
  loginWindow.webContents.on('did-navigate', async (event, url) => {
    console.log('Navigated to:', url);
    if (url.includes('claude.ai')) {
      await checkLoginStatus();
    }
  });

  // Poll periodically in case the session becomes ready without a page navigation
  loginCheckInterval = setInterval(async () => {
    if (!hasLoggedIn && loginWindow) {
      await checkLoginStatus();
    } else if (loginCheckInterval) {
      clearInterval(loginCheckInterval);
      loginCheckInterval = null;
    }
  }, 2000);

  loginWindow.on('closed', () => {
    if (loginCheckInterval) {
      clearInterval(loginCheckInterval);
      loginCheckInterval = null;
    }
    loginWindow = null;
  });
}

// Attempt silent login in a hidden browser window
async function attemptSilentLogin() {
  console.log('[Main] Attempting silent login...');

  // Notify renderer that we're trying to auto-login
  if (mainWindow) {
    mainWindow.webContents.send('silent-login-started');
  }

  return new Promise((resolve) => {
    silentLoginWindow = new BrowserWindow({
      width: 800,
      height: 700,
      show: false, // Hidden window
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    silentLoginWindow.loadURL('https://claude.ai');

    let loginCheckInterval = null;
    let hasLoggedIn = false;
    const SILENT_LOGIN_TIMEOUT = 15000; // 15 seconds timeout

    // Function to check login status
    async function checkLoginStatus() {
      if (hasLoggedIn || !silentLoginWindow) return;

      try {
        const cookies = await session.defaultSession.cookies.get({
          url: 'https://claude.ai',
          name: 'sessionKey'
        });

        if (cookies.length > 0) {
          const sessionKey = cookies[0].value;
          console.log('[Main] Silent login: Session key found, attempting to get org ID...');

          // Fetch org ID from API
          let orgId = null;
          try {
            const response = await axios.get('https://claude.ai/api/organizations', {
              headers: {
                'Cookie': `sessionKey=${sessionKey}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });

            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
              orgId = response.data[0].uuid || response.data[0].id;
              console.log('[Main] Silent login: Org ID fetched from API:', orgId);
            }
          } catch (err) {
            console.log('[Main] Silent login: API not ready yet:', err.message);
          }

          if (sessionKey && orgId) {
            hasLoggedIn = true;
            if (loginCheckInterval) {
              clearInterval(loginCheckInterval);
              loginCheckInterval = null;
            }

            console.log('[Main] Silent login successful!');
            store.set('sessionKey', sessionKey);
            store.set('organizationId', orgId);

            if (mainWindow) {
              mainWindow.webContents.send('login-success', { sessionKey, organizationId: orgId });
            }

            silentLoginWindow.close();
            resolve(true);
          }
        }
      } catch (error) {
        console.error('[Main] Silent login check error:', error);
      }
    }

    // Check on page load
    silentLoginWindow.webContents.on('did-finish-load', async () => {
      const url = silentLoginWindow.webContents.getURL();
      console.log('[Main] Silent login page loaded:', url);

      if (url.includes('claude.ai')) {
        await checkLoginStatus();
      }
    });

    // Also check on navigation
    silentLoginWindow.webContents.on('did-navigate', async (event, url) => {
      console.log('[Main] Silent login navigated to:', url);
      if (url.includes('claude.ai')) {
        await checkLoginStatus();
      }
    });

    // Poll periodically
    loginCheckInterval = setInterval(async () => {
      if (!hasLoggedIn && silentLoginWindow) {
        await checkLoginStatus();
      } else if (loginCheckInterval) {
        clearInterval(loginCheckInterval);
        loginCheckInterval = null;
      }
    }, 1000);

    // Timeout - if silent login doesn't work, fall back to visible login
    setTimeout(() => {
      if (!hasLoggedIn) {
        console.log('[Main] Silent login timeout, falling back to visible login...');
        if (loginCheckInterval) {
          clearInterval(loginCheckInterval);
          loginCheckInterval = null;
        }
        if (silentLoginWindow) {
          silentLoginWindow.close();
        }

        // Notify renderer that silent login failed
        if (mainWindow) {
          mainWindow.webContents.send('silent-login-failed');
        }

        // Open visible login window
        createLoginWindow();
        resolve(false);
      }
    }, SILENT_LOGIN_TIMEOUT);

    silentLoginWindow.on('closed', () => {
      if (loginCheckInterval) {
        clearInterval(loginCheckInterval);
        loginCheckInterval = null;
      }
      silentLoginWindow = null;
    });
  });
}

// Create hidden window for generating tray icons
function createIconGeneratorWindow() {
  if (iconGeneratorWindow) return;

  iconGeneratorWindow = new BrowserWindow({
    width: 100,
    height: 100,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  iconGeneratorWindow.loadFile(path.join(__dirname, 'src/icon-generator.html'));

  iconGeneratorWindow.on('closed', () => {
    iconGeneratorWindow = null;
  });
}

// Generate tray icon with circular progress indicator
async function generateTrayIcon(percentage, colors, showText = true) {
  const { nativeImage } = require('electron');

  if (!iconGeneratorWindow) {
    createIconGeneratorWindow();
    // Wait for window to load
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return new Promise((resolve) => {
    ipcMain.once('icon-generated', (event, dataUrl) => {
      resolve(nativeImage.createFromDataURL(dataUrl));
    });

    iconGeneratorWindow.webContents.send('generate-icon', { percentage, colors, showText });
  });
}

// Update tray icon with current usage data
async function updateTrayIcon() {
  if (!tray) return;

  // If no data yet, show default icon
  if (!cachedUsageData) {
    tray.setImage(path.join(__dirname, 'assets/tray-icon.png'));
    tray.setToolTip('Claude Usage Widget - Loading...');
    return;
  }

  // Get tray settings from store
  const traySettings = store.get('traySettings', {
    displayMode: 'session',
    showText: false,
    colors: {
      normal: { start: '#8b5cf6', end: '#a78bfa' },
      warning: { start: '#f59e0b', end: '#fbbf24' },
      danger: { start: '#ef4444', end: '#f87171' }
    }
  });

  // Get appropriate usage data based on display mode
  let percentage, resetsAt;
  if (traySettings.displayMode === 'weekly') {
    percentage = cachedUsageData.seven_day?.utilization || 0;
    resetsAt = cachedUsageData.seven_day?.resets_at;
  } else {
    percentage = cachedUsageData.five_hour?.utilization || 0;
    resetsAt = cachedUsageData.five_hour?.resets_at;
  }

  // Generate and set new icon
  try {
    const icon = await generateTrayIcon(percentage, traySettings.colors, traySettings.showText);
    tray.setImage(icon);

    // Update tooltip with detailed info
    const modeLabel = traySettings.displayMode === 'weekly' ? '7-day' : '5-hour';
    const resetTime = resetsAt ? new Date(resetsAt).toLocaleString() : 'N/A';
    tray.setToolTip(
      `Claude Usage: ${Math.round(percentage)}% (${modeLabel})\nResets: ${resetTime}`
    );
  } catch (error) {
    console.error('Failed to generate tray icon:', error);
  }
}

// Throttled tray update to avoid excessive updates
function updateTrayIconThrottled() {
  const now = Date.now();
  const interval = store.get('trayUpdateInterval', 30) * 1000; // Convert to ms

  if (now - lastTrayUpdate >= interval) {
    updateTrayIcon();
    lastTrayUpdate = now;
  }
}

// Start periodic tray icon updates
function startTrayUpdateTimer() {
  if (trayUpdateInterval) clearInterval(trayUpdateInterval);

  const interval = store.get('trayUpdateInterval', 30) * 1000;
  trayUpdateInterval = setInterval(() => {
    if (cachedUsageData) {
      updateTrayIcon();
    }
  }, interval);
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'assets/tray-icon.png'));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Widget',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
          } else {
            createMainWindow();
          }
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
        label: 'Settings',
        click: () => {
          createSettingsWindow();
        }
      },
      {
        label: 'Re-login',
        click: () => {
          store.delete('sessionKey');
          store.delete('organizationId');
          createLoginWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Claude Usage Widget');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    });
  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    title: 'Settings - Claude Usage Widget',
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.loadFile('src/renderer/settings.html');

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  // Development tools
  if (process.env.NODE_ENV === 'development') {
    settingsWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// IPC Handlers
ipcMain.handle('get-credentials', () => {
  return {
    sessionKey: store.get('sessionKey'),
    organizationId: store.get('organizationId')
  };
});

ipcMain.handle('save-credentials', (event, { sessionKey, organizationId }) => {
  store.set('sessionKey', sessionKey);
  if (organizationId) {
    store.set('organizationId', organizationId);
  }
  return true;
});

ipcMain.handle('delete-credentials', async () => {
  store.delete('sessionKey');
  store.delete('organizationId');

  // Clear the session cookie to ensure actual logout
  try {
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
    // Also try checking for other auth cookies or clear storage if needed
    // await session.defaultSession.clearStorageData({ storages: ['cookies'] });
  } catch (error) {
    console.error('Failed to clear cookies:', error);
  }

  return true;
});

ipcMain.on('open-login', () => {
  createLoginWindow();
});

ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('close-window', () => {
  app.quit();
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
  shell.openExternal(url);
});

// Color preferences handlers
const DEFAULT_COLOR_PREFERENCES = {
  normal: { start: '#8b5cf6', end: '#a78bfa' },
  warning: { start: '#f59e0b', end: '#fbbf24' },
  danger: { start: '#ef4444', end: '#f87171' }
};

ipcMain.handle('get-color-preferences', () => {
  const saved = store.get('colorPreferences');
  return saved || DEFAULT_COLOR_PREFERENCES;
});

ipcMain.handle('set-color-preferences', (event, preferences) => {
  store.set('colorPreferences', preferences);
  return true;
});

ipcMain.handle('notify-color-change', (event, preferences) => {
  // Notify main window to update colors
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('colors-changed', preferences);
  }
  return true;
});

ipcMain.handle('fetch-usage-data', async () => {
  console.log('[Main] fetch-usage-data handler called');
  const sessionKey = store.get('sessionKey');
  const organizationId = store.get('organizationId');

  console.log('[Main] Credentials:', {
    hasSessionKey: !!sessionKey,
    organizationId
  });

  if (!sessionKey || !organizationId) {
    throw new Error('Missing credentials');
  }

  try {
    console.log('[Main] Making API request to:', `https://claude.ai/api/organizations/${organizationId}/usage`);
    const response = await axios.get(
      `https://claude.ai/api/organizations/${organizationId}/usage`,
      {
        headers: {
          'Cookie': `sessionKey=${sessionKey}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    console.log('[Main] API request successful, status:', response.status);
    return response.data;
  } catch (error) {
    console.error('[Main] API request failed:', error.message);
    if (error.response) {
      console.error('[Main] Response status:', error.response.status);
      if (error.response.status === 401 || error.response.status === 403) {
        // Session expired - attempt silent re-login
        console.log('[Main] Session expired, attempting silent re-login...');
        store.delete('sessionKey');
        store.delete('organizationId');

        // Don't clear cookies - we need them for silent login to work with OAuth
        // The silent login will use existing Google/OAuth session if available

        // Attempt silent login (will notify renderer appropriately)
        attemptSilentLogin();

        throw new Error('SessionExpired');
      }
    }
    throw error;
  }
});

// Tray icon IPC handlers
ipcMain.on('usage-data-update', (event, data) => {
  cachedUsageData = data;
  updateTrayIconThrottled();
});

ipcMain.handle('get-tray-settings', () => {
  return store.get('traySettings', {
    displayMode: 'session',
    showText: false,
    colors: {
      normal: { start: '#8b5cf6', end: '#a78bfa' },
      warning: { start: '#f59e0b', end: '#fbbf24' },
      danger: { start: '#ef4444', end: '#f87171' }
    }
  });
});

ipcMain.on('set-tray-settings', (event, settings) => {
  store.set('traySettings', settings);
  updateTrayIcon(); // Immediate update
});

ipcMain.handle('get-tray-update-interval', () => {
  return store.get('trayUpdateInterval', 30);
});

ipcMain.on('set-tray-update-interval', (event, seconds) => {
  store.set('trayUpdateInterval', seconds);
  startTrayUpdateTimer(); // Restart timer with new interval
});

// Theme settings IPC handlers
ipcMain.handle('get-theme-settings', () => {
  return store.get('themeSettings', {
    backgroundStart: '#1e1e2e',
    backgroundEnd: '#2a2a3e',
    textPrimary: '#e0e0e0',
    textSecondary: '#a0a0a0',
    titleBarBg: '#000000',
    titleBarOpacity: 30,
    borderColor: '#ffffff',
    borderOpacity: 10
  });
});

ipcMain.handle('set-theme-settings', (event, theme) => {
  store.set('themeSettings', theme);
  return true;
});

ipcMain.handle('notify-theme-change', (event, theme) => {
  // Notify main window to update theme
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-changed', theme);
  }
  return true;
});

// App lifecycle
app.whenReady().then(() => {
  createMainWindow();
  createTray();
  createIconGeneratorWindow();
  startTrayUpdateTimer();

  // Check if we have credentials
  // const hasCredentials = store.get('sessionKey') && store.get('organizationId');
  // if (!hasCredentials) {
  //   setTimeout(() => {
  //     createLoginWindow();
  //   }, 1000);
  // }
});

app.on('before-quit', () => {
  if (trayUpdateInterval) {
    clearInterval(trayUpdateInterval);
  }
  if (iconGeneratorWindow && !iconGeneratorWindow.isDestroyed()) {
    iconGeneratorWindow.destroy();
  }
});

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
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
