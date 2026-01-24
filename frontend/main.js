const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Prüfe ob dist/index.html existiert (Production Build)
  const distPath = path.join(__dirname, 'dist', 'index.html');
  const devPath = path.join(__dirname, 'index.html');

  if (fs.existsSync(distPath)) {
    // Production: Lade aus dist/
    mainWindow.loadFile(distPath);
  } else {
    // Development: Lade direkt (für npm run dev)
    mainWindow.loadFile(devPath);
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
