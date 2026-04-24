# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Vollständige Projektdokumentation: siehe [.claude/PROJEKT.md](.claude/PROJEKT.md)

---

## 0. Wichtige Befehle

```bash
# Backend (Dev-Server mit Auto-Reload, Port 3001)
cd backend && npm run dev

# Backend (nur Node, kein Electron)
cd backend && npm run server

# Frontend (Vite Dev-Server, Port 5173)
cd frontend && npm run dev

# Frontend Production-Build (erzeugt neue Hash-Dateinamen in dist/assets/)
cd frontend && npm run build

# Alle Tests
cd backend && npm test

# Nur Regressionstests (tests/bugs/)
cd backend && npm run test:bugs

# Einzelne Testdatei (Substring des Dateinamens genügt)
cd backend && npm test -- termine-crud
cd backend && npm test -- auth
```

Die App-Version wird an **einer einzigen Stelle** gepflegt: `backend/src/config/version.js`.

---

## 1. Projektkontext

Werkstatt-Terminplaner ist eine **Self-hosted KFZ-Werkstatt-Management-Software** (v1.6.2).
Backend: Node.js/Express (Port 3001) + SQLite. Frontend: Vite-Build (Vanilla JS).
Betrieb primär als **systemd-Dienst auf Linux**, optional als Electron-Desktop-App.
Mehrere Browser-Clients im LAN greifen gleichzeitig auf eine zentrale SQLite-Datenbank zu.
Kein Cloud-Backend; alle Daten bleiben lokal. Tablet-App ist eine separate Electron-App (ia32/Windows).

---

## 1. Projektkontext

Werkstatt-Terminplaner ist eine **Self-hosted KFZ-Werkstatt-Management-Software** (v1.6.2).
Backend: Node.js/Express (Port 3001) + SQLite. Frontend: Vite-Build (Vanilla JS).
Betrieb primär als **systemd-Dienst auf Linux**, optional als Electron-Desktop-App.
Mehrere Browser-Clients im LAN greifen gleichzeitig auf eine zentrale SQLite-Datenbank zu.
Kein Cloud-Backend; alle Daten bleiben lokal. Tablet-App ist eine separate Electron-App (ia32/Windows).

---

## 2. Kritische Abhängigkeiten

Diese Regeln dürfen **niemals gebrochen** werden:

| Regel | Begründung |
|---|---|
| **`broadcastEvent()` ist der einzige Weg für WebSocket-Nachrichten** | Direktes `ws.send()` im Controller unterbricht die einheitliche Event-Struktur und lässt Clients desynchronisieren |
| **`API_BASE_URL` immer aus `api.js` ziehen** | Port 3001 niemals im Frontend hardcoden – der Port ist via `.env` konfigurierbar |
| **Vor jedem Restore: DB-Backup** | Restore ist destruktiv und nicht rückgängig zu machen |
| **Migrations nur via `migrations/`-System** | Direkte Schema-Änderungen at Runtime zerstören den Migrations-Zustand |
| **Termin-Status-Lifecycle einhalten** | `geplant → in_arbeit → wartend → abgeschlossen/storniert` – Status rückwärts setzen kann Frontend-Anzeigen korrupieren |
| **WAL-Checkpoint vor jedem Backup** | Ohne `PRAGMA wal_checkpoint(TRUNCATE)` fehlen Daten im Backup |
| **`DATA_DIR` in systemd setzen** | Ohne diese Variable sucht der Server die DB im falschen Verzeichnis |

---

## 3. Coding-Konventionen

### Allgemein
- **CommonJS** (`require` / `module.exports`) im gesamten Backend – kein ES-Modules-Mix
- **2 Leerzeichen** Einrückung, **Semikolons** beibehalten
- **`async/await`** statt Promise-Chains oder Callbacks
- Funktionen klein halten – ein Controller-Handler = eine Verantwortlichkeit

### Namensgebung
- Routen-Dateien: `<ressource>Routes.js` (z.B. `termineRoutes.js`)
- Controller-Dateien: `<ressource>Controller.js`
- Model-Dateien: `<ressource>Model.js`
- Migration-Dateien: `NNN_beschreibung.js` (dreistellige Nummer)
- API-Endpunkte: Kleinbuchstaben, Bindestriche (`/api/arbeitszeiten-plan`)

### Architektur-Muster
- **Route → Controller → Model** – keine DB-Zugriffe in Routen oder direkt im Request-Handler
- **Model = nur DB** – keine Geschäftslogik in Models
- **Controller = Geschäftslogik** – liest aus Model, schreibt Response, sendet WebSocket-Event
- Alle DB-Queries über `dbHelper.js` (`getAsync`, `allAsync`, `runAsync`) – nie rohen `db.get/all/run` in Controllers
- Transactions via `withTransaction()` aus `utils/transaction.js`
- Caching via `SimpleCache` aus `utils/cache.js` – TTL immer explizit setzen

### Fehlerbehandlung
- Controller-Handler immer in `asyncHandler()` wickeln (Middleware in `errorHandler.js`)
- Eigene Fehlerwürfe über Error-Klassen aus `utils/errors.js`
- Bei unerwarteten Fehlern: HTTP 500 + aussagekräftige Meldung im Log

### WebSocket
```js
// RICHTIG – Punkt-Notation, via broadcastEvent:
const { broadcastEvent } = require('../utils/websocket');
broadcastEvent('termin.created', { id: termin.id });

// FALSCH – Underscore-Notation (Frontend verarbeitet diese nicht):
broadcastEvent('termin_created', { id: termin.id });

// FALSCH – direktes ws.send():
wss.clients.forEach(c => c.send(...));
```

### Neue API-Route anlegen
1. `backend/src/routes/<name>Routes.js` erstellen
2. In `backend/src/routes/index.js` mounten: `router.use('/name', nameRoutes)`
3. Controller in `backend/src/controllers/<name>Controller.js`
4. Model in `backend/src/models/<name>Model.js` (falls nötig)
5. CLAUDE.md → Abschnitt 9 "Routen & Services" aktualisieren
6. `.claude/PROJEKT.md` → Abschnitt 4 "Kernkomponenten" ergänzen

### Rate-Limiter für neue Routen
Jede neue Route bekommt den passenden Limiter aus `middleware/rateLimiter.js`:
| Limiter | Limit | Wann verwenden |
|---|---|---|
| `generalLimiter` | 200/min | Standard-CRUD, Leseanfragen |
| `aiLimiter` | 30/min | KI-Schätzungen, teure Berechnungen |
| `systemLimiter` | 5/min | Backup, Restore, destruktive Aktionen |

Destruktive/sicherheitsrelevante Routen zusätzlich mit `requireAuth` aus `middleware/auth.js` schützen (prüft `x-api-key`-Header gegen `process.env.API_KEY`; im Dev-Modus ohne gesetztem `API_KEY` erlaubt).

---

## 4. Häufige Fallstricke

### Datenbank-Pfad
Das Datenverzeichnis wird dynamisch bestimmt – **niemals** `./database/werkstatt.db` hardcoden.
Immer `dataDir` aus `config/database.js` verwenden:
```js
const { dataDir } = require('../config/database');
const backupDir = path.join(dataDir, 'backups');
```

### Frontend-Build
Nach Frontend-Änderungen muss `npm run build` ausgeführt werden – Vite generiert **neue Hash-Namen** für JS/CSS.
Beim Deployment auf den Server müssen die neuen Dateinamen in den SCP-Befehlen angepasst werden.

### SQLite WAL-Modus
Die Datenbank läuft im WAL-Modus. Das bedeutet:
- `.db-wal` und `.db-shm` Dateien existieren neben der `.db`
- Backup = WAL-Checkpoint + Datei kopieren (nie nur roh kopieren)
- Restore = WAL/SHM-Dateien löschen + neue DB einspielen

### Migrations-Nummerierung
Migration-Dateien müssen eindeutige Nummern haben. Lücken sind OK, aber **doppelte Nummern** führen zu Konflikten. Immer den höchsten vorhandenen Stand prüfen (aktuell: 034).

### KI-Verfügbarkeit
`externalAiService.js` gibt `null` zurück wenn kein KI-Dienst verfügbar ist – alle Aufrufer müssen das abfangen. KI-Features sind immer optional, nie für den Kernbetrieb erforderlich.

### CORS im LAN
Wenn ein Browser-Client von einem anderen Host zugreift als `localhost`, muss die IP in `CORS_ORIGIN` eingetragen sein. Fehlendes CORS führt zu stillen Frontend-Fehlern.

### Termin-Nummer-Kollisionen
`TermineModel.generateTerminNr()` hat einen `retryOffset`-Parameter für Race-Conditions bei gleichzeitigen Inserts. Bei häufigen parallelen Terminen darauf achten.

### WebSocket-Event-Naming-Inkonsistenz
Neue Events **immer** in Punkt-Notation benennen: `termin.created`, `kunde.updated`.
Das Frontend (`handleWebSocketMessage`) wertet nur `termin.*` und `kunde.*` per Prefix aus.
Underscore-Events (`termin_updated`, `termine_updated`) werden **nicht** verarbeitet – sie existieren nur noch aus altem Code.

### localAiService ist kein externer Dienst
`localAiService.js` ruft kein API auf. Es ist ein **lokales ML-Modell**, das sich aus der SQLite-DB trainiert:
- Täglich, aus abgeschlossenen Terminen (`status = 'abgeschlossen'`)
- IQR-Ausreißerfilterung (< 3 Samples = kein Filtern)
- Liefert Durchschnittswerte in Minuten je Arbeitsbezeichnung
- Separate Lerndaten in `ki_zeitlern_daten`-Tabelle (höhere Qualität)

### Tablet-App Auto-Update
Das Update-System funktioniert nur wenn:
1. Die Version in `package.json` erhöht wurde
2. Das Update via `POST /api/tablet-update/register` registriert wurde
3. Der Installer-Pfad auf dem Server korrekt ist

### Tab-Verlust in index.html (wiederkehrendes Problem!)
`frontend/index.html` ist sehr groß. Bei umfangreichen Commits werden Tab-Einträge gelegentlich versehentlich entfernt.
**Pflicht vor jedem Commit der `index.html` enthält:**
```bash
# Prüfe dass alle kritischen Tabs noch vorhanden sind:
grep -c "data-tab=" frontend/index.html
```
Folgende Tabs müssen **immer** vorhanden sein (Button in Nav + `<div id="...">` + `<template>`):
`dashboard`, `heute`, `termine`, `kalender`, `kunden`, `zeitverwaltung`, `zeitstempelung`, `auslastung`, `intern`, `papierkorb`, `einstellungen`

Schnellprüfung aller Tabs auf einmal:
```powershell
foreach ($tab in @("dashboard","heute","termine","kalender","kunden","zeitverwaltung","zeitstempelung","auslastung","intern","papierkorb","einstellungen")) {
  if (!(Select-String -Path "frontend/index.html" -Pattern "data-tab=`"$tab`"" -Quiet)) {
    Write-Host "FEHLT: $tab" -ForegroundColor Red
  }
}
```

---

## 5. Build & Deploy

### Entwicklung (lokal)
```bash
# Backend starten (Port 3001)
cd backend && npm run dev

# Frontend Dev-Server (Port 5173)
cd frontend && npm run dev
```

### Produktions-Build
```powershell
# Frontend bauen
cd frontend ; npm run build ; cd ..
```

### Deploy auf Produktivserver
```powershell
# 1. Frontend bauen
cd frontend ; npm run build ; cd ..

# 2. Git push
git add -A ; git commit -m "Beschreibung" ; git push

# 3. DB-Backup auf Server erstellen (IMMER zuerst!)
ssh root@100.124.168.108 "cp /var/lib/werkstatt-terminplaner/database/werkstatt.db /var/lib/werkstatt-terminplaner/backups/pre-update_$(date +%Y%m%d_%H%M%S).db && echo BACKUP_OK"

# 4. Frontend-Assets hochladen (Dateinamen aus dist/assets/ anpassen!)
scp "frontend\dist\assets\main-XXXXXXXX.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\assets\main-XXXXXXXX.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/

# 5. Backend aktualisieren und neu starten
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git stash && git pull && systemctl restart werkstatt-terminplaner && echo DEPLOY_OK"
```

### Server-Status prüfen
```powershell
ssh root@100.124.168.108 "systemctl is-active werkstatt-terminplaner"
ssh root@100.124.168.108 "journalctl -u werkstatt-terminplaner -n 50"
```

### Tablet-App aktualisieren
```powershell
# 1. Version in electron-intern-tablet\package.json erhöhen

# 2. Build
cd electron-intern-tablet ; npm run build ; cd ..

# 3. Installer ins korrekte Verzeichnis hochladen (WICHTIG: direkt ins tablet-updates Verzeichnis!)
scp "electron-intern-tablet\dist\Werkstatt-Intern-Setup-X.X.X-ia32.exe" root@100.124.168.108:/opt/werkstatt-terminplaner/backend/tablet-updates/

# 4. Update registrieren (API-Key aus /etc/werkstatt-terminplaner/.env)
# Der Endpunkt POST /api/tablet-update/register braucht x-api-key Header.
# Einfachste Methode: Node-Skript lokal erstellen, hochladen, ausführen:
@'
const http = require('http');
const body = JSON.stringify({
  version: 'X.X.X',
  filePath: '/opt/werkstatt-terminplaner/backend/tablet-updates/Werkstatt-Intern-Setup-X.X.X-ia32.exe',
  releaseNotes: 'Beschreibung'
});
const req = http.request({
  hostname: 'localhost', port: 3001,
  path: '/api/tablet-update/register', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': 'API_KEY_HIER', 'Content-Length': Buffer.byteLength(body) }
}, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ console.log(d); process.exit(0); }); });
req.write(body); req.end();
'@ | Set-Content _reg.js
scp _reg.js root@100.124.168.108:/tmp/reg.js
ssh root@100.124.168.108 "node /tmp/reg.js ; rm /tmp/reg.js"
Remove-Item _reg.js
```

**Wichtige Hinweise zum Tablet-Update:**
- Installer **muss** in `/opt/werkstatt-terminplaner/backend/tablet-updates/` liegen — andere Pfade werden vom Backend abgelehnt (`Ungültiger Dateipfad`)
- API-Key steht in `/etc/werkstatt-terminplaner/.env` (Zeile `API_KEY=...`)
- `curl` mit mehreren `-H` Flags funktioniert via SSH nicht zuverlässig wegen Shell-Quoting — Node-Skript-Methode (oben) ist die robuste Alternative
- `filePath` im JSON muss der absolute Pfad auf dem Server sein, **nicht** `/opt/werkstatt-upload/`

### Umgebungsvariablen Produktion
Kritische `.env`-Variablen auf dem Server:
```
PORT=3001
DATA_DIR=/var/lib/werkstatt-terminplaner
NODE_ENV=production
CORS_ORIGIN=http://192.168.x.x:3001   # LAN-IP(s) der Clients
API_KEY=<sicherer-zufalls-key>         # Auth für Backup/Restore
BACKUP_PATH=/var/lib/werkstatt-terminplaner/backups
```

---

## 6. Test-Strategie

### Manuelle Kernpfade (nach jeder Änderung prüfen)
1. Kunden anlegen und bearbeiten
2. Termin erstellen, Status wechseln, löschen / wiederherstellen
3. Auslastungsansicht für ein Datum laden
4. WebSocket: Termin in Tab A anlegen → Tab B aktualisiert sich?
5. Backup erstellen und in der Liste sehen

### Automatisierte Tests
- Jest + Supertest: `cd backend && npm test`
- Tests liegen in `backend/tests/` (`.test.js`-Suffix)
- Aktuell geringe Coverage – neue Features sollten Tests bekommen

### Diagnosewerkzeuge im Repo
Für Datenbankprobleme liegen diverse Diagnose-Skripte direkt im `backend/`-Verzeichnis:
- `check-tables.js`, `check-prod-db.js` – Schema/Daten prüfen
- `diagnose-schema.js` – Schema-Kompatibilität prüfen
- `diagnose-backup-datenverlust.js` – Backup-Integrität prüfen

---

## 7. Änderungsprotokoll-Anweisung

**Bei JEDER Code-Änderung:**

1. Prüfe ob `.claude/PROJEKT.md` aktuell ist:
   - Neue Routen/Controller/Services → Tabellen in Abschnitt 4 ergänzen
   - Neue DB-Tabellen → Abschnitt 6 "Datenmodell" aktualisieren
   - Neue Konfigurationsparameter → Abschnitt 7 "Konfiguration" aktualisieren
   - Neue externe Abhängigkeiten → Abschnitt 5 "Abhängigkeiten" ergänzen

2. Prüfe ob CLAUDE.md aktuell ist:
   - Neue Routen-Dateien → Abschnitt 8 "Routen & Services" aktualisieren
   - Neue Fallstricke entdeckt → Abschnitt 4 ergänzen
   - Neue kritische Abhängigkeiten → Tabelle in Abschnitt 2 ergänzen
   - Neue "Do NOT"-Regeln → Abschnitt 12 ergänzen

---

## 9. Routen & Services (Kurzübersicht)

Vollständige Beschreibungen in [.claude/PROJEKT.md](.claude/PROJEKT.md) Abschnitt 4.

### Backend-Routen (`backend/src/routes/`)

| Datei | Zuständigkeit |
|---|---|
| `termineRoutes.js` | Termine CRUD, Split-Termine, Phasen-Zuordnung |
| `phasenRoutes.js` | Arbeits-Phasen verwalten |
| `auslastungRoutes.js` | Auslastungsberechnung (→ AuslastungController) |
| `kundenRoutes.js` | Kunden CRUD, Locosoft-Import |
| `fahrzeuge.js` | Fahrzeuge CRUD |
| `mitarbeiterRoutes.js` | Mitarbeiter CRUD |
| `abwesenheitenRoutes.js` | Abwesenheiten (Urlaub, Krank, …) |
| `arbeitszeitenRoutes.js` | Stempelzeiten, Ist-Zeiten |
| `arbeitszeitenPlanRoutes.js` | Soll-Arbeitszeiten Planung |
| `arbeitspausen.js` | Pausenzeitenbuchung |
| `schichtTemplateRoutes.js` | Schicht-Templates |
| `lehrlingeRoutes.js` | Lehrlings-Verwaltung |
| `ersatzautosRoutes.js` | Ersatzfahrzeuge, Buchungen, Verfügbarkeit |
| `teileRoutes.js` | Teileerfassung je Termin, Bestellungen |
| `wiederkehrendeTermineRoutes.js` | Wiederkehrende Terminserien |
| `reportingRoutes.js` | Berichte und Auswertungen |
| `backupRoutes.js` | Backup erstellen, Restore, Backup-Liste |
| `einstellungenRoutes.js` | App-Einstellungen |
| `tabletRoutes.js` | Tablet-spezifische Endpunkte |
| `tabletUpdateRoutes.js` | Auto-Update-System für Tablet-App |
| `tagesstempelRoutes.js` | Arbeitsbeginn/Arbeitsende/Unterbrechungen je Person (→ tagesstempelController) |
| `GET /api/zeitkonto` | Zeitkonto pro Person (kein eigenes Route-File, direkt in index.js → zeitkontoController) |
| `sucheRoutes.js` | Globale Suche |
| `systemRoutes.js` | Systeminfos, Health-Check |
| `aiRoutes.js` / `kiPlanungRoutes.js` | KI-gestützte Terminoptimierung |
| `pause.js` | Pausenanzeige-Status |
| `status.js` | Server-Statusendpunkt |

### Backend-Services (`backend/src/services/`)
| Datei | Zuständigkeit |
|---|---|
| `localAiService.js` | Lokales ML-Modell, trainiert täglich aus SQLite-Historydaten |
| `ollamaService.js` | Ollama-HTTP-Anbindung |
| `openaiService.js` | OpenAI-API-Anbindung |
| `externalAiService.js` | Abstraktionsschicht für alle KI-Backends |
| `kiDiscoveryService.js` | Erkennung verfügbarer KI-Dienste via mDNS |
| `backendDiscoveryService.js` | Backend-Discovery für Electron |

---

## 9. Commit & Pull Requests

- Commit-Betreff im Imperativ und knapp (`Add kunden import validation`, `Fix auslastung calc`)
- Kleine, thematisch fokussierte Commits bevorzugen
- PR-Beschreibung: Was/warum, relevante Tickets/Issues, manuelle Testschritte
- UI-Änderungen mit kurzen Screenshots oder GIFs dokumentieren
- Prüfe, dass neue Routen/Services in CLAUDE.md (Abschnitt 9) eingetragen sind

---

## 11. Workflow Guidelines

### Task Management
- Vor komplexen Änderungen (3+ Schritte): Plan kurz skizzieren und bestätigen lassen
- Tasks erst als erledigt markieren wenn verifiziert
- Nach Korrekturen durch den User: Muster in `tasks/lessons.md` dokumentieren
- `tasks/lessons.md` zu Sessionbeginn lesen wenn vorhanden

### Verification
- Nie "fertig" ohne Beweis dass es funktioniert (Logs, manueller Test, Statuscheck)
- Bei Bugs: direkt fixen ohne Rückfragen – Logs und Errors zeigen den Weg
- Wenn ein Fix sich hacky anfühlt: elegante Lösung implementieren statt weitermachen

### Code Quality
- Jede Änderung so minimal wie möglich – nur das Nötige anfassen
- Keine temporären Fixes – immer die Ursache finden
- Bei nicht-trivialen Änderungen kurz prüfen: "Gibt es einen eleganteren Weg?"
- Einfache, offensichtliche Fixes nicht überdenken

---

## 12. Do NOT

- SQLite-Datei (`werkstatt.db`) in PRs oder Commits hochladen
- Secrets oder API-Keys in `frontend/config.js` oder ins Repo committen
- Port 3001 im Frontend-Code hardcoden – immer `API_BASE_URL` aus `api.js` nutzen
- `node_modules/` committen
- Direkt in `werkstatt.db` schreiben ohne vorheriges Backup
- CORS-Ziel oder Ports im Code hardcoden statt über `.env` steuern
- Backend auf dem Server updaten OHNE vorher Datenbank-Backup zu erstellen
- WebSocket-Events mit Unterstrich-Notation benennen (`termin_updated`) – immer Punkt-Notation (`termin.updated`)
