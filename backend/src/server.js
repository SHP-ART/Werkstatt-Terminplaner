require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initializeDatabase } = require('./config/database');
const routes = require('./routes');
const { WebSocketServer } = require('ws');
const http = require('http');

let wss;

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
    const app = express();
    const PORT = process.env.PORT || 3001;

    const corsOrigin = process.env.CORS_ORIGIN || '*';

    const corsOptions = {
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps, curl, or file://)
            if (!origin) return callback(null, true);

            // If CORS_ORIGIN is *, allow all origins
            if (corsOrigin === '*') {
                return callback(null, true);
            }

            // Otherwise check whitelist
            const whitelist = [
                corsOrigin,
                'http://localhost:3000',
                'http://127.0.0.1:3000',
            ];

            if (whitelist.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.warn(`CORS: Origin '${origin}' was blocked.`);
                callback(new Error('Not allowed by CORS'));
            }
        },
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
        // Statische Dateien aus dem Frontend-Ordner
        app.use(express.static(frontendPath));
        
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

    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({ error: 'Interner Serverfehler' });
    });

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
        console.log(`Backend-Server läuft auf http://0.0.0.0:${PORT}`);
        console.log(`API-Endpoint: http://0.0.0.0:${PORT}/api`);
        if (frontendPath) {
            console.log(`Frontend: http://0.0.0.0:${PORT}/`);
        }
        console.log(`Zugriff im Netzwerk: http://<IP-ADRESSE>:${PORT}`);
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
