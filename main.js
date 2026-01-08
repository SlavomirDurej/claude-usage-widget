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
let tray = null;

// Window configuration
const WIDGET_WIDTH = 480;
const WIDGET_HEIGHT = 140;
const WIDGET_HEIGHT_WITH_TIMER = 160;
const COMPACT_WIDTH = 360;
const COMPACT_HEIGHT = 76;
const SETTINGS_WIDTH = 480;
const SETTINGS_HEIGHT = 360;

function createMainWindow() {
  // Load saved position and compact mode setting
  const savedPosition = store.get('windowPosition');
  const isCompactMode = store.get('compactMode', false);
  const showUpdateTimer = store.get('showUpdateTimer', false);

  // Calculate height based on mode and timer visibility
  let windowHeight;
  if (isCompactMode) {
    windowHeight = COMPACT_HEIGHT;
  } else {
    windowHeight = showUpdateTimer ? WIDGET_HEIGHT_WITH_TIMER : WIDGET_HEIGHT;
  }

  const windowOptions = {
    width: isCompactMode ? COMPACT_WIDTH : WIDGET_WIDTH,
    height: windowHeight,
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
          // TODO: Open settings window
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

// Compact mode handlers
ipcMain.handle('get-compact-mode', () => {
  return store.get('compactMode', false);
});

ipcMain.handle('get-refresh-interval', () => {
  return store.get('refreshInterval', 300000); // Default 5 minutes
});

ipcMain.handle('set-refresh-interval', (event, interval) => {
  store.set('refreshInterval', interval);
  return true;
});

ipcMain.handle('get-show-update-timer', () => {
  return store.get('showUpdateTimer', false);
});

ipcMain.handle('set-show-update-timer', (event, show) => {
  store.set('showUpdateTimer', show);
  return true;
});

ipcMain.handle('set-compact-mode', (event, isCompact) => {
  store.set('compactMode', isCompact);
  return true;
});

// Temporarily expand window for settings
ipcMain.handle('expand-for-settings', (event, expand) => {
  if (!mainWindow) return false;

  const bounds = mainWindow.getBounds();
  const isCompactMode = store.get('compactMode', false);
  const showUpdateTimer = store.get('showUpdateTimer', false);

  // Temporarily allow resizing
  mainWindow.setResizable(true);

  if (expand) {
    // Expand to settings size
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: SETTINGS_WIDTH, height: SETTINGS_HEIGHT });
    console.log('[Main] Expanded for settings');
  } else {
    // Restore to appropriate size based on compact mode and timer settings
    const targetWidth = isCompactMode ? COMPACT_WIDTH : WIDGET_WIDTH;
    let targetHeight;
    if (isCompactMode) {
      targetHeight = COMPACT_HEIGHT;
    } else {
      targetHeight = showUpdateTimer ? WIDGET_HEIGHT_WITH_TIMER : WIDGET_HEIGHT;
    }
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width: targetWidth, height: targetHeight });
    console.log('[Main] Restored from settings, compact:', isCompactMode, 'size:', targetWidth, 'x', targetHeight);
  }

  // Disable resizing again
  mainWindow.setResizable(false);

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

// App lifecycle
app.whenReady().then(() => {
  createMainWindow();
  createTray();

  // Check if we have credentials
  // const hasCredentials = store.get('sessionKey') && store.get('organizationId');
  // if (!hasCredentials) {
  //   setTimeout(() => {
  //     createLoginWindow();
  //   }, 1000);
  // }
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
