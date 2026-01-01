# Werkstatt Terminplaner

Ein vollständiger Werkstatt-Terminplaner mit Auslastungsanzeige, Kundenverwaltung und Zeitplanung.

## Projektstruktur

```
Werkstatt-Terminplaner/
├── backend/                    # Backend-Server (Node.js/Express)
│   ├── src/
│   │   ├── config/            # Datenbank-Konfiguration
│   │   ├── controllers/       # Business-Logik
│   │   ├── models/            # Datenbank-Modelle
│   │   ├── routes/            # API-Routen
│   │   └── server.js          # Server-Entry-Point
│   ├── database/              # SQLite-Datenbank (wird automatisch erstellt)
│   ├── .env                   # Umgebungsvariablen
│   └── package.json
│
└── frontend/                   # Frontend (HTML/CSS/JavaScript)
    ├── src/
    │   ├── components/        # JavaScript-Komponenten
    │   ├── services/          # API-Service-Layer
    │   └── styles/            # CSS-Dateien
    ├── index.html             # Haupt-HTML-Datei
    └── config.js              # Frontend-Konfiguration
```

## Funktionen

- **Kundenverwaltung**: Speicherung von Kundendaten in SQL-Datenbank
- **Terminplanung**: Erfassung von Terminen mit Kennzeichen, Arbeit, Umfang und Zeitberechnung
- **Zeitverwaltung**: Anpassung von Standard-Arbeitszeiten
- **Auslastungsanzeige**: Visueller Balken (Rot/Grün) zur Anzeige der täglichen Auslastung
- **Locosoft-Import**: Vorbereitet für Import von Kundendaten aus Locosoft
- **Netzwerkzugriff**: Läuft als Webserver, zugänglich im lokalen Netzwerk
- **🆕 Multi-PC-Unterstützung**: Mehrere PCs können gleichzeitig auf eine zentrale Datenbank zugreifen
- **🆕 Server-Konfiguration**: Einfache Einstellung der Server-Verbindung über die Weboberfläche
- **🆕 Verbindungstest**: Testen Sie die Verbindung zum Server direkt in den Einstellungen

## Schnellstart

### 🚀 Netzwerk-Installation (mehrere PCs)

**NEU:** Der Werkstattplaner kann jetzt auf mehreren PCs im Netzwerk verwendet werden!

- **Schnellanleitung**: Siehe [SCHNELLSTART.md](SCHNELLSTART.md)
- **Detaillierte Anleitung**: Siehe [NETZWERK-INSTALLATION.md](NETZWERK-INSTALLATION.md)

**Windows:**
- **Server-PC**: Doppelklick auf `start-server.bat` (startet den zentralen Server)
- **Alle PCs**: Doppelklick auf `werkstattplaner-oeffnen.bat` (öffnet die Anwendung)
- **Konfiguration**: Im Browser → Einstellungen → Server-Verbindung einstellen

### Einfacher Start mit Skripten (Einzelplatz)

**macOS / Linux:**
```bash
./start.sh    # Server starten
./stop.sh     # Server stoppen
```

**Windows (alte Methode):**
```cmd
start.bat     # Server starten
stop.bat      # Server stoppen
```

Die Skripte erledigen automatisch:
- Prüfung der Systemvoraussetzungen
- Installation der Dependencies (beim ersten Start)
- Start von Backend und Frontend
- Anzeige der Zugriffs-URLs
- Erstellung von Log-Dateien

### Was die Skripte tun

**start.sh / start.bat:**
- Prüft ob Node.js und Python installiert sind
- Installiert Backend-Dependencies falls nötig
- Prüft ob Ports 3000 und 3001 verfügbar sind
- Startet Backend-Server auf Port 3001
- Startet Frontend-Server auf Port 3000
- Zeigt Zugriffs-URLs und Ihre IP für Netzwerkzugriff
- Erstellt Logs in `logs/backend.log` und `logs/frontend.log`

**stop.sh / stop.bat:**
- Stoppt alle laufenden Server-Prozesse
- Gibt Ports 3000 und 3001 frei
- Bereinigt PID-Dateien

### Zugriff nach dem Start

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001
- **API**: http://localhost:3001/api

### Voraussetzungen
- Node.js (Version 14 oder höher) - https://nodejs.org
- npm (wird mit Node.js installiert)
- Python 3 (macOS/Linux) oder Python (Windows) - https://python.org

## Manuelle Installation

Falls Sie die Server manuell starten möchten:

### Backend installieren

```bash
cd backend
npm install
```

### Backend starten

```bash
cd backend
npm start
```

Für Entwicklung mit Auto-Reload:

```bash
npm run dev
```

Der Backend-Server läuft auf: **http://localhost:3001**

### Frontend starten

**macOS / Linux:**
```bash
cd frontend
python3 -m http.server 3000
```

**Windows:**
```cmd
cd frontend
python -m http.server 3000
```

Alternativ mit einem anderen Server:

```bash
# Mit Node.js http-server (npm install -g http-server)
http-server -p 3000
```

Das Frontend läuft auf: **http://localhost:3000**

## Zugriff im Netzwerk

### Backend-Zugriff
Der Backend-Server ist standardmäßig für Netzwerkzugriff konfiguriert (`0.0.0.0`).

- **Lokal**: http://localhost:3001
- **Im Netzwerk**: http://\<IP-ADRESSE\>:3001

### Frontend-Zugriff
- **Lokal**: http://localhost:3000
- **Im Netzwerk**: http://\<IP-ADRESSE\>:3000

Um Ihre IP-Adresse zu finden:
- **Windows**: `ipconfig` in CMD
- **Mac/Linux**: `ifconfig` oder `ip addr`

### API-URL anpassen

**Empfohlen: Über die Weboberfläche**
1. Öffnen Sie den Werkstattplaner im Browser
2. Gehen Sie zu **Einstellungen** (oben rechts)
3. Unter "Server-Verbindung":
   - Geben Sie die IP-Adresse des Server-PCs ein
   - Passen Sie den Port an (falls geändert)
   - Klicken Sie auf "Verbindung speichern"
4. Die Einstellungen werden im Browser gespeichert

**Alternativ: Manuell in der Konfigurationsdatei**
1. Öffnen Sie `frontend/config.js`
2. Die Konfiguration erfolgt automatisch über localStorage
3. Für eine Standard-Einstellung können Sie die Datei anpassen

## API-Dokumentation

### Basis-URL
```
http://localhost:3001/api
```

### Endpoints

#### Kunden
- `GET /api/kunden` - Alle Kunden abrufen
- `GET /api/kunden/:id` - Kunde nach ID
- `POST /api/kunden` - Neuen Kunden erstellen
- `POST /api/kunden/import` - Mehrere Kunden importieren
- `PUT /api/kunden/:id` - Kunde aktualisieren
- `DELETE /api/kunden/:id` - Kunde löschen

#### Termine
- `GET /api/termine` - Alle Termine (optional: ?datum=YYYY-MM-DD)
- `POST /api/termine` - Neuen Termin erstellen
- `PUT /api/termine/:id` - Termin aktualisieren
- `DELETE /api/termine/:id` - Termin löschen

#### Arbeitszeiten
- `GET /api/arbeitszeiten` - Alle Standardarbeitszeiten
- `POST /api/arbeitszeiten` - Neue Arbeitszeit erstellen
- `PUT /api/arbeitszeiten/:id` - Arbeitszeit aktualisieren
- `DELETE /api/arbeitszeiten/:id` - Arbeitszeit löschen

#### Auslastung
- `GET /api/auslastung/:datum` - Auslastung für ein Datum

#### Health Check
- `GET /api/health` - Server-Status prüfen

## Verwendung

### Tab: Termine

1. **Neuer Termin erstellen**:
   - Kunde aus Liste auswählen
   - Kennzeichen eingeben
   - Arbeit aus Standardliste wählen (Zeit wird automatisch vorgeschlagen)
   - Optional: Umfang/Details eingeben
   - Geschätzte Zeit anpassen falls nötig
   - Datum wählen
   - "Termin erstellen" klicken

2. **Termine verwalten**:
   - Nach Datum filtern oder alle Termine anzeigen
   - Termine bearbeiten: Zeit anpassen und Status ändern (geplant/in Arbeit/abgeschlossen)

### Tab: Kunden

1. **Neuen Kunden anlegen**:
   - Name, Telefon, Email, Adresse eingeben
   - Optional: Locosoft ID eintragen
   - "Kunde anlegen" klicken

2. **Locosoft Import**:
   - JSON-Daten im folgenden Format einfügen:
   ```json
   [
     {
       "name": "Max Mustermann",
       "telefon": "030123456",
       "email": "max@example.com",
       "adresse": "Musterstr. 1, 12345 Berlin",
       "locosoft_id": "LS001"
     }
   ]
   ```
   - "Import starten" klicken

### Tab: Zeitverwaltung

- Standardzeiten für verschiedene Arbeiten anpassen
- Neue Werte eingeben und "Speichern" klicken
- Diese Zeiten werden als Vorschlag bei neuen Terminen verwendet

### Tab: Auslastung

- Datum auswählen
- Auslastungsanzeige zeigt:
  - Belegte Zeit (Minuten)
  - Verfügbare Zeit (Minuten)
  - Auslastung in Prozent
  - Visueller Balken mit Farbcodierung:
    - **Grün**: 0-80% (Gut)
    - **Gelb**: 80-100% (Voll)
    - **Rot**: >100% (Überlastet)

### Tab: Einstellungen

**Server-Verbindung (NEU):**
- Server-IP-Adresse einstellen (z.B. `192.168.1.100` für Client-PCs, `localhost` für Server-PC)
- Port anpassen (Standard: 3001)
- Verbindung testen mit einem Klick
- Änderungen werden lokal im Browser gespeichert

**Werkstatt-Einstellungen:**
- Anzahl Mitarbeiter festlegen
- Arbeitsstunden pro Tag pro Mitarbeiter einstellen
- Abwesenheiten (Urlaub/Krank) für bestimmte Tage erfassen

## Datenbank

Die Anwendung verwendet SQLite. Die Datenbankdatei `werkstatt.db` wird automatisch beim ersten Start im `backend/database/` Ordner erstellt.

### Datenbankstruktur:

- **kunden**: Kundendaten mit Locosoft-ID
- **termine**: Terminplanung mit Zeitberechnung
- **arbeitszeiten**: Standard-Arbeitszeiten für verschiedene Tätigkeiten

## Standardarbeiten

Bei der ersten Einrichtung werden folgende Standardarbeiten angelegt:

- Ölwechsel: 30 Min
- Inspektion klein: 60 Min
- Inspektion groß: 120 Min
- Bremsen vorne: 90 Min
- Bremsen hinten: 90 Min
- Reifen wechseln: 45 Min
- TÜV-Vorbereitung: 60 Min
- Diagnose: 30 Min

Diese können im Tab "Zeitverwaltung" angepasst werden.

## Architektur

### Backend (MVC-Pattern)
- **Models**: Datenbank-Zugriff und Datenlogik
- **Controllers**: Business-Logik und Request-Handling
- **Routes**: API-Endpoint-Definitionen
- **Config**: Datenbank- und Server-Konfiguration

### Frontend (Komponentenbasiert)
- **Components**: UI-Logik und Event-Handling
- **Services**: API-Kommunikation
- **Styles**: CSS-Styling

## Technologie-Stack

- **Backend**: Node.js, Express, SQLite3
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Design**: Responsive, Mobile-freundlich

## Firewall-Einstellungen

Für Netzwerkzugriff:
- **Windows**: Windows Defender Firewall > Erweiterte Einstellungen > Eingehende Regeln
  - Port 3000 (Frontend) freigeben
  - Port 3001 (Backend) freigeben
- **Mac**: Systemeinstellungen > Sicherheit > Firewall

## Backup

Sichern Sie regelmäßig die Datei `backend/database/werkstatt.db` für ein Backup Ihrer Daten.

```bash
# Backup erstellen
cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db
```

## Development

### Backend-Entwicklung
```bash
cd backend
npm run dev  # Startet mit nodemon für Auto-Reload
```

### Frontend-Entwicklung
Das Frontend verwendet Vanilla JavaScript ohne Build-Prozess. Änderungen sind sofort sichtbar nach Browser-Reload.

## Troubleshooting

### Backend startet nicht
- Prüfen Sie, ob Port 3001 bereits belegt ist
- Überprüfen Sie die `.env` Datei
- Stellen Sie sicher, dass Node.js installiert ist

### Frontend kann Backend nicht erreichen
- Prüfen Sie die API-URL in `frontend/src/services/api.js`
- Stellen Sie sicher, dass das Backend läuft
- Überprüfen Sie CORS-Einstellungen in `backend/src/server.js`

### Datenbank-Fehler
- Löschen Sie `backend/database/werkstatt.db` und starten Sie neu
- Die Datenbank wird automatisch neu erstellt

## Lizenz

Proprietäre Software für interne Nutzung.
