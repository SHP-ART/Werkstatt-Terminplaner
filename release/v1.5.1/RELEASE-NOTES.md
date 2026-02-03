# Werkstatt Terminplaner v1.5.1

## 🎉 Neue Features

### 📱 Zentrale Tablet-Display-Steuerung
- **Server-basierte Konfiguration:** Steuern Sie alle Tablet-Displays zentral vom Server-Frontend
- **Automatische Zeitsteuerung:** Definieren Sie Ein-/Ausschaltzeiten für alle Tablets
- **Manuelle Steuerung:** Schalten Sie alle Displays sofort manuell ein/aus oder nutzen Sie den Automatik-Modus
- **Server-Synchronisation:** Tablets laden Einstellungen automatisch alle 30 Sekunden vom Server
- **Offline-Fallback:** Bei Server-Ausfall nutzen Tablets ihre lokalen Einstellungen

## 🔧 Technische Änderungen

### Backend
- Migration 019: Neue Tabelle `tablet_einstellungen`
- Neuer API-Endpoint: `GET /api/tablet/einstellungen`
- Neuer API-Endpoint: `PUT /api/tablet/einstellungen`
- Neuer API-Endpoint: `PUT /api/tablet/display-manuell`
- TabletController, TabletModel, tabletRoutes implementiert

### Frontend
- Neuer Sub-Tab "Tablet-Steuerung" in Einstellungen
- TabletService für API-Kommunikation
- UI für Zeitsteuerung und manuelle Display-Kontrolle
- Status-Anzeige mit visuellem Feedback

### Tablet-App
- Server-Synchronisation für Display-Einstellungen
- IPC-Handler für Display-Zeit-Updates
- Automatische Aktualisierung alle 30 Sekunden
- Fallback auf lokale config.json bei Server-Ausfall

## 📦 Downloads

### Server (AllinOne mit Frontend)
- **Werkstatt-Terminplaner-Setup-1.5.1.exe** (225.89 MB)
  - Kompletter Server mit eingebautem Frontend
  - Electron-basiert, läuft auch ohne Browser
  - Für Windows x64

### Tablet-App
- **Werkstatt-Intern-Tablet-Setup-1.5.1-Win32.exe** (63.45 MB)
  - Für Windows 32-bit Systeme
- **Werkstatt-Intern-Tablet-Setup-1.5.1-Win64.exe** (72.59 MB)
  - Für Windows 64-bit Systeme

## 🚀 Installation

### Server-Update
1. Alte Version stoppen (falls läuft)
2. `Werkstatt-Terminplaner-Setup-1.5.1.exe` ausführen
3. Installation durchführen
4. Server startet automatisch

### Tablet-App-Update
1. Alte Version deinstallieren (optional)
2. Passende Version herunterladen (Win32 oder Win64)
3. Installer ausführen
4. Backend-URL in Einstellungen prüfen (normalerweise `http://SERVER-IP:3001`)

## ⚙️ Verwendung der Tablet-Steuerung

1. **Server-Frontend öffnen:** `http://localhost:3001`
2. **Zu Einstellungen navigieren:** Tab "Einstellungen"
3. **Tablet-Steuerung öffnen:** Sub-Tab "Tablet-Steuerung"
4. **Zeiten einstellen:**
   - Einschaltzeit (Standard: 07:30)
   - Ausschaltzeit (Standard: 18:10)
   - Speichern klicken
5. **Manuelle Steuerung:**
   - "Alle einschalten" - Sofortiges Einschalten aller Displays
   - "Alle ausschalten" - Sofortiges Ausschalten aller Displays
   - "Automatik" - Zurück zur zeitgesteuerten Automatik

## 🔄 Update-Hinweise

- **Datenbank-Migration:** Wird automatisch beim ersten Start ausgeführt
- **Keine Datenverluste:** Alle bestehenden Daten bleiben erhalten
- **Rückwärtskompatibilität:** Alte Tablet-Apps funktionieren weiterhin (ohne neue Features)

## 🐛 Bekannte Probleme

- Keine bekannten kritischen Probleme in dieser Version

## 📝 Vollständiges Changelog

Siehe [CHANGELOG.md](../CHANGELOG.md) für Details zu allen Änderungen.

---

**Entwickelt mit ❤️ für effiziente Werkstatt-Planung**
