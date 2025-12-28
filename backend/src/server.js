require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { initializeDatabase } = require('./config/database');
const routes = require('./routes');
const { WebSocketServer } = require('ws');
const http = require('http');

let wss;

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
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

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
