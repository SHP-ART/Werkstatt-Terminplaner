const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  onClientCountUpdate: (callback) => ipcRenderer.on('client-count-update', (event, ...args) => callback(...args))
});
