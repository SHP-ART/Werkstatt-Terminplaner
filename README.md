# Werkstatt Terminplaner

[![Version](https://img.shields.io/badge/version-1.0.8-blue.svg)](https://github.com/SHP-ART/Werkstatt-Terminplaner/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](README.md)

> 🔧 **Professioneller Werkstatt-Terminplaner** für Kfz-Betriebe mit Echtzeit-Auslastung, Mitarbeiterverwaltung, Ersatzauto-System und Multi-PC-Netzwerkunterstützung.

Ein vollständiger Werkstatt-Terminplaner mit intelligenter Auslastungsanzeige, umfassender Kundenverwaltung, Zeitplanung und Multi-PC-Unterstützung. Entwickelt für Kfz-Werkstätten zur effizienten Verwaltung von Terminen, Mitarbeitern, Fahrzeugen und Ersatzautos.

## 🚀 Hauptfunktionen

- **Multi-PC-Netzwerkfähig**: Mehrere PCs können gleichzeitig auf eine zentrale Datenbank zugreifen
- **Kundenverwaltung**: Umfassende Kundendaten mit Fahrzeugverwaltung und Locosoft-Import
- **Terminplanung**: Erweiterte Terminverwaltung mit Phasen, Split-Terminen und Schwebend-Funktion
- **Mitarbeiterverwaltung**: Mitarbeiter und Lehrlinge mit individuellen Abwesenheiten
- **Ersatzauto-System**: Verwaltung von Ersatzfahrzeugen mit Buchungen und Verfügbarkeit
- **Auslastungsanzeige**: Echtzeit-Visualisierung mit dynamischer Nebenzeit-Berechnung
- **Backup-System**: Automatische und manuelle Backups mit Restore-Funktion inkl. Auto-Migration
- **Windows Autostart**: Automatischer Start beim Systemstart mit sauberem Shutdown beim Herunterfahren
- **WebSocket Live-Updates**: Änderungen werden in Echtzeit auf alle Clients übertragen
- **Sicherer Betrieb**: SQL-Injection-Schutz, async/await-Architektur, automatische Datenbankschließung

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

## 📦 Verfügbare Pakete

### Windows Installer (Empfohlen für Windows)
- **Werkstatt Terminplaner Setup.exe** (~230 MB)
- Vollständiger Installer mit Setup-Assistent
- Automatische Installation und Desktop-Verknüpfung
- Inkludiert alle Abhängigkeiten
- ➡️ [Download vom neuesten Release](https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/latest)

### Portable Versionen (Windows)

#### All-in-One Version (Empfohlen für Einzelplatz)
- **Werkstatt-Terminplaner-Complete.exe** (~226 MB)
- Backend + Frontend in einer Anwendung
- Automatisches Server-Status-Fenster
- Ideal für Einzelplatz oder Server-PC
- Keine Installation erforderlich

#### Netzwerk-Installation
- **Werkstatt-Server.exe** (~226 MB) - Für den Server-PC
- **Werkstatt-Frontend.exe** (~73 MB) - Für Client-PCs
- Zentrale Datenbankfreigabe für mehrere Benutzer

### macOS & Linux
- Manuelle Installation mit Start-Skripten (siehe unten)
- Node.js und Python erforderlich

Siehe [NETZWERK-INSTALLATION.md](NETZWERK-INSTALLATION.md) für Details.

## Schnellstart

### 🚀 Windows (Empfohlen)

#### Option 1: Windows Installer (Einfachste Methode)
1. **[Setup.exe herunterladen](https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/latest)** vom neuesten Release
2. Installer ausführen und Anweisungen folgen
3. Desktop-Verknüpfung nutzen oder Start-Menü öffnen
4. Fertig! ✅

#### Option 2: Portable Version
- **Werkstatt-Terminplaner-Complete.exe** herunterladen und direkt ausführen
- Keine Installation erforderlich

#### Option 3: Netzwerk-Installation (mehrere PCs)
**NEU:** Der Werkstattplaner kann auf mehreren PCs im Netzwerk verwendet werden!

- **Schnellanleitung**: Siehe [SCHNELLSTART.md](SCHNELLSTART.md)
- **Detaillierte Anleitung**: Siehe [NETZWERK-INSTALLATION.md](NETZWERK-INSTALLATION.md)

**Windows:**
- **Server-PC**: Doppelklick auf `start-server.bat` (startet den zentralen Server)
- **Alle PCs**: Doppelklick auf `werkstattplaner-oeffnen.bat` (öffnet die Anwendung)
- **Konfiguration**: Im Browser → Einstellungen → Server-Verbindung einstellen

### 🍎 macOS / 🐧 Linux: Einfacher Start mit Skripten
```bash
./start.sh    # Server starten
./stop.sh     # Server stoppen
```

**Windows (alte Methode ohne Installer):**
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

## 💻 Systemvoraussetzungen

### Minimale Anforderungen (Einzelplatz bis 5 Termine/Tag)
- **Prozessor**: Intel Core i3 / AMD Ryzen 3 oder höher (2 Kerne)
- **RAM**: 4 GB
- **Festplatte**: 500 MB freier Speicher
- **Betriebssystem**:
  - Windows 10/11 (64-bit)
  - macOS 10.15 (Catalina) oder neuer
  - Linux (Ubuntu 20.04+, Debian 10+)

### Empfohlene Konfiguration (Werkstatt-Alltag: 10 Termine/Tag, 4 Mitarbeiter)
- **Prozessor**: Intel Core i5 / AMD Ryzen 5 oder höher (4 Kerne)
- **RAM**: 8 GB (besser 16 GB für gleichzeitige Client-Zugriffe)
- **Festplatte**: 
  - **System**: 10 GB freier Speicher
  - **Datensicherung (10 Jahre)**: 20-50 GB für Backups
    - ~5 MB pro Backup bei 10 Terminen/Tag
    - ~2-5 GB pro Jahr (tägliche Backups)
    - SSD empfohlen für bessere Performance
- **Netzwerk**: 
  - 100 Mbit/s LAN (bei Netzwerk-Betrieb)
  - Stabiles WLAN (5 GHz) für Client-PCs
- **Betriebssystem**: 
  - **Windows 10/11 Pro** (empfohlen für Server)
  - macOS 11 (Big Sur) oder neuer
  - Linux Server (Ubuntu 22.04 LTS)

### Server-PC Anforderungen (Multi-PC-Betrieb mit 3-5 Clients)
- **Prozessor**: Intel Core i5-8xxx / AMD Ryzen 5 3xxx oder neuer (6 Kerne)
- **RAM**: 16 GB
- **Festplatte**: 
  - 50 GB SSD für System und Datenbank
  - 100 GB HDD/SSD für langfristige Backups
- **Netzwerk**: Gigabit LAN (kabelgebunden empfohlen)
- **Unterbrechungsfreie Stromversorgung (USV)**: Empfohlen zum Schutz der Datenbank

### Client-PC Anforderungen
- **Prozessor**: Intel Core i3 / AMD Ryzen 3
- **RAM**: 4 GB
- **Browser**: Aktueller Chrome, Firefox, Edge oder Safari
- **Netzwerk**: Stabiles LAN/WLAN zum Server

### Software-Voraussetzungen (nur bei manueller Installation)
- **Node.js**: Version 14.0 oder höher - [Download](https://nodejs.org)
- **npm**: Wird mit Node.js automatisch installiert
- **Python**: 
  - Python 3.7+ (macOS/Linux)
  - Python 3.7+ (Windows, für Frontend-Server)

**Hinweis**: Bei Verwendung des Windows Installers oder der .exe-Dateien sind **keine** zusätzlichen Software-Installationen erforderlich!

### Speicherplatz-Berechnung für 10 Jahre

#### Datenbank-Größe (bei 10 Terminen/Tag, 4 Mitarbeiter)
- **Jahr 1**: ~15-25 MB (3.650 Termine + Kunden + Mitarbeiter)
- **Jahr 5**: ~75-125 MB
- **Jahr 10**: ~150-250 MB
- **Gesamt mit Wachstum**: 300-500 MB

#### Backup-Größe (tägliche automatische Backups)
- **Tägliche Backups**: 365 Backups/Jahr × 5 MB = ~2 GB/Jahr
- **Wöchentliche Langzeit-Backups**: 52 × 5 MB = ~260 MB/Jahr
- **Empfohlenes Backup-Konzept für 10 Jahre**:
  - **Tägliche Backups**: Letzten 30 Tage (2 GB)
  - **Wöchentliche Backups**: Letztes Jahr (3 GB)
  - **Monatliche Backups**: 10 Jahre (600 MB)
  - **Gesamt**: ~6-10 GB für umfassendes Backup-System

#### Gesamtspeicherbedarf (10 Jahre)
- **Datenbank**: 500 MB
- **Backups**: 10 GB
- **System + Logs**: 2 GB
- **Reserve**: 5 GB
- **Empfohlen**: **20-30 GB freier Speicher**

### Leistungsmetriken (Benchmark mit 10 Terminen/Tag)
- **Startzeit**: 2-5 Sekunden
- **Termin erstellen**: <500 ms
- **Auslastung berechnen**: <1 Sekunde
- **Backup erstellen**: 1-2 Sekunden
- **Gleichzeitige Benutzer**: 5-10 (bei empfohlener Hardware)
- **Datenbank-Zugriff**: <100 ms (SQLite, lokal)

### Netzwerk-Anforderungen (Multi-PC)
- **Bandbreite pro Client**: ~1-5 Mbit/s (geringe Last)
- **Latenz**: <50 ms (LAN), <100 ms (WLAN)
- **Offene Ports**: TCP 3001 (Backend-API)
- **Firewall**: Windows Defender / macOS Firewall konfiguriert

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

### Voraussetzungen für manuelle Installation
- Node.js (Version 14 oder höher) - https://nodejs.org
- npm (wird mit Node.js installiert)
- Python 3 (macOS/Linux) oder Python (Windows) - https://python.org

**Hinweis**: Bei Verwendung des Windows Installers oder der .exe-Dateien sind keine Voraussetzungen erforderlich!

### Zugriff nach dem Start

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001
- **API**: http://localhost:3001/api

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

### 🏢 Kunden-Endpoints

#### Kunden verwalten
- **GET** `/api/kunden` - Alle Kunden abrufen
- **GET** `/api/kunden/:id` - Einzelnen Kunden abrufen
- **GET** `/api/kunden/search?q=suchbegriff` - Kunden suchen (Name, Telefon, Email)
- **POST** `/api/kunden` - Neuen Kunden erstellen
  ```json
  {
    "name": "Max Mustermann",
    "telefon": "030123456",
    "email": "max@example.com",
    "adresse": "Musterstr. 1, 12345 Berlin",
    "locosoft_id": "LS001"
  }
  ```
- **PUT** `/api/kunden/:id` - Kunde aktualisieren
- **DELETE** `/api/kunden/:id` - Kunde löschen
- **POST** `/api/kunden/import` - Mehrere Kunden importieren (Array von Kunden)

#### Fahrzeuge verwalten
- **GET** `/api/kunden/:id/fahrzeuge` - Alle Fahrzeuge eines Kunden
- **GET** `/api/kunden/stats/fahrzeuge` - Anzahl Fahrzeuge pro Kunde
- **POST** `/api/kunden/:id/fahrzeuge` - Neues Fahrzeug hinzufügen
  ```json
  {
    "kennzeichen": "B-AB 1234",
    "marke": "VW",
    "modell": "Golf",
    "hsn_tsn": "0603/ABS",
    "fahrgestellnummer": "WVWZZZ1KZ1234567",
    "erstzulassung": "2020-01-15"
  }
  ```
- **PUT** `/api/kunden/:id/fahrzeuge/:kennzeichen` - Fahrzeug aktualisieren
- **DELETE** `/api/kunden/:id/fahrzeuge/:kennzeichen` - Fahrzeug löschen

---

### 📅 Termin-Endpoints

#### Termine verwalten
- **GET** `/api/termine` - Alle Termine (optional: `?datum=YYYY-MM-DD` oder `?von=YYYY-MM-DD&bis=YYYY-MM-DD`)
- **GET** `/api/termine/:id` - Einzelnen Termin abrufen
- **POST** `/api/termine` - Neuen Termin erstellen
  ```json
  {
    "kunde_id": 1,
    "kennzeichen": "B-AB 1234",
    "arbeit": "Inspektion",
    "umfang": "60.000 km Service",
    "datum": "2026-01-15",
    "geschaetzte_zeit": 120,
    "status": "geplant",
    "prioritaet": "normal",
    "notizen": "Kunde möchte Ersatzauto"
  }
  ```
- **PUT** `/api/termine/:id` - Termin aktualisieren
- **DELETE** `/api/termine/:id` - Termin löschen (Soft-Delete)

#### Erweiterte Termin-Funktionen
- **GET** `/api/termine/papierkorb` - Gelöschte Termine abrufen
- **POST** `/api/termine/:id/restore` - Gelöschten Termin wiederherstellen
- **DELETE** `/api/termine/:id/permanent` - Termin permanent löschen
- **POST** `/api/termine/:id/schwebend` - Termin als schwebend markieren (ohne Datum)
- **POST** `/api/termine/:id/split` - Termin auf mehrere Tage aufteilen
  ```json
  {
    "phasen": [
      {"datum": "2026-01-15", "stunden": 4},
      {"datum": "2026-01-16", "stunden": 2}
    ]
  }
  ```
- **GET** `/api/termine/:id/split-termine` - Alle Phasen eines Split-Termins

#### Termin-Validierung & Vorschläge
- **GET** `/api/termine/verfuegbarkeit?datum=YYYY-MM-DD&dauer=120` - Verfügbarkeit prüfen
- **POST** `/api/termine/validate` - Termin validieren (Überbuchung, Konflikte)
- **GET** `/api/termine/vorschlaege?dauer=120&tage=7` - Terminvorschläge für nächste freie Slots

---

### 🧑‍🔧 Mitarbeiter & Lehrlinge

#### Mitarbeiter
- **GET** `/api/mitarbeiter` - Alle Mitarbeiter
- **GET** `/api/mitarbeiter/aktive` - Nur aktive Mitarbeiter
- **GET** `/api/mitarbeiter/:id` - Einzelnen Mitarbeiter
- **POST** `/api/mitarbeiter` - Neuen Mitarbeiter erstellen
  ```json
  {
    "name": "Hans Meier",
    "kuerzel": "HM",
    "typ": "Service",
    "stunden_pro_tag": 8,
    "aktiv": 1
  }
  ```
- **PUT** `/api/mitarbeiter/:id` - Mitarbeiter aktualisieren
- **DELETE** `/api/mitarbeiter/:id` - Mitarbeiter löschen

#### Lehrlinge
- **GET** `/api/lehrlinge` - Alle Lehrlinge
- **GET** `/api/lehrlinge/aktive` - Nur aktive Lehrlinge
- **GET** `/api/lehrlinge/:id` - Einzelnen Lehrling
- **POST** `/api/lehrlinge` - Neuen Lehrling erstellen
  ```json
  {
    "name": "Tom Schmidt",
    "lehrjahr": 2,
    "aktiv": 1
  }
  ```
- **PUT** `/api/lehrlinge/:id` - Lehrling aktualisieren
- **DELETE** `/api/lehrlinge/:id` - Lehrling löschen

---

### 📊 Abwesenheiten

- **GET** `/api/abwesenheiten/liste` - Alle Abwesenheiten
- **GET** `/api/abwesenheiten/range?von=YYYY-MM-DD&bis=YYYY-MM-DD` - Abwesenheiten im Zeitraum
- **GET** `/api/abwesenheiten/item/:id` - Einzelne Abwesenheit
- **POST** `/api/abwesenheiten` - Neue Abwesenheit erstellen
  ```json
  {
    "person_typ": "mitarbeiter",
    "person_id": 1,
    "datum": "2026-01-20",
    "grund": "Urlaub",
    "ganztags": 1
  }
  ```
- **DELETE** `/api/abwesenheiten/item/:id` - Abwesenheit löschen

#### Legacy-Routes (Datum-basiert)
- **GET** `/api/abwesenheiten/:datum` - Abwesenheiten für Datum (alte Tabelle)
- **PUT** `/api/abwesenheiten/:datum` - Abwesenheiten für Datum aktualisieren

---

### 🚗 Ersatzautos

#### Ersatzauto-Verwaltung
- **GET** `/api/ersatzautos` - Alle Ersatzautos
- **GET** `/api/ersatzautos/aktiv` - Nur aktive/verfügbare Ersatzautos
- **GET** `/api/ersatzautos/:id` - Einzelnes Ersatzauto
- **POST** `/api/ersatzautos` - Neues Ersatzauto erstellen
  ```json
  {
    "kennzeichen": "B-EA 999",
    "marke": "VW",
    "modell": "Polo",
    "farbe": "Blau",
    "aktiv": 1
  }
  ```
- **PUT** `/api/ersatzautos/:id` - Ersatzauto aktualisieren

#### Verfügbarkeit & Buchungen
- **GET** `/api/ersatzautos/buchungen/aktuell` - Aktuelle Buchungen (heute + laufend)
- **GET** `/api/ersatzautos/verfuegbarkeit/:datum` - Verfügbare Ersatzautos für Datum
- **GET** `/api/ersatzautos/verfuegbarkeit/:datum/details` - Detaillierte Verfügbarkeit

#### Sperrungen
- **POST** `/api/ersatzautos/:id/toggle-gesperrt` - Manuelle Sperrung umschalten
- **PUT** `/api/ersatzautos/:id/gesperrt` - Sperrung setzen (body: `{"gesperrt": true}`)
- **POST** `/api/ersatzautos/:id/sperren-bis` - Zeitbasierte Sperrung (body: `{"bis": "2026-01-30"}`)
- **POST** `/api/ersatzautos/:id/entsperren` - Sperrung aufheben

---

### ⏱️ Arbeitszeiten & Phasen

#### Arbeitszeiten (Standard-Zeiten)
- **GET** `/api/arbeitszeiten` - Alle Standardarbeitszeiten
- **GET** `/api/arbeitszeiten/:id` - Einzelne Arbeitszeit
- **POST** `/api/arbeitszeiten` - Neue Standardarbeitszeit
  ```json
  {
    "arbeit": "Ölwechsel",
    "standard_zeit": 30,
    "interne_auftragsnummer": "AZ-001"
  }
  ```
- **PUT** `/api/arbeitszeiten/:id` - Arbeitszeit aktualisieren
- **DELETE** `/api/arbeitszeiten/:id` - Arbeitszeit löschen

#### Phasen (Split-Termine)
- **GET** `/api/phasen/datum/:datum` - Alle Phasen für ein Datum (für Auslastung)
- **GET** `/api/phasen/termin/:terminId` - Alle Phasen eines Termins
- **GET** `/api/phasen/:id` - Einzelne Phase
- **POST** `/api/phasen` - Neue Phase erstellen
- **PUT** `/api/phasen/:id` - Phase aktualisieren
- **PUT** `/api/phasen/termin/:terminId/sync` - Phasen synchronisieren (alle ersetzen)
- **DELETE** `/api/phasen/:id` - Phase löschen

---

### 📈 Auslastung

- **GET** `/api/auslastung/:datum` - Auslastungsberechnung für ein Datum
  
  **Response:**
  ```json
  {
    "datum": "2026-01-15",
    "verfuegbare_zeit": 480,
    "belegte_zeit": 360,
    "prozent": 75,
    "status": "gut",
    "details": {
      "mitarbeiter": [...],
      "termine": [...]
    }
  }
  ```

---

### 💾 Backup & Restore

- **GET** `/api/backup/status` - Backup-System-Status
- **GET** `/api/backup/list` - Alle verfügbaren Backups
- **POST** `/api/backup/create` - Manuelles Backup erstellen
  ```json
  {
    "beschreibung": "Vor großem Update"
  }
  ```
- **POST** `/api/backup/restore` - Backup wiederherstellen
  ```json
  {
    "filename": "backup_20260115_120000.db"
  }
  ```
- **GET** `/api/backup/download/:filename` - Backup-Datei herunterladen
- **POST** `/api/backup/upload` - Backup hochladen (multipart/form-data)
- **POST** `/api/backup/delete` - Backup löschen
  ```json
  {
    "filename": "backup_20260115_120000.db"
  }
  ```

---

### ⚙️ Einstellungen

- **GET** `/api/einstellungen/werkstatt` - Werkstatt-Einstellungen abrufen
- **PUT** `/api/einstellungen/werkstatt` - Werkstatt-Einstellungen aktualisieren
  ```json
  {
    "anzahl_mitarbeiter": 4,
    "stunden_pro_tag": 8
  }
  ```
- **GET** `/api/einstellungen/ersatzauto/:datum` - Ersatzauto-Verfügbarkeit für Datum

---

### 🔍 System & Health

- **GET** `/api/health` - Server-Status prüfen
- **GET** `/api/server-info` - Server-Informationen (Version, Uptime)
  ```json
  {
    "version": "1.0.5",
    "uptime": 3600,
    "database": "connected"
  }
  ```

---

### 📝 Hinweise zur API

#### Authentifizierung
Aktuell keine Authentifizierung implementiert. Für Produktionsumgebungen wird empfohlen, Authentifizierung hinzuzufügen.

#### CORS
Der Server ist für `http://localhost:3000` konfiguriert. Für andere Origins muss die CORS-Konfiguration in `backend/src/server.js` angepasst werden.

#### Fehlerbehandlung
Alle Endpoints geben strukturierte Fehler zurück:
```json
{
  "error": "Fehlertyp",
  "message": "Detaillierte Fehlermeldung",
  "details": {...}
}
```

HTTP-Statuscodes:
- `200` - Erfolg
- `201` - Erstellt
- `400` - Ungültige Anfrage
- `404` - Nicht gefunden
- `500` - Serverfehler

## 📖 Verwendung

### Frontend-Oberfläche

#### Tab: Termine
1. **Neuer Termin**:
   - Kunde aus Liste auswählen oder suchen
   - Kennzeichen eingeben (mit Fahrzeug-Dropdown)
   - Arbeit aus Standardliste wählen
   - Datum, Zeit und Details eingeben
   - Optional: Split-Termin erstellen für mehrtägige Arbeiten
   
2. **Schwebende Termine**:
   - Termine ohne festes Datum vormerken
   - Später auf konkretes Datum verschieben

3. **Papierkorb**:
   - Gelöschte Termine wiederherstellen
   - Permanent löschen

#### Tab: Kunden
1. **Kundenverwaltung**:
   - Neuen Kunden mit allen Details anlegen
   - Fahrzeuge pro Kunde verwalten
   - Suche nach Name, Telefon oder Email

2. **Locosoft Import**:
   - JSON-Format für Massenimport:
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

#### Tab: Mitarbeiter & Lehrlinge
- Mitarbeiter mit Kürzel und Typ (Service/Nur Service) verwalten
- Lehrlinge mit Lehrjahr erfassen
- Abwesenheiten (Urlaub/Krank) pro Person planen

#### Tab: Ersatzautos
- Ersatzfahrzeuge erfassen und verwalten
- Verfügbarkeit pro Datum prüfen
- Manuelle oder zeitbasierte Sperrungen
- Buchungsübersicht

#### Tab: Zeitverwaltung
- Standardzeiten für Arbeiten definieren
- Interne Auftragsnummern zuweisen
- Neue Arbeitstypen hinzufügen

#### Tab: Auslastung
- Datum auswählen für Auslastungsanzeige
- Visueller Balken mit Farbcodierung:
  - **Grün** (0-80%): Gut
  - **Gelb** (80-100%): Voll
  - **Rot** (>100%): Überlastet
- Details zu Mitarbeitern, Abwesenheiten und Terminen

#### Tab: Backup
- Manuelle Backups erstellen
- Automatische Backups konfigurieren
- Backup wiederherstellen
- Backups herunterladen/hochladen

#### Tab: Einstellungen
- **Server-Verbindung**: IP-Adresse und Port konfigurieren
- **Werkstatt**: Anzahl Mitarbeiter und Standardstunden
- **Verbindungstest**: Server-Erreichbarkeit prüfen

## 💾 Datenbank

Die Anwendung verwendet **SQLite** als Datenbank. Die Datei `werkstatt.db` wird automatisch beim ersten Start im Verzeichnis `backend/database/` erstellt.

### Datenbankstruktur

#### Haupttabellen
- **kunden**: Kundenstammdaten mit Locosoft-Integration
- **fahrzeuge**: Fahrzeuge mit Kennzeichen, HSN/TSN, Fahrgestellnummer
- **termine**: Terminplanung mit Status, Priorität und Soft-Delete
- **phasen**: Split-Termine über mehrere Tage
- **mitarbeiter**: Mitarbeiter mit Typ (Service/Nur Service) und Stunden
- **lehrlinge**: Lehrlinge mit Lehrjahr
- **abwesenheiten**: Individuelle Abwesenheiten (Urlaub/Krank) pro Person
- **abwesenheiten_legacy**: Alte werkstattweite Abwesenheiten
- **arbeitszeiten**: Standard-Arbeitszeiten mit interner Auftragsnummer
- **ersatzautos**: Ersatzfahrzeuge mit Sperrungsstatus
- **einstellungen**: Werkstatt-Konfiguration (Mitarbeiteranzahl, Stunden)

### Backup & Migration
Backups können über die Web-Oberfläche oder manuell erstellt werden:

```bash
# Manuelles Backup
cp backend/database/werkstatt.db backend/backups/backup_$(date +%Y%m%d_%H%M%S).db

# Restore
cp backend/backups/backup_YYYYMMDD_HHMMSS.db backend/database/werkstatt.db
```

**Automatische Backups** können in den Einstellungen konfiguriert werden.

## 🔧 Standard-Arbeitszeiten

Bei der ersten Einrichtung werden folgende Standardarbeiten automatisch angelegt:

| Arbeit | Zeit | Beschreibung |
|--------|------|--------------|
| Ölwechsel | 30 Min | Motoröl wechseln |
| Inspektion klein | 60 Min | Kleine Wartung |
| Inspektion groß | 120 Min | Große Wartung |
| Bremsen vorne | 90 Min | Vordere Bremsanlage |
| Bremsen hinten | 90 Min | Hintere Bremsanlage |
| Reifen wechseln | 45 Min | Sommer/Winter-Reifen |
| TÜV-Vorbereitung | 60 Min | Vorbereitung Hauptuntersuchung |
| Diagnose | 30 Min | Fehlerdiagnose |

Diese Zeiten können im Tab **Zeitverwaltung** individuell angepasst werden. Neue Arbeitstypen können jederzeit hinzugefügt werden.

## ⚙️ Technologie-Stack

### Backend
- **Node.js** (v14+) - JavaScript-Runtime
- **Express** (v4) - Web-Framework
- **SQLite3** - Eingebettete Datenbank
- **Electron** (optional) - Desktop-App-Wrapper
- **WebSocket** - Live-Updates zwischen Clients

### Frontend
- **Vanilla JavaScript** (ES6+) - Keine Frameworks
- **HTML5** - Semantisches Markup
- **CSS3** - Modernes Styling mit Flexbox/Grid
- **LocalStorage** - Client-seitige Konfiguration

### Architektur (MVC-Pattern)

#### Backend
- **Models** (`backend/src/models/`): Datenbank-Zugriff und SQL-Queries
- **Controllers** (`backend/src/controllers/`): Business-Logik und Request-Handling
- **Routes** (`backend/src/routes/`): API-Endpoint-Definitionen
- **Config** (`backend/src/config/`): Datenbank- und Server-Konfiguration

#### Frontend
- **Components** (`frontend/src/components/`): UI-Logik und Event-Handling
- **Services** (`frontend/src/services/`): API-Kommunikation
- **Styles** (`frontend/src/styles/`): CSS-Styling

### Build & Deployment
- **electron-builder**: Windows .exe Pakete erstellen
- Kein Build-Prozess für Frontend (Vanilla JS)
- Portable SQLite-Datenbank

## 🔥 Firewall-Einstellungen

Für Netzwerkzugriff müssen folgende Ports freigegeben werden:

### Windows Firewall
1. **Windows Defender Firewall** öffnen
2. **Erweiterte Einstellungen** → **Eingehende Regeln**
3. **Neue Regel** erstellen:
   - **Port 3001** (Backend-API) freigeben
   - **Port 3000** (Frontend) freigeben (nur bei manueller Installation)

**Schnell-Lösung:** Die Start-Skripte erstellen automatisch Firewall-Regeln (Admin-Rechte erforderlich).

### macOS Firewall
1. **Systemeinstellungen** → **Sicherheit** → **Firewall**
2. Bei Aufforderung: Node.js/Python eingehende Verbindungen erlauben

### Router/Netzwerk
Falls Zugriff von außerhalb des lokalen Netzwerks gewünscht:
- Port-Forwarding für 3001 einrichten
- **Nicht empfohlen** ohne Authentifizierung!

## 🐛 Troubleshooting

### Backend startet nicht
- **Port belegt**: Prüfen Sie mit `netstat -an | grep 3001` (Mac/Linux) oder `netstat -an | findstr 3001` (Windows)
- **Fehlende Dependencies**: `cd backend && npm install` ausführen
- **Node.js fehlt**: Node.js von https://nodejs.org installieren
- **Datenbank-Fehler**: Prüfen Sie Schreibrechte im `backend/database/` Ordner

### Frontend kann Backend nicht erreichen
- **Server läuft nicht**: Backend-Server starten mit `npm start`
- **Falsche API-URL**: In Einstellungen → Server-Verbindung die korrekte IP eingeben
- **CORS-Fehler**: Überprüfen Sie `backend/src/server.js` CORS-Konfiguration
- **Firewall blockiert**: Port 3001 in Firewall freigeben

### Verbindungstest schlägt fehl
- **Server-IP prüfen**: Auf Server-PC `ipconfig` (Windows) oder `ifconfig` (Mac/Linux)
- **Ping-Test**: Von Client `ping <server-ip>` ausführen
- **Port-Test**: `telnet <server-ip> 3001` (Windows: Telnet-Client aktivieren)

### Datenbank-Probleme
- **Datenbank neu erstellen**: `werkstatt.db` löschen, Server neu starten
- **Backup wiederherstellen**: Über Web-Interface oder manuell kopieren
- **Schreibrechte fehlen**: Ordner `backend/database/` Vollzugriff geben

### Electron-App startet nicht
- **Port bereits belegt**: Andere Instanz schließen oder Port ändern
- **Windows Defender**: App-Ausführung erlauben
- **Fehlende .NET**: Microsoft .NET Framework installieren

### Performance-Probleme
- **Alte Termine aufräumen**: Papierkorb regelmäßig leeren
- **Datenbank optimieren**: Über Backup → Restore neu aufbauen
- **Zu viele Clients**: Maximale Verbindungen in Electron-App prüfen

### Logs prüfen
- Backend-Logs: `logs/backend.log`
- Frontend-Logs: Browser-Konsole (F12)
- Electron-Logs: Im Server-Status-Fenster

## 🔐 Sicherheitshinweise

⚠️ **Wichtig**: Die Anwendung hat aktuell **keine Authentifizierung**!

### Empfehlungen für Produktivumgebungen
1. **Netzwerk-Isolation**: Nur im lokalen/vertrauenswürdigen Netzwerk betreiben
2. **Firewall**: Zugriff auf vertrauenswürdige IPs beschränken
3. **VPN**: Für externen Zugriff VPN verwenden
4. **Backups**: Regelmäßige automatische Backups aktivieren
5. **Updates**: Software regelmäßig aktualisieren

### Für Internet-Zugriff (nicht empfohlen ohne Anpassungen)
- Authentifizierung implementieren (JWT, Session-basiert)
- HTTPS mit SSL-Zertifikaten
- Rate-Limiting für API-Endpoints
- Input-Validierung verstärken

## 📚 Weitere Dokumentation

- [SCHNELLSTART.md](SCHNELLSTART.md) - Schnelle Inbetriebnahme
- [NETZWERK-INSTALLATION.md](NETZWERK-INSTALLATION.md) - Detaillierte Netzwerk-Anleitung
- [RELEASE-NOTES.md](RELEASE-NOTES.md) - Versionshistorie und Änderungen
- [AGENTS.md](AGENTS.md) - Entwickler-Richtlinien

## 🆕 Neueste Änderungen (v1.0.8)

### Architektur & Sicherheit
- **SQL-Injection-Schutz**: Alle Controller verwenden jetzt parametrisierte Queries
- **Async/Await Migration**: Komplette Modernisierung der Datenbank-Operationen
- **Error-Handling**: Zentrales Middleware-System mit strukturierten Responses
- **Validierungs-Framework**: express-validator für Input-Sanitierung

### Auslastung & Berechnung
- **Dynamische Nebenzeit**: Änderungen an Einstellungen wirken sich sofort auf alle Auslastungsberechnungen aus
- **Verbesserte Zeitleiste**: Endzeit-Berechnung mit Halbstunden-Markierungen
- **Korrigierte Balkenanzeige**: Auslastungsbalken zeigen jetzt korrekte Werte

### Backup & Restore
- **Auto-Migration**: Nach Backup-Restore werden fehlende Tabellen/Spalten automatisch erstellt
- **Tagesübersicht**: Zeigt korrekte Dauer inkl. Nebenzeit und Erweiterungen

### UI-Verbesserungen
- **Verbessertes Scrolling**: Tagesübersicht-Modal scrollt korrekt bei vielen Terminen
- **Kennzeichen-Suche**: Leerzeichen und Bindestriche werden bei der Suche ignoriert

## 🤝 Beitragen

Für Entwickler siehe [AGENTS.md](AGENTS.md) für:
- Code-Style und Konventionen
- Commit-Richtlinien
- Testing-Praktiken
- PR-Prozess

## 📄 Lizenz

Proprietäre Software für interne Nutzung.

---

**Version**: 1.0.8  
**Letztes Update**: Januar 2026
