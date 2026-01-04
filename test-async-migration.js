/**
 * Test-Suite für async/await Migration
 * Testet alle 9 migrierten Models/Controller
 */

const http = require('http');

const API_BASE = 'http://localhost:3001';
const tests = [];
let passedTests = 0;
let failedTests = 0;

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passedTests++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\\n===========================================');
  console.log('  Test: async/await Migration');
  console.log('===========================================\\n');

  // 1. AbwesenheitenModel/Controller
  console.log('📦 1. Abwesenheiten (async/await)');
  await test('GET /api/abwesenheiten/liste', async () => {
    const res = await apiRequest('GET', '/api/abwesenheiten/liste');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Expected array');
  });

  await test('GET /api/abwesenheiten/:datum (legacy)', async () => {
    const res = await apiRequest('GET', '/api/abwesenheiten/2026-01-10');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  // 2. ArbeitszeitenModel/Controller  
  console.log('\\n📦 2. Arbeitszeiten (async/await)');
  await test('GET /api/arbeitszeiten', async () => {
    const res = await apiRequest('GET', '/api/arbeitszeiten');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Expected array');
  });

  let arbeitszeitId;
  await test('POST /api/arbeitszeiten (create)', async () => {
    const res = await apiRequest('POST', '/api/arbeitszeiten', {
      bezeichnung: 'Test Arbeitszeit async',
      standard_minuten: 45,
      aliase: 'test'
    });
    if (![200, 201].includes(res.status)) throw new Error(`Status ${res.status}`);
    if (!res.data.id) throw new Error('No ID returned');
    arbeitszeitId = res.data.id;
  });

  if (arbeitszeitId) {
    await test('PUT /api/arbeitszeiten/:id (update)', async () => {
      const res = await apiRequest('PUT', `/api/arbeitszeiten/${arbeitszeitId}`, {
        standard_minuten: 60
      });
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    await test('DELETE /api/arbeitszeiten/:id', async () => {
      const res = await apiRequest('DELETE', `/api/arbeitszeiten/${arbeitszeitId}`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });
  }

  // 3. ErsatzautosModel/Controller
  console.log('\\n📦 3. Ersatzautos (async/await)');
  await test('GET /api/ersatzautos', async () => {
    const res = await apiRequest('GET', '/api/ersatzautos');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Expected array');
  });

  // 4. LehrlingeModel/Controller
  console.log('\\n📦 4. Lehrlinge (async/await)');
  await test('GET /api/lehrlinge', async () => {
    const res = await apiRequest('GET', '/api/lehrlinge');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Expected array');
  });

  // 5. MitarbeiterModel/Controller
  console.log('\\n📦 5. Mitarbeiter (async/await)');
  await test('GET /api/mitarbeiter', async () => {
    const res = await apiRequest('GET', '/api/mitarbeiter');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Expected array');
  });

  // 6. EinstellungenModel/Controller
  console.log('\\n📦 6. Einstellungen (async/await)');
  await test('GET /api/einstellungen/werkstatt', async () => {
    const res = await apiRequest('GET', '/api/einstellungen/werkstatt');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  // 7. KundenModel/Controller
  console.log('\\n📦 7. Kunden (async/await)');
  await test('GET /api/kunden', async () => {
    const res = await apiRequest('GET', '/api/kunden');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Expected array');
  });

  let kundenId;
  await test('POST /api/kunden (create)', async () => {
    const res = await apiRequest('POST', '/api/kunden', {
      name: 'Async Test Kunde',
      telefon: '0123456789',
      email: 'async@test.de'
    });
    if (![200, 201].includes(res.status)) throw new Error(`Status ${res.status}`);
    if (!res.data.id) throw new Error('No ID returned');
    kundenId = res.data.id;
  });

  if (kundenId) {
    await test('GET /api/kunden/:id', async () => {
      const res = await apiRequest('GET', `/api/kunden/${kundenId}`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      if (res.data.name !== 'Async Test Kunde') throw new Error('Wrong name');
    });

    await test('PUT /api/kunden/:id (update)', async () => {
      const res = await apiRequest('PUT', `/api/kunden/${kundenId}`, {
        telefon: '9876543210'
      });
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    await test('DELETE /api/kunden/:id', async () => {
      const res = await apiRequest('DELETE', `/api/kunden/${kundenId}`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });
  }

  await test('GET /api/kunden/search?term=test', async () => {
    const res = await apiRequest('GET', '/api/kunden/search?term=test');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  // 8. PhasenModel/Controller
  console.log('\\n📦 8. Phasen (async/await)');
  await test('GET /api/phasen', async () => {
    const res = await apiRequest('GET', '/api/phasen');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Expected array');
  });

  // 9. TermineModel/Controller (KOMPLEX!)
  console.log('\\n📦 9. Termine (async/await - 18 Methoden migriert)');
  await test('GET /api/termine', async () => {
    const res = await apiRequest('GET', '/api/termine');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Expected array');
  });

  await test('GET /api/termine/datum/2026-01-15', async () => {
    const res = await apiRequest('GET', '/api/termine/datum/2026-01-15');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  await test('GET /api/termine/auslastung/2026-01-15', async () => {
    const res = await apiRequest('GET', '/api/termine/auslastung/2026-01-15');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  await test('GET /api/termine/schwebend', async () => {
    const res = await apiRequest('GET', '/api/termine/schwebend');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  await test('GET /api/termine/geloescht', async () => {
    const res = await apiRequest('GET', '/api/termine/geloescht');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  let terminId;
  await test('POST /api/termine (create)', async () => {
    // Hole ersten Kunden
    const kundenRes = await apiRequest('GET', '/api/kunden?limit=1');
    if (!kundenRes.data[0]) throw new Error('Keine Kunden gefunden');
    
    const res = await apiRequest('POST', '/api/termine', {
      kunde_id: kundenRes.data[0].id,
      datum: '2026-02-15',
      geschaetzte_zeit: 60,
      arbeit: 'Async Test Termin',
      kennzeichen: 'TEST-123',
      status: 'offen'
    });
    if (![200, 201].includes(res.status)) throw new Error(`Status ${res.status}`);
    if (!res.data.id) throw new Error('No ID returned');
    terminId = res.data.id;
  });

  if (terminId) {
    await test('GET /api/termine/:id', async () => {
      const res = await apiRequest('GET', `/api/termine/${terminId}`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    await test('PUT /api/termine/:id (update)', async () => {
      const res = await apiRequest('PUT', `/api/termine/${terminId}`, {
        status: 'fertig',
        tatsaechliche_zeit: 55
      });
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    await test('DELETE /api/termine/:id (soft delete)', async () => {
      const res = await apiRequest('DELETE', `/api/termine/${terminId}`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    await test('POST /api/termine/:id/restore', async () => {
      const res = await apiRequest('POST', `/api/termine/${terminId}/restore`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });

    await test('DELETE /api/termine/:id/permanent', async () => {
      const res = await apiRequest('DELETE', `/api/termine/${terminId}/permanent`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
    });
  }

  // Zusammenfassung
  console.log('\\n===========================================');
  console.log('  TESTERGEBNISSE');
  console.log('===========================================');
  console.log(`✅ Bestanden: ${passedTests}`);
  console.log(`❌ Fehlgeschlagen: ${failedTests}`);
  console.log(`📊 Gesamt: ${passedTests + failedTests}`);
  console.log(`📈 Erfolgsrate: ${((passedTests/(passedTests+failedTests))*100).toFixed(1)}%`);
  console.log('===========================================\\n');

  if (failedTests === 0) {
    console.log('🎉 ALLE TESTS BESTANDEN! async/await Migration erfolgreich!\\n');
    process.exit(0);
  } else {
    console.log('⚠️  Einige Tests fehlgeschlagen. Prüfe die Fehler oben.\\n');
    process.exit(1);
  }
}

// Server-Verfügbarkeit prüfen
console.log('Prüfe Server-Verfügbarkeit...');
http.get(API_BASE + '/api/kunden', (res) => {
  console.log('✅ Server ist erreichbar\\n');
  runTests().catch(err => {
    console.error('❌ Test-Suite fehlgeschlagen:', err);
    process.exit(1);
  });
}).on('error', (err) => {
  console.error('❌ Server nicht erreichbar. Starte Backend mit: cd backend && node src/server.js');
  process.exit(1);
});
