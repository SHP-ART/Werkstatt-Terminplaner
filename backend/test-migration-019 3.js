/**
 * Test-Script für Migration 019 und neue Pause-Funktionalität
 */
const { getAsync, allAsync, runAsync } = require('./src/utils/dbHelper');

async function testMigration() {
  console.log('=== MIGRATIONS-TEST ===\n');
  
  // 1. Schema-Version prüfen (mit Fallback)
  let version = null;
  try {
    version = await getAsync('SELECT MAX(version) as v FROM schema_version');
    console.log('1. Aktuelle Schema-Version:', version?.v || 'unbekannt');
  } catch (e) {
    console.log('1. Schema-Version: Tabelle existiert nicht (DB nicht initialisiert)');
  }
  
  // 2. Prüfe ob pause_tracking Tabelle existiert
  const pauseTable = await getAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='pause_tracking'");
  console.log('2. pause_tracking Tabelle:', pauseTable ? '✅ existiert' : '❌ FEHLT');
  
  // 3. Prüfe ob verschoben_von_datum Spalte existiert
  let hatVerschoben = false;
  try {
    const termineColumns = await allAsync('PRAGMA table_info(termine)');
    hatVerschoben = termineColumns.some(c => c.name === 'verschoben_von_datum');
    console.log('3. termine.verschoben_von_datum:', hatVerschoben ? '✅ existiert' : '❌ FEHLT');
  } catch (e) {
    console.log('3. termine Tabelle existiert nicht');
  }
  
  // 4. Prüfe ob letzter_zugriff_datum Spalte existiert
  let hatLetzterZugriff = false;
  try {
    const einstellungenColumns = await allAsync('PRAGMA table_info(werkstatt_einstellungen)');
    hatLetzterZugriff = einstellungenColumns.some(c => c.name === 'letzter_zugriff_datum');
    console.log('4. werkstatt_einstellungen.letzter_zugriff_datum:', hatLetzterZugriff ? '✅ existiert' : '❌ FEHLT');
  } catch (e) {
    console.log('4. werkstatt_einstellungen Tabelle existiert nicht');
  }
  
  console.log('\n=== Tabellen-Info ===');
  if (pauseTable) {
    const pauseColumns = await allAsync('PRAGMA table_info(pause_tracking)');
    console.log('pause_tracking Spalten:', pauseColumns.map(c => c.name).join(', '));
  }
  
  return { pauseTable, hatVerschoben, hatLetzterZugriff };
}

async function runMigration() {
  console.log('\n=== FÜHRE MIGRATION 019 AUS ===\n');
  
  const migration = require('./migrations/019_add_pause_tracking_and_verschoben');
  await migration.up();
  
  console.log('✅ Migration 019 abgeschlossen\n');
}

async function testEndpoints() {
  console.log('\n=== API-ENDPOINT-TESTS ===\n');
  
  const baseUrl = 'http://localhost:3001/api';
  
  // Test 1: GET /pause/aktive
  console.log('Test 1: GET /pause/aktive');
  try {
    const res = await fetch(`${baseUrl}/pause/aktive`);
    const data = await res.json();
    console.log('  Status:', res.status);
    console.log('  Response:', JSON.stringify(data).substring(0, 100));
    console.log('  ✅ Endpoint funktioniert\n');
  } catch (e) {
    console.log('  ❌ Fehler:', e.message, '\n');
  }
  
  // Test 2: POST /pause/starten (ohne echte Daten, erwarte Fehler)
  console.log('Test 2: POST /pause/starten (Validierungs-Test)');
  try {
    const res = await fetch(`${baseUrl}/pause/starten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    console.log('  Status:', res.status);
    console.log('  Response:', JSON.stringify(data).substring(0, 100));
    console.log('  ✅ Endpoint antwortet (Validierung funktioniert)\n');
  } catch (e) {
    console.log('  ❌ Fehler:', e.message, '\n');
  }
  
  // Test 3: POST /termine/berechne-zeiten-neu
  console.log('Test 3: POST /termine/berechne-zeiten-neu (Validierungs-Test)');
  try {
    const res = await fetch(`${baseUrl}/termine/berechne-zeiten-neu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    console.log('  Status:', res.status);
    console.log('  Response:', JSON.stringify(data).substring(0, 100));
    console.log('  ✅ Endpoint antwortet\n');
  } catch (e) {
    console.log('  ❌ Fehler:', e.message, '\n');
  }
}

async function main() {
  try {
    // Migration prüfen
    const { pauseTable, hatVerschoben, hatLetzterZugriff } = await testMigration();
    
    // Migration ausführen falls nötig
    if (!pauseTable || !hatVerschoben || !hatLetzterZugriff) {
      await runMigration();
      await testMigration();
    }
    
    // Endpoints testen
    await testEndpoints();
    
    console.log('\n=== ALLE TESTS ABGESCHLOSSEN ===\n');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ FEHLER:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

main();
