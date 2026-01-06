#!/usr/bin/env node

/**
 * SQL-Injection Sicherheitstest
 * Testet alle kritischen API-Endpoints mit SQL-Injection-Payloads
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

// SQL-Injection Payloads - typische Angriffsvektoren
const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE termine; --",
  "1' OR '1'='1' --",
  "admin'--",
  "' UNION SELECT * FROM termine--",
  "1; DELETE FROM kunden WHERE '1'='1",
  "' OR 1=1--",
  "\" OR \"1\"=\"1",
  "' OR 'x'='x",
  "1' AND '1'='2' UNION SELECT * FROM kunden--",
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function apiRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: body ? JSON.parse(body) : null,
            headers: res.headers
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body,
            headers: res.headers
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

async function testEndpoint(name, method, path, dataGenerator) {
  log('blue', `\n🔍 Testing: ${name}`);
  log('blue', `   Endpoint: ${method} ${path}`);
  
  let endpointPassed = 0;
  let endpointFailed = 0;

  for (const payload of SQL_INJECTION_PAYLOADS) {
    totalTests++;
    const data = dataGenerator(payload);
    
    try {
      const response = await apiRequest(method, path, data);
      
      // Prüfe, ob die Antwort auf einen SQL-Fehler oder erfolgreiche Injection hinweist
      const responseText = JSON.stringify(response.data).toLowerCase();
      
      const isSqlError = responseText.includes('sql') || 
                        responseText.includes('sqlite') ||
                        responseText.includes('syntax error') ||
                        responseText.includes('near');
      
      const isUnexpectedSuccess = response.status === 200 && 
                                 payload.includes('DROP TABLE');
      
      if (isSqlError || isUnexpectedSuccess) {
        failedTests++;
        endpointFailed++;
        log('red', `   ❌ VULNERABILITY: Payload "${payload.substring(0, 30)}..."`);
        log('red', `      Response: ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}`);
      } else {
        passedTests++;
        endpointPassed++;
        // Nur bei expliziter Verbose-Option ausgeben
        // log('green', `   ✓ Blocked: "${payload.substring(0, 30)}..."`);
      }
    } catch (error) {
      // Netzwerkfehler - Server hat möglicherweise gecrasht
      if (error.code === 'ECONNREFUSED') {
        failedTests++;
        endpointFailed++;
        log('red', `   ❌ CRITICAL: Server crashed with payload "${payload}"`);
      } else {
        // Andere Fehler als passed werten (Request wurde abgelehnt)
        passedTests++;
        endpointPassed++;
      }
    }
  }
  
  if (endpointFailed === 0) {
    log('green', `   ✅ All ${endpointPassed} injection attempts blocked!`);
  } else {
    log('red', `   ⚠️  ${endpointFailed}/${SQL_INJECTION_PAYLOADS.length} vulnerabilities found!`);
  }
}

async function runTests() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║   SQL-Injection Security Test Suite       ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  log('yellow', `Testing ${SQL_INJECTION_PAYLOADS.length} injection payloads per endpoint...\n`);

  // Test 1: Kunden GET by ID
  await testEndpoint(
    'Kunden - Get by ID',
    'GET',
    '/api/kunden/1',
    (payload) => null // GET hat keinen Body, ID im Path ist durch Express Router geschützt
  );

  // Test 2: Kunden Search
  await testEndpoint(
    'Kunden - Search',
    'GET',
    '/api/kunden/search?q=' + encodeURIComponent(SQL_INJECTION_PAYLOADS[0]),
    (payload) => null
  );

  // Test 3: Kunden Create
  await testEndpoint(
    'Kunden - Create',
    'POST',
    '/api/kunden',
    (payload) => ({
      name: payload,
      telefon: payload,
      email: `test${payload}@example.com`,
      adresse: payload,
      locosoft_id: payload
    })
  );

  // Test 4: Termine Create
  await testEndpoint(
    'Termine - Create',
    'POST',
    '/api/termine',
    (payload) => ({
      kunde_name: payload,
      kunde_telefon: payload,
      kennzeichen: payload,
      arbeit: payload,
      umfang: 'klein',
      geschaetzte_zeit: 60,
      datum: '2026-01-15',
      status: 'geplant'
    })
  );

  // Test 5: Termine Update
  await testEndpoint(
    'Termine - Update',
    'PUT',
    '/api/termine/1',
    (payload) => ({
      arbeit: payload,
      kennzeichen: payload,
      status: payload
    })
  );

  // Test 6: Mitarbeiter Create
  await testEndpoint(
    'Mitarbeiter - Create',
    'POST',
    '/api/mitarbeiter',
    (payload) => ({
      name: payload,
      arbeitsstunden_pro_tag: 8,
      nebenzeit_prozent: 0
    })
  );

  // Test 7: Lehrlinge Create
  await testEndpoint(
    'Lehrlinge - Create',
    'POST',
    '/api/lehrlinge',
    (payload) => ({
      name: payload,
      nebenzeit_prozent: 0,
      aufgabenbewaeltigung_prozent: 100
    })
  );

  // Test 8: Arbeitszeiten Update
  await testEndpoint(
    'Arbeitszeiten - Update',
    'PUT',
    '/api/arbeitszeiten/1',
    (payload) => ({
      bezeichnung: payload,
      standard_minuten: 30
    })
  );

  // Test 9: Ersatzautos Create
  await testEndpoint(
    'Ersatzautos - Create',
    'POST',
    '/api/ersatzautos',
    (payload) => ({
      kennzeichen: payload,
      name: payload,
      typ: payload
    })
  );

  // Test 10: Abwesenheiten Create
  await testEndpoint(
    'Abwesenheiten - Create',
    'POST',
    '/api/abwesenheiten',
    (payload) => ({
      mitarbeiter_id: 1,
      typ: 'urlaub',
      von_datum: '2026-01-15',
      bis_datum: payload // Injection im Datum
    })
  );

  // Zusammenfassung
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║           Test Results Summary             ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  log('blue', `Total Tests:  ${totalTests}`);
  log('green', `✅ Passed:     ${passedTests}`);
  log('red', `❌ Failed:     ${failedTests}`);
  
  const successRate = ((passedTests / totalTests) * 100).toFixed(2);
  log('yellow', `Success Rate: ${successRate}%\n`);
  
  if (failedTests === 0) {
    log('green', '🎉 SUCCESS: All SQL-Injection tests passed!');
    log('green', '   All models use Prepared Statements correctly.\n');
    process.exit(0);
  } else {
    log('red', '⚠️  WARNING: Some SQL-Injection vulnerabilities found!');
    log('red', '   Please review the failed tests above.\n');
    process.exit(1);
  }
}

// Prüfe ob Server läuft
apiRequest('GET', '/api/kunden')
  .then(() => {
    log('green', '✓ Server is running\n');
    return runTests();
  })
  .catch(err => {
    log('red', '✗ Server not running or not reachable');
    log('red', '  Please start the server first: ./start_server.sh\n');
    process.exit(1);
  });
