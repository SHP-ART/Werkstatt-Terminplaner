#!/usr/bin/env node

const timeout = setTimeout(() => {
    console.error('TIMEOUT: Server.js-Laden dauert zu lange (>10s)');
    console.error('Das Skript hängt wahrscheinlich bei einem require()');
    process.exit(1);
}, 10000);

console.log('=== Lade server.js mit Timeout ===');

try {
    const { startServer } = require('./src/server.js');
    clearTimeout(timeout);
    console.log('✓ server.js erfolgreich geladen');
    console.log('Starte Server...');
    
    startServer(
        (count) => console.log(`Clients: ${count}`),
        (req) => console.log(`${req.method} ${req.path}`)
    ).then(() => {
        console.log('✓ Server gestartet');
    }).catch(err => {
        console.error('Fehler beim Starten:', err);
        process.exit(1);
    });
} catch (err) {
    clearTimeout(timeout);
    console.error('Fehler beim Laden:', err);
    process.exit(1);
}
