# Sicherheits- und Code-Qualitaets-Haertung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die kritischen Sicherheitsluecken, API-Schwaechen und Code-Qualitaetsprobleme im Werkstatt-Terminplaner beheben — priorisiert nach Risiko.

**Architecture:** Neue Middleware-Dateien fuer Auth und Rate-Limiting, bestehende Route-Dateien um Validierung und asyncHandler ergaenzen, Debug-Logging entfernen, XSS-Escaping konsistent machen, WebSocket-Heartbeat hinzufuegen.

**Tech Stack:** Node.js, Express 4, SQLite3, express-rate-limit (neu), helmet (neu), ws

---

## Dateistruktur

| Aktion | Datei | Verantwortung |
|--------|-------|---------------|
| **Erstellen** | `backend/src/middleware/auth.js` | API-Key-Authentifizierung fuer destruktive Endpunkte |
| **Erstellen** | `backend/src/middleware/rateLimiter.js` | Rate-Limiting Konfiguration |
| **Aendern** | `backend/src/server.js` | helmet, Interval-Handles, Signal-Handler, Body-Parser-Limit |
| **Aendern** | `backend/src/config/database.js:139-146` | Debug-Logging entfernen |
| **Aendern** | `backend/src/controllers/termineController.js:920-936` | Debug-Logging entfernen |
| **Aendern** | `backend/src/controllers/tabletUpdateController.js:75-103` | Path-Traversal Fix |
| **Aendern** | `backend/src/routes/index.js` | Auth-Middleware auf destruktive Sub-Router |
| **Aendern** | `backend/src/routes/termineRoutes.js` | asyncHandler + Validierung |
| **Aendern** | `backend/src/routes/mitarbeiterRoutes.js` | asyncHandler + Validierung |
| **Aendern** | `backend/src/routes/kundenRoutes.js` | asyncHandler + Validierung |
| **Aendern** | `backend/src/routes/backupRoutes.js` | asyncHandler + Auth |
| **Aendern** | `backend/src/routes/systemRoutes.js` | asyncHandler + Auth |
| **Aendern** | `backend/src/routes/aiRoutes.js` | asyncHandler + Rate-Limiting |
| **Erstellen** | `backend/tests/middleware/auth.test.js` | Auth-Middleware Tests |
| **Erstellen** | `backend/tests/middleware/rateLimiter.test.js` | Rate-Limiter Tests |
| **Erstellen** | `backend/tests/security/pathTraversal.test.js` | Path-Traversal Tests |

---

## Task 1: Debug-Logging entfernen (KRITISCH — Performance)

**Files:**
- Modify: `backend/src/config/database.js:139-146`
- Modify: `backend/src/controllers/termineController.js:920-936`

- [ ] **Step 1: Entferne DB-Proxy Debug-Logging**

In `backend/src/config/database.js` den Block in Zeilen 139-146 entfernen:

```javascript
// ENTFERNEN - Zeilen 139-146:
    // Debug: Was ist dbWrapper.connection?
    if (prop === 'get' || prop === 'all' || prop === 'run') {
      console.log(`[DB-Proxy] Zugriff auf '${prop}':`, {
        connectionType: typeof dbWrapper.connection,
        hasMethod: typeof dbWrapper.connection[prop],
        connectionKeys: Object.keys(dbWrapper.connection).slice(0, 5)
      });
    }
```

Nach dem Entfernen sieht der Code so aus (Zeile 137 geht direkt zu 148):

```javascript
    if (!dbWrapper.connection) {
      const errorMsg = `...`;
      console.error(errorMsg);
      console.error('...');
      const error = new Error('...');
      error.code = 'DB_NOT_READY';
      throw error;
    }
    
    // Alle anderen Props/Methoden vom aktuellen Connection-Objekt holen
    const value = dbWrapper.connection[prop];
```

- [ ] **Step 2: Entferne Debug-Logs in termineController.update()**

In `backend/src/controllers/termineController.js` die 5 Debug-Zeilen entfernen:

```javascript
// ENTFERNEN - Zeile 920:
      console.log('[DEBUG] Führe Datenbank-Update aus...');
// ENTFERNEN - Zeile 922:
      console.log('[DEBUG] Datenbank-Update Ergebnis:', result);
// ENTFERNEN - Zeile 925:
      console.log('[DEBUG] Anzahl geänderter Zeilen:', changes);
// ENTFERNEN - Zeile 928:
        console.log('[DEBUG] Cache wird invalidiert');
// ENTFERNEN - Zeile 936:
        console.log('[DEBUG] Keine Änderungen - Cache wird NICHT invalidiert');
```

Nach Entfernung:

```javascript
      const result = await TermineModel.update(req.params.id, updateData);
      
      const changes = (result && result.changes) || 0;
      
      if (changes > 0) {
        invalidateTermineCache();
        broadcastEvent('termin.updated', {
          id: req.params.id,
          datum: newDatum || null,
          oldDatum: termin.datum || null
        });
      }
```

- [ ] **Step 3: Server starten und pruefen**

Run: `cd backend && node -e "require('./src/config/database'); console.log('DB module loaded OK')"`
Expected: Keine `[DB-Proxy]` Ausgaben mehr

- [ ] **Step 4: Commit**

```bash
git add backend/src/config/database.js backend/src/controllers/termineController.js
git commit -m "perf: Debug-Logging aus DB-Proxy und termineController entfernen"
```

---

## Task 2: Path-Traversal Fix im Tablet-Update-Controller (KRITISCH — Sicherheit)

**Files:**
- Modify: `backend/src/controllers/tabletUpdateController.js:72-103`
- Create: `backend/tests/security/pathTraversal.test.js`

- [ ] **Step 1: Schreibe den Test**

Erstelle `backend/tests/security/pathTraversal.test.js`:

```javascript
const path = require('path');

// Simuliere die Validierungslogik
function isPathSafe(filePath, allowedDir) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(allowedDir + path.sep) || resolved === allowedDir;
}

describe('Path Traversal Protection', () => {
  const allowedDir = path.resolve(__dirname, '../../tablet-updates');

  test('erlaubt Dateien im erlaubten Verzeichnis', () => {
    const safePath = path.join(allowedDir, 'update-v1.2.0.apk');
    expect(isPathSafe(safePath, allowedDir)).toBe(true);
  });

  test('blockiert Path-Traversal mit ../', () => {
    const evilPath = path.join(allowedDir, '..', '..', 'etc', 'passwd');
    expect(isPathSafe(evilPath, allowedDir)).toBe(false);
  });

  test('blockiert absolute Pfade ausserhalb', () => {
    expect(isPathSafe('/etc/passwd', allowedDir)).toBe(false);
  });

  test('blockiert Windows-Pfade ausserhalb', () => {
    expect(isPathSafe('C:\\Windows\\System32\\config\\sam', allowedDir)).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausfuehren — muss PASS sein**

Run: `cd backend && npx jest tests/security/pathTraversal.test.js --verbose`
Expected: 4 Tests PASS

- [ ] **Step 3: Fix im TabletUpdateController implementieren**

In `backend/src/controllers/tabletUpdateController.js` die `registerUpdate`-Methode aendern (Zeilen 75-103):

```javascript
  static async registerUpdate(req, res) {
    try {
      const { version, filePath, releaseNotes } = req.body;

      if (!version || !filePath) {
        return res.status(400).json({ error: 'Version und Dateipfad erforderlich' });
      }

      // Path-Traversal-Schutz: Nur Dateien im erlaubten Verzeichnis
      const allowedDir = path.resolve(__dirname, '..', '..', 'tablet-updates');
      const resolvedPath = path.resolve(filePath);
      
      if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) {
        return res.status(400).json({ error: 'Ungültiger Dateipfad — nur Dateien im tablet-updates Verzeichnis erlaubt' });
      }

      // Prüfe ob Datei existiert
      if (!fs.existsSync(resolvedPath)) {
        return res.status(400).json({ error: 'Update-Datei nicht gefunden' });
      }

      const result = await TabletUpdateModel.registerUpdate({
        version,
        filePath: resolvedPath,
        releaseNotes: releaseNotes || ''
      });

      res.json({
        success: true,
        message: 'Update registriert',
        updateId: result.id
      });
    } catch (error) {
      console.error('Fehler beim Registrieren des Updates:', error);
      res.status(500).json({ error: error.message });
    }
  }
```

- [ ] **Step 4: Tests ausfuehren**

Run: `cd backend && npx jest tests/security/ --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/tabletUpdateController.js backend/tests/security/pathTraversal.test.js
git commit -m "security: Path-Traversal-Schutz für Tablet-Update filePath"
```

---

## Task 3: API-Key-Authentifizierung fuer destruktive Endpunkte (KRITISCH — Sicherheit)

**Files:**
- Create: `backend/src/middleware/auth.js`
- Create: `backend/tests/middleware/auth.test.js`
- Modify: `backend/src/routes/index.js:26-55`

- [ ] **Step 1: Schreibe den Test**

Erstelle `backend/tests/middleware/auth.test.js`:

```javascript
describe('Auth Middleware', () => {
  let requireAuth;

  beforeAll(() => {
    process.env.API_KEY = 'test-secret-key-12345';
    requireAuth = require('../../src/middleware/auth').requireAuth;
  });

  function createMockReqRes(apiKey) {
    const req = { headers: {} };
    if (apiKey) req.headers['x-api-key'] = apiKey;
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; }
    };
    const next = jest.fn();
    return { req, res, next };
  }

  test('laesst Anfragen mit korrektem API-Key durch', () => {
    const { req, res, next } = createMockReqRes('test-secret-key-12345');
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  test('blockiert Anfragen ohne API-Key', () => {
    const { req, res, next } = createMockReqRes(null);
    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('blockiert Anfragen mit falschem API-Key', () => {
    const { req, res, next } = createMockReqRes('wrong-key');
    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('laesst Anfragen durch wenn kein API_KEY konfiguriert (Entwicklung)', () => {
    delete process.env.API_KEY;
    // Modul neu laden um env-Aenderung zu greifen
    jest.resetModules();
    const { requireAuth: freshAuth } = require('../../src/middleware/auth');
    const { req, res, next } = createMockReqRes(null);
    freshAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test ausfuehren — muss FAIL sein**

Run: `cd backend && npx jest tests/middleware/auth.test.js --verbose`
Expected: FAIL — Modul existiert noch nicht

- [ ] **Step 3: Auth-Middleware implementieren**

Erstelle `backend/src/middleware/auth.js`:

```javascript
/**
 * API-Key-Authentifizierung fuer destruktive Endpunkte
 * 
 * Wenn API_KEY in .env gesetzt ist, muessen destruktive Endpunkte
 * den Header "x-api-key" mit dem korrekten Wert senden.
 * 
 * Ohne API_KEY in .env (Entwicklung) wird alles durchgelassen.
 */

function requireAuth(req, res, next) {
  const configuredKey = process.env.API_KEY;
  
  // Kein API_KEY konfiguriert = Entwicklungsmodus, alles erlaubt
  if (!configuredKey) {
    return next();
  }
  
  const providedKey = req.headers['x-api-key'];
  
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ 
      error: 'Nicht autorisiert — API-Key fehlt oder ungueltig',
      hint: 'Sende den Header "x-api-key" mit dem konfigurierten Schluessel'
    });
  }
  
  next();
}

module.exports = { requireAuth };
```

- [ ] **Step 4: Test ausfuehren — muss PASS sein**

Run: `cd backend && npx jest tests/middleware/auth.test.js --verbose`
Expected: 4 Tests PASS

- [ ] **Step 5: Auth-Middleware in Routes einbinden**

In `backend/src/routes/index.js` aendern:

```javascript
const express = require('express');
const router = express.Router();
const { VERSION, APP_NAME } = require('../config/version');
const { requireAuth } = require('../middleware/auth');

// ... alle requires bleiben gleich ...

// Oeffentliche Routes (kein Auth)
router.use('/kunden', kundenRoutes);
router.use('/termine', termineRoutes);
router.use('/arbeitszeiten', arbeitszeitenRoutes);
router.use('/auslastung', auslastungRoutes);
router.use('/einstellungen', einstellungenRoutes);
router.use('/abwesenheiten', abwesenheitenRoutes);
router.use('/arbeitszeiten-plan', arbeitszeitenPlanRoutes);
router.use('/schicht-templates', schichtTemplateRoutes);
router.use('/mitarbeiter', mitarbeiterRoutes);
router.use('/lehrlinge', lehrlingeRoutes);
router.use('/ersatzautos', ersatzautosRoutes);
router.use('/phasen', phasenRoutes);
router.use('/ai', aiRoutes);
router.use('/teile-bestellungen', teileRoutes);
router.use('/fahrzeuge', fahrzeugeRoutes);
router.use('/ki-planung', kiPlanungRoutes);
router.use('/tablet', tabletRoutes);
router.use('/pause', pauseRoutes);
router.use('/arbeitspausen', arbeitspausenRoutes);
router.use('/reports', reportingRoutes);
router.use('/suche', sucheRoutes);
router.use('/wiederkehrende-termine', wiederkehrendeTermineRoutes);

// Geschuetzte Routes (API-Key erforderlich)
router.use('/backup', requireAuth, backupRoutes);
router.use('/system', requireAuth, systemRoutes);
router.use('/tablet-update', requireAuth, tabletUpdateRoutes);

// ... health und server-info bleiben gleich ...
```

- [ ] **Step 6: .env.example um API_KEY ergaenzen**

In `backend/.env.example` hinzufuegen:

```
# API-Key fuer destruktive Endpunkte (backup, system, tablet-update)
# Ohne diesen Wert sind diese Endpunkte fuer jeden im Netzwerk zugaenglich!
API_KEY=hier-einen-sicheren-schluessel-setzen
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/auth.js backend/tests/middleware/auth.test.js backend/src/routes/index.js backend/.env.example
git commit -m "security: API-Key-Auth fuer destruktive Endpunkte (backup, system, tablet-update)"
```

---

## Task 4: helmet und Security-Headers installieren (MITTEL — Sicherheit)

**Files:**
- Modify: `backend/package.json` (neues Paket)
- Modify: `backend/src/server.js:170-172`

- [ ] **Step 1: helmet installieren**

Run: `cd backend && npm install helmet`
Expected: `added 1 package`

- [ ] **Step 2: helmet in server.js einbinden**

In `backend/src/server.js` nach Zeile 5 (`const compression = require('compression');`) einfuegen:

```javascript
const helmet = require('helmet');
```

Nach Zeile 172 (`logStartup('Erstelle Express App...');` / `const app = express();`) einfuegen:

```javascript
    // Security Headers
    app.use(helmet({
      contentSecurityPolicy: false, // CSP deaktiviert wegen Inline-Scripts im Frontend
      crossOriginEmbedderPolicy: false // Fuer lokale Netzwerk-Nutzung
    }));
    logStartup('Helmet Security-Headers aktiviert');
```

- [ ] **Step 3: Server starten und pruefen**

Run: `cd backend && node -e "const http = require('http'); const { startServer } = require('./src/server'); startServer().then(s => { http.get('http://localhost:' + (process.env.PORT || 3001) + '/api/health', r => { console.log('X-Content-Type-Options:', r.headers['x-content-type-options']); console.log('X-Frame-Options:', r.headers['x-frame-options']); s.close(); process.exit(0); }); })"`
Expected: `X-Content-Type-Options: nosniff` und `X-Frame-Options: SAMEORIGIN`

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/server.js
git commit -m "security: helmet fuer HTTP-Sicherheits-Header"
```

---

## Task 5: Rate-Limiting fuer KI- und System-Endpunkte (HOCH — Sicherheit)

**Files:**
- Create: `backend/src/middleware/rateLimiter.js`
- Modify: `backend/package.json` (neues Paket)
- Modify: `backend/src/routes/index.js`

- [ ] **Step 1: express-rate-limit installieren**

Run: `cd backend && npm install express-rate-limit`
Expected: `added 1 package`

- [ ] **Step 2: Rate-Limiter-Middleware erstellen**

Erstelle `backend/src/middleware/rateLimiter.js`:

```javascript
const rateLimit = require('express-rate-limit');

/**
 * Rate-Limiter fuer KI-Endpunkte (teuer wegen OpenAI-Kosten)
 * Max 30 Anfragen pro Minute pro IP
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Zu viele KI-Anfragen — bitte 1 Minute warten' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate-Limiter fuer destruktive System-Endpunkte
 * Max 5 Anfragen pro Minute pro IP
 */
const systemLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Zu viele System-Anfragen — bitte 1 Minute warten' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Allgemeiner API-Limiter
 * Max 200 Anfragen pro Minute pro IP
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Zu viele Anfragen — bitte kurz warten' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { aiLimiter, systemLimiter, generalLimiter };
```

- [ ] **Step 3: Rate-Limiter in Routes einbinden**

In `backend/src/routes/index.js` ergaenzen:

```javascript
const { aiLimiter, systemLimiter } = require('../middleware/rateLimiter');
```

Dann die betroffenen Zeilen aendern:

```javascript
router.use('/ai', aiLimiter, aiRoutes);
router.use('/backup', requireAuth, systemLimiter, backupRoutes);
router.use('/system', requireAuth, systemLimiter, systemRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/middleware/rateLimiter.js backend/package.json backend/package-lock.json backend/src/routes/index.js
git commit -m "security: Rate-Limiting fuer KI- und System-Endpunkte"
```

---

## Task 6: Validierungs-Middleware in Routes einbinden (KRITISCH — API)

**Files:**
- Modify: `backend/src/routes/termineRoutes.js`
- Modify: `backend/src/routes/mitarbeiterRoutes.js`
- Modify: `backend/src/routes/kundenRoutes.js`

- [ ] **Step 1: termineRoutes.js mit Validierung**

In `backend/src/routes/termineRoutes.js` aendern:

```javascript
const express = require('express');
const router = express.Router();
const TermineController = require('../controllers/termineController');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateTermin, validateId } = require('../middleware/validation');

// Papierkorb-Routes
router.get('/papierkorb', asyncHandler(TermineController.getDeleted));
router.get('/geloescht', asyncHandler(TermineController.getDeleted));
router.post('/:id/restore', validateId, asyncHandler(TermineController.restore));
router.delete('/:id/permanent', validateId, asyncHandler(TermineController.permanentDelete));

// Schwebende Termine
router.get('/schwebend', asyncHandler(TermineController.getSchwebend));
router.post('/:id/schwebend', validateId, asyncHandler(TermineController.setSchwebend));
router.post('/:id/split', validateId, asyncHandler(TermineController.splitTermin));
router.get('/:id/split-termine', validateId, asyncHandler(TermineController.getSplitTermine));
router.post('/:id/weiterfuehren', validateId, asyncHandler(TermineController.weiterfuehren));
router.post('/:id/folgearbeit', validateId, asyncHandler(TermineController.folgearbeitErstellen));

// Auftragserweiterung
router.get('/erweiterung/verfuegbare-mitarbeiter', asyncHandler(TermineController.findeVerfuegbareMitarbeiter));
router.get('/:id/erweiterung/konflikte', validateId, asyncHandler(TermineController.pruefeErweiterungsKonflikte));
router.post('/:id/erweiterung', validateId, asyncHandler(TermineController.erweiterungErstellen));
router.get('/:id/erweiterungen', validateId, asyncHandler(TermineController.getErweiterungen));
router.get('/:id/erweiterungen/count', validateId, asyncHandler(TermineController.countErweiterungen));

// Automatisierung
router.get('/naechster-slot', asyncHandler(TermineController.getNaechsterSlot));
router.patch('/batch', asyncHandler(TermineController.batchUpdate));

// Spezifische Routes
router.get('/datum/:datum', asyncHandler(TermineController.getByDatumLegacy));
router.get('/auslastung/:datum', asyncHandler(TermineController.getAuslastung));
router.get('/verfuegbarkeit', asyncHandler(TermineController.checkAvailability));
router.post('/validate', asyncHandler(TermineController.validate));
router.get('/vorschlaege', asyncHandler(TermineController.getVorschlaege));
router.get('/bringzeit-ueberschneidungen', asyncHandler(TermineController.getBringzeitUeberschneidungen));
router.get('/aehnliche', asyncHandler(TermineController.getAehnliche));
router.get('/duplikat-check', asyncHandler(TermineController.checkDuplikate));
router.get('/teile-status', asyncHandler(TermineController.getTeileStatus));
router.get('/dropdown', asyncHandler(TermineController.getDropdownData));
router.post('/berechne-zeiten-neu', asyncHandler(TermineController.berechneZeitenNeu));

// Einzelarbeit
router.put('/:id/arbeit/:arbeitName/abschliessen', validateId, asyncHandler(TermineController.completeEinzelarbeit));
router.post('/:id/arbeit-beenden', validateId, asyncHandler(TermineController.arbeitBeendenByIndex));

// Standard CRUD
router.get('/', asyncHandler(TermineController.getAll));
router.get('/:id', validateId, asyncHandler(TermineController.getById));
router.post('/', validateTermin, asyncHandler(TermineController.create));
router.put('/:id', validateId, validateTermin, asyncHandler(TermineController.update));
router.delete('/:id', validateId, asyncHandler(TermineController.delete));

module.exports = router;
```

- [ ] **Step 2: mitarbeiterRoutes.js mit Validierung**

In `backend/src/routes/mitarbeiterRoutes.js` aendern:

```javascript
const express = require('express');
const router = express.Router();
const MitarbeiterController = require('../controllers/mitarbeiterController');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateMitarbeiter, validateId } = require('../middleware/validation');

router.get('/', asyncHandler(MitarbeiterController.getAll));
router.get('/aktive', asyncHandler(MitarbeiterController.getAktive));
router.get('/:id', validateId, asyncHandler(MitarbeiterController.getById));
router.post('/', validateMitarbeiter, asyncHandler(MitarbeiterController.create));
router.put('/:id', validateId, validateMitarbeiter, asyncHandler(MitarbeiterController.update));
router.delete('/:id', validateId, asyncHandler(MitarbeiterController.delete));

module.exports = router;
```

- [ ] **Step 3: kundenRoutes.js mit Validierung**

In `backend/src/routes/kundenRoutes.js` aendern:

```javascript
const express = require('express');
const router = express.Router();
const KundenController = require('../controllers/kundenController');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateKunde, validateKundenSearch, validateId } = require('../middleware/validation');

router.get('/', asyncHandler(KundenController.getAll));
router.get('/dropdown', asyncHandler(KundenController.getDropdownData));
router.get('/search', validateKundenSearch, asyncHandler(KundenController.search));
router.get('/search/fuzzy', asyncHandler(KundenController.fuzzySearch));
router.get('/stats/fahrzeuge', asyncHandler(KundenController.countFahrzeuge));
router.get('/:id', validateId, asyncHandler(KundenController.getById));
router.get('/:id/fahrzeuge', validateId, asyncHandler(KundenController.getFahrzeuge));
router.post('/', validateKunde, asyncHandler(KundenController.create));
router.post('/import', asyncHandler(KundenController.import));
router.post('/:id/fahrzeuge', validateId, asyncHandler(KundenController.addFahrzeug));
router.put('/:id', validateId, validateKunde, asyncHandler(KundenController.update));
router.put('/:id/fahrzeuge/:kennzeichen', validateId, asyncHandler(KundenController.updateFahrzeug));
router.delete('/:id', validateId, asyncHandler(KundenController.delete));
router.delete('/:id/fahrzeuge/:kennzeichen', validateId, asyncHandler(KundenController.deleteFahrzeug));

module.exports = router;
```

- [ ] **Step 4: Tests ausfuehren**

Run: `cd backend && npm test`
Expected: Alle bestehenden Tests PASS (Validierung gibt 400 statt 500 bei falschen Daten)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/termineRoutes.js backend/src/routes/mitarbeiterRoutes.js backend/src/routes/kundenRoutes.js
git commit -m "feat: Validierungs-Middleware und asyncHandler in Routes einbinden"
```

---

## Task 7: Graceful-Shutdown und Signal-Handler fixen (HOCH — Code-Qualitaet)

**Files:**
- Modify: `backend/src/server.js:360-378, 480-528`

- [ ] **Step 1: Interval-Handles speichern**

In `backend/src/server.js` die Interval-Erstellung aendern (Zeilen 360-378):

```javascript
    // Wiederkehrende Termine Scheduler
    const schedulerInterval = setInterval(() => {
        WiederkehrendeTermineController.runScheduler().catch(err => {
            console.warn('[WiederkehrendeTermine] Scheduler-Fehler:', err.message);
        });
    }, MS_PER_DAY);
    logStartup('Wiederkehrende-Termine-Scheduler gestartet');

    // Pause-Cleanup
    const pauseCleanupInterval = setInterval(() => {
        PauseController.cleanupAbgelaufenePausen().catch(err => {
            console.warn('Pause-Cleanup Fehler:', err.message);
        });
    }, 5 * 60 * 1000);
    logStartup('Pause-Cleanup-Job gestartet');
```

- [ ] **Step 2: Graceful-Shutdown um clearInterval ergaenzen**

Im `gracefulShutdown`-Handler (Zeile 480) nach `console.log(...)` einfuegen:

```javascript
    const gracefulShutdown = async (signal) => {
        console.log(`\n\n${signal} empfangen - starte graceful shutdown...`);
        
        // Intervals stoppen
        clearInterval(schedulerInterval);
        clearInterval(pauseCleanupInterval);
        
        // Neue Requests ablehnen
        server.close(async () => {
            // ... Rest bleibt gleich
```

- [ ] **Step 3: Signal-Handler mit process.once() statt process.on()**

Zeilen 515-516 aendern:

```javascript
    // Shutdown-Handler registrieren (once statt on, um Mehrfach-Registrierung zu verhindern)
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    
    process.once('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.js
git commit -m "fix: Graceful-Shutdown mit clearInterval und process.once()"
```

---

## Task 8: WebSocket-Heartbeat (HOCH — API)

**Files:**
- Modify: `backend/src/server.js:437-449`

- [ ] **Step 1: Heartbeat im WebSocket-Handler hinzufuegen**

In `backend/src/server.js` den WebSocket-Block (Zeilen 437-449) ersetzen:

```javascript
    wss.on('connection', (ws) => {
        logStartup('WebSocket Client connected');
        ws.isAlive = true;
        if (clientCountCallback) clientCountCallback(wss.clients.size);

        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('close', () => {
            logStartup('WebSocket Client disconnected');
            if (clientCountCallback) clientCountCallback(wss.clients.size);
        });

        ws.on('error', (error) => {
            logStartup(`WebSocket error: ${error.message}`, 'ERROR');
        });
    });

    // Heartbeat: Tote Verbindungen alle 30s aufraemen
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach(ws => {
            if (!ws.isAlive) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => clearInterval(heartbeatInterval));
```

- [ ] **Step 2: heartbeatInterval im Graceful-Shutdown aufraemen**

Im `gracefulShutdown`-Handler nach den anderen `clearInterval`-Aufrufen:

```javascript
        clearInterval(schedulerInterval);
        clearInterval(pauseCleanupInterval);
        clearInterval(heartbeatInterval);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.js
git commit -m "feat: WebSocket Heartbeat fuer Erkennung toter Verbindungen"
```

---

## Task 9: Body-Parser Limit reduzieren (MITTEL — Sicherheit)

**Files:**
- Modify: `backend/src/server.js:234-235`
- Modify: `backend/src/routes/backupRoutes.js`

- [ ] **Step 1: Standard-Limit auf 1MB reduzieren**

In `backend/src/server.js` Zeilen 234-235 aendern:

```javascript
    app.use(bodyParser.json({ limit: '1mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
```

- [ ] **Step 2: Backup-Routes erhalten eigenes hoeheres Limit**

In `backend/src/routes/backupRoutes.js` aendern:

```javascript
const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const BackupController = require('../controllers/backupController');

// Backup-Upload braucht groesseres Limit
router.use(bodyParser.json({ limit: '50mb' }));

router.get('/status', BackupController.status);
router.get('/list', BackupController.list);
router.post('/create', BackupController.create);
router.post('/restore', BackupController.restore);
router.post('/upload', BackupController.upload);
router.post('/delete', BackupController.delete);
router.get('/download/:filename', BackupController.download);

module.exports = router;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/server.js backend/src/routes/backupRoutes.js
git commit -m "security: Body-Parser Limit auf 1MB reduziert (Backup-Routes behalten 50MB)"
```

---

## Task 10: CORS korrekt konfigurieren (MITTEL — Sicherheit)

**Files:**
- Modify: `backend/src/server.js:176-205`

- [ ] **Step 1: CORS-Konfiguration absichern**

In `backend/src/server.js` den CORS-Block (Zeilen 176-205) ersetzen:

```javascript
    const corsOrigin = process.env.CORS_ORIGIN || '';
    logStartup(`CORS Origin: ${corsOrigin || '(nur localhost)'}`);

    const corsOptions = {
        origin: function (origin, callback) {
            // Requests ohne Origin erlauben (curl, Electron, mobile Apps)
            if (!origin) return callback(null, true);

            // Whitelist erstellen
            const whitelist = ['http://localhost:3000', 'http://127.0.0.1:3000'];
            
            if (corsOrigin) {
                corsOrigin.split(',').map(o => o.trim()).forEach(o => whitelist.push(o));
            }
            
            // Lokale Netzwerk-IPs erlauben (192.168.x.x, 10.x.x.x)
            if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }

            if (whitelist.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.warn(`CORS: Origin '${origin}' blockiert`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        optionsSuccessStatus: 200
    };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/server.js
git commit -m "security: CORS auf lokale Netzwerk-IPs beschraenken statt Wildcard"
```

---

## Task 11: XSS-Escaping im Frontend konsistent machen (HOCH — Sicherheit)

**Files:**
- Modify: `frontend/src/components/app.js` (mehrere Stellen)

Dieser Task erfordert eine sorgfaeltige Durchsicht der gesamten `app.js`. Die Kernregel: Jeder Wert aus der API der in `innerHTML` landet, MUSS durch `this.escapeHtml()` oder `this._escapeHtml()` gehen.

- [ ] **Step 1: showToast XSS-sicher machen**

Die `showToast`-Methode (circa Zeile 124) aendern — `message` mit `_escapeHtml` schuetzen:

```javascript
    // Im toast.innerHTML-Template:
    // Alt:  <span>${message}</span>
    // Neu:  <span>${this._escapeHtml(message)}</span>
```

- [ ] **Step 2: Alle innerHTML-Stellen mit Datenbankwerten pruefen und escapen**

Suche nach `innerHTML` in `app.js` und stelle sicher, dass alle Datenbankfelder (`kunde_name`, `kennzeichen`, `arbeit`, `name`, `telefon` etc.) durch `this._escapeHtml()` geschuetzt sind. Beispiele:

```javascript
// Alt:
kundeInfo.innerHTML = `<strong>${kunde.name}</strong>`;
// Neu:
kundeInfo.innerHTML = `<strong>${this._escapeHtml(kunde.name)}</strong>`;

// Alt:
`${t.kunde_name || 'Unbekannt'}`
// Neu:
`${this._escapeHtml(t.kunde_name || 'Unbekannt')}`
```

- [ ] **Step 3: Doppelte _escapeHtml und highlightMatch Methoden bereinigen**

Die doppelte `_escapeHtml()`-Definition (Zeile 34706) entfernen — nur eine behalten (Zeile 26935).
Die doppelte `highlightMatch()`-Definition (Zeile 12282) mit der ersten (Zeile 3381) zusammenfuehren und sicherstellen, dass der Text vor dem Regex escaped wird.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "security: XSS-Escaping konsistent auf alle innerHTML-Stellen anwenden"
```

---

## Zusammenfassung der Reihenfolge

| Task | Schwere | Thema | Geschaetzter Aufwand |
|------|---------|-------|---------------------|
| 1 | KRITISCH | Debug-Logging entfernen | 2 min |
| 2 | KRITISCH | Path-Traversal Fix | 5 min |
| 3 | KRITISCH | API-Key-Auth | 10 min |
| 4 | MITTEL | helmet Security-Headers | 3 min |
| 5 | HOCH | Rate-Limiting | 5 min |
| 6 | KRITISCH | Validierung in Routes | 10 min |
| 7 | HOCH | Graceful-Shutdown Fix | 5 min |
| 8 | HOCH | WebSocket-Heartbeat | 5 min |
| 9 | MITTEL | Body-Parser Limit | 3 min |
| 10 | MITTEL | CORS Fix | 5 min |
| 11 | HOCH | XSS-Escaping Frontend | 15 min |
