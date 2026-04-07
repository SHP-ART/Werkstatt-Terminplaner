require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
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

logStartup('Lade localAiService...');
const localAiService = require('./services/localAiService');
logStartup('localAiService geladen ✓');

logStartup('Lade backendDiscoveryService...');
const backendDiscoveryService = require('./services/backendDiscoveryService');
logStartup('backendDiscoveryService geladen ✓');

logStartup('Lade kiDiscoveryService...');
const kiDiscoveryService = require('./services/kiDiscoveryService');
kiDiscoveryService.start();
logStartup('kiDiscoveryService gestartet ✓');

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

    // Security Headers
    app.use(helmet({
      contentSecurityPolicy: false, // CSP deaktiviert wegen Inline-Scripts im Frontend
      crossOriginEmbedderPolicy: false // Fuer lokale Netzwerk-Nutzung
    }));
    logStartup('Helmet Security-Headers aktiviert');

    // CORS-Konfiguration (verbessert)
    const corsOrigin = process.env.CORS_ORIGIN || '';
    logStartup(`CORS Origin: ${corsOrigin || '(nur localhost + LAN)'}`);

    const corsOptions = {
        origin: function (origin, callback) {
            // Requests ohne Origin erlauben (curl, Electron, mobile Apps)
            if (!origin) return callback(null, true);

            // Whitelist erstellen
            const whitelist = ['http://localhost:3000', 'http://127.0.0.1:3000'];

            if (corsOrigin) {
                corsOrigin.split(',').map(o => o.trim()).forEach(o => whitelist.push(o));
            }

            // Lokale Netzwerk-IPs erlauben (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }

            if (whitelist.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.warn(`CORS: Origin '${origin}' blockiert`);
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
    
    app.use(bodyParser.json({ limit: '1mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
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

    // Tablet-Update-System initialisieren
    logStartup('Initialisiere Tablet-Update-System...');
    try {
        const TabletUpdateModel = require('./models/tabletUpdateModel');
        await TabletUpdateModel.initialize();
        logStartup('Tablet-Update-System initialisiert ✓');
    } catch (err) {
        logStartup(`WARNUNG: Tablet-Update-System Fehler: ${err.message}`, 'WARN');
    }

    // Automatisches Backup beim Start erstellen
    logStartup('Erstelle automatisches Backup beim Start...');
    try {
        const BackupController = require('./controllers/backupController');
        const autoBackupResult = await BackupController.createAutoBackupOnStartup();
        
        if (autoBackupResult.created) {
            logStartup(`Auto-Backup erstellt: ${autoBackupResult.backup.name}`);
            
            if (autoBackupResult.warnung) {
                logStartup('⚠️  DATENBANK-WARNUNG:', 'WARN');
                logStartup(autoBackupResult.warnung, 'WARN');
                console.warn('\n' + '='.repeat(80));
                console.warn(autoBackupResult.warnung);
                console.warn('='.repeat(80) + '\n');
            }
        } else if (autoBackupResult.skipped) {
            logStartup(`Auto-Backup übersprungen: ${autoBackupResult.reason}`);
        }
    } catch (backupError) {
        logStartup(`WARNUNG: Auto-Backup fehlgeschlagen: ${backupError.message}`, 'WARN');
        // Kein throw - Server soll trotzdem starten
    }

    // Automatische Endzeiten-Migration (einmalig nach Update)
    logStartup('Prüfe Endzeiten-Migration...');
    try {
        const { migrateEndzeitenIfNeeded } = require('./utils/endzeit-migration');
        const migrationResult = await migrateEndzeitenIfNeeded();
        if (migrationResult.migrated) {
            logStartup(`Endzeiten-Migration abgeschlossen: ${migrationResult.migrated} Termine aktualisiert`);
        } else if (migrationResult.skipped) {
            logStartup('Endzeiten-Migration übersprungen (bereits durchgeführt)');
        }
    } catch (migrationError) {
        logStartup(`WARNUNG: Endzeiten-Migration fehlgeschlagen: ${migrationError.message}`, 'WARN');
        // Server trotzdem starten
    }

    // Health-Check-Endpoint SOFORT verfügbar (vor anderen Routes)
    const { dbWrapper } = require('./config/database');
    app.get('/api/health', (req, res) => {
        if (dbWrapper && dbWrapper.ready) {
            res.status(200).json({ 
                status: 'ok', 
                database: 'connected',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({ 
                status: 'unavailable', 
                database: 'initializing',
                message: 'Datenbank wird initialisiert, bitte warten...',
                timestamp: new Date().toISOString()
            });
        }
    });
    logStartup('Health-Check-Endpoint registriert ✓');

    // JETZT erst Routes laden - nachdem DB bereit ist
    logStartup('Lade routes (nach DB-Init)...');
    const routes = require('./routes');
    logStartup('routes geladen ✓');

    // Status-Route für headless Server
    logStartup('Lade Status-Route...');
    const { router: statusRouter, requestLogger } = require('./routes/status');
    logStartup('Status-Route geladen ✓');

    // Request-Logger aktivieren (vor allen Routes)
    app.use(requestLogger);

    // Lokales KI-Training (täglich)
    localAiService.scheduleDailyTraining();

    // A6d: Wiederkehrende Termine – täglich prüfen
    const WiederkehrendeTermineController = require('./controllers/wiederkehrendeTermineController');
    WiederkehrendeTermineController.runScheduler().catch(err => {
        logStartup(`WARNUNG: Wiederkehrende-Termine-Scheduler-Start fehlgeschlagen: ${err.message}`, 'WARN');
    });
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const schedulerInterval = setInterval(() => {
        WiederkehrendeTermineController.runScheduler().catch(err => {
            console.warn('[WiederkehrendeTermine] Scheduler-Fehler:', err.message);
        });
    }, MS_PER_DAY);
    logStartup('Wiederkehrende-Termine-Scheduler gestartet ✓');

    // Pause-Cleanup beim Start und alle 5 Minuten
    logStartup('Starte Pause-Cleanup-Job...');
    const PauseController = require('./controllers/pauseController');
    // WICHTIG: Cleanup als async ausführen, damit es den Server-Start nicht blockiert
    PauseController.cleanupAbgelaufenePausen().catch(err => {
        logStartup(`WARNUNG: Initiales Pause-Cleanup fehlgeschlagen: ${err.message}`, 'WARN');
    });
    const pauseCleanupInterval = setInterval(() => {
        PauseController.cleanupAbgelaufenePausen().catch(err => {
            console.warn('Pause-Cleanup Fehler:', err.message);
        });
    }, 5 * 60 * 1000); // Alle 5 Minuten
    logStartup('Pause-Cleanup-Job gestartet ✓');

    // Status-Route registrieren (vor API-Routen für /status und /api/server-status etc.)
    logStartup('Registriere Status-Route...');
    app.use('/', statusRouter);
    logStartup('Status-Route registriert ✓');

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
            lastModified: false,
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
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
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
        ws.isAlive = true;
        if (clientCountCallback) clientCountCallback(wss.clients.size);

        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('close', () => {
            logStartup('WebSocket Client disconnected');
            if (clientCountCallback) clientCountCallback(wss.clients.size);
        });

        ws.on('error', (error) => {
            logStartup(`WebSocket error: ${error.message}`, 'ERROR');
        });
    });

    // Heartbeat: Tote Verbindungen alle 30s aufraemen
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach(ws => {
            if (!ws.isAlive) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => clearInterval(heartbeatInterval));

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
        backendDiscoveryService.start(PORT);
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

        // Intervals stoppen
        clearInterval(schedulerInterval);
        clearInterval(pauseCleanupInterval);
        clearInterval(heartbeatInterval);

        // Neue Requests ablehnen
        server.close(async () => {
            console.log('✅ HTTP Server: Keine neuen Requests mehr angenommen');
            backendDiscoveryService.stop();
            
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
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Uncaught Exception Handler
    process.once('uncaughtException', (error) => {
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
