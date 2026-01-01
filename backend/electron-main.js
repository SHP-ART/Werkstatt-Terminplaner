const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ===== SAFE CONSOLE LOGGING =====
// Verhindert Crashes durch EIO-Fehler wenn stdout/stderr nicht verfügbar ist
const safeLog = (...args) => {
  try {
    console.log(...args);
  } catch (e) {
    // Ignoriere Schreibfehler
  }
};

const safeError = (...args) => {
  try {
    console.error(...args);
  } catch (e) {
    // Ignoriere Schreibfehler
  }
};

// Globaler Error-Handler für unbehandelte Fehler
process.on('uncaughtException', (error) => {
  // Ignoriere EIO-Fehler beim Logging
  if (error.code === 'EIO') {
    return;
  }
  safeError('Uncaught Exception:', error);
});

// ===== AUTO-UPDATER KONFIGURATION =====
autoUpdater.autoDownload = false; // Manuell steuern
autoUpdater.autoInstallOnAppQuit = true;

// Update-Status für die UI
let updateStatus = {
  checking: false,
  available: false,
  downloaded: false,
  downloading: false,
  progress: 0,
  version: null,
  error: null
};

function sendUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
}

// Auto-Updater Events
autoUpdater.on('checking-for-update', () => {
  console.log('Prüfe auf Updates...');
  updateStatus = { ...updateStatus, checking: true, error: null };
  sendUpdateStatus();
});

autoUpdater.on('update-available', (info) => {
  console.log('Update verfügbar:', info.version);
  updateStatus = {
    ...updateStatus,
    checking: false,
    available: true,
    version: info.version,
    releaseNotes: info.releaseNotes
  };
  sendUpdateStatus();
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Kein Update verfügbar');
  updateStatus = { ...updateStatus, checking: false, available: false };
  sendUpdateStatus();
});

autoUpdater.on('error', (err) => {
  console.error('Auto-Updater Fehler:', err);
  updateStatus = {
    ...updateStatus,
    checking: false,
    downloading: false,
    error: err.message
  };
  sendUpdateStatus();
});

autoUpdater.on('download-progress', (progressObj) => {
  console.log(`Download: ${progressObj.percent.toFixed(1)}%`);
  updateStatus = {
    ...updateStatus,
    downloading: true,
    progress: progressObj.percent
  };
  sendUpdateStatus();
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update heruntergeladen:', info.version);
  updateStatus = {
    ...updateStatus,
    downloading: false,
    downloaded: true,
    version: info.version
  };
  sendUpdateStatus();
});
// ===== ENDE AUTO-UPDATER KONFIGURATION =====

// Ermittle das tatsächliche Verzeichnis der EXE-Datei
// Bei portable Apps wird PORTABLE_EXECUTABLE_DIR gesetzt
// Bei installierten Apps verwenden wir process.execPath
function getAppDirectory() {
  // Portable App: PORTABLE_EXECUTABLE_DIR enthält das Verzeichnis der ursprünglichen EXE
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    console.log('Portable App erkannt, Verzeichnis:', process.env.PORTABLE_EXECUTABLE_DIR);
    return process.env.PORTABLE_EXECUTABLE_DIR;
  }
  
  // Installierte oder normale App: Verzeichnis der EXE
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  
  // Entwicklungsmodus
  return process.cwd();
}

// Konfigurationsdatei für persistente Einstellungen
function getConfigPath() {
  const appDir = getAppDirectory();
  return path.join(appDir, 'werkstatt-config.json');
}

function loadConfig() {
  const configPath = getConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      console.log('Konfiguration geladen von:', configPath);
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Fehler beim Laden der Konfiguration:', error);
  }
  return {};
}

function saveConfig(config) {
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('Konfiguration gespeichert:', configPath);
    return true;
  } catch (error) {
    console.error('Fehler beim Speichern der Konfiguration:', error);
    return false;
  }
}

// Lade gespeicherte Konfiguration
const savedConfig = loadConfig();

// Setze das Datenverzeichnis
// Dies muss VOR dem Laden des Servers geschehen!
const appDir = getAppDirectory();

if (app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) {
  // Bei gepackter App: Verzeichnis der EXE-Datei verwenden
  process.env.ELECTRON_EXE_DIR = appDir;
  process.env.DATA_DIR = appDir;
  
  // Prüfe ob ein gespeicherter Datenbank-Pfad existiert
  if (savedConfig.dbPath && fs.existsSync(savedConfig.dbPath)) {
    process.env.DB_PATH = savedConfig.dbPath;
    console.log('=== Gepackte Electron-App (gespeicherte DB) ===');
    console.log('Gespeicherter Datenbank-Pfad:', savedConfig.dbPath);
  } else {
    // Standard: Datenbank-Pfad neben der EXE
    const dbDir = path.join(appDir, 'database');
    const dbPath = path.join(dbDir, 'werkstatt.db');
    process.env.DB_PATH = dbPath;
    
    // Erstelle database-Ordner falls nicht vorhanden
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log('Datenbank-Ordner erstellt:', dbDir);
    }
    
    console.log('=== Gepackte Electron-App ===');
    console.log('Datenbank-Pfad:', dbPath);
  }
  
  console.log('EXE-Pfad:', process.execPath);
  console.log('App-Verzeichnis:', appDir);
  console.log('PORTABLE_EXECUTABLE_DIR:', process.env.PORTABLE_EXECUTABLE_DIR || 'nicht gesetzt');
  console.log('=============================');
} else {
  // Entwicklungsmodus: auch gespeicherten Pfad beachten
  if (savedConfig.dbPath && fs.existsSync(savedConfig.dbPath)) {
    process.env.DB_PATH = savedConfig.dbPath;
    console.log('=== Entwicklungsmodus (gespeicherte DB) ===');
    console.log('Gespeicherter Datenbank-Pfad:', savedConfig.dbPath);
  } else {
    console.log('=== Entwicklungsmodus ===');
  }
  console.log('Arbeitsverzeichnis:', process.cwd());
}

const { startServer } = require('./src/server');
const BackupController = require('./src/controllers/backupController');

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
    width: 400,
    height: 580,
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

  // Auto-Update: Prüfe auf Updates nach App-Start (nur bei gepackter App)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.log('Update-Check fehlgeschlagen:', err.message);
      });
    }, 3000); // 3 Sekunden nach Start
  }

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

// IPC Handler für Datenbank-Pfad Verwaltung
ipcMain.handle('db-get-path', async () => {
  try {
    const config = loadConfig();
    const currentPath = process.env.DB_PATH || BackupController.getDbPath();
    return {
      success: true,
      dbPath: currentPath,
      savedPath: config.dbPath || null,
      isCustom: !!config.dbPath
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-select-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Datenbank auswählen',
      filters: [
        { name: 'SQLite Datenbank', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const selectedPath = result.filePaths[0];
    
    // Speichere den Pfad in der Konfiguration
    const config = loadConfig();
    config.dbPath = selectedPath;
    saveConfig(config);

    return {
      success: true,
      dbPath: selectedPath,
      message: 'Datenbank-Pfad gespeichert. Bitte starten Sie die Anwendung neu, um die neue Datenbank zu verwenden.'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-reset-path', async () => {
  try {
    const config = loadConfig();
    delete config.dbPath;
    saveConfig(config);

    // Ermittle den Standard-Pfad (mit getAppDirectory für portable Apps)
    const appDir = getAppDirectory();
    const defaultPath = path.join(appDir, 'database', 'werkstatt.db');

    return {
      success: true,
      dbPath: defaultPath,
      message: 'Datenbank-Pfad auf Standard zurückgesetzt. Bitte starten Sie die Anwendung neu.'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-open-folder', async () => {
  try {
    const dbPath = process.env.DB_PATH || BackupController.getDbPath();
    const dbDir = path.dirname(dbPath);
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

// ===== AUTO-UPDATE IPC HANDLER =====
ipcMain.handle('update-check', async () => {
  try {
    if (!app.isPackaged) {
      return { success: false, error: 'Updates nur in der installierten Version verfügbar' };
    }
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
  // Installiert das Update und startet die App neu
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('update-get-status', async () => {
  return {
    success: true,
    status: updateStatus,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged
  };
});
// ===== ENDE AUTO-UPDATE IPC HANDLER =====
