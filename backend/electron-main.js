const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { startServer } = require('./src/server');
const BackupController = require('./src/controllers/backupController');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let statsInterval;
let serverStats = {
  totalRequests: 0,
  requestsLastMinute: [],
  lastActivity: null,
  startTime: Date.now()
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 350,
    height: 520,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron-preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'status.html'));
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('closed', () => {
    mainWindow = null;
    stopStatsInterval();
  });
}

// Function to send client count updates to the window
function sendClientCount(count) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('client-count-update', count);
  }
}

// Function to send request log to the window
function sendRequestLog(request) {
  serverStats.totalRequests++;
  serverStats.lastActivity = Date.now();
  serverStats.requestsLastMinute.push(Date.now());
  
  // Entferne alte Einträge (älter als 1 Minute)
  const oneMinuteAgo = Date.now() - 60000;
  serverStats.requestsLastMinute = serverStats.requestsLastMinute.filter(t => t > oneMinuteAgo);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('request-log', request);
  }
}

// Function to send system stats
function sendSystemStats() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const cpuUsage = process.cpuUsage();
  const memoryUsage = process.memoryUsage();
  
  // Einfache CPU-Berechnung basierend auf den letzten Werten
  const cpuPercent = ((cpuUsage.user + cpuUsage.system) / 1000000) % 100;

  const stats = {
    cpu: cpuPercent,
    memory: memoryUsage.heapUsed,
    uptime: (Date.now() - serverStats.startTime) / 1000,
    totalRequests: serverStats.totalRequests,
    requestsPerMin: serverStats.requestsLastMinute.length,
    lastActivity: serverStats.lastActivity
  };

  mainWindow.webContents.send('system-stats', stats);
}

function stopStatsInterval() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

// Start the Express server and pass the callbacks
const server = startServer(sendClientCount, sendRequestLog);

function stopServer() {
  if (server && server.shutdown) {
    console.log('Shutting down server...');
    server.shutdown().then(() => {
      console.log('Server stopped successfully');
    }).catch((err) => {
      console.error('Error stopping server:', err);
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  // System-Stats alle 2 Sekunden senden
  statsInterval = setInterval(sendSystemStats, 2000);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  stopStatsInterval();
  // Auf macOS läuft die App weiter, daher Server nicht stoppen
  // Auf anderen Plattformen beendet sich die App, daher Server stoppen
  if (process.platform !== 'darwin') {
    stopServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  stopStatsInterval();
  stopServer();
});

// Function to get the actual IP address of the machine
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// IPC listener to get the server URL
ipcMain.handle('get-server-url', async (event) => {
  const address = server.address();
  if (address) {
    const port = address.port;
    const ipAddress = address.address === '0.0.0.0' ? getLocalIPAddress() : address.address;
    return `http://${ipAddress}:${port}`;
  }
  return 'Server starting...';
});

// IPC Handler für Backup-Funktionen
ipcMain.handle('backup-status', async () => {
  try {
    const dbPath = BackupController.getDbPath();
    const backupDir = BackupController.getBackupDir();
    const backups = BackupController.mapBackupFiles();
    const dbStats = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
    
    return {
      success: true,
      dbPath,
      backupDir,
      dbSizeBytes: dbStats ? dbStats.size : 0,
      lastBackup: backups[0] || null,
      backupCount: backups.length
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup-list', async () => {
  try {
    const backups = BackupController.mapBackupFiles();
    return { success: true, backups };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup-create', async () => {
  try {
    const backupDir = BackupController.getBackupDir();
    const dbPath = BackupController.getDbPath();
    
    if (!fs.existsSync(path.dirname(backupDir))) {
      fs.mkdirSync(path.dirname(backupDir), { recursive: true });
    }
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `werkstatt-backup-${timestamp}.db`;
    const dest = path.join(backupDir, backupName);
    
    fs.copyFileSync(dbPath, dest);
    const stats = fs.statSync(dest);
    
    return {
      success: true,
      backup: { name: backupName, sizeBytes: stats.size, createdAt: stats.mtime }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup-restore', async (event, filename) => {
  try {
    const backupDir = BackupController.getBackupDir();
    const dbPath = BackupController.getDbPath();
    const source = path.join(backupDir, path.basename(filename));
    
    if (!fs.existsSync(source)) {
      return { success: false, error: 'Backup nicht gefunden' };
    }
    
    fs.copyFileSync(source, dbPath);
    return { success: true, restored: path.basename(filename) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup-delete', async (event, filename) => {
  try {
    const backupDir = BackupController.getBackupDir();
    const filePath = path.join(backupDir, path.basename(filename));
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Backup nicht gefunden' };
    }
    
    fs.unlinkSync(filePath);
    return { success: true, deleted: path.basename(filename) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup-open-folder', async () => {
  try {
    const backupDir = BackupController.getBackupDir();
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    shell.openPath(backupDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handler für Datenbank-Pfad Funktionen
ipcMain.handle('db-get-path', async () => {
  try {
    const dbPath = BackupController.getDbPath();
    return { success: true, path: dbPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-select-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Datenbank auswählen',
      filters: [{ name: 'SQLite Datenbank', extensions: ['db', 'sqlite', 'sqlite3'] }],
      properties: ['openFile']
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    
    const selectedPath = result.filePaths[0];
    // Speichere den neuen Pfad in einer Konfigurationsdatei
    const configPath = path.join(app.getPath('userData'), 'db-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ dbPath: selectedPath }));
    
    return { success: true, path: selectedPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-reset-path', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'db-config.json');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-open-folder', async () => {
  try {
    const dbPath = BackupController.getDbPath();
    const dbFolder = path.dirname(dbPath);
    shell.openPath(dbFolder);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('app-restart', async () => {
  app.relaunch();
  app.exit(0);
});

// Auto-Update Status
let updateStatus = {
  checking: false,
  available: false,
  downloaded: false,
  error: null,
  progress: null,
  version: null
};

// Auto-Updater Events
autoUpdater.on('checking-for-update', () => {
  updateStatus = { ...updateStatus, checking: true, error: null };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('update-available', (info) => {
  updateStatus = { ...updateStatus, checking: false, available: true, version: info.version };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('update-not-available', () => {
  updateStatus = { ...updateStatus, checking: false, available: false };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('error', (err) => {
  updateStatus = { ...updateStatus, checking: false, error: err.message };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('download-progress', (progress) => {
  updateStatus = { ...updateStatus, progress: progress.percent };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('update-downloaded', () => {
  updateStatus = { ...updateStatus, downloaded: true, progress: 100 };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

// IPC Handler für Auto-Update
ipcMain.handle('update-check', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-install', async () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('update-get-status', async () => {
  return updateStatus;
});

// IPC Handler für Autostart
ipcMain.handle('autostart-get', async () => {
  try {
    const loginItemSettings = app.getLoginItemSettings();
    return { success: true, enabled: loginItemSettings.openAtLogin };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autostart-set', async (event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath
    });
    return { success: true, enabled };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
