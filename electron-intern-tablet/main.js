const { app, BrowserWindow, screen, ipcMain, Menu, Tray, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== KONFIGURATION ==========
// Standard-Konfiguration
const DEFAULT_CONFIG = {
  backendUrl: 'http://127.0.0.1:3001',
  fullscreen: true,
  kiosk: true,
  refreshInterval: 30,
  autostart: true,
  displayOffTime: '18:10',
  displayOnTime: '07:30',
  blockWindowsShortcuts: true,
  autoInstallUpdates: true,
  updateWindowStart: '02:00',
  updateWindowEnd: '05:00'
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

// ========== WINDOWS-SHORTCUT-BLOCKER ==========
// Setzt HKCU-Registry-Keys, die Win+L, Abmelden, Herunterfahren, Task-Manager sperren.
// Keine Admin-Rechte nötig (HKCU gilt nur für aktuellen User).
// Wirkung der Policies:
//   DisableLockWorkstation  → Win+L blockiert
//   DisableTaskMgr          → Task-Manager blockiert
//   DisableChangePassword   → Passwort-Änderung blockiert
//   NoLogoff                → Abmelden aus Startmenü/Ctrl+Alt+Del blockiert
//   NoClose                 → Herunterfahren/Neustart aus Startmenü blockiert
const WINDOWS_SHORTCUT_KEYS = [
  { path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', name: 'DisableLockWorkstation' },
  { path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', name: 'DisableTaskMgr' },
  { path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', name: 'DisableChangePassword' },
  { path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', name: 'NoLogoff' },
  { path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', name: 'NoClose' }
];

function applyWindowsShortcutBlocker(enable) {
  if (process.platform !== 'win32') return;
  if (!app.isPackaged) {
    console.log('🛠️ Dev-Modus: Windows-Shortcut-Blocker übersprungen');
    return;
  }
  const { exec } = require('child_process');
  WINDOWS_SHORTCUT_KEYS.forEach(({ path: regPath, name }) => {
    const cmd = enable
      ? `reg add "${regPath}" /v ${name} /t REG_DWORD /d 1 /f`
      : `reg delete "${regPath}" /v ${name} /f`;
    exec(cmd, { windowsHide: true }, (error) => {
      if (error && enable) {
        console.log(`⚠️ Registry ${name} setzen fehlgeschlagen:`, error.message);
      } else if (!error) {
        console.log(`${enable ? '🔒' : '🔓'} ${name} ${enable ? 'gesperrt' : 'freigegeben'}`);
      }
    });
  });
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

// API-Key für geschützte Backend-Endpunkte. Wird beim Start über
// GET /api/client-config gezogen und in Folge-Requests als x-api-key gesendet.
let CACHED_API_KEY = null;

/**
 * Normalisiert eine Backend-URL (ergänzt http:// falls kein Schema angegeben)
 */
function normalizeBackendUrl(url) {
  if (!url) return url;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return 'http://' + trimmed;
  }
  return trimmed;
}

/**
 * Hilfsfunktion für HTTP-Requests (Node.js-kompatibel)
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    // API-Key automatisch mitsenden, wenn vorhanden und nicht explizit unterdrückt
    const headers = Object.assign({}, options.headers || {});
    if (CACHED_API_KEY && !options.skipApiKey && !headers['x-api-key']) {
      headers['x-api-key'] = CACHED_API_KEY;
    }
    const reqOptions = Object.assign({}, options, { headers });

    const req = protocol.request(url, reqOptions, (res) => {
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
 * Holt den API-Key vom öffentlichen /api/client-config-Endpunkt.
 * Muss VOR den ersten Update-/Status-Requests laufen, damit die Auth sitzt.
 */
async function fetchApiKey() {
  try {
    const backendUrl = CONFIG.backendUrl || 'http://localhost:3001';
    const response = await httpRequest(`${backendUrl}/api/client-config`, { skipApiKey: true });
    const data = response.json();
    if (data && data.apiKey) {
      CACHED_API_KEY = data.apiKey;
      console.log('🔑 API-Key vom Backend bezogen');
    } else {
      console.log('ℹ️ Backend liefert keinen API-Key (Dev-Modus?)');
    }
  } catch (error) {
    console.log('⚠️ API-Key konnte nicht abgerufen werden:', error.message);
  }
}

/**
 * Prüft auf Updates vom Server
 */
async function checkForUpdates() {
  try {
    const backendUrl = CONFIG.backendUrl || 'http://localhost:3001';
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
 * Prüft ob aktuelle Uhrzeit im konfigurierten Update-Wartungsfenster liegt.
 * Unterstützt Fenster über Mitternacht (z.B. 22:00–05:00).
 */
function isWithinUpdateWindow() {
  const start = CONFIG.updateWindowStart;
  const end = CONFIG.updateWindowEnd;
  if (!start || !end) return false;
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (start < end) {
    return current >= start && current < end;
  }
  // Über Mitternacht
  return current >= start || current < end;
}

/**
 * Reagiert auf ein gefundenes Update:
 *   - Im Wartungsfenster + autoInstallUpdates=true → sofort silent installieren
 *   - Sonst → Notification im UI anzeigen, User entscheidet
 */
function handleAvailableUpdate(updateInfo) {
  if (!updateInfo || !updateInfo.updateAvailable) return;

  if (CONFIG.autoInstallUpdates && isWithinUpdateWindow()) {
    console.log(`🌙 Update ${updateInfo.latestVersion} im Wartungsfenster — installiere automatisch`);
    downloadAndInstallUpdate();
    return;
  }

  console.log(`📢 Update ${updateInfo.latestVersion} verfügbar — zeige Notification`);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', updateInfo);
  }
}

/**
 * Lädt Update herunter und installiert es
 */
async function downloadAndInstallUpdate() {
  try {
    const backendUrl = CONFIG.backendUrl || 'http://localhost:3001';
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
    
    // App zuerst beenden, dann Installer starten
    // Kleines Batch-Skript: wartet kurz und startet dann den Installer
    const batchPath = path.join(tempDir, 'werkstatt-update-launcher.bat');
    const batchContent = `@echo off\r\nping 127.0.0.1 -n 3 -w 1000 > nul\r\n"${updatePath}" /S\r\n`;
    fs.writeFileSync(batchPath, batchContent);
    
    const { spawn } = require('child_process');
    const child = spawn('cmd.exe', ['/c', batchPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.unref();
    
    console.log('✅ Update-Launcher gestartet - App wird jetzt beendet');
    setTimeout(() => app.quit(), 500);
    
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
    const backendUrl = CONFIG.backendUrl || 'http://localhost:3001';
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
    
    const body = JSON.stringify({
      version: CURRENT_VERSION,
      hostname,
      ip
    });

    await httpRequest(statusUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body))
      },
      body
    });
    console.log(`📡 Status gemeldet: ${hostname} (${ip}) - v${CURRENT_VERSION}`);
  } catch (error) {
    // Fehler beim Status-Melden ist nicht kritisch
    console.log('⚠️ Status-Meldung fehlgeschlagen:', error.message);
  }
}

/**
 * Startet regelmäßigen Update-Check
 */
function startUpdateCheck() {
  // Erster Check erfolgt via did-finish-load in createWindow() sobald der Renderer bereit ist.
  // Periodischer Check alle 15 Minuten (damit kein Wartungsfenster verpasst wird)
  updateCheckInterval = setInterval(() => {
    checkForUpdates().then(updateInfo => {
      handleAvailableUpdate(updateInfo);
    });

    // Status an Server melden
    reportStatusToServer();
  }, 15 * 60 * 1000); // 15 Minuten

  // Status sofort beim Start an Server melden
  reportStatusToServer();
}

function createWindow() {
  // Bildschirmgröße ermitteln
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    fullscreen: app.isPackaged ? CONFIG.fullscreen : false,
    kiosk: app.isPackaged ? CONFIG.kiosk : false,
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

  // Erster Update-Check erst nach vollständigem Laden (sonst ist der Listener im Renderer noch nicht bereit)
  mainWindow.webContents.once('did-finish-load', () => {
    checkForUpdates().then(updateInfo => {
      handleAvailableUpdate(updateInfo);
    });
  });

  // DevTools für lokales Testen aktiviert
  if (!app.isPackaged) mainWindow.webContents.openDevTools();

  // Tastatur-Handler: Kiosk-Mode vs. Entwickler-Mode
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isKiosk = app.isPackaged && CONFIG.kiosk;

    // Wartungs-Kombi: Ctrl+Alt+Shift+Q → App sauber beenden (Registry-Cleanup läuft in before-quit)
    if (input.control && input.alt && input.shift && (input.key === 'Q' || input.key === 'q')) {
      console.log('🔑 Wartungs-Kombi erkannt, beende App');
      event.preventDefault();
      app.quit();
      return;
    }

    if (isKiosk) {
      // Im Kiosk-Mode: alle Ausbruchs-Tasten blockieren
      if (input.key === 'F11' || input.key === 'Escape' || input.key === 'F4' ||
          (input.alt && input.key === 'F4') ||
          (input.control && (input.key === 'w' || input.key === 'W')) ||
          (input.control && input.shift && (input.key === 'i' || input.key === 'I'))) {
        event.preventDefault();
        return;
      }
      // F5 Reload im Kiosk erlaubt (nützlich bei Server-Reconnect)
      if (input.key === 'F5') {
        mainWindow.reload();
      }
      return;
    }

    // Dev-Mode: alte Komfort-Shortcuts
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
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
  // Im Dev-Modus: Display-Timer deaktiviert (Display immer an)
  if (!app.isPackaged) {
    console.log('🛠️ Dev-Modus: Display-Timer deaktiviert');
    return;
  }

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

// PowerSaveBlocker IMMER aktiv halten — verhindert, dass Windows
// Standby/Sleep/Lock/Auto-Logoff triggert. Der "aus"-Zustand wird
// ausschließlich durch das schwarze Overlay mit Schriftzug dargestellt,
// nicht durch echtes Abschalten des Monitors.
function ensurePowerSaveBlockerActive() {
  if (powerSaveBlockerId === null) {
    try {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      console.log('☀️ PowerSaveBlocker aktiv (Display bleibt an, Windows bleibt wach)');
    } catch (e) {
      console.error('Fehler beim Starten des PowerSaveBlockers:', e);
    }
  }
}

// Einmaliger Setup beim App-Start: Windows-Energiesparen und Bildschirmschoner deaktivieren.
// Verhindert Auto-Abmeldung, Lock-Screen und Windows-eigenen Screensaver.
function disableWindowsPowerAndScreensaver() {
  if (process.platform !== 'win32') return;
  if (!app.isPackaged) return;
  const { exec } = require('child_process');
  // Kein Monitor-Timeout, kein Standby, kein Hibernate
  exec('powercfg /change monitor-timeout-ac 0', { windowsHide: true });
  exec('powercfg /change monitor-timeout-dc 0', { windowsHide: true });
  exec('powercfg /change standby-timeout-ac 0', { windowsHide: true });
  exec('powercfg /change standby-timeout-dc 0', { windowsHide: true });
  exec('powercfg /change hibernate-timeout-ac 0', { windowsHide: true });
  exec('powercfg /change hibernate-timeout-dc 0', { windowsHide: true });
  // Windows-Bildschirmschoner in HKCU deaktivieren
  exec('reg add "HKCU\\Control Panel\\Desktop" /v ScreenSaveActive /t REG_SZ /d 0 /f', { windowsHide: true });
  exec('reg add "HKCU\\Control Panel\\Desktop" /v ScreenSaveTimeOut /t REG_SZ /d 0 /f', { windowsHide: true });
  exec('reg add "HKCU\\Control Panel\\Desktop" /v ScreenSaverIsSecure /t REG_SZ /d 0 /f', { windowsHide: true });
  console.log('🛡️ Windows-Energiesparen und Bildschirmschoner deaktiviert');
}

function checkDisplaySchedule() {
  if (!mainWindow || !CONFIG.displayOffTime || !CONFIG.displayOnTime) {
    return;
  }

  // Windows bleibt IMMER wach — wir stellen nur das Overlay um.
  ensurePowerSaveBlockerActive();

  // Manueller Override hat Vorrang vor Zeitsteuerung
  if (CONFIG.manuellerDisplayStatus === 'an') {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('display-status', false);
    }
    return;
  }
  if (CONFIG.manuellerDisplayStatus === 'aus') {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('display-status', true);
    }
    return;
  }

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const offTime = CONFIG.displayOffTime;
  const onTime = CONFIG.displayOnTime;

  let shouldBeOff = false;
  if (offTime > onTime) {
    // Zeitfenster über Mitternacht (z.B. 18:10–07:30)
    shouldBeOff = currentTime >= offTime || currentTime < onTime;
  } else {
    // Zeitfenster am selben Tag (z.B. 07:30–18:10)
    shouldBeOff = currentTime >= offTime && currentTime < onTime;
  }

  // Nur das Overlay umschalten, keinen Windows-Systemeingriff mehr
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('display-status', shouldBeOff);
  }
}

// App bereit
app.whenReady().then(async () => {
  // Autostart beim ersten Start setzen falls konfiguriert
  if (CONFIG.autostart) {
    setAutostart(true);
  }

  // Windows-Shortcuts sperren (Win+L, Abmelden, Herunterfahren, Task-Manager)
  if (CONFIG.blockWindowsShortcuts) {
    applyWindowsShortcutBlocker(true);
  }

  // Windows-Energiesparen + Bildschirmschoner deaktivieren (verhindert Auto-Abmeldung)
  disableWindowsPowerAndScreensaver();

  // API-Key holen, bevor Update-/Status-Requests laufen
  await fetchApiKey();

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

// Beim Beenden: Windows-Energiesparplan auf vernünftigen Standardwert zurücksetzen
// und Shortcut-Sperren aufheben, damit Wartung/Abmelden wieder möglich ist.
app.on('before-quit', () => {
  if (process.platform === 'win32') {
    const { exec } = require('child_process');
    // 10 Minuten als sinnvoller Standard nach App-Ende
    exec('powercfg /change monitor-timeout-ac 10', { windowsHide: true });
    exec('powercfg /change monitor-timeout-dc 5', { windowsHide: true });
    console.log('🔧 Monitor-Timeout auf Standard zurückgesetzt');
  }
  if (CONFIG.blockWindowsShortcuts) {
    applyWindowsShortcutBlocker(false);
  }
});

// ========== IPC HANDLER ==========

// Konfiguration abrufen
ipcMain.handle('get-config', () => {
  return CONFIG;
});

// Konfiguration speichern
ipcMain.handle('save-config', (event, newConfig) => {
  // URL normalisieren (http:// ergänzen falls fehlt)
  if (newConfig.backendUrl) {
    newConfig.backendUrl = normalizeBackendUrl(newConfig.backendUrl);
  }

  const urlChanged = newConfig.backendUrl && newConfig.backendUrl !== CONFIG.backendUrl;
  const shortcutBlockerChanged =
    newConfig.blockWindowsShortcuts !== undefined &&
    newConfig.blockWindowsShortcuts !== CONFIG.blockWindowsShortcuts;

  CONFIG = { ...CONFIG, ...newConfig };
  saveConfig(CONFIG);

  // Autostart aktualisieren
  setAutostart(CONFIG.autostart);

  // Windows-Shortcut-Blocker zur Laufzeit umschalten
  if (shortcutBlockerChanged) {
    applyWindowsShortcutBlocker(CONFIG.blockWindowsShortcuts);
  }

  // Display-Timer neu starten wenn Zeiten geändert wurden
  if (newConfig.displayOffTime || newConfig.displayOnTime) {
    startDisplayTimer();
  }

  // Bei neuer Server-URL: neuen API-Key holen, dann Check + Status
  if (urlChanged) {
    console.log('🔄 Backend-URL geändert, hole neuen API-Key und starte Update-Check...');
    CACHED_API_KEY = null;
    fetchApiKey().then(() => {
      checkForUpdates().then(updateInfo => {
        handleAvailableUpdate(updateInfo);
      });
      reportStatusToServer();
    });
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
  // Manuellen Status speichern ('an', 'aus' oder 'auto'/null für Zeitsteuerung)
  if (times.manuellerDisplayStatus !== undefined) {
    CONFIG.manuellerDisplayStatus = times.manuellerDisplayStatus;
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
  // Manuellen Status merken, damit checkDisplaySchedule() ihn respektiert
  CONFIG.manuellerDisplayStatus = shouldBeOff ? 'aus' : 'an';

  // Windows bleibt IMMER wach — Overlay macht den sichtbaren "aus"-Effekt.
  ensurePowerSaveBlockerActive();

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

