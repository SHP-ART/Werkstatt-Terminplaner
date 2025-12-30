# Release Notes - Version 1.0.2

## 🐛 Bugfixes & Verbesserungen

### Datenbank-Speicherort verbessert
- **Änderung**: Die Datenbank wird jetzt IMMER im Ordner neben der EXE-Datei gespeichert
- **Betrifft**: Werkstatt-Server.exe und Werkstatt-Terminplaner-Complete.exe
- **Vorteil**: Einfacheres Backup, da alle Daten im gleichen Ordner wie die Anwendung liegen
- **Struktur**: `[EXE-Ordner]/database/werkstatt.db`

### Robustere Erkennung der Electron-App
- Verbesserte Erkennung für gepackte Electron-Apps
- Mehrere Fallback-Methoden für die Pfaderkennung
- Besseres Logging beim Start

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

- Datenbank wird jetzt IMMER neben der EXE gespeichert
- Robustere Erkennung der Electron-App-Umgebung
- Verbessertes Logging beim Start

## 💡 Support

Bei Problemen bitte ein Issue auf GitHub erstellen: https://github.com/SHP-ART/Werkstatt-Terminplaner/issues

---

**Datum**: 30. Dezember 2025
**Version**: 1.0.2
**Build**: Complete App (All-in-One mit ICU-Fix)
