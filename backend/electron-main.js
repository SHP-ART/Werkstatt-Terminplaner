const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { startServer } = require('./src/server');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'status.html'));
  mainWindow.setMenuBarVisibility(false);
}

// Function to send client count updates to the window
function sendClientCount(count) {
  if (mainWindow) {
    mainWindow.webContents.send('client-count-update', count);
  }
}

// Start the Express server and pass the callback
const server = startServer(sendClientCount);

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC listener to get the server URL
ipcMain.handle('get-server-url', async (event) => {
  const address = server.address();
  if (address) {
    return `http://${address.address}:${address.port}`;
  }
  return 'Server starting...';
});
