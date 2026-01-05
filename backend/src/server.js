require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initializeDatabase } = require('./config/database');
const { VERSION, APP_NAME } = require('./config/version');
const routes = require('./routes');
const { WebSocketServer } = require('ws');
const http = require('http');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

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
        // Entwicklung: Frontend neben Backend
        path.join(__dirname, '..', '..', 'frontend'),
        // Produktion: Frontend im gleichen Ordner wie die EXE
        path.join(process.resourcesPath || '', '..', 'frontend'),
        // Produktion: Frontend in resources
        path.join(process.resourcesPath || '', 'frontend'),
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

function startServer(clientCountCallback, requestLogCallback) {
    // Environment Check durchführen
    checkEnvironment();
    
    const app = express();
    const PORT = process.env.PORT || 3001;

    // CORS-Konfiguration (verbessert)
    const corsOrigin = process.env.CORS_ORIGIN || '*';
    console.log(`🌐 CORS Origin: ${corsOrigin}`);

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
    app.use(bodyParser.json({ limit: '50mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

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

    initializeDatabase();

    app.use('/api', routes);

    // Frontend statisch ausliefern (falls vorhanden)
    const frontendPath = findFrontendPath();
    if (frontendPath) {
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

    const server = http.createServer(app);

    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        console.log('Client connected');
        if (clientCountCallback) clientCountCallback(wss.clients.size);

        ws.on('close', () => {
            console.log('Client disconnected');
            if (clientCountCallback) clientCountCallback(wss.clients.size);
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n✅ ${APP_NAME} v${VERSION} gestartet!`);
        console.log(`📡 Backend-Server: http://0.0.0.0:${PORT}`);
        console.log(`🔌 API-Endpoint:   http://0.0.0.0:${PORT}/api`);
        if (frontendPath) {
            console.log(`🎨 Frontend:       http://0.0.0.0:${PORT}/`);
        }
        console.log(`🌐 Netzwerk:       http://<IP-ADRESSE>:${PORT}`);
        console.log(`\n👉 Zum Stoppen: CTRL+C\n`);
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
