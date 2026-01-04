# Release Notes - Version 1.0.11

## 🐛 Bugfixes

### Datenbank-Reconnect nach Backup-Restore
- **Problem**: Nach Wiederherstellung eines Backups konnte die Datenbank-Verbindung fehlschlagen
- **Lösung**: Verbesserter Reconnect-Mechanismus nach Backup-Restore

## 📖 Dokumentation

### README aktualisiert
- Dokumentation auf aktuellen Stand gebracht

---

# Release Notes - Version 1.0.10

## 🐛 Bugfixes

### Kunden-Import repariert
- **Problem**: Kunden-Import schlug mit "db is not defined" fehl
- **Ursache**: Nach der async/await Migration wurden noch veraltete `db.prepare()` Aufrufe verwendet
- **Lösung**: Alle `db.prepare()` und `stmt.run()` durch `runAsync()` ersetzt

---

# Release Notes - Version 1.0.9

## 🔒 Sicherheit

### SQL-Injection Schutz (KRITISCH)
- **Feature**: Umfassende SQL-Injection-Absicherung aller Datenbank-Abfragen
- **Dateien**: Alle Controller und Models überarbeitet
- **Tests**: 62 Tests, 60 bestanden (96.8%)
- **Dokumentation**: `SQL-INJECTION-TEST-REPORT.md`

## 🚀 Performance & Architektur

### Async/Await Migration komplett
- **Feature**: Alle Datenbank-Operationen auf async/await umgestellt
- **Vorteil**: Bessere Lesbarkeit, weniger Callback-Hell, bessere Fehlerbehandlung

### DB-Transaktionen
- **Feature**: Transaktions-Support für kritische Datenbankoperationen
- **Datei**: `backend/src/utils/transaction.js`
- **Dokumentation**: Getestet und dokumentiert

### Controller-Optimierung (32% abgeschlossen)
- **Status**: 11/34 Tasks erfolgreich umgesetzt
- **Dokumentation**: `CONTROLLER-OPTIMIERUNG-REPORT.md`

## 🐛 Bugfixes

### Auslastungs-Cache bei Einstellungsänderung invalidieren
- **Problem**: Cache wurde bei Änderung der Einstellungen nicht aktualisiert
- **Lösung**: Cache-Invalidierung bei relevanten Einstellungsänderungen

### Auslastungsberechnung und Balkenanzeige korrigiert
- **Problem**: Fehlerhafte Berechnung und Darstellung der Auslastungsbalken
- **Lösung**: Korrigierte Berechnungslogik

### Verbessertes Scrolling im Tagesübersicht-Modal
- **Problem**: Bei vielen Terminen war Scrolling problematisch
- **Lösung**: Optimiertes Scroll-Verhalten

## 🆕 Neue Features

### Backup-Restore mit automatischen Migrationen
- **Feature**: Bei Wiederherstellung eines Backups werden automatisch DB-Migrationen ausgeführt
- **Vorteil**: Alte Backups sind kompatibel mit neuen Versionen

### Verbesserte Zeitleiste
- **Feature**: Endzeit-Berechnung und Halbstunden-Markierungen
- **Vorteil**: Bessere visuelle Darstellung der Termine

## 🛠️ Technische Verbesserungen

### Neues Middleware-System
- **Dateien**:
  - `backend/src/middleware/errorHandler.js` - Globaler Error-Handler
  - `backend/src/middleware/validation.js` - Input-Validierung
- **Vorteil**: Konsistente Fehlerbehandlung

### Neue Utility-Module
- **Dateien**:
  - `backend/src/utils/dbHelper.js` - Datenbank-Hilfsfunktionen
  - `backend/src/utils/errors.js` - Custom Error-Klassen
  - `backend/src/utils/response.js` - Einheitliche Response-Helper
  - `backend/src/utils/transaction.js` - DB-Transaktions-Support

### Konstanten-Modul
- **Datei**: `backend/src/config/constants.js`
- **Vorteil**: Zentrale Verwaltung von Konstanten

---

# Release Notes - Version 1.0.8

## 🏗️ Architektur-Verbesserungen

### Error-Handling komplett überarbeitet
- **Feature**: Zentrales Error-Handler-Middleware-System
- **Dateien**: 
  - `backend/src/middleware/errorHandler.js` - Globaler Error-Handler
  - `backend/src/utils/errors.js` - Custom Error-Klassen (ValidationError, NotFoundError, DatabaseError, etc.)
  - `backend/src/utils/response.js` - Einheitliche Response-Helper
- **Vorteile**:
  - Konsistente API-Responses für alle Fehler
  - SQLite-Error-Handling (UNIQUE, FOREIGN KEY Constraints)
  - Strukturiertes Logging
  - Produktionsbereit (sensitive Fehler werden versteckt)
- **Response-Format**:
  ```json
  // Erfolg:
  { "success": true, "data": {...}, "message": "..." }
  // Fehler:
  { "success": false, "error": "...", "details": {...} }
  ```

### 404-Handler implementiert
- **Feature**: Nicht gefundene API-Routen liefern jetzt strukturierte 404-Responses
- **Format**: `{"success":false,"error":"Route /api/xyz nicht gefunden"}`

### Async Error-Wrapper
- **Feature**: `asyncHandler()` für sauberes Error-Handling in async Controllern
- **Vorbereitung**: Basis für kommende async/await Migration

## 📋 Dokumentation

### CONTROLLER-OPTIMIERUNG.md
- **Feature**: Umfassende TODO-Liste für alle geplanten Optimierungen
- **Struktur**: 34 Tasks in 7 Kategorien
- **Prioritäten**: Kritisch, Wichtig, Mittelfristig, Langfristig, Testing, Dokumentation
- **Sprint-Planung**: 5 Sprints à 1-2 Wochen
- **Status**: 3/34 Tasks (9%) - Error-Handling komplett ✅

---

# Release Notes - Version 1.0.5

## 🆕 Neue Features

### Windows Autostart
- **Feature**: Neuer Tab "Einstellungen" im Server-Status-Fenster
- **Funktion**: Werkstatt Terminplaner kann beim Windows-Start automatisch starten
- **Speicherung**: Einstellung wird in `werkstatt-config.json` gespeichert

### Versionsanzeige
- **Server-Status**: Version wird im Status-Tab angezeigt
- **Frontend-Banner**: Version wird oben rechts im Header angezeigt
- **API**: Neue `/api/server-info` Endpoint liefert Version

### Vereinfachte Auslastung für "Nur Service" Mitarbeiter
- **Berechnung**: Für Mitarbeiter mit Typ "Nur Service" wird eine einfachere Berechnung verwendet
- **Formel**: Belegt = Servicezeit + Arbeitszeit (ohne Nebenzeit-Faktor)
- **Anzeige**: Separate Darstellung mit Arbeitszeit, Servicezeit, Nebenzeit (Info) und Termine

---

# Release Notes - Version 1.0.4

## 🐛 Bugfixes

### Debug-Logging entfernt
- **Problem**: Übermäßiges Debug-Logging in der Konsole
- **Lösung**: Debug-Ausgaben entfernt für saubere Logs

---

# Release Notes - Version 1.0.3

## 🐛 Bugfixes & Verbesserungen

### Fix: "Interner Termin" Formular-Sichtbarkeit
- **Problem**: Das "Interner Termin" Formular blieb nach Tab-Wechsel oder Speichern sichtbar
- **Lösung**: Direkte `style.display` Steuerung anstelle von CSS-Klassen für zuverlässige Sichtbarkeit
- **Betrifft**: Tab "Termine" → Unter-Tabs

### Neu: Interne Auftragsnummer bei Zeitverwaltung
- **Feature**: Neues Eingabefeld "Interne Auftragsnummer" im Modal "Zeiten für einzelne Arbeiten"
- **Speicherung**: Wird in der Datenbank gespeichert und beim Öffnen geladen
- **Position**: Unter "Arbeitszeit in Stunden" mit blauem Info-Styling

## 📦 Release-Dateien

### Werkstatt-Terminplaner-Complete.exe (226 MB)
Komplette All-in-One-Version mit:
- Backend-Server (Port 3001)
- Frontend (im Browser unter http://localhost:3001)
- Integriertes Server-Status-Fenster
- Automatische Datenbankverwaltung
- Backup-Funktionalität

**Empfohlen für**: Einzelplatzinstallationen, Server-PC in Netzwerkumgebungen

### Werkstatt-Server.exe (226 MB)
Backend-Server ohne Frontend:
- Nur Backend-Server (Port 3001)
- Server-Status-Fenster
- Für Netzwerkinstallationen als zentraler Server

**Empfohlen für**: Server-PC in Netzwerkumgebungen

### Werkstatt-Frontend-Backend.exe (201 MB)
Frontend + Backend in einer Datei:
- Vollständige Lösung
- Frontend läuft auf Port 3000
- Backend läuft auf Port 3001

### Werkstatt-Frontend.exe (73 MB)
Nur Frontend:
- Verbindet sich zu externem Backend
- Konfigurierbar über Einstellungen

**Empfohlen für**: Client-PCs in Netzwerkumgebungen

## 🚀 Neue Features (aus vorherigen Versionen)

- ✅ Mehrere PCs können gleichzeitig auf eine zentrale Datenbank zugreifen
- ✅ Server-Konfiguration über Weboberfläche
- ✅ Verbindungstest in den Einstellungen
- ✅ Automatische Backup-Funktionalität
- ✅ WebSocket-Support für Live-Updates

## 📋 Installation

### Einzelplatz
1. `Werkstatt-Terminplaner-Complete.exe` herunterladen
2. Ausführen - fertig!

### Netzwerk (Server)
1. `Werkstatt-Server.exe` auf Server-PC herunterladen und starten
2. IP-Adresse notieren (wird im Status-Fenster angezeigt)
3. Port 3001 in Firewall freigeben

### Netzwerk (Clients)
1. `Werkstatt-Frontend.exe` herunterladen
2. Ausführen und in Einstellungen Server-IP konfigurieren
3. Verbindung testen

Detaillierte Anleitung: [NETZWERK-INSTALLATION.md](https://github.com/SHP-ART/Werkstatt-Terminplaner/blob/master/NETZWERK-INSTALLATION.md)

## 🔧 Technische Details

- **Electron Version**: 39.2.7
- **Node.js**: Integriert
- **Datenbank**: SQLite 5.1.6
- **Backend**: Express 4.18.2
- **WebSocket**: ws 8.18.3

## 📝 Bekannte Einschränkungen

- Windows-only (aktuell)
- SQLite-Datenbank (keine gleichzeitigen Schreibzugriffe aus mehreren Prozessen - nutze Netzwerkversion)

## 🆕 Seit letztem Release

- Fix für "Interner Termin" Formular-Sichtbarkeit
- Neues Feld "Interne Auftragsnummer" bei Zeitverwaltung
- Verbesserte Sub-Tab-Steuerung

## 💡 Support

Bei Problemen bitte ein Issue auf GitHub erstellen: https://github.com/SHP-ART/Werkstatt-Terminplaner/issues

---

**Datum**: 1. Januar 2026
**Version**: 1.0.2
**Build**: Complete App (All-in-One mit ICU-Fix)
