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
  openBackupFolder: () => ipcRenderer.invoke('backup-open-folder')
});
