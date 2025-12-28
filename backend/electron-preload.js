const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  onClientCountUpdate: (callback) => ipcRenderer.on('client-count-update', (event, ...args) => callback(...args)),
  onSystemStats: (callback) => ipcRenderer.on('system-stats', (event, ...args) => callback(...args)),
  onRequestLog: (callback) => ipcRenderer.on('request-log', (event, ...args) => callback(...args))
});
