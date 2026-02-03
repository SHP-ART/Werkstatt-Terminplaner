const { app, BrowserWindow, screen, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== KONFIGURATION ==========
// Standard-Konfiguration
const DEFAULT_CONFIG = {
  backendUrl: 'http://localhost:3000',
  fullscreen: true,
  kiosk: false,
  refreshInterval: 30,
  autostart: false,
  displayOffTime: '18:10',
  displayOnTime: '07:30'
};

// Config-Datei Pfad (neben der .exe)
function getConfigPath() {
  // Im Development: im Projektordner
  // Im Production: neben der .exe
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'config.json');
  }
  return path.join(__dirname, 'config.json');
}

// Konfiguration laden
function loadConfig() {
  const configPath = getConfigPath();
  let config = { ...DEFAULT_CONFIG };

  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const loadedConfig = JSON.parse(fileContent);
      config = { ...DEFAULT_CONFIG, ...loadedConfig };
      console.log('Konfiguration geladen von:', configPath);
    } else {
      // Config-Datei erstellen mit Standardwerten
      saveConfig(config);
      console.log('Standard-Konfiguration erstellt:', configPath);
    }
  } catch (error) {
    console.error('Fehler beim Laden der Konfiguration:', error);
  }

  return config;
}

// Konfiguration speichern
function saveConfig(config) {
  const configPath = getConfigPath();
  try {
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf8');
    console.log('Konfiguration gespeichert:', configPath);
  } catch (error) {
    console.error('Fehler beim Speichern der Konfiguration:', error);
  }
}

// Autostart verwalten
function setAutostart(enable) {
  if (process.platform !== 'win32') return;

  const appPath = app.isPackaged ? process.execPath : process.execPath;
  const appName = 'WerkstattIntern';

  app.setLoginItemSettings({
    openAtLogin: enable,
    path: appPath,
    args: ['--autostart']
  });

  console.log(`Autostart ${enable ? 'aktiviert' : 'deaktiviert'}`);
}

// Konfiguration laden
let CONFIG = loadConfig();

let mainWindow;
let tray = null;
let displayTimer = null;

function createWindow() {
  // Bildschirmgröße ermitteln
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    fullscreen: CONFIG.fullscreen,
    kiosk: CONFIG.kiosk,
    autoHideMenuBar: true,
    frame: !CONFIG.kiosk, // Fensterrahmen nur wenn nicht Kiosk
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#f0f2f5'
  });

  // Lade die HTML-Datei
  mainWindow.loadFile('index.html');

  // DevTools nur in Entwicklung
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Vollbild-Toggle mit F11
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    // Escape zum Beenden des Vollbildmodus
    if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
    // F5 zum Neuladen
    if (input.key === 'F5') {
      mainWindow.reload();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Display-Timer starten
  startDisplayTimer();
}

// ========== DISPLAY-TIMER ==========
function startDisplayTimer() {
  // Bestehenden Timer aufräumen
  if (displayTimer) {
    clearInterval(displayTimer);
  }

  // Prüfe alle 30 Sekunden
  displayTimer = setInterval(() => {
    checkDisplaySchedule();
  }, 30000);

  // Sofort prüfen
  checkDisplaySchedule();
}

function checkDisplaySchedule() {
  if (!mainWindow || !CONFIG.displayOffTime || !CONFIG.displayOnTime) {
    return;
  }

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const offTime = CONFIG.displayOffTime;
  const onTime = CONFIG.displayOnTime;

  let shouldBeOff = false;

  // Prüfe ob wir im "Aus"-Zeitfenster sind
  if (offTime < onTime) {
    // Normaler Fall (z.B. 18:10 bis 07:30 nächster Tag)
    shouldBeOff = currentTime >= offTime || currentTime < onTime;
  } else {
    // Falls jemand z.B. 07:30 bis 18:10 als "Aus" definiert (ungewöhnlich)
    shouldBeOff = currentTime >= offTime && currentTime < onTime;
  }

  // Display-Status an Renderer senden
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('display-status', shouldBeOff);
  }
}

// App bereit
app.whenReady().then(() => {
  // Autostart beim ersten Start setzen falls konfiguriert
  if (CONFIG.autostart) {
    setAutostart(true);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Alle Fenster geschlossen
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ========== IPC HANDLER ==========

// Konfiguration abrufen
ipcMain.handle('get-config', () => {
  return CONFIG;
});

// Konfiguration speichern
ipcMain.handle('save-config', (event, newConfig) => {
  CONFIG = { ...CONFIG, ...newConfig };
  saveConfig(CONFIG);

  // Autostart aktualisieren
  setAutostart(CONFIG.autostart);

  // Display-Timer neu starten wenn Zeiten geändert wurden
  if (newConfig.displayOffTime || newConfig.displayOnTime) {
    startDisplayTimer();
  }

  return CONFIG;
});

// Config-Pfad abrufen (für Anzeige)
ipcMain.handle('get-config-path', () => {
  return getConfigPath();
});

// App neustarten
ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit(0);
});
