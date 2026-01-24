const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const { autoUpdater } = require('electron-updater');

// Globaler Handler für unbehandelte Promise-Rejections (unterdrückt EINTR-Fehler)
process.on('unhandledRejection', (reason, promise) => {
  // EINTR-Fehler sind harmlos und können ignoriert werden
  if (reason && reason.code === 'EINTR') {
    console.log('EINTR-Fehler ignoriert (System-Interrupt)');
    return;
  }
  console.warn('Unhandled Promise Rejection:', reason);
});

// LAZY LOAD: Server und BackupController werden erst bei Bedarf geladen
let startServer = null;
let BackupController = null;

let mainWindow;
let statsInterval;
let server = null;
let serverExternal = false; // Flag: Server läuft extern (z.B. über start_server.sh)
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

// Lazy load BackupController mit Fehlerbehandlung
function getBackupController() {
  if (!BackupController) {
    try {
      BackupController = require('./src/controllers/backupController');
    } catch (err) {
      console.warn('BackupController konnte nicht geladen werden:', err.message);
      return null;
    }
  }
  return BackupController;
}

function stopStatsInterval() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

// Prüfe ob ein Port bereits belegt ist
function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        tester.close(() => resolve(false));
      })
      .listen(port, '0.0.0.0');
  });
}

// Starte den Server (nur wenn Port frei ist)
async function initServer() {
  const PORT = process.env.PORT || 3001;
  const portInUse = await isPortInUse(PORT);
  
  if (portInUse) {
    console.log(`ℹ️  Port ${PORT} bereits belegt - verwende externen Server`);
    serverExternal = true;
    return null;
  }
  
  console.log(`🚀 Starte internen Server auf Port ${PORT}...`);
  // Lazy load: Server-Modul erst jetzt laden
  if (!startServer) {
    startServer = require('./src/server').startServer;
  }
  return startServer(sendClientCount, sendRequestLog);
}

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

app.whenReady().then(async () => {
  // Server initialisieren (prüft ob Port frei ist)
  server = await initServer();

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
  const PORT = process.env.PORT || 3001;
  
  // Wenn Server extern läuft oder noch nicht gestartet
  if (serverExternal || !server) {
    const ipAddress = getLocalIPAddress();
    return `http://${ipAddress}:${PORT}`;
  }
  
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
    const BC = getBackupController();
    const dbPath = BC.getDbPath();
    const backupDir = BC.getBackupDir();
    const backups = BC.mapBackupFiles();
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
    const backups = getBackupController().mapBackupFiles();
    return { success: true, backups };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup-create', async () => {
  try {
    const BC = getBackupController();
    const backupDir = BC.getBackupDir();
    const dbPath = BC.getDbPath();
    
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
    const BC = getBackupController();
    const backupDir = BC.getBackupDir();
    const dbPath = BC.getDbPath();
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
    const backupDir = getBackupController().getBackupDir();
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
    const backupDir = getBackupController().getBackupDir();
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    shell.openPath(backupDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// =============================================================================
// DATENBANK-PFAD HANDLER
// =============================================================================

ipcMain.handle('db-get-path', async () => {
  try {
    const { dbPath, dataDir } = require('./src/config/database');
    return { success: true, dbPath: dbPath, isCustom: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-select-file', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Datenbank-Datei auswählen',
      filters: [{ name: 'SQLite Datenbank', extensions: ['db', 'sqlite', 'sqlite3'] }],
      properties: ['openFile']
    });
    
    if (result.canceled || !result.filePaths[0]) {
      return { success: false, canceled: true };
    }
    
    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-reset-path', async () => {
  try {
    // Setzt den Pfad auf Standard zurück (hier könnte eine Konfigurationsdatei verwendet werden)
    return { success: true, message: 'Pfad auf Standard zurückgesetzt' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-open-folder', async () => {
  try {
    const { getDataPath } = require('./src/config/database');
    const dbDir = path.join(getDataPath(), 'database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    shell.openPath(dbDir);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('app-restart', async () => {
  app.relaunch();
  app.exit(0);
});

// =============================================================================
// AUTO-UPDATE FUNKTIONALITÄT
// =============================================================================

// Auto-Updater Konfiguration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Logging für Debugging
autoUpdater.logger = require('electron').app;
autoUpdater.logger = {
  info: (msg) => console.log('[AutoUpdater INFO]', msg),
  warn: (msg) => console.warn('[AutoUpdater WARN]', msg),
  error: (msg) => console.error('[AutoUpdater ERROR]', msg),
  debug: (msg) => console.log('[AutoUpdater DEBUG]', msg)
};

// GitHub Release URL explizit setzen
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'SHP-ART',
  repo: 'Werkstatt-Terminplaner'
});

console.log('[AutoUpdater] Feed URL konfiguriert für SHP-ART/Werkstatt-Terminplaner');
console.log('[AutoUpdater] App isPackaged:', app.isPackaged);

// Update-Status Tracking
let updateStatus = {
  status: 'idle',
  message: 'Bereit',
  progress: 0,
  updateAvailable: false,
  updateDownloaded: false,
  version: null,
  error: null
};

// Auto-Updater Events
autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdater] Checking for updates...');
  updateStatus = { ...updateStatus, status: 'checking', message: 'Suche nach Updates...' };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdater] Update available:', info.version);
  updateStatus = { 
    ...updateStatus, 
    status: 'available', 
    message: `Update ${info.version} verfügbar`,
    updateAvailable: true,
    version: info.version
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[AutoUpdater] No update available. Current version is up to date.');
  console.log('[AutoUpdater] Info:', JSON.stringify(info));
  updateStatus = { 
    ...updateStatus, 
    status: 'idle', 
    message: 'Keine Updates verfügbar',
    updateAvailable: false
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('download-progress', (progress) => {
  updateStatus = { 
    ...updateStatus, 
    status: 'downloading', 
    message: `Download: ${Math.round(progress.percent)}%`,
    progress: progress.percent
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  updateStatus = { 
    ...updateStatus, 
    status: 'downloaded', 
    message: `Update ${info.version} bereit zur Installation`,
    updateDownloaded: true,
    progress: 100
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdater] Error:', err.message);
  console.error('[AutoUpdater] Stack:', err.stack);
  updateStatus = { 
    ...updateStatus, 
    status: 'error', 
    message: `Update-Fehler: ${err.message}`,
    error: err.message
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
});

ipcMain.handle('update-check', async () => {
  console.log('[AutoUpdater] Manual check triggered');
  console.log('[AutoUpdater] app.isPackaged:', app.isPackaged);
  
  // Warnung wenn nicht gepackt
  if (!app.isPackaged) {
    console.warn('[AutoUpdater] App läuft im Entwicklungsmodus - Update-Check wird trotzdem versucht');
  }
  
  try {
    const result = await autoUpdater.checkForUpdates();
    console.log('[AutoUpdater] Check result:', JSON.stringify(result?.updateInfo));
    return { success: true, updateInfo: result?.updateInfo };
  } catch (error) {
    console.error('[AutoUpdater] Check failed:', error.message);
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
  try {
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-get-status', async () => {
  const { VERSION } = require('./src/config/version');
  return { 
    success: true,
    ...updateStatus,
    currentVersion: VERSION,
    isPackaged: app.isPackaged,
    checking: updateStatus.status === 'checking',
    downloading: updateStatus.status === 'downloading',
    downloaded: updateStatus.status === 'downloaded',
    available: updateStatus.updateAvailable
  };
});

// =============================================================================
// AUTOSTART HANDLER
// =============================================================================

ipcMain.handle('autostart-get', async () => {
  try {
    const loginSettings = app.getLoginItemSettings();
    return { success: true, enabled: loginSettings.openAtLogin };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autostart-set', async (event, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
