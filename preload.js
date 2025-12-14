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

  // API
  fetchUsageData: () => ipcRenderer.invoke('fetch-usage-data'),
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
