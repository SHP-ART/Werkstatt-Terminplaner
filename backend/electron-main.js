const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { startServer } = require('./src/server');

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
    width: 320,
    height: 420,
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
  stopServer();
  if (process.platform !== 'darwin') {
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
