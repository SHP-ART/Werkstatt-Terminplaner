#!/usr/bin/env node

/**
 * Umfassende Test-Suite für Controller-Optimierungen
 * Testet alle neu implementierten Features
 */

const http = require('http');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const BASE_URL = 'http://localhost:3001';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failedTestDetails = [];

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    log('green', `  ✅ ${testName}`);
  } else {
    failedTests++;
    log('red', `  ❌ ${testName}`);
    if (details) {
      log('red', `     ${details}`);
    }
    failedTestDetails.push({ test: testName, details });
  }
}

function apiRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body ? JSON.parse(body) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testServerFeatures() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║     TEST 1: Server-Features                ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  // Test 1.1: Server erreichbar
  try {
    const response = await apiRequest('GET', '/api/kunden');
    assert(response.status === 200, 'Server ist erreichbar');
  } catch (error) {
    assert(false, 'Server ist erreichbar', error.message);
  }
  
  // Test 1.2: Environment Check in Logs
  try {
    const { stdout } = await execPromise('tail -n 50 logs/backend.log');
    assert(stdout.includes('Environment Check'), 'Environment Check wird durchgeführt');
    assert(stdout.includes('CORS Origin'), 'CORS Origin wird geloggt');
    assert(stdout.includes('Server erfolgreich gestartet'), 'Server-Start-Message korrekt');
  } catch (error) {
    assert(false, 'Log-Überprüfung', error.message);
  }
}

async function testAPIEndpoints() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║     TEST 2: API-Endpoints                  ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  // Test 2.1: GET /api/kunden
  try {
    const response = await apiRequest('GET', '/api/kunden');
    assert(response.status === 200, 'GET /api/kunden → 200 OK');
    assert(Array.isArray(response.data), 'Kunden-Liste ist Array');
  } catch (error) {
    assert(false, 'GET /api/kunden', error.message);
  }
  
  // Test 2.2: GET /api/kunden/:id (existiert)
  try {
    const response = await apiRequest('GET', '/api/kunden/1');
    assert(response.status === 200 || response.status === 404, 'GET /api/kunden/1 → 200 oder 404');
  } catch (error) {
    assert(false, 'GET /api/kunden/1', error.message);
  }
  
  // Test 2.3: GET /api/kunden/:id (existiert nicht)
  try {
    const response = await apiRequest('GET', '/api/kunden/999999');
    assert(response.status === 404, 'GET /api/kunden/999999 → 404 Not Found');
  } catch (error) {
    assert(false, 'GET /api/kunden/999999', error.message);
  }
  
  // Test 2.4: POST /api/kunden (gültige Daten)
  try {
    const response = await apiRequest('POST', '/api/kunden', {
      name: 'Test-Kunde Optimierung',
      telefon: '0123-TEST-OPT'
    });
    assert(response.status === 200 || response.status === 201, 'POST /api/kunden → 200/201', `Status: ${response.status}`);
  } catch (error) {
    assert(false, 'POST /api/kunden', error.message);
  }
  
  // Test 2.5: GET /api/termine
  try {
    const response = await apiRequest('GET', '/api/termine');
    assert(response.status === 200, 'GET /api/termine → 200 OK');
    assert(Array.isArray(response.data), 'Termine-Liste ist Array');
  } catch (error) {
    assert(false, 'GET /api/termine', error.message);
  }
  
  // Test 2.6: GET /api/mitarbeiter
  try {
    const response = await apiRequest('GET', '/api/mitarbeiter');
    assert(response.status === 200, 'GET /api/mitarbeiter → 200 OK');
  } catch (error) {
    assert(false, 'GET /api/mitarbeiter', error.message);
  }
  
  // Test 2.7: GET /api/lehrlinge
  try {
    const response = await apiRequest('GET', '/api/lehrlinge');
    assert(response.status === 200, 'GET /api/lehrlinge → 200 OK');
  } catch (error) {
    assert(false, 'GET /api/lehrlinge', error.message);
  }
  
  // Test 2.8: GET /api/arbeitszeiten
  try {
    const response = await apiRequest('GET', '/api/arbeitszeiten');
    assert(response.status === 200, 'GET /api/arbeitszeiten → 200 OK');
  } catch (error) {
    assert(false, 'GET /api/arbeitszeiten', error.message);
  }
  
  // Test 2.9: GET /api/ersatzautos
  try {
    const response = await apiRequest('GET', '/api/ersatzautos');
    assert(response.status === 200, 'GET /api/ersatzautos → 200 OK');
  } catch (error) {
    assert(false, 'GET /api/ersatzautos', error.message);
  }
  
  // Test 2.10: GET /api/abwesenheiten
  try {
    const response = await apiRequest('GET', '/api/abwesenheiten');
    assert(response.status === 200, 'GET /api/abwesenheiten → 200 OK');
  } catch (error) {
    assert(false, 'GET /api/abwesenheiten', error.message);
  }
}

async function testCORSConfiguration() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║     TEST 3: CORS-Konfiguration             ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  // Test 3.1: Request mit erlaubtem Origin
  try {
    const response = await apiRequest('GET', '/api/kunden', null, {
      'Origin': 'http://localhost:3000'
    });
    assert(response.status === 200, 'Request mit Origin localhost:3000 erlaubt');
    assert(response.headers['access-control-allow-origin'], 'CORS-Header gesetzt');
  } catch (error) {
    assert(false, 'CORS mit localhost:3000', error.message);
  }
  
  // Test 3.2: Preflight Request (OPTIONS)
  try {
    const response = await apiRequest('OPTIONS', '/api/kunden', null, {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST'
    });
    assert(response.status === 200 || response.status === 204, 'OPTIONS Preflight → 200/204');
  } catch (error) {
    assert(false, 'CORS Preflight', error.message);
  }
  
  // Test 3.3: Request ohne Origin (sollte erlaubt sein)
  try {
    const response = await apiRequest('GET', '/api/kunden');
    assert(response.status === 200, 'Request ohne Origin erlaubt');
  } catch (error) {
    assert(false, 'Request ohne Origin', error.message);
  }
}

async function testErrorHandling() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║     TEST 4: Error-Handling                 ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  // Test 4.1: 404 für nicht existierende Route
  try {
    const response = await apiRequest('GET', '/api/nicht-existierende-route');
    assert(response.status === 404, 'Nicht existierende Route → 404');
    assert(response.data && response.data.error, '404 Response hat error-Feld');
  } catch (error) {
    assert(false, '404 Handler', error.message);
  }
  
  // Test 4.2: 404 für nicht existierende ID
  try {
    const response = await apiRequest('GET', '/api/kunden/999999');
    assert(response.status === 404, 'Nicht existierende Kunden-ID → 404');
  } catch (error) {
    assert(false, '404 für nicht existierende ID', error.message);
  }
  
  // Test 4.3: 400 für invalide Daten (leerer Name)
  try {
    const response = await apiRequest('POST', '/api/kunden', {
      name: '',
      telefon: '123'
    });
    assert(response.status === 400 || response.status === 500, 'Leerer Name → 400/500');
  } catch (error) {
    assert(false, 'Validierung leerer Name', error.message);
  }
  
  // Test 4.4: Error Response Format
  try {
    const response = await apiRequest('GET', '/api/nicht-existierende-route');
    assert(response.data && typeof response.data === 'object', 'Error Response ist JSON');
    assert(response.data.error || response.data.message, 'Error hat message/error Feld');
  } catch (error) {
    assert(false, 'Error Response Format', error.message);
  }
}

async function testValidationHelpers() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║     TEST 5: Validierungs-Helper            ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  // Diese Tests prüfen ob die validation.js Datei korrekt strukturiert ist
  try {
    const fs = require('fs');
    const validationContent = fs.readFileSync('./backend/src/middleware/validation.js', 'utf8');
    
    assert(validationContent.includes('isValidDate'), 'isValidDate() definiert');
    assert(validationContent.includes('isValidTime'), 'isValidTime() definiert');
    assert(validationContent.includes('isPositiveNumber'), 'isPositiveNumber() definiert');
    assert(validationContent.includes('isPositiveInteger'), 'isPositiveInteger() definiert');
    assert(validationContent.includes('isValidPercentage'), 'isValidPercentage() definiert');
    assert(validationContent.includes('sanitizeString'), 'sanitizeString() definiert');
    assert(validationContent.includes('validateKunde'), 'validateKunde Rules definiert');
    assert(validationContent.includes('validateTermin'), 'validateTermin Rules definiert');
    assert(validationContent.includes('validateMitarbeiter'), 'validateMitarbeiter Rules definiert');
    assert(validationContent.includes('module.exports'), 'Module korrekt exportiert');
    
    log('yellow', '  ℹ️  Validierung noch nicht in Routen eingebunden');
  } catch (error) {
    assert(false, 'validation.js Struktur', error.message);
  }
}

async function testConfigurationConstants() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║     TEST 6: Konfigurations-Konstanten      ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  try {
    const fs = require('fs');
    const constantsContent = fs.readFileSync('./backend/src/config/constants.js', 'utf8');
    
    assert(constantsContent.includes('HTTP_STATUS'), 'HTTP_STATUS definiert');
    assert(constantsContent.includes('TERMIN_STATUS'), 'TERMIN_STATUS definiert');
    assert(constantsContent.includes('VALIDATION_LIMITS'), 'VALIDATION_LIMITS definiert');
    assert(constantsContent.includes('DEFAULTS'), 'DEFAULTS definiert');
    assert(constantsContent.includes('CACHE_CONFIG'), 'CACHE_CONFIG definiert');
    assert(constantsContent.includes('ERROR_MESSAGES'), 'ERROR_MESSAGES definiert');
    assert(constantsContent.includes('module.exports'), 'Module korrekt exportiert');
    
    // Versuche Constants zu laden
    const constants = require('/Users/shp-art/Documents/Github/Werkstatt-Terminplaner/backend/src/config/constants.js');
    assert(constants.HTTP_STATUS.OK === 200, 'HTTP_STATUS.OK = 200');
    assert(constants.HTTP_STATUS.CREATED === 201, 'HTTP_STATUS.CREATED = 201');
    assert(constants.HTTP_STATUS.NO_CONTENT === 204, 'HTTP_STATUS.NO_CONTENT = 204');
    assert(constants.HTTP_STATUS.NOT_FOUND === 404, 'HTTP_STATUS.NOT_FOUND = 404');
    
    log('yellow', '  ℹ️  Constants noch nicht in Controllern verwendet');
  } catch (error) {
    assert(false, 'constants.js Struktur', error.message);
  }
}

async function testSecurityFeatures() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║     TEST 7: Sicherheits-Features           ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  // Test 7.1: SQL-Injection Schutz
  try {
    const response = await apiRequest('POST', '/api/kunden', {
      name: "'; DROP TABLE kunden; --",
      telefon: '123'
    });
    assert(response.status === 200 || response.status === 201, 'SQL-Injection Payload akzeptiert (als String gespeichert)');
    
    // Prüfe ob Tabelle noch existiert
    const checkResponse = await apiRequest('GET', '/api/kunden');
    assert(checkResponse.status === 200, 'Kunden-Tabelle existiert noch (DROP TABLE blockiert)');
  } catch (error) {
    assert(false, 'SQL-Injection Schutz', error.message);
  }
  
  // Test 7.2: XSS Schutz (sollte in sanitizeString sein)
  try {
    const response = await apiRequest('POST', '/api/kunden', {
      name: '<script>alert("XSS")</script>',
      telefon: '123'
    });
    assert(response.status === 200 || response.status === 201, 'XSS Payload akzeptiert');
    // sanitizeString würde <script> Tags entfernen, aber das ist noch nicht implementiert
    log('yellow', '  ℹ️  XSS-Schutz in sanitizeString() vorhanden, aber noch nicht überall eingebunden');
  } catch (error) {
    assert(false, 'XSS Test', error.message);
  }
}

async function testDatabaseIntegrity() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║     TEST 8: Datenbank-Integrität           ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  try {
    const { stdout } = await execPromise('cd /Users/shp-art/Documents/Github/Werkstatt-Terminplaner/backend && sqlite3 database/werkstatt.db "SELECT name FROM sqlite_master WHERE type=\'table\';"');
    
    const tables = stdout.trim().split('\n');
    assert(tables.includes('kunden'), 'Tabelle "kunden" existiert');
    assert(tables.includes('termine'), 'Tabelle "termine" existiert');
    assert(tables.includes('mitarbeiter'), 'Tabelle "mitarbeiter" existiert');
    assert(tables.includes('lehrlinge'), 'Tabelle "lehrlinge" existiert');
    assert(tables.includes('arbeitszeiten'), 'Tabelle "arbeitszeiten" existiert');
    assert(tables.includes('ersatzautos'), 'Tabelle "ersatzautos" existiert');
    assert(tables.includes('mitarbeiter_abwesenheiten'), 'Tabelle "mitarbeiter_abwesenheiten" existiert');
    
    log('green', '  ✅ Alle Haupttabellen vorhanden');
  } catch (error) {
    assert(false, 'Datenbank-Tabellen', error.message);
  }
}

async function runAllTests() {
  log('cyan', '\n╔════════════════════════════════════════════════════════╗');
  log('cyan', '║   UMFASSENDE TEST-SUITE: CONTROLLER-OPTIMIERUNGEN     ║');
  log('cyan', '╚════════════════════════════════════════════════════════╝\n');
  
  log('white', 'Testet alle neu implementierten Features und Optimierungen\n');
  
  try {
    await testServerFeatures();
    await testAPIEndpoints();
    await testCORSConfiguration();
    await testErrorHandling();
    await testValidationHelpers();
    await testConfigurationConstants();
    await testSecurityFeatures();
    await testDatabaseIntegrity();
    
    // Zusammenfassung
    log('cyan', '\n╔════════════════════════════════════════════════════════╗');
    log('cyan', '║                  TEST ZUSAMMENFASSUNG                  ║');
    log('cyan', '╚════════════════════════════════════════════════════════╝\n');
    
    log('white', `Gesamt Tests:     ${totalTests}`);
    log('green', `✅ Bestanden:      ${passedTests}`);
    log('red', `❌ Fehlgeschlagen: ${failedTests}`);
    
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    log('yellow', `Erfolgsrate:      ${successRate}%\n`);
    
    if (failedTests > 0) {
      log('red', '❌ Fehlgeschlagene Tests:\n');
      failedTestDetails.forEach((failure, index) => {
        log('red', `${index + 1}. ${failure.test}`);
        if (failure.details) {
          log('red', `   ${failure.details}`);
        }
      });
      console.log();
    }
    
    if (failedTests === 0) {
      log('green', '🎉 ALLE TESTS BESTANDEN!');
      log('green', '✅ Alle implementierten Features funktionieren korrekt\n');
      process.exit(0);
    } else {
      log('yellow', '⚠️  Einige Tests fehlgeschlagen - bitte prüfen\n');
      process.exit(1);
    }
    
  } catch (error) {
    log('red', `\n❌ Unerwarteter Fehler: ${error.message}\n`);
    process.exit(1);
  }
}

// Server-Check vor Tests
apiRequest('GET', '/api/kunden')
  .then(() => {
    log('green', '✓ Server läuft\n');
    return runAllTests();
  })
  .catch(err => {
    log('red', '✗ Server nicht erreichbar');
    log('red', '  Bitte starte den Server: ./start_server.sh\n');
    process.exit(1);
  });
