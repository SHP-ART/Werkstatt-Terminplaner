#!/usr/bin/env node
/**
 * Test-Script für Migration 019 und neue Features
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');

const dbPath = path.join(__dirname, '../database/werkstatt.db');

// Hilfsfunktion für API-Aufrufe
function apiRequest(method, endpoint, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: `/api${endpoint}`,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function testDatabase() {
  console.log('\n=== 1. DATENBANK-SCHEMA PRÜFEN ===\n');
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath);
    
    let results = { pauseTracking: false, verschobenVonDatum: false, schemaVersion: null };
    let completed = 0;
    const total = 3;
    
    function checkComplete() {
      completed++;
      if (completed >= total) {
        db.close();
        resolve(results);
      }
    }
    
    // 1. Prüfe pause_tracking Tabelle
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='pause_tracking'", (err, row) => {
      if (row) {
        console.log('✅ pause_tracking Tabelle existiert');
        results.pauseTracking = true;
        db.all('PRAGMA table_info(pause_tracking)', (err, cols) => {
          if (cols) {
            console.log('   Spalten:', cols.map(c => c.name).join(', '));
          }
          checkComplete();
        });
      } else {
        console.log('❌ pause_tracking Tabelle fehlt - Migration 019 muss ausgeführt werden');
        checkComplete();
      }
    });
    
    // 2. Prüfe verschoben_von_datum in termine
    db.all('PRAGMA table_info(termine)', (err, cols) => {
      if (cols) {
        const hasVerschoben = cols.some(c => c.name === 'verschoben_von_datum');
        if (hasVerschoben) {
          console.log('✅ termine.verschoben_von_datum existiert');
          results.verschobenVonDatum = true;
        } else {
          console.log('❌ termine.verschoben_von_datum fehlt');
        }
      }
      checkComplete();
    });
    
    // 3. Prüfe schema_version
    db.get('SELECT MAX(version) as v FROM schema_version', (err, row) => {
      if (err) {
        console.log('⚠️  schema_version Tabelle fehlt (neue DB?)');
      } else {
        results.schemaVersion = row?.v;
        console.log('📊 Aktuelle Schema-Version:', row?.v || 'unbekannt');
      }
      checkComplete();
    });
  });
}

async function testEndpoints() {
  console.log('\n=== 2. API-ENDPOINTS TESTEN ===\n');
  
  // Test 1: GET /api/pause/aktive
  try {
    const result = await apiRequest('GET', '/pause/aktive');
    if (result.status === 200) {
      console.log('✅ GET /api/pause/aktive - Status:', result.status);
      console.log('   Aktive Pausen:', Array.isArray(result.data) ? result.data.length : 'N/A');
    } else {
      console.log('❌ GET /api/pause/aktive - Status:', result.status);
      console.log('   Response:', JSON.stringify(result.data).substring(0, 100));
    }
  } catch (e) {
    console.log('❌ GET /api/pause/aktive - Fehler:', e.message);
  }
  
  // Test 2: POST /api/pause/starten (ohne gültige Daten - sollte 400 zurückgeben)
  try {
    const result = await apiRequest('POST', '/pause/starten', {});
    if (result.status === 400) {
      console.log('✅ POST /api/pause/starten - Validierung funktioniert (400 bei fehlenden Daten)');
    } else {
      console.log('⚠️  POST /api/pause/starten - Unerwarteter Status:', result.status);
    }
  } catch (e) {
    console.log('❌ POST /api/pause/starten - Fehler:', e.message);
  }
  
  // Test 3: POST /api/termine/berechne-zeiten-neu (ohne Daten)
  try {
    const result = await apiRequest('POST', '/termine/berechne-zeiten-neu', {});
    if (result.status === 400) {
      console.log('✅ POST /api/termine/berechne-zeiten-neu - Validierung funktioniert');
    } else {
      console.log('⚠️  POST /api/termine/berechne-zeiten-neu - Status:', result.status);
    }
  } catch (e) {
    console.log('❌ POST /api/termine/berechne-zeiten-neu - Fehler:', e.message);
  }
  
  // Test 4: Health-Check
  try {
    const result = await apiRequest('GET', '/health');
    if (result.status === 200) {
      console.log('✅ GET /api/health - Server läuft');
    }
  } catch (e) {
    console.log('❌ Server nicht erreichbar:', e.message);
  }
}

async function runMigration() {
  console.log('\n=== 3. MIGRATION 019 MANUELL AUSFÜHREN ===\n');
  
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath);
    
    // Führe SQL direkt aus
    db.serialize(() => {
      // 1. Prüfe und erstelle verschoben_von_datum
      db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='termine'", (err, row) => {
        if (row && row.sql && !row.sql.includes('verschoben_von_datum')) {
          db.run("ALTER TABLE termine ADD COLUMN verschoben_von_datum TEXT NULL", (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.log('❌ Fehler bei verschoben_von_datum:', err.message);
            } else {
              console.log('✅ Spalte termine.verschoben_von_datum hinzugefügt');
            }
          });
        } else {
          console.log('ℹ️  Spalte verschoben_von_datum existiert bereits oder Tabelle fehlt');
        }
      });
      
      // 2. Prüfe und erstelle letzter_zugriff_datum
      db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='werkstatt_einstellungen'", (err, row) => {
        if (row && row.sql && !row.sql.includes('letzter_zugriff_datum')) {
          db.run("ALTER TABLE werkstatt_einstellungen ADD COLUMN letzter_zugriff_datum DATE NULL", (err) => {
            if (err && !err.message.includes('duplicate column')) {
              console.log('❌ Fehler bei letzter_zugriff_datum:', err.message);
            } else {
              console.log('✅ Spalte werkstatt_einstellungen.letzter_zugriff_datum hinzugefügt');
            }
          });
        } else {
          console.log('ℹ️  Spalte letzter_zugriff_datum existiert bereits oder Tabelle fehlt');
        }
      });
      
      db.close(() => {
        resolve(true);
      });
    });
  });
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  TEST: Migration 019 & Neue Features   ║');
  console.log('╚════════════════════════════════════════╝');
  
  // 1. Datenbank prüfen
  const dbResults = await testDatabase();
  
  // 2. Falls Tabellen fehlen, Migration ausführen
  if (!dbResults.pauseTracking || !dbResults.verschobenVonDatum) {
    console.log('\n⚠️  Fehlende Schema-Elemente gefunden - führe Migration aus...');
    await runMigration();
    
    // Erneut prüfen
    console.log('\n--- Erneute Prüfung nach Migration ---');
    await testDatabase();
  }
  
  // 3. API-Endpoints testen
  await testEndpoints();
  
  console.log('\n=== TEST ABGESCHLOSSEN ===\n');
}

main().catch(console.error);
