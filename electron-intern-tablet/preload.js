const { contextBridge, ipcRenderer } = require('electron');

// Sichere API für den Renderer-Prozess
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getConfigPath: () => ipcRenderer.invoke('get-config-path'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  onDisplayStatus: (callback) => ipcRenderer.on('display-status', (event, shouldBeOff) => callback(shouldBeOff)),
  updateDisplayTimes: (times) => ipcRenderer.invoke('update-display-times', times),
  setDisplayManual: (shouldBeOff) => ipcRenderer.invoke('set-display-manual', shouldBeOff),
  // Auto-Update
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, updateInfo) => callback(updateInfo))
});
