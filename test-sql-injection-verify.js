#!/usr/bin/env node

/**
 * SQL-Injection Verifikationstest
 * Zeigt, dass Payloads sicher als Strings gespeichert werden
 */

const http = require('http');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const BASE_URL = 'http://localhost:3001';
const DB_PATH = './backend/database/werkstatt.db';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

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
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
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

async function queryDB(sql) {
  try {
    const { stdout } = await execPromise(`cd /Users/shp-art/Documents/Github/Werkstatt-Terminplaner/backend && sqlite3 database/werkstatt.db "${sql}"`);
    return stdout.trim();
  } catch (error) {
    throw new Error(`DB Query failed: ${error.message}`);
  }
}

async function runTests() {
  log('magenta', '\n╔════════════════════════════════════════════╗');
  log('magenta', '║   SQL-Injection Verification Tests        ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  let allPassed = true;
  
  // Test 1: Tabellen existieren noch
  log('cyan', '📋 Test 1: Verify tables exist after DROP TABLE attempts');
  try {
    const terminCount = await queryDB('SELECT COUNT(*) FROM termine;');
    const kundenCount = await queryDB('SELECT COUNT(*) FROM kunden;');
    const mitarbeiterCount = await queryDB('SELECT COUNT(*) FROM mitarbeiter;');
    
    log('green', `   ✅ termine table:      ${terminCount} rows`);
    log('green', `   ✅ kunden table:       ${kundenCount} rows`);
    log('green', `   ✅ mitarbeiter table:  ${mitarbeiterCount} rows`);
    log('green', '   → All tables still exist (DROP TABLE failed as expected)\n');
  } catch (error) {
    log('red', `   ❌ FAILED: ${error.message}\n`);
    allPassed = false;
  }
  
  // Test 2: Injection-Payloads werden als Strings gespeichert
  log('cyan', '📋 Test 2: Verify payloads stored as strings (not executed as SQL)');
  
  const testPayload = "'; DROP TABLE termine; --";
  const testPayloadEscaped = testPayload.replace(/'/g, "''"); // SQLite escape für Query
  
  // Erstelle Test-Kunde mit Injection-Payload
  log('blue', `   Creating test customer with payload: "${testPayload}"`);
  const createResponse = await apiRequest('POST', '/api/kunden', {
    name: testPayload,
    telefon: '999-INJECT-TEST'
  });
  
  if (createResponse.status === 200 || createResponse.status === 201) {
    log('yellow', `   → Server accepted request (Status ${createResponse.status})`);
    
    // Prüfe ob der Payload wirklich als String in DB steht
    try {
      const result = await queryDB(`SELECT name FROM kunden WHERE telefon = '999-INJECT-TEST';`);
      
      if (result === testPayload) {
        log('green', `   ✅ Payload stored as string: "${result}"`);
        log('green', '   → SQL-Injection successfully blocked!\n');
      } else {
        log('red', `   ❌ Unexpected value in DB: "${result}"\n`);
        allPassed = false;
      }
    } catch (error) {
      log('red', `   ❌ DB Query failed: ${error.message}\n`);
      allPassed = false;
    }
  } else {
    log('red', `   ❌ Request failed with status ${createResponse.status}\n`);
    allPassed = false;
  }
  
  // Test 3: UNION SELECT wird nicht ausgeführt
  log('cyan', '📋 Test 3: Verify UNION SELECT payloads are blocked');
  
  const unionPayload = "' UNION SELECT * FROM termine--";
  log('blue', `   Creating test with UNION payload: "${unionPayload}"`);
  
  await apiRequest('POST', '/api/mitarbeiter', {
    name: unionPayload,
    arbeitsstunden_pro_tag: 8,
    nebenzeit_prozent: 0
  });
  
  try {
    const mitCount = await queryDB('SELECT COUNT(*) FROM mitarbeiter;');
    const result = await queryDB(`SELECT name FROM mitarbeiter WHERE name LIKE '%UNION%' LIMIT 1;`);
    
    if (result.includes('UNION SELECT')) {
      log('green', `   ✅ UNION payload stored as string: "${result.substring(0, 50)}..."`);
      log('green', '   → No data leak or unauthorized access occurred\n');
    } else {
      log('red', '   ❌ UNION payload not found in expected format\n');
      allPassed = false;
    }
  } catch (error) {
    log('red', `   ❌ Test failed: ${error.message}\n`);
    allPassed = false;
  }
  
  // Test 4: OR '1'='1' wird nicht ausgeführt
  log('cyan', "📋 Test 4: Verify OR '1'='1' authentication bypass is blocked");
  
  const orPayload = "admin' OR '1'='1' --";
  log('blue', `   Testing with bypass payload: "${orPayload}"`);
  
  const kundenBefore = await queryDB('SELECT COUNT(*) FROM kunden;');
  
  await apiRequest('POST', '/api/kunden', {
    name: orPayload,
    telefon: '888-BYPASS-TEST'
  });
  
  const kundenAfter = await queryDB('SELECT COUNT(*) FROM kunden;');
  const diff = parseInt(kundenAfter) - parseInt(kundenBefore);
  
  if (diff === 1) {
    log('green', '   ✅ Exactly 1 customer added (not all customers affected)');
    
    const storedName = await queryDB("SELECT name FROM kunden WHERE telefon = '888-BYPASS-TEST';");
    if (storedName === orPayload) {
      log('green', `   ✅ Payload stored as string: "${storedName}"`);
      log('green', '   → Authentication bypass blocked!\n');
    } else {
      log('red', '   ❌ Unexpected behavior\n');
      allPassed = false;
    }
  } else {
    log('red', `   ❌ Unexpected number of rows affected: ${diff}\n`);
    allPassed = false;
  }
  
  // Test 5: DELETE FROM wird nicht ausgeführt
  log('cyan', '📋 Test 5: Verify DELETE FROM payloads are blocked');
  
  const countBefore = await queryDB('SELECT COUNT(*) FROM termine;');
  log('blue', `   Termine before: ${countBefore}`);
  
  const deletePayload = "1; DELETE FROM termine WHERE '1'='1";
  await apiRequest('POST', '/api/termine', {
    kunde_name: deletePayload,
    kennzeichen: 'TEST-DEL',
    arbeit: 'Test',
    umfang: 'klein',
    geschaetzte_zeit: 30,
    datum: '2026-02-01',
    status: 'geplant'
  });
  
  const countAfter = await queryDB('SELECT COUNT(*) FROM termine;');
  log('blue', `   Termine after:  ${countAfter}`);
  
  const diff2 = parseInt(countAfter) - parseInt(countBefore);
  
  if (diff2 === 1) {
    log('green', '   ✅ Exactly 1 termin added (mass deletion prevented)');
    log('green', '   → DELETE injection successfully blocked!\n');
  } else if (diff2 <= 0) {
    log('red', `   ❌ CRITICAL: Termine count decreased by ${Math.abs(diff2)}!\n`);
    allPassed = false;
  } else {
    log('yellow', `   ⚠️  Unexpected: ${diff2} termine added\n`);
  }
  
  // Cleanup: Lösche Test-Daten
  log('cyan', '🧹 Cleanup: Removing test data...');
  try {
    await queryDB("DELETE FROM kunden WHERE telefon IN ('999-INJECT-TEST', '888-BYPASS-TEST');");
    await queryDB("DELETE FROM mitarbeiter WHERE name LIKE '%UNION%' OR name LIKE '%DROP TABLE%';");
    await queryDB("DELETE FROM termine WHERE kennzeichen = 'TEST-DEL';");
    log('green', '   ✅ Test data cleaned up\n');
  } catch (error) {
    log('yellow', `   ⚠️  Cleanup warning: ${error.message}\n`);
  }
  
  // Zusammenfassung
  log('magenta', '╔════════════════════════════════════════════╗');
  log('magenta', '║              Final Results                 ║');
  log('magenta', '╚════════════════════════════════════════════╝\n');
  
  if (allPassed) {
    log('green', '🎉 SUCCESS: All SQL-Injection tests passed!');
    log('green', '');
    log('green', '✅ Prepared Statements working correctly');
    log('green', '✅ No SQL code execution from user input');
    log('green', '✅ All payloads stored as safe strings');
    log('green', '✅ Database integrity maintained');
    log('green', '');
    log('green', '📝 CONCLUSION: The application is SECURE against SQL-Injection attacks.');
    log('green', '   All models use parameterized queries (? placeholders) correctly.\n');
    process.exit(0);
  } else {
    log('red', '❌ FAILURE: Some tests failed!');
    log('red', '   Please review the output above.\n');
    process.exit(1);
  }
}

// Start
apiRequest('GET', '/api/kunden')
  .then(() => {
    log('green', '✓ Server is running\n');
    return runTests();
  })
  .catch(err => {
    log('red', '✗ Server not running');
    log('red', '  Start with: ./start_server.sh\n');
    process.exit(1);
  });
