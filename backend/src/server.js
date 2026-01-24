require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// =============================================================================
// STARTUP LOGGING - Detailliertes Logging für Debugging
// =============================================================================
const startupTime = new Date();
const logFile = path.join(__dirname, '..', '..', 'logs', 'server-debug.log');

function logStartup(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const elapsed = Date.now() - startupTime.getTime();
  const logLine = `[${timestamp}] [${elapsed}ms] [${level}] ${message}`;
  console.log(logLine);
  
  // Auch in Datei schreiben
  try {
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(logFile, logLine + '\n');
  } catch (e) {
    // Ignoriere Dateifehler
  }
}

// Log-Datei bei Start leeren
try {
  const logsDir = path.dirname(logFile);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  fs.writeFileSync(logFile, `=== Server Start: ${startupTime.toISOString()} ===\n`);
} catch (e) {}

logStartup('Server-Modul wird geladen...');
logStartup(`Node Version: ${process.version}`);
logStartup(`Platform: ${process.platform} ${process.arch}`);
logStartup(`Working Directory: ${process.cwd()}`);

// Module laden mit Logging
logStartup('Lade database.js...');
const { initializeDatabase, initializeDatabaseWithBackup, DB_SCHEMA_VERSION } = require('./config/database');
logStartup('database.js geladen ✓');

logStartup('Lade version.js...');
const { VERSION, APP_NAME } = require('./config/version');
logStartup(`Version: ${VERSION} ✓`);

logStartup('Lade routes...');
const routes = require('./routes');
logStartup('routes geladen ✓');

logStartup('Lade localAiService...');
const localAiService = require('./services/localAiService');
logStartup('localAiService geladen ✓');

logStartup('Lade ws (WebSocket)...');
const { WebSocketServer } = require('ws');
logStartup('ws geladen ✓');

logStartup('Lade websocket utils...');
const { setWebSocketServer } = require('./utils/websocket');
logStartup('websocket utils geladen ✓');

logStartup('Lade http...');
const http = require('http');
logStartup('http geladen ✓');

logStartup('Lade errorHandler...');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
logStartup('errorHandler geladen ✓');

let wss;

// =============================================================================
// ENVIRONMENT CHECK
// =============================================================================

/**
 * Prüft erforderliche Umgebungsvariablen und gibt Warnungen aus
 */
function checkEnvironment() {
    console.log('\n🔍 Environment Check...');
    
    const required = ['PORT'];
    const optional = ['CORS_ORIGIN', 'DB_PATH', 'NODE_ENV'];
    
    let hasWarnings = false;
    
    // Prüfe erforderliche Variablen
    required.forEach(key => {
        if (!process.env[key]) {
            console.warn(`⚠️  ${key} nicht gesetzt - verwende Standardwert`);
            hasWarnings = true;
        }
    });
    
    // Info zu optionalen Variablen
    optional.forEach(key => {
        if (!process.env[key]) {
            console.log(`ℹ️  ${key} nicht gesetzt - verwende Standardwert`);
        }
    });
    
    // Warnung wenn keine .env Datei existiert
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
        console.warn('⚠️  .env Datei nicht gefunden!');
        console.warn('   Kopiere .env.example nach .env und passe die Werte an.');
        hasWarnings = true;
    }
    
    if (!hasWarnings) {
        console.log('✅ Environment Check abgeschlossen\n');
    } else {
        console.log('⚠️  Environment Check mit Warnungen abgeschlossen\n');
    }
}

// Funktion zum Finden des Frontend-Ordners
function findFrontendPath() {
    const possiblePaths = [
        // Entwicklung: dist (Vite Build)
        path.join(__dirname, '..', '..', 'frontend', 'dist'),
        // Entwicklung: Frontend neben Backend
        path.join(__dirname, '..', '..', 'frontend'),
        // Produktion: dist neben der EXE
        path.join(process.resourcesPath || '', '..', 'frontend', 'dist'),
        // Produktion: Frontend im gleichen Ordner wie die EXE
        path.join(process.resourcesPath || '', '..', 'frontend'),
        // Produktion: dist in resources
        path.join(process.resourcesPath || '', 'frontend', 'dist'),
        // Produktion: Frontend in resources
        path.join(process.resourcesPath || '', 'frontend'),
        // Fallback: dist relativ zum Arbeitsverzeichnis
        path.join(process.cwd(), 'frontend', 'dist'),
        // Fallback: Relativ zum Arbeitsverzeichnis
        path.join(process.cwd(), 'frontend'),
    ];

    for (const frontendPath of possiblePaths) {
        if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
            console.log(`Frontend gefunden: ${frontendPath}`);
            return frontendPath;
        }
    }
    console.warn('Frontend-Ordner nicht gefunden!');
    return null;
}

async function startServer(clientCountCallback, requestLogCallback) {
    logStartup('=== startServer() aufgerufen ===');
    
    // Environment Check durchführen
    logStartup('Starte Environment Check...');
    checkEnvironment();
    logStartup('Environment Check abgeschlossen');
    
    logStartup('Erstelle Express App...');
    const app = express();
    const PORT = process.env.PORT || 3001;
    logStartup(`Port: ${PORT}`);

    // CORS-Konfiguration (verbessert)
    const corsOrigin = process.env.CORS_ORIGIN || '*';
    logStartup(`CORS Origin: ${corsOrigin}`);

    const corsOptions = {
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps, curl, or file://)
            if (!origin) return callback(null, true);

            // If CORS_ORIGIN is *, allow all origins
            if (corsOrigin === '*') {
                return callback(null, true);
            }

            // Parse comma-separated origins
            const whitelist = corsOrigin.split(',').map(o => o.trim());
            
            // Add localhost variants
            whitelist.push('http://localhost:3000', 'http://127.0.0.1:3000');

            if (whitelist.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.warn(`⚠️  CORS: Origin '${origin}' blocked (not in whitelist)`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        optionsSuccessStatus: 200
    };

    app.use(cors(corsOptions));
    logStartup('CORS Middleware aktiviert');

    // === Performance-Optimierung: Verbesserte Compression ===
    app.use(compression({
      // Nur komprimieren wenn größer als 1KB
      threshold: 1024,
      // Kompressionslevel (1-9, höher = bessere Kompression aber langsamer)
      level: 6,
      // Diese Content-Types komprimieren
      filter: (req, res) => {
        // Immer JSON und HTML komprimieren
        const contentType = res.getHeader('Content-Type');
        if (contentType && (
          contentType.includes('application/json') ||
          contentType.includes('text/html') ||
          contentType.includes('text/css') ||
          contentType.includes('application/javascript')
        )) {
          return true;
        }
        // Standardfilter für andere Typen
        return compression.filter(req, res);
      }
    }));
    logStartup('Compression Middleware aktiviert (optimiert)');
    
    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
    logStartup('Body-Parser Middleware aktiviert');

    // Request-Logging Middleware für Electron
    if (requestLogCallback) {
        app.use((req, res, next) => {
            const startTime = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                requestLogCallback({
                    method: req.method,
                    path: req.path,
                    status: res.statusCode,
                    duration: duration
                });
            });
            
            next();
        });
    }

    logStartup('Initialisiere Datenbank...');
    logStartup(`Schema-Version: ${DB_SCHEMA_VERSION}`);
    try {
        // Mit automatischem Backup bei Schema-Änderungen
        await initializeDatabaseWithBackup();
        logStartup('Datenbank initialisiert (mit Backup-Prüfung) ✓');
    } catch (dbError) {
        logStartup(`FEHLER bei Datenbank-Initialisierung: ${dbError.message}`, 'ERROR');
        logStartup(dbError.stack, 'ERROR');
        throw dbError;
    }

    // Lokales KI-Training (täglich)
    localAiService.scheduleDailyTraining();

    logStartup('Registriere API-Routen...');
    app.use('/api', routes);
    logStartup('API-Routen registriert ✓');

    // Frontend statisch ausliefern (falls vorhanden)
    logStartup('Suche Frontend-Pfad...');
    const frontendPath = findFrontendPath();
    if (frontendPath) {
        logStartup(`Frontend gefunden: ${frontendPath}`);
        // Statische Dateien aus dem Frontend-Ordner (ohne Cache für Entwicklung)
        app.use(express.static(frontendPath, {
            etag: false,
            maxAge: 0,
            setHeaders: (res) => {
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
            }
        }));
        
        // Alle anderen Anfragen an index.html weiterleiten (SPA-Support)
        app.get('*', (req, res, next) => {
            // Nur wenn es keine API-Route ist
            if (!req.path.startsWith('/api')) {
                res.sendFile(path.join(frontendPath, 'index.html'));
            } else {
                next();
            }
        });
        console.log('Frontend wird auf / ausgeliefert');
    }

    // 404-Handler für nicht gefundene Routen (MUSS vor Error-Handler)
    app.use(notFoundHandler);

    // Globaler Error-Handler (MUSS am Ende)
    app.use(errorHandler);
    logStartup('Error-Handler registriert');

    logStartup('Erstelle HTTP Server...');
    const server = http.createServer(app);
    logStartup('HTTP Server erstellt ✓');

    logStartup('Erstelle WebSocket Server...');
    wss = new WebSocketServer({ server });
    logStartup('WebSocket Server erstellt ✓');
    setWebSocketServer(wss);

    wss.on('connection', (ws) => {
        logStartup('WebSocket Client connected');
        if (clientCountCallback) clientCountCallback(wss.clients.size);

        ws.on('close', () => {
            logStartup('WebSocket Client disconnected');
            if (clientCountCallback) clientCountCallback(wss.clients.size);
        });

        ws.on('error', (error) => {
            logStartup(`WebSocket error: ${error.message}`, 'ERROR');
        });
    });

    logStartup(`Starte Server auf Port ${PORT}...`);
    server.listen(PORT, '0.0.0.0', () => {
        logStartup('=== SERVER ERFOLGREICH GESTARTET ===');
        logStartup('Server erfolgreich gestartet');
        console.log(`\n✅ ${APP_NAME} v${VERSION} gestartet!`);
        console.log(`📡 Backend-Server: http://0.0.0.0:${PORT}`);
        console.log(`🔌 API-Endpoint:   http://0.0.0.0:${PORT}/api`);
        if (frontendPath) {
            console.log(`🎨 Frontend:       http://0.0.0.0:${PORT}/`);
        }
        console.log(`🌐 Netzwerk:       http://<IP-ADRESSE>:${PORT}`);
        console.log(`\n👉 Zum Stoppen: CTRL+C\n`);
        logStartup(`Server hört auf http://0.0.0.0:${PORT}`);
    });
    
    server.on('error', (err) => {
        logStartup(`SERVER FEHLER: ${err.message}`, 'ERROR');
        logStartup(err.stack, 'ERROR');
    });

    // =============================================================================
    // GRACEFUL SHUTDOWN
    // =============================================================================
    
    /**
     * Graceful Shutdown Handler
     * Schließt sauber alle Verbindungen bei SIGTERM/SIGINT
     */
    const gracefulShutdown = async (signal) => {
        console.log(`\n\n⚠️  ${signal} empfangen - starte graceful shutdown...`);
        
        // Neue Requests ablehnen
        server.close(async () => {
            console.log('✅ HTTP Server: Keine neuen Requests mehr angenommen');
            
            // WebSocket-Connections schließen
            if (wss) {
                console.log('🔌 WebSocket: Schließe alle Verbindungen...');
                wss.clients.forEach(client => {
                    client.close(1000, 'Server shutdown');
                });
                
                wss.close(() => {
                    console.log('✅ WebSocket Server: Geschlossen');
                });
            }
            
            // Warte kurz damit laufende Requests fertig werden können
            setTimeout(() => {
                console.log('✅ Graceful shutdown abgeschlossen');
                process.exit(0);
            }, 1000);
        });
        
        // Force shutdown nach 10 Sekunden
        setTimeout(() => {
            console.error('❌ Graceful shutdown timeout - force exit');
            process.exit(1);
        }, 10000);
    };
    
    // Shutdown-Handler registrieren
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Uncaught Exception Handler
    process.on('uncaughtException', (error) => {
        console.error('❌ Uncaught Exception:', error);
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    // Unhandled Rejection Handler
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        // Nicht sofort beenden, nur loggen
    });

    // Shutdown-Funktion hinzufügen
    server.shutdown = () => {
        return new Promise((resolve) => {
            console.log('Closing WebSocket connections...');
            if (wss) {
                wss.clients.forEach(client => {
                    client.close();
                });
                wss.close(() => {
                    console.log('WebSocket server closed');
                });
            }

            server.close(() => {
                console.log('HTTP server closed');
                resolve();
            });
        });
    };

    return server;
}

// If the file is executed directly (for non-electron environment)
if (require.main === module) {
    startServer(
        (count) => console.log(`Clients: ${count}`),
        (req) => console.log(`${req.method} ${req.path} - ${req.status} (${req.duration}ms)`)
    );
}

module.exports = { startServer };
