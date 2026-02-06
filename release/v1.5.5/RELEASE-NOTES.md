# Werkstatt Terminplaner v1.5.5

## 🎉 Neue Features

### 🔄 Verbesserte Migrations-Verwaltung
- **Robustes Migrations-System:** Überarbeitetes System mit besserer Fehlerbehandlung
- **Automatische Backups:** Sicherheitsbackups vor jeder Migration
- **Migration Monitor:** Neue Frontend-Komponente zur Überwachung von Migrationen
- **Async Operations:** Neue Utilities für asynchrone Operationen

### ⏸️ Pause-Tracking System
- **Migration 019:** Neue Felder für Pausen-Tracking und Verschoben-Status
- **Pause-Controller:** Backend-API für Pausenverwaltung
- **Echtzeit-Pausenanzeige:** Live-Aktualisierung im Tablet-Display

### 📱 Tablet-Steuerung (aus v1.5.1)
- **Server-basierte Konfiguration:** Zentrale Steuerung aller Tablet-Displays
- **Automatische Zeitsteuerung:** Ein-/Ausschaltzeiten konfigurierbar
- **Manuelle Steuerung:** Sofortige manuelle Display-Kontrolle
- **Server-Synchronisation:** Automatische Updates alle 30 Sekunden

### 🖥️ System-Management
- **System-Controller:** Neue API-Endpunkte für Systemverwaltung
- **Erweiterte Monitoring-Funktionen**
- **Verbesserte Fehlerbehandlung**

## 🔧 Technische Verbesserungen

### Backend
- **Migration 019:** Pause-Tracking + Verschoben-Status
- **Migration 020:** Tablet-Einstellungen (konsolidiert)
- **Verbesserte database.js:** Erweiterte Features und Stabilität
- **Neue Controller:** pauseController.js, systemController.js
- **Neue Routes:** /api/pause, /api/system
- **Async Utils:** backend/src/utils/asyncOperations.js

### Frontend
- **Migration Monitor:** Echtzeit-Überwachung von DB-Migrationen
- **Verbesserte UI:** Tablet-Steuerung im Einstellungen-Tab
- **Neue Services:** Erweiterte API-Kommunikation

### Tablet-App
- **Pausen-Anzeige:** Echtzeitanzeige von Pausen im Display
- **Server-Sync:** Synchronisation mit zentraler Konfiguration
- **Start/Stop-Scripts:** Neue Batch/Shell-Scripts für einfachen Start

### Testing
- **Neue Test-Dateien:** Umfangreiche Tests für Migrationen
- **Migration-Tests:** backend/tests/migrations.test.js
- **Feature-Tests:** backend/test-new-features.js

## 📦 Downloads

### Server (AllinOne mit Frontend)
- **Werkstatt-Terminplaner-Setup-1.5.5.exe** (225.9 MB)
  - Kompletter Server mit eingebautem Frontend
  - Electron-basiert, läuft auch ohne Browser
  - Für Windows x64

### Tablet-App
- **Werkstatt-Intern-Tablet-Setup-1.5.5-Win32.exe** (63.46 MB)
  - Für Windows 32-bit Systeme
- **Werkstatt-Intern-Tablet-Setup-1.5.5-Win64.exe** (72.6 MB)
  - Für Windows 64-bit Systeme

## 🚀 Installation

### Server-Update
1. Alte Version stoppen (falls läuft)
2. `Werkstatt-Terminplaner-Setup-1.5.5.exe` ausführen
3. Installation durchführen
4. Server startet automatisch und führt Migrationen durch

### Tablet-App-Update
1. Alte Version deinstallieren (optional)
2. Passende Version herunterladen (Win32 oder Win64)
3. Installer ausführen
4. Backend-URL in Einstellungen prüfen

## 🔄 Update-Hinweise

### Datenbank-Migrationen
- **Migration 019:** Fügt Pause-Tracking und Verschoben-Status hinzu
- **Migration 020:** Erstellt Tablet-Einstellungen (falls noch nicht vorhanden)
- Werden automatisch beim ersten Start ausgeführt
- Automatisches Backup vor jeder Migration

### Von v1.5.1 upgraden
- Alle Funktionen von v1.5.1 bleiben erhalten
- Neue Pause-Tracking-Features verfügbar
- Tablet-Steuerung unverändert
- Keine manuellen Schritte erforderlich

### Von älteren Versionen (< 1.5.1)
- Alle Migrationen werden automatisch nacheinander ausgeführt
- Kann einige Minuten dauern beim ersten Start
- Backup wird automatisch erstellt
- Bei Problemen: Backup aus `backend/backups/` wiederherstellen

## 📝 Wichtige Änderungen

### Migration System
- Robusteres Migrations-System mit besserer Fehlerbehandlung
- Automatische Backups vor kritischen Änderungen
- Verbesserte Logging und Monitoring
- Frontend-Integration für Migrations-Status

### API-Erweiterungen
- Neue Endpoints: `/api/pause/*`
- Neue Endpoints: `/api/system/*`
- Erweiterte `/api/tablet/*` Endpoints
- Verbesserte Fehlerbehandlung

### Dokumentation
- Neue Datei: MIGRATIONS-IMPROVEMENTS.md
- Erweiterte Test-Dokumentation
- Verbesserte Code-Kommentare

## 🐛 Bekannte Probleme

- Keine kritischen Probleme bekannt
- 6 npm-Schwachstellen (nicht kritisch, betrifft nur Dev-Dependencies)

## 🔗 Weitere Informationen

- **Vollständiges Changelog:** Siehe [CHANGELOG.md](../CHANGELOG.md)
- **Migrations-Details:** Siehe [MIGRATIONS-IMPROVEMENTS.md](../MIGRATIONS-IMPROVEMENTS.md)
- **GitHub Repository:** https://github.com/SHP-ART/Werkstatt-Terminplaner

---

**Entwickelt mit ❤️ für effiziente Werkstatt-Planung**

**Version:** 1.5.5  
**Release-Datum:** 4. Februar 2026  
**Vorherige Version:** 1.5.1
