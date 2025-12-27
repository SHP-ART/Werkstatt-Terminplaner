require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { initializeDatabase } = require('./config/database');
const routes = require('./routes');
const { WebSocketServer } = require('ws');
const http = require('http');

let wss;

function startServer(clientCountCallback) {
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
        clientCountCallback(wss.clients.size);

        ws.on('close', () => {
            console.log('Client disconnected');
            clientCountCallback(wss.clients.size);
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    server.listen(PORT, '127.0.0.1', () => {
        console.log(`Backend-Server läuft auf http://0.0.0.0:${PORT}`);
        console.log(`API-Endpoint: http://0.0.0.0:${PORT}/api`);
        console.log(`Zugriff im Netzwerk: http://<IP-ADRESSE>:${PORT}`);
    });

    return server;
}

// If the file is executed directly (for non-electron environment)
if (require.main === module) {
    startServer((count) => console.log(`Clients: ${count}`));
}

module.exports = { startServer };
