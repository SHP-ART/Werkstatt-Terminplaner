/**
 * Test-Skript für Tablet-Update-System
 * 
 * Testet alle API-Endpunkte und Funktionen
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';

// Hilfsfunktion für HTTP-Requests
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const urlObj = new URL(url);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    
    const req = http.request(reqOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: json, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Tests
async function runTests() {
  console.log('🧪 Starte Tablet-Update-System Tests...\n');
  
  let passedTests = 0;
  let failedTests = 0;
  
  // Test 1: Health-Check
  try {
    console.log('📋 Test 1: Server Health-Check');
    const result = await request('/api/health');
    if (result.status === 200 && result.data.status === 'OK') {
      console.log('✅ PASSED - Server läuft\n');
      passedTests++;
    } else {
      console.log('❌ FAILED - Server antwortet nicht korrekt\n');
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED - Fehler:', error.message, '\n');
    failedTests++;
  }
  
  // Test 2: Update-Check ohne Version
  try {
    console.log('📋 Test 2: Update-Check ohne Version (sollte Fehler sein)');
    const result = await request('/api/tablet-update/check');
    if (result.status === 400) {
      console.log('✅ PASSED - Fehler-Validierung funktioniert\n');
      passedTests++;
    } else {
      console.log('❌ FAILED - Sollte 400 zurückgeben\n');
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED - Fehler:', error.message, '\n');
    failedTests++;
  }
  
  // Test 3: Update-Check mit Version
  try {
    console.log('📋 Test 3: Update-Check mit Version');
    const result = await request('/api/tablet-update/check?version=1.0.0');
    if (result.status === 200) {
      console.log('✅ PASSED - Update-Check funktioniert');
      console.log('   Response:', JSON.stringify(result.data, null, 2), '\n');
      passedTests++;
    } else {
      console.log('❌ FAILED - Status:', result.status, '\n');
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED - Fehler:', error.message, '\n');
    failedTests++;
  }
  
  // Test 4: Status-Meldung
  try {
    console.log('📋 Test 4: Tablet Status-Meldung');
    const result = await request('/api/tablet-update/report-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        version: '1.5.9',
        hostname: 'TEST-TABLET',
        ip: '192.168.1.100'
      }
    });
    if (result.status === 200) {
      console.log('✅ PASSED - Status-Meldung funktioniert\n');
      passedTests++;
    } else {
      console.log('❌ FAILED - Status:', result.status, '\n');
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED - Fehler:', error.message, '\n');
    failedTests++;
  }
  
  // Test 5: Status abrufen
  try {
    console.log('📋 Test 5: Tablet-Status abrufen');
    const result = await request('/api/tablet-update/status');
    if (result.status === 200 && Array.isArray(result.data)) {
      console.log('✅ PASSED - Status-Abfrage funktioniert');
      console.log('   Tablets:', result.data.length);
      if (result.data.length > 0) {
        console.log('   Erstes Tablet:', JSON.stringify(result.data[0], null, 2));
      }
      console.log('');
      passedTests++;
    } else {
      console.log('❌ FAILED - Status:', result.status, '\n');
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED - Fehler:', error.message, '\n');
    failedTests++;
  }
  
  // Test 6: Download ohne Update
  try {
    console.log('📋 Test 6: Download ohne registriertes Update');
    const result = await request('/api/tablet-update/download');
    if (result.status === 404) {
      console.log('✅ PASSED - Korrekter Fehler bei fehlendem Update\n');
      passedTests++;
    } else {
      console.log('❌ FAILED - Status:', result.status, '\n');
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED - Fehler:', error.message, '\n');
    failedTests++;
  }
  
  // Zusammenfassung
  console.log('═══════════════════════════════════════');
  console.log(`📊 Test-Zusammenfassung:`);
  console.log(`   ✅ Erfolgreich: ${passedTests}`);
  console.log(`   ❌ Fehlgeschlagen: ${failedTests}`);
  console.log(`   📈 Erfolgsquote: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%`);
  console.log('═══════════════════════════════════════\n');
  
  if (failedTests === 0) {
    console.log('🎉 Alle Tests bestanden! Das System ist einsatzbereit.\n');
  } else {
    console.log('⚠️ Einige Tests sind fehlgeschlagen. Bitte Logs prüfen.\n');
  }
  
  // Hinweise
  console.log('💡 Hinweise:');
  console.log('   • Update registrieren: POST /api/tablet-update/register');
  console.log('   • Stellen Sie sicher, dass der Server läuft auf Port 3001');
  console.log('   • Die Datenbank-Tabellen werden automatisch erstellt\n');
}

// Tests ausführen
console.log('╔═══════════════════════════════════════╗');
console.log('║  Tablet-Update-System Test Suite     ║');
console.log('╚═══════════════════════════════════════╝\n');

runTests().catch(error => {
  console.error('❌ Kritischer Fehler:', error);
  process.exit(1);
});
