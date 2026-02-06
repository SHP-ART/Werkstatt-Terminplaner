# Tablet-App Remote-Update-System

## Übersicht

Das Tablet-App Remote-Update-System ermöglicht die zentrale Verwaltung und automatische Aktualisierung aller im Netzwerk verbundenen Tablet-Apps vom Server aus.

## Features

### 1. Automatische Update-Erkennung
- **Intervall:** Tablets prüfen alle 30 Minuten auf neue Updates
- **Sofort-Check:** Beim App-Start wird ein Update-Check durchgeführt
- **Status-Meldung:** Tablets melden ihre Version regelmäßig an den Server

### 2. Zentrale Update-Verwaltung
- Server verwaltet verfügbare Updates
- Übersicht über alle verbundenen Tablets
- Versionsvergleich und Update-Status

### 3. Ein-Klick-Installation
- Update-Benachrichtigung erscheint automatisch auf dem Tablet
- Installation mit einem Klick
- Automatischer Neustart nach Installation

### 4. Persistente Einstellungen
- **NEU:** Einstellungen werden im userData-Verzeichnis gespeichert
- **Wichtig:** Einstellungen bleiben bei Updates erhalten
- Kein Datenverlust mehr bei Neuinstallation

## API-Endpunkte

### Server (Backend)

#### `GET /api/tablet-update/check?version=X.X.X`
Prüft ob ein Update verfügbar ist.

**Query-Parameter:**
- `version` - Aktuelle Version der Tablet-App

**Response:**
```json
{
  "updateAvailable": true,
  "currentVersion": "1.5.9",
  "latestVersion": "1.6.0",
  "downloadUrl": "/api/tablet-update/download",
  "releaseNotes": "Neue Features...",
  "publishedAt": "2026-02-06T10:00:00Z"
}
```

#### `GET /api/tablet-update/download`
Lädt die neueste Tablet-App-Installer-Datei herunter.

**Response:** Binary-Stream (EXE-Datei)

#### `POST /api/tablet-update/register`
Registriert eine neue Update-Version (nur Admin).

**Request Body:**
```json
{
  "version": "1.6.0",
  "filePath": "C:\\path\\to\\Werkstatt-Intern-Setup-1.6.0.exe",
  "releaseNotes": "Bugfixes und neue Features"
}
```

#### `GET /api/tablet-update/status`
Liefert Status aller verbundenen Tablets.

**Response:**
```json
[
  {
    "hostname": "TABLET-01",
    "ip": "192.168.1.100",
    "version": "1.5.9",
    "last_seen": "2026-02-06T10:30:00Z"
  }
]
```

#### `POST /api/tablet-update/report-status`
Tablet meldet Status an Server (automatisch).

**Request Body:**
```json
{
  "version": "1.5.9",
  "hostname": "TABLET-01",
  "ip": "192.168.1.100"
}
```

## Installation und Verwendung

### Server-Seite

1. **Update-Datei bereitstellen:**
   ```bash
   # Baue die Tablet-App
   cd electron-intern-tablet
   npm run build
   ```

2. **Update registrieren:**
   ```bash
   # Via API (mit curl oder Postman)
   curl -X POST http://localhost:3001/api/tablet-update/register \
     -H "Content-Type: application/json" \
     -d '{
       "version": "1.6.0",
       "filePath": "C:\\path\\to\\dist\\Werkstatt-Intern-Setup-1.6.0-x64.exe",
       "releaseNotes": "Neue Features und Bugfixes"
     }'
   ```

3. **Status überwachen:**
   ```bash
   # Alle verbundenen Tablets anzeigen
   curl http://localhost:3001/api/tablet-update/status
   ```

### Tablet-Seite

Die Tablet-App prüft automatisch auf Updates:

1. **Beim Start:** Sofortiger Update-Check
2. **Automatisch:** Alle 30 Minuten
3. **Benachrichtigung:** Bei verfügbarem Update erscheint eine Benachrichtigung
4. **Installation:** Klick auf "Jetzt installieren"

## Technische Details

### Datenbank-Tabellen

#### `tablet_updates`
Speichert verfügbare Updates:

```sql
CREATE TABLE tablet_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  file_path TEXT NOT NULL,
  release_notes TEXT,
  published_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `tablet_status`
Verfolgt verbundene Tablets:

```sql
CREATE TABLE tablet_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostname TEXT,
  ip TEXT,
  version TEXT NOT NULL,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Persistente Einstellungen

**Vorher (PROBLEM):**
```
C:\Program Files\Werkstatt Intern\config.json  ← Wurde bei Update gelöscht!
```

**Nachher (GELÖST):**
```
C:\Users\USERNAME\AppData\Roaming\werkstatt-intern-tablet\config.json  ← Bleibt erhalten!
```

Die Einstellungen werden nun im `userData`-Verzeichnis gespeichert, das von Windows/Electron persistent verwaltet wird und bei Updates nicht gelöscht wird.

### Versionsvergleich

Der Server verwendet semantische Versionierung (SemVer):
- Format: `MAJOR.MINOR.PATCH` (z.B. `1.5.9`)
- Vergleich: Komponentenweise von links nach rechts
- Beispiel: `1.5.9` < `1.6.0` < `2.0.0`

## Workflow

### Typischer Update-Workflow

```
┌─────────────────┐
│  Neue Version   │
│    erstellen    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Build & Test   │
│  Tablet-App     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Installer     │
│   auf Server    │
│   kopieren      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Update via    │
│   API regist.   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Tablets prüfen  │
│  automatisch    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Benachrichtigung│
│   auf Tablets   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Benutzer klickt │
│ "Installieren"  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Download von   │
│     Server      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Installation   │
│   & Neustart    │
└─────────────────┘
```

## Sicherheit

### Empfehlungen
- Nur signierte Installer verwenden (Zukunft: Code-Signing)
- Updates nur über HTTPS (in Produktion)
- Zugriffskontrolle für `/api/tablet-update/register` Endpoint
- Validierung der Datei-Integrität (SHA-256 Hash)

### Aktueller Stand
- HTTP (LAN-intern)
- Keine Authentifizierung für Update-Checks
- Datei-Pfad-Validierung auf Server-Seite

## Fehlerbehandlung

### Tablet kann Update nicht laden
1. Prüfe Netzwerkverbindung zum Server
2. Prüfe ob Backend läuft: `http://SERVER_IP:3001/api/health`
3. Prüfe Firewall-Einstellungen

### Update-Installation schlägt fehl
1. Prüfe ob genügend Speicherplatz vorhanden
2. Prüfe Benutzerrechte (Administrator erforderlich)
3. Schließe laufende Tablet-App-Instanzen

### Einstellungen gehen verloren
- **Sollte nicht mehr passieren!**
- Bei Problemen: `C:\Users\USERNAME\AppData\Roaming\werkstatt-intern-tablet\` prüfen

## Logs und Debugging

### Tablet-App Logs
```javascript
// Console-Ausgaben beim Update-Check
console.log('🔍 Prüfe auf Updates...');
console.log('✨ Update verfügbar: X.X.X');
console.log('✅ Tablet-App ist aktuell');
```

### Server Logs
```javascript
// In backend/src/server.js
console.log('Tablet-Update-System initialisiert ✓');
```

## Zukunftserweiterungen

- [ ] Code-Signing für Installer
- [ ] Delta-Updates (nur geänderte Dateien)
- [ ] Zeitgesteuertes Update (nachts)
- [ ] Rollback-Funktion
- [ ] Update-Historie
- [ ] Automatische Update-Installation ohne Benutzer-Interaktion
- [ ] Web-UI für Update-Verwaltung im Admin-Panel

## Changelog

### Version 1.6.0 (geplant)
- ✅ Remote-Update-System implementiert
- ✅ Persistente Einstellungen (userData-Verzeichnis)
- ✅ Automatische Update-Erkennung
- ✅ Status-Tracking aller Tablets
- ✅ Update-Benachrichtigung UI
- ✅ Ein-Klick-Installation

## Support

Bei Problemen:
1. Prüfe Server-Logs: `backend/logs/server-debug.log`
2. Prüfe Tablet-App Console (Electron DevTools)
3. Prüfe Netzwerk-Verbindung
4. Kontaktiere Support mit Logs

## Lizenz

Proprietär - Nur für interne Verwendung
