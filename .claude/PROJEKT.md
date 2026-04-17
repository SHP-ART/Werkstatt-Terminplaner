# PROJEKT.md – Werkstatt-Terminplaner

## 1. Projektname & Zweck

**Werkstatt-Terminplaner v1.6.2**

Self-hosted KFZ-Werkstatt-Management-Software für eine einzelne Werkstatt. Ersetzt klassische Papier- oder Excel-Planung durch ein netzwerkfähiges System, das mehrere PC-Arbeitsplätze gleichzeitig bedient. Kein Cloud-Backend, keine externen Abhängigkeiten im laufenden Betrieb.

**Kernfunktionen auf einen Blick:**
- Terminplanung mit Phasen (Bringszeit, Arbeit, Abholung), Split-Terminen und Echtzeit-Auslastungsanzeige
- Kunden- & Fahrzeugverwaltung inkl. Locosoft-CSV-Import
- Mitarbeiterverwaltung: Abwesenheiten, Stempelzeiten, Lehrlings-Verwaltung, Schicht-Templates
- Ersatzfahrzeug-Buchungssystem mit Verfügbarkeitsprüfung
- Teileerfassung je Termin & Bestellverwaltung
- Reporting / Auswertungen
- Wiederkehrende Terminserien
- WebSocket-basierte Live-Updates auf alle Clients
- Automatisches Backup & Restore der SQLite-Datenbank
- Optional: KI-gestützte Terminzeit-Schätzung (Ollama lokal / OpenAI)

---

## 2. Architektur-Übersicht

```
┌──────────────────────────────────────────────────┐
│                  Clients                         │
│                                                  │
│  Browser (LAN)   Electron-Desktop   Tablet-App  │
│  http://server:3001  localhost:3001  http://...  │
└────────────┬─────────────┬──────────────┬────────┘
             │  HTTP REST  │  WebSocket   │
             ▼             ▼              ▼
┌──────────────────────────────────────────────────┐
│         Node.js / Express  (Port 3001)           │
│                                                  │
│  Routes → Controllers → Models                  │
│  Middleware: helmet, cors, compression,          │
│              rate-limiter, auth, validation      │
│                                                  │
│  WebSocket-Server (ws)                           │
│   └─ broadcastEvent() bei Datenänderungen        │
│                                                  │
│  Optionale KI-Services:                          │
│   ExternalAiService → Ollama (mDNS-Discovery)   │
│                     → OpenAI API                │
└────────────────────────┬─────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │  SQLite-Datenbank│
              │  werkstatt.db    │
              │  (WAL-Modus)     │
              └──────────────────┘
                         │
              ┌──────────────────┐
              │  Migrations      │
              │  001 … 030       │
              └──────────────────┘
```

**Datenfluss Termin erstellen:**
1. Frontend-Formular → `POST /api/termine`
2. Middleware: Validierung (`express-validator`), ggf. Auth-Check
3. `TermineController.create()` → `TermineModel` → SQLite INSERT
4. Controller ruft `broadcastEvent('termin_created', {...})` auf
5. WebSocket-Server informiert alle verbundenen Clients
6. Alle Frontends aktualisieren ihre Terminansicht ohne Reload

---

## 3. Technologie-Stack

| Bereich | Technologie | Begründung |
|---|---|---|
| Backend-Runtime | Node.js (≥18) | Async I/O, breites Ökosystem, einfache Electron-Integration |
| Backend-Framework | Express 4 | Minimalistisch, bewährt, gute Middleware-Unterstützung |
| Datenbank | SQLite 3 (WAL-Modus) | Keine Server-Installation, einfaches Backup, ausreichend für Einzelwerkstatt |
| ORM / DB-Hilfe | Eigene Promise-Wrapper (dbHelper.js) | Kein ORM-Overhead, volle SQL-Kontrolle |
| Migrations | Eigenes System (`migrations/`) | Schema-Versionierung ohne externe Abhängigkeit |
| Frontend-Build | Vite 7 | Schnelle HMR, optimale Produktions-Bundles |
| Frontend-Sprache | Vanilla JS / HTML / CSS | Keine Framework-Abhängigkeit, wartungsarm |
| Desktop (optional) | Electron 39 | Kapselt Frontend+Backend als eigenständige App |
| Tablet-App | Electron 28 (ia32) | Vollbild-Darstellung auf Windows-Tablets |
| WebSocket | ws 8 | Leichtgewichtig, keine Socket.io-Abhängigkeit |
| Sicherheit | helmet, cors, express-rate-limit, express-validator | OWASP-konforme Absicherung |
| KI (optional) | OpenAI SDK + eigener Ollama-Client | Optionale Zeitschätzung, lokal oder cloud |
| KI-Discovery | mdns-js | Automatische Erkennung lokaler KI-Dienste via mDNS |
| Logging | Eigenes Startup-Logging + Datei | Diagnose ohne externe Log-Infrastruktur |
| Prozess-Manager | systemd (Linux-Produktion) | Automatischer Neustart, Logging via journald |

---

## 4. Kernkomponenten

### Backend (`backend/src/`)

#### `server.js`
Einstiegspunkt. Initialisiert Express, Middleware-Stack, alle Routen, HTTP-Server, WebSocket-Server (`wss`), Datenbank und KI-Discovery. Exportiert `startServer()`.

#### `config/database.js`
Öffnet SQLite-Verbindung, führt Migrations automatisch aus, bestimmt das Datenverzeichnis (Priorität: `DATA_DIR` env → `ELECTRON_EXE_DIR` → Linux `/var/lib/werkstatt-terminplaner` → CWD).

#### `config/version.js`
Single Source of Truth für `VERSION = '1.6.2'` und `APP_NAME`.

#### `config/constants.js`
Zentrale Enums: Termin-Status, Abwesenheits-Typen, Ersatzauto-Typen, Validierungslimits.

#### `config/schemaCompatibility.js`
Prüft nach Migrations ob das Schema mit dem erwarteten Stand übereinstimmt.

#### `routes/index.js`
Montiert alle Sub-Router unter `/api/...`, setzt Auth und Rate-Limiter für kritische Endpunkte.

#### Controller (`controllers/`)
Enthält Geschäftslogik zwischen Route und Model. Jeder Controller ist verantwortlich für eine Ressource:

| Controller | Verantwortlichkeit |
|---|---|
| `termineController.js` | CRUD Termine, Split-Termine, Auslastung, Duplikat-Check, Zeitschätzung, Papierkorb |
| `kundenController.js` | CRUD Kunden, Locosoft-CSV-Import |
| `mitarbeiterController.js` | CRUD Mitarbeiter |
| `abwesenheitenController.js` | Urlaub/Krank-Einträge |
| `arbeitszeitenController.js` | Stempelzeiten erfassen und abfragen |
| `stempelzeitenController.js` | GET /api/stempelzeiten?datum: Tagesübersicht aller Stempelzeiten, gruppiert nach Person; PUT /api/stempelzeiten/stempel: Stempel-Start oder -Ende für eine Arbeit setzen |
| `arbeitszeitenPlanController.js` | Soll-Arbeitszeiten |
| `arbeitspausenController.js` | Pausenzeitenbuchung |
| `schichtTemplateController.js` | Schicht-Vorlagen |
| `lehrlingeController.js` | Lehrlinge verwalten |
| `ersatzautosController.js` | Ersatzfahrzeuge und Buchungen |
| `teileController.js` | Teile je Termin, Bestellungen |
| `phasenController.js` | Arbeitsphasen-Definitionen |
| `backupController.js` | Backup erstellen (WAL-Checkpoint!), Restore, Liste |
| `einstellungenController.js` | App-Einstellungen lesen/schreiben |
| `tabletController.js` | Tablet-spezifische Datenaggregation |
| `tabletUpdateController.js` | Auto-Update-Registrierung und -Auslieferung |
| `reportingController.js` | Berichte und Auswertungen |
| `sucheController.js` | Globale Volltextsuche |
| `systemController.js` | Health-Check, System-Info |
| `pauseController.js` | Pausenanzeige-Status |
| `aiController.js` | KI-Zeitschätzung via externem Dienst |
| `kiPlanungController.js` | KI-gestützte Terminoptimierung |
| `wiederkehrendeTermineController.js` | Wiederkehrende Terminserien |
| `fahrzeugeController.js` | Fahrzeuge CRUD |

#### Models (`models/`)
Reine Datenbankschicht. Keine Geschäftslogik. Nutzen `dbHelper.js` für Promise-basierte Queries.

Wichtige Models:
- `termineModel.js` – Termin-Abfragen inkl. JOIN auf Kunden und Mitarbeiter; soft-delete via `geloescht_am`; Termin-Nr-Generator (`T-YYYY-NNN`)
- `kundenModel.js` – inkl. `importMultiple()` für Locosoft-Import mit Duplikat-Erkennung via normiertes Kennzeichen
- `einstellungenModel.js` – Schlüssel-Wert-Store für App-Einstellungen
- `tabletUpdateModel.js` – Speichert registrierte Tablet-App-Versionen

#### Services (`services/`)

| Service | Verantwortlichkeit |
|---|---|
| `externalAiService.js` | Abstraktionsschicht KI: wählt aktiven Dienst (Discovery > Env-URL), normalisiert Zeitschätzungs-Response |
| `kiDiscoveryService.js` | mDNS-Browser für `werkstatt-ki._tcp`-Dienste; Stale-Erkennung nach 5 Minuten |
| `ollamaService.js` | Direkte HTTP-Aufrufe an lokale Ollama-Instanz |
| `openaiService.js` | OpenAI SDK Wrapper für Zeitschätzungen |
| `localAiService.js` | **Lokales ML-Modell** (kein externer Dienst): trainiert sich täglich aus abgeschlossenen Terminen. Verwendet IQR-Ausreißerfilterung, Kategorie-Klassifikation (Inspektion/Bremsen/Motor etc.), Token-Matching auf Arbeitsbezeichnungen und `ki_zeitlern_daten`-Tabelle als dedizierte Lernquelle. Liefert Durchschnittswerte in Minuten je Arbeitstyp. |
| `backendDiscoveryService.js` | mDNS-Discovery des Backends für Electron |

#### Utils (`utils/`)

| Datei | Verantwortlichkeit |
|---|---|
| `websocket.js` | `setWebSocketServer()` + `broadcastEvent()` – zentraler Broadcast-Mechanismus |
| `dbHelper.js` | `getAsync`, `allAsync`, `runAsync` – SQLite Promise-Wrapper |
| `transaction.js` | `withTransaction()` – atomare DB-Operationen |
| `cache.js` | `SimpleCache` – In-Memory-Cache mit TTL und LRU-Eviction |
| `errors.js` | Eigene Error-Klassen |
| `pagination.js` | Pagination-Parameter parsen |
| `response.js` | Einheitliche Response-Struktur |
| `zeitBerechnung.js` | Zeit- und Dauerberechnungen |
| `asyncOperations.js` | Async-Hilfsfunktionen |

#### Middleware (`middleware/`)

| Datei | Verantwortlichkeit |
|---|---|
| `auth.js` | `requireAuth()` – API-Key-Prüfung via `x-api-key` Header (nur wenn `API_KEY` in `.env`) |
| `errorHandler.js` | Globale Fehlerbehandlung + `asyncHandler` Wrapper |
| `rateLimiter.js` | Drei Limiter: allgemein (200/min), KI (30/min), System (5/min) |
| `validation.js` | `express-validator`-basierte Eingabevalidierung |

#### Migrations (`migrations/`)
30 nummerierte Migrations (001–030). Automatisch ausgeführt beim Serverstart. Zustand wird in `schema_migrations`-Tabelle gespeichert.

Wichtige Migrations:
- `001_initial.js` – Basistabellen
- `009_performance_indizes.js` – Datenbank-Indizes
- `013_create_termine_arbeiten_table.js` – Relationale Arbeiten-Tabelle
- `019_add_pause_tracking_and_verschoben.js` – Pause-Tracking
- `029_wiederholung.js` – Wiederkehrende Termine
- `030_arbeitspausen.js` – Detaillierte Pausenzeiten

---

### Frontend (`frontend/`)

- **Build-Tool:** Vite 7, erzeugt `dist/` mit Hash-basiertem Asset-Namen
- **`src/services/api.js`:** Einziger HTTP-Client. Enthält `API_BASE_URL` (aus `CONFIG.API_URL`). Implementiert Health-Check mit Retry-Logik (Exponential Backoff, 3 Versuche, max 4s Delay).
- **`src/components/app.js`:** Monolithische Haupt-App-Klasse (`class App`). Verwaltet den gesamten Anwendungszustand (Kunden-Cache, Termine-Cache, Tab-Zustand, WebSocket-Verbindung, Fuzzy-Search-Index, Drag&Drop-Puffer). Enthält alle UI-Handler, Tab-Navigation, Formularlogik sowie WebSocket-Message-Handling (`handleWebSocketMessage` → `handleRealtimeTerminEvent` / `handleRealtimeKundenEvent`). Enthält auch Hilfslogik für Lehrlings-Berufsschulwochen-Erkennung (ISOKalenderwoche), Datumsformatierung und Toasts.
- **`src/components/migrationMonitor.js`:** Überwacht laufende Migrations und zeigt Status im Frontend an.

### Electron-Desktop (`backend/electron-main.js`)
Startet `server.js` als Child-Process, öffnet Browser-Fenster auf `localhost:3001`.

### Tablet-App (`electron-intern-tablet/`)
- Eigenständige Electron-App (v1.7.4, ia32)
- Vollbild-Darstellung der Werkstatt-Übersicht
- Auto-Update: prüft beim Start `GET /api/tablet-update/latest`, lädt neuen Installer herunter und installiert selbstständig
- Konfiguration via `config.json` (Backend-URL)

---

## 5. Abhängigkeiten & Schnittstellen

### Interne Abhängigkeiten

```
Frontend
  └─ api.js → Backend HTTP REST API (Port 3001)
  └─ WebSocket → Backend WS (Port 3001)

electron-main.js
  └─ spawnt backend/src/server.js

Tablet-App
  └─ HTTP → Backend REST API
  └─ /api/tablet-update/latest für Auto-Update

Backend
  └─ SQLite (lokal, kein Netzwerk)
  └─ Migrations (auto beim Start)
  └─ KI-Services (optional, extern)
```

### Externe Abhängigkeiten (optional)

| Dienst | Protokoll | Zweck |
|---|---|---|
| OpenAI API | HTTPS | Zeitschätzung für Arbeiten |
| Ollama (lokal/LAN) | HTTP | Lokale KI, via mDNS (`werkstatt-ki._tcp`) oder fester URL |
| Locosoft | Datei-Import (CSV) | Kunden-/Fahrzeugdaten importieren |

### Produktiv-Infrastruktur

| Komponente | Ort |
|---|---|
| Linux-Server (systemd) | SSH via Tailscale: `root@100.124.168.108` |
| App-Verzeichnis | `/opt/werkstatt-terminplaner/` |
| Datenbank | `/var/lib/werkstatt-terminplaner/database/werkstatt.db` |
| Backups | `/var/lib/werkstatt-terminplaner/backups/` |

---

## 6. Datenmodell

### Kerntabellen (SQLite)

| Tabelle | Inhalt |
|---|---|
| `termine` | Haupt-Termintabelle; FK → `kunden`, `mitarbeiter`; Felder u.a. `datum`, `uhrzeit`, `arbeit`, `status`, `mitarbeiter_id`, `kunde_id`, `kennzeichen`, `geloescht_am` (soft-delete) |
| `termine_arbeiten` | Relationale Arbeiten je Termin (seit Migration 013); Felder: `stempel_start` TEXT (HH:MM, NULL = nicht gestempelt), `stempel_ende` TEXT (HH:MM, NULL = nicht gestempelt) seit Migration 032 |
| `kunden` | Kundendaten; `locosoft_id` für Importzuordnung; `kennzeichen`, `vin`, `fahrzeugtyp` |
| `mitarbeiter` | Mitarbeiter; `aktiv` Flag |
| `lehrlinge` | Lehrlinge; eigene Arbeitszeiten-Tracks |
| `abwesenheiten` | Urlaub/Krank-Einträge je Mitarbeiter (`typ`: urlaub/krank/sonstiges) |
| `arbeitszeiten` | Stempelzeiten (Ist-Zeiten) je Mitarbeiter/Tag |
| `arbeitszeiten_plan` | Soll-Zeiten je Mitarbeiter/Wochentag |
| `schicht_templates` | Vorlage für Schichten |
| `ersatzautos` | Fahrzeuge mit Typ, Kennzeichen |
| `ersatzauto_buchungen` | Buchungen mit `von`/`bis`-Datum |
| `phasen` | Arbeitsphasen-Definitionen |
| `teile_bestellungen` | Teile je Termin, Bestellstatus |
| `einstellungen` | Key-Value-Store für App-Einstellungen |
| `tablet_einstellungen` | Tablet-spezifische Konfiguration |
| `tablet_updates` | Registrierte Installer-Versionen |
| `wiederholende_termine` | Definitionen für Terminserien |
| `arbeitspausen` | Granulare Pausen-Einträge |
| `pause_tracking` | Aktive Pausen je Mitarbeiter/Tag |
| `schema_migrations` | Migrations-Zustand |
| `automation_log` | Log für automatisierte Aktionen |

### Termin-Nummernformat
`T-YYYY-NNN` (z.B. `T-2026-042`) – generiert in `TermineModel.generateTerminNr()`.

### Termin-Status-Lifecycle
`geplant` → `in_arbeit` → `wartend` → `abgeschlossen` | `storniert`

### WebSocket-Events (broadcastEvent)
Alle Events haben Format: `{ event: string, data: any, ts: number }`

**⚠️ Wichtig – Inkonsistenz im Naming:** Die meisten Events nutzen Punkt-Notation (`termin.created`), einige ältere Stellen noch Unterstrich-Notation (`termin_updated`, `termine_updated`). Das Frontend wertet nur `termin.*` und `kunde.*` per Prefix aus – Underscore-Events werden **nicht** verarbeitet. Beim Hinzufügen neuer Events immer Punkt-Notation verwenden.

| Event | Quelle | Payload | Frontend-Reaktion |
|---|---|---|---|
| `termin.created` | `termineController` | `{ id, datum }` | Lädt Termine-Cache, Dashboard, aktiven Tab neu |
| `termin.updated` | `termineController` | `{ id, datum }` | Lädt Termine-Cache, Dashboard, aktiven Tab neu |
| `termin.deleted` | `termineController` | `{ id, datum }` | Lädt Papierkorb neu (wenn aktiv) |
| `termin.restored` | `termineController` | `{ id, datum }` | Lädt Papierkorb neu |
| `kunde.created` | `kundenController` | `{ id }` | Lädt Kunden-Liste, Dashboard neu |
| `kunde.updated` | `kundenController` | `{ id }` | Lädt Kunden-Liste, Dashboard neu |
| `kunde.deleted` | `kundenController` | `{ id }` | Lädt Kunden-Liste, Dashboard neu |
| `kunde.imported` | `kundenController` | `{ imported, skipped, fahrzeugeHinzugefuegt }` | Lädt Kunden-Liste, Dashboard neu |
| `ki_planung_done` | `kiPlanungController` | `{ jobId, type, error? }` | KI-Planung abgeschlossen |
| `operation_progress` | `asyncOperations` | `{ operationId, progress, message }` | Fortschrittsanzeige langer Operationen |
| `operation_timeout_warning` | `asyncOperations` | `{ operationId, elapsed }` | Warnung bei langen Operationen |
| `termine_updated` *(veraltet)* | `termineController` | `{ datum }` | Nicht vom Frontend verarbeitet |
| `termin_updated` *(veraltet)* | `termineController` | `{ id, datum }` | Nicht vom Frontend verarbeitet |
| `termine_batch_updated` *(veraltet)* | `termineController` | `{ count }` | Nicht vom Frontend verarbeitet |

---

## 7. Konfiguration

### Backend `.env` (Datei: `backend/.env`, Vorlage: `backend/.env.example`)

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `3001` | HTTP-Port des Servers |
| `NODE_ENV` | `development` | Umgebungsmodus |
| `CORS_ORIGIN` | `''` | Erlaubte Origins (komma-separiert), leer = nur localhost+LAN |
| `DB_PATH` | `./database/werkstatt.db` | Pfad zur SQLite-Datei |
| `DATABASE_PATH` | `./database/werkstatt.db` | Alias für DB_PATH |
| `DATA_DIR` | – | Überschreibt Datenverzeichnis (höchste Priorität) |
| `BACKUP_PATH` | `./backups` | Backup-Verzeichnis |
| `BACKUP_RETENTION_DAYS` | `30` | Aufbewahrungsdauer Backups |
| `CACHE_ENABLED` | `true` | In-Memory-Cache aktivieren |
| `CACHE_TTL_MINUTES` | `5` | Cache-Lebensdauer |
| `LOG_LEVEL` | `info` | Log-Level |
| `LOG_FILE` | `./logs/backend.log` | Log-Datei |
| `API_KEY` | – | Aktiviert Auth für destruktive Endpunkte (leer = kein Auth) |
| `OPENAI_API_KEY` | – | OpenAI API-Key für KI-Features |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI-Modell |
| `OPENAI_MAX_TOKENS` | `1000` | Max Token pro Anfrage |
| `OPENAI_TEMPERATURE` | `0.3` | Determinismus der KI-Antworten |
| `OPENAI_COST_LIMIT` | `50` | Monatliches Kostenlimit in EUR |
| `KI_EXTERNAL_URL` | – | Fallback-URL für lokalen KI-Dienst |
| `KI_EXTERNAL_TIMEOUT_MS` | `4000` | Timeout für KI-Anfragen |
| `RATE_LIMIT_ENABLED` | `false` | Rate-Limiting global aktivieren |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-Limit Zeitfenster |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max Anfragen pro Zeitfenster |

### Frontend-Konfiguration
`frontend/src/services/api.js` enthält `CONFIG.API_URL` (zentrale Backend-URL). Bei Netzwerk-Einsatz anpassen.

### Tablet-App-Konfiguration
`electron-intern-tablet/config.json` – enthält Backend-URL.

### Systemd-Unit (Linux-Produktion)
Setzt `DATA_DIR=/var/lib/werkstatt-terminplaner` damit die Datenbank im persistenten Pfad liegt.

---

## 8. Bekannte Grenzen & offene Punkte

- **Keine automatisierten Tests für Kernfunktionen** – Jest-Setup vorhanden, aber Coverage gering
- **Kein Authentifizierungs-System für Benutzer** – API-Key ist nur für destruktive Endpunkte, kein Login
- **Single-DB-Writer-Problem** – SQLite WAL erlaubt mehrere Leser, aber bei hoher paralleler Schreiblast könnte es zu Locks kommen
- **Frontend ist Vanilla JS-Monolith** – `app.js` enthält die gesamte UI-Logik in einer einzelnen Klasse; keine Typsicherheit, keine Komponentenbibliothek
- **WebSocket-Event-Naming-Inkonsistenz** – manche Events nutzen Punkt- (`termin.created`), andere Unterstrich-Notation (`termin_updated`). Underscore-Events werden vom Frontend nicht ausgewertet. Sollte vereinheitlicht werden.
- **Lokales KI-Modell (localAiService) benötigt Anlaufzeit** – Schätzungen werden erst nach ausreichend vielen abgeschlossenen Terminen verlässlich (< 3 Samples: keine Ausreißerfilterung). Training läuft täglich, Cache wird in-memory gehalten.
- **mDNS-Discovery funktioniert nicht in allen Netzwerkkonfigurationen** (z.B. VLANs, streng isolierte Segmente)
- **Tablet-App nur für Windows (ia32)** – kein macOS/Linux-Support
- **Backup-Restore unterbricht laufende Verbindungen** – kein Zero-Downtime-Restore
- **`auslastungRoutes.js` hat keinen eigenen Controller** – delegiert direkt an `TermineController.getAuslastung()`. Kein eigener `auslastungController.js` vorhanden.
