const { contextBridge, ipcRenderer } = require('electron');

// Allowed domains for openExternal — prevents renderer from opening arbitrary URLs
const ALLOWED_EXTERNAL_DOMAINS = [
  'claude.ai',
  'github.com',
  'paypal.me'
];

function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_EXTERNAL_DOMAINS.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Credentials management
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  saveCredentials: (credentials) => ipcRenderer.invoke('save-credentials', credentials),
  deleteCredentials: () => ipcRenderer.invoke('delete-credentials'),
  validateSessionKey: (sessionKey) => ipcRenderer.invoke('validate-session-key', sessionKey),
  detectSessionKey: () => ipcRenderer.invoke('detect-session-key'),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  resizeWindow: (height) => ipcRenderer.send('resize-window', height),

  // Window position
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  setWindowPosition: (position) => ipcRenderer.invoke('set-window-position', position),

  // Event listeners
  onRefreshUsage: (callback) => {
    ipcRenderer.on('refresh-usage', () => callback());
  },
  onSessionExpired: (callback) => {
    ipcRenderer.on('session-expired', () => callback());
  },

  // API
  fetchUsageData: () => ipcRenderer.invoke('fetch-usage-data'),
  getUsageHistory: () => ipcRenderer.invoke('get-usage-history'),
  openExternal: (url) => {
    if (isAllowedExternalUrl(url)) {
      ipcRenderer.send('open-external', url);
    } else {
      console.warn('openExternal blocked — URL not in allowlist:', url);
    }
  },

  // Platform
  platform: process.platform,

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Updates
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Notifications
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),

  // Compact mode
  setCompactMode: (compact) => ipcRenderer.send('set-compact-mode', compact)
});
