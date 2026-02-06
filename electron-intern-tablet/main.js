const { app, BrowserWindow, screen, ipcMain, Menu, Tray, powerSaveBlocker } = require('electron');
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

// Config-Datei Pfad - PERSISTENT über Updates!
function getConfigPath() {
  // Im Production: Verwende userData (persistent über Updates)
  // Im Development: im Projektordner
  if (app.isPackaged) {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'config.json');
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
      console.log('✅ Konfiguration geladen von:', configPath);
    } else {
      // Config-Datei erstellen mit Standardwerten
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      saveConfig(config);
      console.log('✨ Standard-Konfiguration erstellt:', configPath);
    }
  } catch (error) {
    console.error('❌ Fehler beim Laden der Konfiguration:', error);
  }

  return config;
}

// Konfiguration speichern
function saveConfig(config) {
  const configPath = getConfigPath();
  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf8');
    console.log('💾 Konfiguration gespeichert:', configPath);
  } catch (error) {
    console.error('❌ Fehler beim Speichern der Konfiguration:', error);
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
let powerSaveBlockerId = null;  // Für Display-Steuerung
let updateCheckInterval = null; // Für Auto-Update-Check

// ========== AUTO-UPDATE FUNKTIONEN ==========
const http = require('http');
const https = require('https');
const os = require('os');

// Versions-Information aus package.json
const packageJson = require('./package.json');
const CURRENT_VERSION = packageJson.version;

/**
 * Hilfsfunktion für HTTP-Requests (Node.js-kompatibel)
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const req = protocol.request(url, options, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            ok: true,
            status: res.statusCode,
            data: body,
            json: () => JSON.parse(body.toString()),
            buffer: () => body
          });
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

/**
 * Prüft auf Updates vom Server
 */
async function checkForUpdates() {
  try {
    const backendUrl = CONFIG.backendUrl || 'http://localhost:3000';
    const updateCheckUrl = `${backendUrl}/api/tablet-update/check?version=${CURRENT_VERSION}`;
    
    console.log(`🔍 Prüfe auf Updates... (Aktuelle Version: ${CURRENT_VERSION})`);
    
    const response = await httpRequest(updateCheckUrl);
    const updateInfo = response.json();
    
    if (updateInfo.updateAvailable) {
      console.log(`✨ Update verfügbar: ${updateInfo.latestVersion}`);
      return updateInfo;
    } else {
      console.log('✅ Tablet-App ist aktuell');
      return null;
    }
  } catch (error) {
    console.log('⚠️ Update-Check Fehler:', error.message);
    return null;
  }
}

/**
 * Lädt Update herunter und installiert es
 */
async function downloadAndInstallUpdate() {
  try {
    const backendUrl = CONFIG.backendUrl || 'http://localhost:3000';
    const downloadUrl = `${backendUrl}/api/tablet-update/download`;
    
    console.log('⬇️ Lade Update herunter...');
    
    const tempDir = app.getPath('temp');
    const updateFileName = `Werkstatt-Intern-Update-${Date.now()}.exe`;
    const updatePath = path.join(tempDir, updateFileName);
    
    // Download
    const response = await httpRequest(downloadUrl);
    const buffer = response.buffer();
    
    fs.writeFileSync(updatePath, buffer);
    
    console.log('✅ Update heruntergeladen:', updatePath);
    console.log('🚀 Starte Installation...');
    
    // Installer starten
    const { exec } = require('child_process');
    exec(`"${updatePath}" /S`, (error) => {
      if (error) {
        console.error('❌ Installation fehlgeschlagen:', error);
      } else {
        console.log('✅ Installation gestartet - App wird beendet');
        app.quit();
      }
    });
    
    return true;
  } catch (error) {
    console.error('❌ Update-Fehler:', error);
    return false;
  }
}

/**
 * Meldet Status an Server
 */
async function reportStatusToServer() {
  try {
    const backendUrl = CONFIG.backendUrl || 'http://localhost:3000';
    const statusUrl = `${backendUrl}/api/tablet-update/report-status`;
    
    const hostname = os.hostname();
    const networkInterfaces = os.networkInterfaces();
    let ip = 'unknown';
    
    // Finde primäre IP-Adresse
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ip = iface.address;
          break;
        }
      }
      if (ip !== 'unknown') break;
    }
    
    await fetch(statusUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    const body = JSON.stringify({
      version: CURRENT_VERSION,
      hostname,
      ip
    });
    
    await httpRequest(statusUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      bodyole.log(`📡 Status gemeldet: ${hostname} (${ip}) - v${CURRENT_VERSION}`);
  } catch (error) {
    // Fehler beim Status-Melden ist nicht kritisch
    console.log('⚠️ Status-Meldung fehlgeschlagen:', error.message);
  }
}

/**
 * Startet regelmäßigen Update-Check
 */
function startUpdateCheck() {
  // Sofort beim Start prüfen
  checkForUpdates().then(updateInfo => {
    if (updateInfo && updateInfo.updateAvailable) {
      // Zeige Update-Benachrichtigung
      if (mainWindow) {
        mainWindow.webContents.send('update-available', updateInfo);
      }
    }
  });
  
  // Status an Server melden
  reportStatusToServer();
  
  // Alle 30 Minuten prüfen
  updateCheckInterval = setInterval(() => {
    checkForUpdates().then(updateInfo => {
      if (updateInfo && updateInfo.updateAvailable) {
        if (mainWindow) {
          mainWindow.webContents.send('update-available', updateInfo);
        }
      }
    });
    
    // Status an Server melden
    reportStatusToServer();
  }, 30 * 60 * 1000); // 30 Minuten
}

let mainWindow;
let tray = null;
let displayTimer = null;
let powerSaveBlockerId = null;  // Für Display-Steuerung

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

  // DevTools deaktiviert
  // mainWindow.webContents.openDevTools();

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

  // Display physisch ausschalten (Windows 10/11)
  if (shouldBeOff) {
    // Display ausschalten: Blockiere NICHT den Bildschirm-Energiesparmodus
    if (powerSaveBlockerId !== null) {
      try {
        powerSaveBlocker.stop(powerSaveBlockerId);
        powerSaveBlockerId = null;
        console.log('🌙 Display-Energiesparmodus AKTIVIERT (Display kann ausschalten)');
      } catch (e) {
        console.error('Fehler beim Stoppen des PowerSaveBlockers:', e);
      }
    }
    
    // Windows Display ausschalten via nircmd (funktioniert zuverlässiger)
    if (process.platform === 'win32') {
      try {
        const { exec } = require('child_process');
        
        // Methode 1: PowerShell mit korrigierter Syntax
        const psCommand = `powershell -Command "Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Monitor {
    [DllImport(\\"user32.dll\\")]
    public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);
    public static void Off() {
        SendMessage(0xFFFF, 0x0112, 0xF170, 2);
    }
}
'@; [Monitor]::Off()"`;
        
        exec(psCommand, { windowsHide: true, timeout: 2000 }, (error) => {
          if (error) {
            console.log('PowerShell-Methode fehlgeschlagen, versuche Alternative...');
            
            // Methode 2: Setze Windows-Energiesparplan auf minimale Zeit
            exec('powercfg /change monitor-timeout-ac 1', { windowsHide: true });
            
            // Warte kurz und setze zurück
            setTimeout(() => {
              exec('powercfg /change monitor-timeout-ac 0', { windowsHide: true });
            }, 2000);
          } else {
            console.log('🌙 Windows-Monitor erfolgreich ausgeschaltet');
          }
        });
        
      } catch (e) {
        console.error('Fehler beim Ausschalten des Monitors:', e.message);
      }
    }
  } else {
    // Display einschalten: Blockiere den Bildschirm-Energiesparmodus
    if (powerSaveBlockerId === null) {
      try {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
        console.log('☀️ Display-Energiesparmodus BLOCKIERT (Display bleibt an)');
        
        // Sicherstellen, dass Monitor auch wirklich an ist
        if (process.platform === 'win32') {
          const { exec } = require('child_process');
          // Bewege Maus minimal, um Display zu aktivieren
          exec('powershell -Command "$sig = @\\\"\\n[DllImport(\\\\"user32.dll\\\\")]public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);\\n\\\"; Add-Type -MemberDefinition $sig -Name Mouse -Namespace Win32; [Win32.Mouse]::mouse_event(0x0001, 1, 1, 0, 0)"', { windowsHide: true });
        }
      } catch (e) {
        console.error('Fehler beim Starten des PowerSaveBlockers:', e);
      }
    }
  }

  // Display-Status an Renderer senden (für UI-Overlay)
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
  
  // Starte Auto-Update-Check
  startUpdateCheck();

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

// Display-Zeiten aktualisieren (vom Server synchronisiert)
ipcMain.handle('update-display-times', (event, times) => {
  if (times.displayOffTime) {
    CONFIG.displayOffTime = times.displayOffTime;
  }
  if (times.displayOnTime) {
    CONFIG.displayOnTime = times.displayOnTime;
  }
  
  // Optional: Auch in config.json speichern als Cache
  saveConfig(CONFIG);
  
  // Display-Timer neu starten mit neuen Zeiten
  startDisplayTimer();
  
  return { success: true };
});

// Manuelles Display-Steuern (sofort ein/aus schalten)
ipcMain.handle('set-display-manual', (event, shouldBeOff) => {
  console.log(`🔧 Manuelles Display-Schalten: ${shouldBeOff ? 'AUS' : 'AN'}`);
  
  if (shouldBeOff) {
    // Display ausschalten
    if (powerSaveBlockerId !== null) {
      try {
        powerSaveBlocker.stop(powerSaveBlockerId);
        powerSaveBlockerId = null;
      } catch (e) {
        console.error('Fehler beim Stoppen des PowerSaveBlockers:', e);
      }
    }
    
    // Windows Monitor ausschalten
    if (process.platform === 'win32') {
      try {
        const { exec } = require('child_process');
        
        const psCommand = `powershell -Command "Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Monitor {
    [DllImport(\\"user32.dll\\")]
    public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);
    public static void Off() {
        SendMessage(0xFFFF, 0x0112, 0xF170, 2);
    }
}
'@; [Monitor]::Off()"`;
        
        exec(psCommand, { windowsHide: true, timeout: 2000 }, (error) => {
          if (error) {
            console.log('Fehler beim manuellen Display-Ausschalten:', error.message);
          } else {
            console.log('🌙 Windows-Monitor manuell ausgeschaltet');
          }
        });
        
      } catch (e) {
        console.error('Fehler:', e.message);
      }
    }
  } else {
    // Display einschalten
    if (powerSaveBlockerId === null) {
      try {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
        console.log('☀️ Display-Energiesparmodus blockiert (manuell)');
      } catch (e) {
        console.error('Fehler beim Starten des PowerSaveBlockers:', e);
      }
    }
  }
  
  // Status an Renderer senden
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('display-status', shouldBeOff);
  }
  
  return { success: true };
});

// Update-Verwaltung
ipcMain.handle('check-for-updates', async () => {
  return await checkForUpdates();
});

ipcMain.handle('install-update', async () => {
  return await downloadAndInstallUpdate();
});

