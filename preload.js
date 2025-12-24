const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Credentials management
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  saveCredentials: (credentials) => ipcRenderer.invoke('save-credentials', credentials),
  deleteCredentials: () => ipcRenderer.invoke('delete-credentials'),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  openLogin: () => ipcRenderer.send('open-login'),
  openSettings: () => ipcRenderer.send('open-settings'),

  // Window position
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  setWindowPosition: (position) => ipcRenderer.invoke('set-window-position', position),

  // Event listeners
  onLoginSuccess: (callback) => {
    ipcRenderer.on('login-success', (event, data) => callback(data));
  },
  onRefreshUsage: (callback) => {
    ipcRenderer.on('refresh-usage', () => callback());
  },
  onSessionExpired: (callback) => {
    ipcRenderer.on('session-expired', () => callback());
  },
  onSilentLoginStarted: (callback) => {
    ipcRenderer.on('silent-login-started', () => callback());
  },
  onSilentLoginFailed: (callback) => {
    ipcRenderer.on('silent-login-failed', () => callback());
  },

  // API
  fetchUsageData: () => ipcRenderer.invoke('fetch-usage-data'),
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Color preferences
  getColorPreferences: () => ipcRenderer.invoke('get-color-preferences'),
  setColorPreferences: (preferences) => ipcRenderer.invoke('set-color-preferences', preferences),
  notifyColorChange: (preferences) => ipcRenderer.invoke('notify-color-change', preferences),
  onColorsChanged: (callback) => {
    ipcRenderer.on('colors-changed', (event, preferences) => callback(preferences));
  }
});
