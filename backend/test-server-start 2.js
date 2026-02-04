#!/usr/bin/env node

console.log('=== TEST: Server Start ===');
console.log('1. Node läuft');

try {
    console.log('2. Lade server.js...');
    const { startServer } = require('./src/server.js');
    console.log('3. server.js geladen');
    
    console.log('4. Rufe startServer() auf...');
    startServer(
        (count) => console.log(`[CLIENT-COUNT] ${count}`),
        (req) => console.log(`[REQUEST] ${req.method} ${req.path} - ${req.status} (${req.duration}ms)`)
    ).then(() => {
        console.log('5. Server gestartet!');
    }).catch(err => {
        console.error('FEHLER beim Starten:', err);
        process.exit(1);
    });
} catch (err) {
    console.error('FEHLER beim Laden:', err);
    process.exit(1);
}
