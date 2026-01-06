const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  onClientCountUpdate: (callback) => ipcRenderer.on('client-count-update', (event, ...args) => callback(...args)),
  onSystemStats: (callback) => ipcRenderer.on('system-stats', (event, ...args) => callback(...args)),
  onRequestLog: (callback) => ipcRenderer.on('request-log', (event, ...args) => callback(...args)),
  // Backup-Funktionen
  getBackupStatus: () => ipcRenderer.invoke('backup-status'),
  getBackupList: () => ipcRenderer.invoke('backup-list'),
  createBackup: () => ipcRenderer.invoke('backup-create'),
  restoreBackup: (filename) => ipcRenderer.invoke('backup-restore', filename),
  deleteBackup: (filename) => ipcRenderer.invoke('backup-delete', filename),
  openBackupFolder: () => ipcRenderer.invoke('backup-open-folder'),
  // Datenbank-Pfad Funktionen
  getDbPath: () => ipcRenderer.invoke('db-get-path'),
  selectDbFile: () => ipcRenderer.invoke('db-select-file'),
  resetDbPath: () => ipcRenderer.invoke('db-reset-path'),
  openDbFolder: () => ipcRenderer.invoke('db-open-folder'),
  restartApp: () => ipcRenderer.invoke('app-restart'),
  // Auto-Update Funktionen
  checkForUpdates: () => ipcRenderer.invoke('update-check'),
  downloadUpdate: () => ipcRenderer.invoke('update-download'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  getUpdateStatus: () => ipcRenderer.invoke('update-get-status'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, ...args) => callback(...args)),
  // Autostart Funktionen
  getAutostartStatus: () => ipcRenderer.invoke('autostart-get'),
  setAutostart: (enabled) => ipcRenderer.invoke('autostart-set', enabled)
});
