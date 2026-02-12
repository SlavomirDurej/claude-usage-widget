const { app, BrowserWindow, ipcMain, Tray, Menu, session, shell, nativeImage, net } = require('electron');
const path = require('path');
const Store = require('electron-store');
const axios = require('axios');

const store = new Store({
  encryptionKey: 'claude-widget-secure-key-2024'
});

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

let mainWindow = null;
let loginWindow = null;
let silentLoginWindow = null;
let apiWindow = null;
let tray = null;

// Window configuration
const WIDGET_WIDTH = 480;
const WIDGET_HEIGHT = 140;

// Platform-specific User-Agent
const USER_AGENT = isMac
  ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

async function getClaudeCookieHeader() {
  const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
  if (!cookies || cookies.length === 0) return '';
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

function claudeGetJson(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url,
      session: session.defaultSession,
      redirect: 'follow'
    });

    request.setHeader('User-Agent', USER_AGENT);
    request.setHeader('Accept', 'application/json');
    request.setHeader('Referer', 'https://claude.ai/');

    request.on('response', (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch (error) {
            reject(new Error(`Invalid JSON response (status ${response.statusCode})`));
          }
        } else {
          if (process.env.DEBUG_AUTH === '1') {
            const snippet = body ? body.slice(0, 300) : '';
            console.log('[Auth][Debug] HTTP error', {
              status: response.statusCode,
              headers: response.headers,
              bodySnippet: snippet
            });
          }
          reject(new Error(`HTTP ${response.statusCode}`));
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

async function logClaudeCookieNames(prefix) {
  if (process.env.DEBUG_AUTH !== '1') return;
  const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
  const names = cookies.map((c) => c.name).sort();
  console.log(`[Auth][Debug] ${prefix} cookies:`, names);
}

async function fetchOrgIdViaWindow(win, label) {
  if (!win || win.isDestroyed()) return null;
  try {
    const result = await win.webContents.executeJavaScript(
      `(async () => {
        try {
          const res = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
          const text = await res.text();
          return { ok: res.ok, status: res.status, text };
        } catch (e) {
          return { error: e.message };
        }
      })()`,
      true
    );

    if (result?.ok) {
      const data = JSON.parse(result.text || '[]');
      if (Array.isArray(data) && data.length > 0) {
        return data[0].uuid || data[0].id || null;
      }
      return null;
    }

    if (process.env.DEBUG_AUTH === '1') {
      console.log(`[Auth][Debug] ${label} window fetch failed:`, result);
    }
    return null;
  } catch (error) {
    if (process.env.DEBUG_AUTH === '1') {
      console.log(`[Auth][Debug] ${label} window fetch error:`, error.message);
    }
    return null;
  }
}

function createApiWindow() {
  if (apiWindow && !apiWindow.isDestroyed()) {
    return apiWindow;
  }

  apiWindow = new BrowserWindow({
    width: 800,
    height: 700,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  apiWindow.loadURL('https://claude.ai');

  apiWindow.on('closed', () => {
    apiWindow = null;
  });

  return apiWindow;
}

async function getApiWindowReady() {
  const win = createApiWindow();
  if (win.webContents.isLoading()) {
    await new Promise((resolve) => {
      win.webContents.once('did-finish-load', resolve);
    });
  }
  return win;
}

async function fetchUsageViaWindow(organizationId) {
  const win = await getApiWindowReady();
  if (!win || win.isDestroyed()) return null;

  try {
    const result = await win.webContents.executeJavaScript(
      `(async () => {
        try {
          const res = await fetch('https://claude.ai/api/organizations/${organizationId}/usage', { credentials: 'include' });
          const text = await res.text();
          return { ok: res.ok, status: res.status, text };
        } catch (e) {
          return { error: e.message };
        }
      })()`,
      true
    );

    if (result?.ok) {
      return result.text ? JSON.parse(result.text) : null;
    }

    if (process.env.DEBUG_AUTH === '1') {
      console.log('[Auth][Debug] Usage window fetch failed:', result);
    }
    return null;
  } catch (error) {
    if (process.env.DEBUG_AUTH === '1') {
      console.log('[Auth][Debug] Usage window fetch error:', error.message);
    }
    return null;
  }
}

// Platform-specific icon
function getAppIcon() {
  if (isWindows) {
    return path.join(__dirname, 'assets/icon.ico');
  }
  return path.join(__dirname, 'assets/icon.png');
}

// Get tray icon (macOS uses template images for proper dark/light menu bar support)
function getTrayIcon() {
  if (isMac) {
    // On macOS, create a properly sized template image for the menu bar
    // Template images automatically adapt to dark/light menu bar
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets/tray-icon.png'));
    const resized = icon.resize({ width: 18, height: 18 });
    resized.setTemplateImage(true);
    return resized;
  }
  return path.join(__dirname, 'assets/tray-icon.png');
}

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
    icon: getAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  // macOS-specific window options
  if (isMac) {
    windowOptions.vibrancy = 'under-window';
    windowOptions.visualEffectState = 'active';
    windowOptions.roundedCorners = true;
    // Hide from Cmd+Tab app switcher while keeping tray/dock presence
    windowOptions.skipTaskbar = true;
  }

  // Apply saved position if it exists
  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('src/renderer/index.html');

  // Make window draggable and always on top
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

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
        const cookieHeader = await getClaudeCookieHeader();
        if (cookieHeader) {
          const sessionKeyCookie = await session.defaultSession.cookies.get({
            url: 'https://claude.ai',
            name: 'sessionKey'
          });
          const sessionKey = sessionKeyCookie[0]?.value;
          console.log('Session key found, attempting to get org ID...');

          // Fetch org ID from API
          let orgId = null;
          try {
            await logClaudeCookieNames('Login');
            orgId = await fetchOrgIdViaWindow(loginWindow, 'Login');
            if (!orgId) {
              const orgs = await claudeGetJson('https://claude.ai/api/organizations');
              if (orgs && Array.isArray(orgs) && orgs.length > 0) {
                orgId = orgs[0].uuid || orgs[0].id;
              }
            }
            if (orgId) {
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
        const cookieHeader = await getClaudeCookieHeader();
        if (cookieHeader) {
          const sessionKeyCookie = await session.defaultSession.cookies.get({
            url: 'https://claude.ai',
            name: 'sessionKey'
          });
          const sessionKey = sessionKeyCookie[0]?.value;
          console.log('[Main] Silent login: Session key found, attempting to get org ID...');

          // Fetch org ID from API
          let orgId = null;
          try {
            await logClaudeCookieNames('SilentLogin');
            orgId = await fetchOrgIdViaWindow(silentLoginWindow, 'SilentLogin');
            if (!orgId) {
              const orgs = await claudeGetJson('https://claude.ai/api/organizations');
              if (orgs && Array.isArray(orgs) && orgs.length > 0) {
                orgId = orgs[0].uuid || orgs[0].id;
              }
            }
            if (orgId) {
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
    tray = new Tray(getTrayIcon());

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Widget',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            if (isMac) mainWindow.focus();
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
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    tray.setToolTip('Claude Usage Widget');
    tray.setContextMenu(contextMenu);

    // On macOS, clicking the tray icon shows the context menu by default
    // On Windows/Linux, toggle window visibility on click
    if (!isMac) {
      tray.on('click', () => {
        if (mainWindow) {
          mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
      });
    }
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
  if (isMac) {
    // On macOS, closing the widget hides it (app stays in menu bar)
    if (mainWindow) mainWindow.hide();
  } else {
    app.quit();
  }
});

ipcMain.handle('get-platform', () => {
  return process.platform;
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
    let usage = await fetchUsageViaWindow(organizationId);
    if (!usage) {
      usage = await claudeGetJson(`https://claude.ai/api/organizations/${organizationId}/usage`);
    }
    console.log('[Main] API request successful');
    return usage;
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

// macOS: Set up application menu (required for keyboard shortcuts like Cmd+Q, Cmd+C, Cmd+V)
function createAppMenu() {
  if (!isMac) return;

  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// App lifecycle
app.whenReady().then(() => {
  createAppMenu();
  createMainWindow();
  createTray();

  // On macOS, hide the dock icon since this is a menu bar widget
  if (isMac) {
    app.dock.hide();
  }
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay running even with no windows
  // On all platforms, keep running in tray
  if (!isMac) {
    // Keep running in tray on Windows/Linux too
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked (if dock is visible)
  if (mainWindow === null) {
    createMainWindow();
  } else {
    mainWindow.show();
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
