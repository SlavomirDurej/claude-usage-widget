const { contextBridge, ipcRenderer } = require('electron');

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
  openExternal: (url) => ipcRenderer.send('open-external', url),

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
