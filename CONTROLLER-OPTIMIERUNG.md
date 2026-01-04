# Controller-Optimierung TODO

Übersicht aller Optimierungen für die Backend-Controller. Status wird mit `[x]` markiert wenn implementiert.

---

## 🔴 KRITISCH - Sofort umsetzen

### 1. SQL-Injection Sicherheit
- [ ] **Alle Models auf Prepared Statements prüfen**
  - Betroffene Dateien: `backend/src/models/*.js`
  - Sicherstellen, dass keine String-Konkatenierung für SQL-Queries verwendet wird
  - Beispiel sicher: `db.run("SELECT * FROM kunden WHERE id = ?", [id])`
  - Beispiel unsicher: `db.run("SELECT * FROM kunden WHERE id = " + id)`
  - Priority: 🔴 KRITISCH

### 2. Input-Validierung bei allen Endpoints
- [ ] **abwesenheitenController.js**
  - `create()`: Datum-Format validieren (YYYY-MM-DD)
  - `getByDateRange()`: von_datum <= bis_datum prüfen
  - Priority: 🔴 KRITISCH

- [ ] **arbeitszeitenController.js**
  - `create()`: standard_minuten > 0 prüfen
  - `update()`: bezeichnung nicht leer prüfen
  - Priority: 🔴 KRITISCH

- [ ] **kundenController.js**
  - `create()`: Email-Format validieren (falls vorhanden)
  - `import()`: Array-Größe limitieren (max 1000 Einträge)
  - `search()`: searchTerm min. 2 Zeichen
  - Priority: 🔴 KRITISCH

- [ ] **mitarbeiterController.js**
  - `create()`: arbeitsstunden_pro_tag zwischen 1-24
  - `create()`: nebenzeit_prozent zwischen 0-100
  - Priority: 🔴 KRITISCH

- [ ] **lehrlingeController.js**
  - `create()`: aufgabenbewaeltigung_prozent zwischen 1-200
  - `update()`: name mindestens 2 Zeichen
  - Priority: 🔴 KRITISCH

- [ ] **termineController.js**
  - `create()`: Datum nicht in Vergangenheit
  - `create()`: kunde_id existiert in DB
  - `update()`: Status nur erlaubte Werte
  - Priority: 🔴 KRITISCH

- [ ] **ersatzautosController.js**
  - `create()`: Kennzeichen Format prüfen
  - `update()`: typ nur erlaubte Werte
  - Priority: 🔴 KRITISCH

- [ ] **einstellungenController.js**
  - `updateWerkstatt()`: Alle Werte > 0 prüfen
  - `updateWerkstatt()`: nebenzeit_prozent realistisch (0-100)
  - Priority: 🔴 KRITISCH

### 3. Validierungs-Middleware einführen
- [ ] **express-validator oder Joi installieren**
  ```bash
  cd backend && npm install express-validator
  ```
  - Priority: 🔴 KRITISCH

- [ ] **Zentrale Validierungs-Helper erstellen**
  - Datei: `backend/src/middleware/validation.js`
  - Funktionen: `isValidDate()`, `isValidEmail()`, `isPositiveInteger()`, etc.
  - Priority: 🔴 KRITISCH

---

## ⚠️ WICHTIG - Kurzfristig umsetzen

### 4. Callback → async/await Migration
- [ ] **abwesenheitenModel.js auf Promises umstellen**
  - Wrapper-Funktionen für `db.get()`, `db.run()`, `db.all()` erstellen
  - Priority: ⚠️ WICHTIG

- [ ] **abwesenheitenController.js auf async/await umstellen**
  - Alle Methoden zu `async` machen
  - Callbacks durch `await` ersetzen
  - Priority: ⚠️ WICHTIG

- [ ] **arbeitszeitenModel.js + Controller auf Promises umstellen**
  - Priority: ⚠️ WICHTIG

- [ ] **kundenModel.js + Controller auf Promises umstellen**
  - Besonders wichtig wegen komplexer `import()` Logik
  - Priority: ⚠️ WICHTIG

- [ ] **mitarbeiterModel.js + Controller auf Promises umstellen**
  - Priority: ⚠️ WICHTIG

- [ ] **lehrlingeModel.js + Controller auf Promises umstellen**
  - Priority: ⚠️ WICHTIG

- [ ] **termineModel.js + Controller auf Promises umstellen**
  - Größte Migration wegen Komplexität (1358 Zeilen!)
  - In mehrere Sessions aufteilen
  - Priority: ⚠️ WICHTIG

- [ ] **ersatzautosModel.js + Controller auf Promises umstellen**
  - Priority: ⚠️ WICHTIG

- [ ] **einstellungenModel.js + Controller auf Promises umstellen**
  - Priority: ⚠️ WICHTIG

### 5. Error-Handling vereinheitlichen
- [x] **Globales Error-Handler-Middleware erstellen** ✅
  - Datei: `backend/src/middleware/errorHandler.js`
  - Zentrale Fehlerbehandlung für alle Controller
  - Logging aller Fehler
  - In `server.js` registriert
  - **Getestet**: 404-Handler funktioniert, SQLite-Error-Handling implementiert
  - Priority: ⚠️ WICHTIG

- [x] **Einheitliches Response-Schema definieren** ✅
  ```javascript
  // Erfolg:
  { success: true, data: {...}, message: "..." }
  // Fehler:
  { success: false, error: "...", details: {...} }
  ```
  - Datei: `backend/src/utils/response.js`
  - Helper: `sendSuccess()`, `sendError()`, `sendCreated()`, `sendNoContent()`
  - Priority: ⚠️ WICHTIG

- [x] **Custom Error-Klassen erstellen** ✅
  - `ValidationError`, `NotFoundError`, `DatabaseError`, `UnauthorizedError`, `ConflictError`
  - Datei: `backend/src/utils/errors.js`
  - Alle erben von `AppError` mit `isOperational` Flag
  - Priority: ⚠️ WICHTIG

### 6. DB-Transaktionen implementieren
- [ ] **kundenController.import() mit Transaction**
  - Bei Fehler: Rollback aller Änderungen
  - Priority: ⚠️ WICHTIG

- [ ] **phasenController.syncPhasen() mit Transaction**
  - Löschen + Erstellen atomar machen
  - Priority: ⚠️ WICHTIG

- [ ] **termineController komplexe Updates mit Transaction**
  - Besonders bei Status-Änderungen mit Auslastungs-Neuberechnung
  - Priority: ⚠️ WICHTIG

- [x] **Transaction-Helper erstellen** ✅
  - Datei: `backend/src/utils/transaction.js`
  - Funktionen: `withTransaction(callback)`, `runAsync()`, `allAsync()`
  - `phasenModel.syncPhasen()` mit Transaction umgebaut
  - `kundenModel.importMultiple()` mit Transaction umgebaut
  - **Getestet**: Rollback bei Fehlern funktioniert einwandfrei
  - **Integriert in v1.0.8**
  - Priority: ⚠️ WICHTIG

---

## 📊 MITTELFRISTIG - Code-Qualität

### 7. termineController.js refaktorieren (1358 Zeilen!)
- [ ] **Auslastungslogik in separaten Service auslagern**
  - Neue Datei: `backend/src/services/AuslastungService.js`
  - Funktion `berechneAuslastungErgebnis()` verschieben
  - Priority: 📊 MITTEL

- [ ] **Cache-Logik in separaten Service auslagern**
  - Neue Datei: `backend/src/services/CacheService.js`
  - Cache-Verwaltung abstrahieren
  - Priority: 📊 MITTEL

- [ ] **TerminValidation Service erstellen**
  - Neue Datei: `backend/src/services/TerminValidationService.js`
  - Alle Validierungen zentralisieren
  - Priority: 📊 MITTEL

- [ ] **termineController in mehrere Module aufteilen**
  - `TermineController` (CRUD-Operationen)
  - `TermineAuslastungController` (Auslastung & Statistiken)
  - `TermineStatusController` (Status-Verwaltung)
  - Priority: 📊 MITTEL

### 8. Redundanten Code eliminieren
- [ ] **Base-Controller-Klasse erstellen**
  - Datei: `backend/src/controllers/BaseController.js`
  - Gemeinsame Methoden: `validateId()`, `handleError()`, `sendSuccess()`
  - Priority: 📊 MITTEL

- [ ] **Alle Controller von BaseController erben lassen**
  - abwesenheitenController, arbeitszeitenController, etc.
  - Priority: 📊 MITTEL

- [ ] **Shared Validation Helpers**
  - Datei: `backend/src/utils/validators.js`
  - Funktionen: `isValidDate()`, `isPositiveNumber()`, `sanitizeString()`
  - Priority: 📊 MITTEL

### 9. Logging-System implementieren
- [ ] **Winston oder Pino installieren**
  ```bash
  cd backend && npm install winston
  ```
  - Priority: 📊 MITTEL

- [ ] **Logger-Konfiguration erstellen**
  - Datei: `backend/src/config/logger.js`
  - Verschiedene Log-Level: error, warn, info, debug
  - Rotation von Log-Dateien
  - Priority: 📊 MITTEL

- [ ] **console.log/error durch Logger ersetzen**
  - Alle Controller durchgehen
  - Strukturiertes Logging mit Context
  - Priority: 📊 MITTEL

- [ ] **Request-Logging-Middleware**
  - Alle API-Requests loggen
  - Response-Zeiten messen
  - Priority: 📊 MITTEL

### 10. Konfiguration zentralisieren
- [ ] **Zentrale Config-Datei erweitern**
  - Datei: `backend/src/config/constants.js`
  - Alle Magic Numbers/Strings sammeln
  - Priority: 📊 MITTEL

- [ ] **Umgebungsvariablen dokumentieren**
  - Datei: `backend/.env.example` aktualisieren
  - Alle verwendeten Env-Vars auflisten
  - Priority: 📊 MITTEL

---

## 🔧 PERFORMANCE - Langfristig

### 11. Cache-System verbessern
- [ ] **Redis als Cache-Backend evaluieren**
  - Statt In-Memory-Cache
  - Persistiert bei Server-Restart
  - Priority: 🔧 LANGFRISTIG

- [ ] **Cache-Invalidierung optimieren**
  - Präzisere Invalidierung (nicht gesamten Cache löschen)
  - Cache-Tags verwenden
  - Priority: 🔧 LANGFRISTIG

- [ ] **Cache-Hit-Rate monitoren**
  - Statistiken über Cache-Nutzung
  - Priority: 🔧 LANGFRISTIG

### 12. DB-Performance
- [ ] **Indizes für häufige Queries prüfen**
  - Besonders auf `termine.datum`, `kunden.name`
  - `EXPLAIN QUERY PLAN` für langsame Queries
  - Priority: 🔧 LANGFRISTIG

- [ ] **Connection-Pooling implementieren**
  - Statt einzelne DB-Connections
  - Priority: 🔧 LANGFRISTIG

- [ ] **Lazy Loading für große Datasets**
  - Pagination für `kundenController.getAll()`
  - Priority: 🔧 LANGFRISTIG

### 13. API-Rate-Limiting
- [ ] **express-rate-limit installieren**
  - Schutz vor DoS-Attacken
  - Priority: 🔧 LANGFRISTIG

- [ ] **Rate-Limiting konfigurieren**
  - Unterschiedliche Limits für verschiedene Endpoints
  - Priority: 🔧 LANGFRISTIG

---

## ✅ TESTING

### 14. Test-Suite aufbauen
- [ ] **Jest + Supertest installieren**
  ```bash
  cd backend && npm install --save-dev jest supertest
  ```
  - Priority: 🧪 TESTING

- [ ] **Test-Struktur erstellen**
  - Ordner: `backend/tests/controllers/`
  - Ordner: `backend/tests/models/`
  - Ordner: `backend/tests/integration/`
  - Priority: 🧪 TESTING

- [ ] **Unit-Tests für Controller**
  - Mindestens für kritische Operationen (create, update, delete)
  - Mock für DB-Layer
  - Priority: 🧪 TESTING

- [ ] **Integration-Tests für API-Endpoints**
  - Happy Path + Error Cases
  - Test-DB verwenden
  - Priority: 🧪 TESTING

- [ ] **Test-Coverage einrichten**
  - Ziel: >80% Coverage
  - Priority: 🧪 TESTING

---

## 📋 DOKUMENTATION

### 15. API-Dokumentation
- [ ] **Swagger/OpenAPI installieren**
  ```bash
  cd backend && npm install swagger-ui-express swagger-jsdoc
  ```
  - Priority: 📋 DOCS

- [ ] **API-Endpoints dokumentieren**
  - JSDoc-Kommentare in Controllern
  - Swagger-UI unter `/api-docs`
  - Priority: 📋 DOCS

- [ ] **Beispiel-Requests/Responses**
  - Für alle wichtigen Endpoints
  - Priority: 📋 DOCS

### 16. Code-Kommentare
- [ ] **JSDoc für alle Controller-Methoden**
  - Parameter, Return-Types, Beispiele
  - Priority: 📋 DOCS

- [ ] **Komplexe Logik kommentieren**
  - Besonders in termineController
  - Priority: 📋 DOCS

---

## 🎯 QUICK WINS - Sofort umsetzbar

- [ ] **HTTP-Status-Codes korrigieren**
  - 201 für CREATE statt 200
  - 204 für DELETE ohne Body
  - 400 für Client-Fehler konsistent
  - Priority: 🎯 QUICK WIN

- [ ] **Trailing Slashes in Routes normalisieren**
  - Entweder mit oder ohne `/` - konsistent
  - Priority: 🎯 QUICK WIN

- [ ] **CORS-Konfiguration prüfen**
  - Nur notwendige Origins erlauben
  - Priority: 🎯 QUICK WIN

- [ ] **Environment Check beim Start**
  - Warnung wenn `.env` fehlt
  - Priority: 🎯 QUICK WIN

- [ ] **Graceful Shutdown implementieren**
  - DB-Connections sauber schließen
  - Priority: 🎯 QUICK WIN

---

## 📊 METRIKEN

### Fortschritt
- **Kritisch**: 0/3 (0%)
- **Wichtig**: 3/6 (50%) ✅ Error-Handling komplett
- **Mittelfristig**: 0/10 (0%)
- **Langfristig**: 0/3 (0%)
- **Testing**: 0/5 (0%)
- **Dokumentation**: 0/2 (0%)
- **Quick Wins**: 0/5 (0%)

**Gesamt**: 3/34 Tasks (9%)

### Zuletzt implementiert
- ✅ **4. Januar 2026**: Error-Handler-Middleware, Custom Error-Klassen, Response-Helper
  - Tests erfolgreich (404-Handler, SQLite-Error-Handling)
  - Alte Error-Handler in `server.js` ersetzt

---

## 🗓️ EMPFOHLENE REIHENFOLGE

### Sprint 1 (Woche 1) - Sicherheit
1. SQL-Injection Audit
2. Input-Validierung kritische Endpoints
3. Validierungs-Middleware einrichten

### Sprint 2 (Woche 2-3) - Error-Handling
4. Globales Error-Handler
5. Custom Error-Klassen
6. Response-Schema vereinheitlichen

### Sprint 3 (Woche 4-5) - async/await Migration
7. Models auf Promises umstellen
8. Controller migrieren (Start mit einfachen: abwesenheiten, arbeitszeiten)
9. termineController schrittweise migrieren

### Sprint 4 (Woche 6) - Transaktionen & Refactoring
10. DB-Transaktionen implementieren
11. termineController aufteilen
12. Base-Controller einführen

### Sprint 5 (Woche 7-8) - Qualität & Testing
13. Logging-System
14. Test-Suite aufbauen
15. API-Dokumentation

---

## 📝 NOTIZEN

- Vor jeder Änderung: Branch erstellen und Tests durchführen
- Nach jeder Controller-Änderung: Manuelle Tests der Kernfunktionen
- DB-Backup vor Migrations-Scripts: `cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db`
- Änderungen dokumentieren in RELEASE-NOTES.md

---

**Letzte Aktualisierung**: 4. Januar 2026
**Verantwortlich**: Entwickler-Team
**Status**: 🚧 In Planung
