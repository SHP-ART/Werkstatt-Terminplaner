# Build-Anleitung für Release-Erstellung

**Werkstatt-Terminplaner Release Build Prozess**

Diese Anleitung beschreibt den kompletten Prozess zur Erstellung eines neuen Releases mit allen benötigten Komponenten.

---

## 📋 Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Voraussetzungen](#voraussetzungen)
3. [Release-Komponenten](#release-komponenten)
4. [Build-Prozess](#build-prozess)
5. [GitHub Release erstellen](#github-release-erstellen)
6. [Update-Fähigkeit testen](#update-fähigkeit-testen)
7. [Troubleshooting](#troubleshooting)

---

## Übersicht

### Benötigte Release-Komponenten

Für jedes Release werden folgende Dateien benötigt:

1. **Backend Server (All-in-One)**
   - `Werkstatt-Terminplaner-Setup-1.x.x.exe` (ca. 370 MB)
   - Enthält: Backend-Server + Frontend + Electron-UI
   - **Wichtig**: Mit Auto-Update-Fähigkeit!

2. **Tablet/Intern-App (64-Bit)**
   - `WerkstattIntern-Setup-x64.exe`
   - Vollbild Team-Übersicht für Tablets

3. **Tablet/Intern-App (32-Bit)**
   - `WerkstattIntern-Setup-ia32.exe`
   - Für ältere 32-Bit Systeme

4. **Update-Metadaten (PFLICHT!)**
   - `latest.yml` - Update-Server Konfiguration
   - `Werkstatt-Terminplaner-Setup-1.x.x.exe.blockmap` - Optimierung für Delta-Updates

---

## Voraussetzungen

### System-Anforderungen
- Windows 10/11
- Administrator-Rechte für Code-Signing
- Node.js 18+ und npm installiert
- Git installiert
- GitHub CLI (`gh`) installiert (optional, für Upload)

### Einmalige Einrichtung

#### Option A: Developer Mode aktivieren (Empfohlen)
```powershell
# Windows-Einstellungen öffnen
# "Update & Sicherheit" -> "Für Entwickler"
# "Entwicklermodus" aktivieren
# Neustart
```
Danach können Builds ohne Admin-Rechte durchgeführt werden.

#### Option B: Als Administrator ausführen
Alle Build-Befehle mit erhöhten Rechten ausführen.

---

## Release-Komponenten

### 1. Backend All-in-One Setup
**Datei:** `Werkstatt-Terminplaner-Setup-1.x.x.exe`  
**Größe:** ~370 MB  
**Enthält:**
- Express Backend-Server (Port 3001)
- Electron Desktop-UI
- Frontend (Vite-gebaut, eingebettet)
- SQLite Datenbank
- Migrations-System
- Auto-Update-Fähigkeit via `electron-updater`

**Build-Konfiguration:** `backend/electron-builder-allinone.json`

### 2. Tablet-App 64-Bit
**Datei:** `WerkstattIntern-Setup-x64.exe`  
**Größe:** ~150 MB  
**Enthält:**
- Vollbild Electron-App
- Team-Übersicht/Intern-Ansicht
- Verbindung zu Backend via API (http://localhost:3001)

**Build-Konfiguration:** `electron-intern-tablet/package.json`

### 3. Tablet-App 32-Bit
**Datei:** `WerkstattIntern-Setup-ia32.exe`  
**Größe:** ~140 MB  
**Zweck:** Ältere 32-Bit Windows-Systeme

---

## Build-Prozess

### Schritt 1: Version aktualisieren

```bash
# 1. Version in allen package.json Dateien aktualisieren
# backend/package.json
# frontend/package.json
# electron-intern-tablet/package.json

# 2. Version_1.x.x.md erstellen (siehe Version_1.5.0.md als Beispiel)
```

### Schritt 2: Frontend bauen

```bash
cd frontend
npm install
npm run build
```

**Ausgabe:** `frontend/dist/` mit index.html, CSS und JS

### Schritt 3: Backend All-in-One Setup bauen

**Mit Admin-Rechte (Batch-Datei):**
```bash
# Rechtsklick auf build-release-admin.bat
# "Als Administrator ausführen"
```

**Mit PowerShell als Administrator:**
```powershell
cd C:\Users\Sven\Documents\Github\Terminplaner\Werkstatt-Terminplaner\backend
$env:CI = "true"
npm run build:allinone
```

**Mit Developer Mode (ohne Admin):**
```bash
cd backend
npm run build:allinone
```

**Build-Dauer:** 3-5 Minuten

**Ausgabe-Dateien:**
```
backend/dist-allinone/
  ├── Werkstatt-Terminplaner-Setup-1.x.x.exe
  ├── latest.yml
  └── Werkstatt-Terminplaner-Setup-1.x.x.exe.blockmap
```

### Schritt 4: Tablet-App bauen (64-Bit + 32-Bit)

```bash
cd electron-intern-tablet
npm install

# Build beide Architekturen
npm run build  # Erstellt x64 und ia32

# Oder einzeln:
# npm run build:win  # x64 + ia32
```

**Ausgabe-Dateien:**
```
electron-intern-tablet/dist/
  ├── WerkstattIntern-Setup-x64.exe    # 64-Bit Installer
  ├── WerkstattIntern-Setup-ia32.exe   # 32-Bit Installer
  ├── WerkstattIntern-Portable.exe     # Portable Version
  └── latest.yml
```

### Schritt 5: Alle Dateien prüfen

**Checklist:**
- [ ] `backend/dist-allinone/Werkstatt-Terminplaner-Setup-1.x.x.exe` (ca. 370 MB)
- [ ] `backend/dist-allinone/latest.yml`
- [ ] `backend/dist-allinone/Werkstatt-Terminplaner-Setup-1.x.x.exe.blockmap`
- [ ] `electron-intern-tablet/dist/WerkstattIntern-Setup-x64.exe` (ca. 150 MB)
- [ ] `electron-intern-tablet/dist/WerkstattIntern-Setup-ia32.exe` (ca. 140 MB)

---

## GitHub Release erstellen

### Schritt 1: Git Tag erstellen

```bash
# Aktualisierte Dateien committen
git add .
git commit -m "Release v1.x.x"

# Tag erstellen
git tag -a v1.x.x -m "Release v1.x.x - Kurze Beschreibung"

# Tag pushen
git push origin v1.x.x
git push origin master
```

### Schritt 2: Release auf GitHub erstellen

**Via GitHub Web-Interface:**

1. Gehe zu: https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/new
2. Wähle Tag: `v1.x.x`
3. Release-Titel: `Version 1.x.x - Titel`
4. Beschreibung schreiben (siehe Version_1.x.x.md)
5. **Assets hochladen (WICHTIG!):**

**PFLICHT für Auto-Update:**
```
✅ Werkstatt-Terminplaner-Setup-1.x.x.exe
✅ latest.yml
✅ Werkstatt-Terminplaner-Setup-1.x.x.exe.blockmap
```

**Optional (für manuelle Installation):**
```
✅ WerkstattIntern-Setup-x64.exe
✅ WerkstattIntern-Setup-ia32.exe
✅ WerkstattIntern-Portable.exe
```

6. Als **"Latest release"** markieren ✅
7. "Publish release" klicken

**Via GitHub CLI:**
```bash
# Release erstellen
gh release create v1.x.x \
  --title "Version 1.x.x - Titel" \
  --notes-file Version_1.x.x.md

# Assets hochladen
cd backend/dist-allinone
gh release upload v1.x.x \
  "Werkstatt-Terminplaner-Setup-1.x.x.exe" \
  "latest.yml" \
  "Werkstatt-Terminplaner-Setup-1.x.x.exe.blockmap" \
  --clobber

# Tablet-App hochladen
cd ../../electron-intern-tablet/dist
gh release upload v1.x.x \
  "WerkstattIntern-Setup-x64.exe" \
  "WerkstattIntern-Setup-ia32.exe" \
  "WerkstattIntern-Portable.exe" \
  --clobber
```

### Schritt 3: Auto-Update Konfiguration prüfen

**Wichtig:** `latest.yml` muss folgende Struktur haben:

```yaml
version: 1.x.x
files:
  - url: Werkstatt-Terminplaner-Setup-1.x.x.exe
    sha512: [automatisch generiert]
    size: [automatisch generiert]
path: Werkstatt-Terminplaner-Setup-1.x.x.exe
sha512: [automatisch generiert]
releaseDate: '2026-02-03T...'
```

Diese Datei wird automatisch von `electron-builder` erstellt.

---

## Update-Fähigkeit testen

### Test 1: Lokaler Update-Test

1. **Alte Version installieren:**
   - Installiere vorherige Version (z.B. v1.4.0)
   - Starte die Anwendung

2. **Neue Version bereitstellen:**
   - GitHub Release mit neuer Version erstellen
   - `latest.yml` und Setup-Datei hochladen

3. **Update prüfen:**
   - Alte Version öffnen
   - Nach ~10 Sekunden sollte Update-Benachrichtigung erscheinen
   - "Jetzt aktualisieren" klicken
   - App lädt Update im Hintergrund herunter
   - Nach Neustart: Neue Version aktiv

### Test 2: Manuelle Installation

1. **Setup-Datei herunterladen:**
   - Von GitHub Release herunterladen
   - Doppelklick auf `Werkstatt-Terminplaner-Setup-1.x.x.exe`

2. **Installation prüfen:**
   - App startet automatisch nach Installation
   - Version in Info-Dialog prüfen
   - Funktionen testen

### Test 3: Migration prüfen

Wenn Datenbank-Migrationen vorhanden sind:

1. **Alte Datenbank verwenden:**
   - Kopiere alte `werkstatt.db` nach `backend/database/`
   
2. **Server starten:**
   ```bash
   npm start
   ```

3. **Migrations-Log prüfen:**
   ```
   📊 Aktuelle Schema-Version: X
   📊 Verfügbare Migrationen: Y
   🔄 Starte Migration X+1: ...
   ✅ Migration X+1 erfolgreich
   ```

---

## Troubleshooting

### Build-Fehler

#### Problem: "EPERM: operation not permitted, symlink"
**Lösung:**
```powershell
# Als Administrator ausführen oder Developer Mode aktivieren
```

#### Problem: "Cannot find module 'electron'"
**Lösung:**
```bash
npm install --save-dev electron electron-builder
```

#### Problem: Build-Cache Fehler
**Lösung:**
```powershell
# Cache löschen
Remove-Item -Path "$env:LOCALAPPDATA\electron-builder\Cache" -Recurse -Force
npm run build:allinone
```

### Auto-Update funktioniert nicht

#### Problem: Update wird nicht erkannt
**Checkliste:**
- [ ] `latest.yml` auf GitHub hochgeladen?
- [ ] Setup-Datei mit korrektem Namen hochgeladen?
- [ ] Release als "Latest" markiert?
- [ ] Version in `package.json` erhöht?
- [ ] `electron-updater` in Dependencies?

**Lösung:**
```bash
# Prüfe latest.yml URL in electron-main.js
console.log('Update-Feed:', 'https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/latest/download/latest.yml');

# Prüfe ob Datei erreichbar ist
curl https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/latest/download/latest.yml
```

#### Problem: "Update herunterladen fehlgeschlagen"
**Ursachen:**
- Firewall blockiert Download
- GitHub Release nicht öffentlich
- Dateiname stimmt nicht mit `latest.yml` überein

**Lösung:**
```yaml
# latest.yml prüfen - Dateiname muss exakt übereinstimmen!
path: Werkstatt-Terminplaner-Setup-1.5.0.exe  # Muss genau so heißen!
```

### Tablet-App Verbindungsprobleme

#### Problem: "Keine Verbindung zum Server"
**Checkliste:**
- [ ] Backend läuft auf Port 3001?
- [ ] `config.json` hat korrekte IP?
- [ ] Firewall erlaubt Zugriff?

**Lösung:**
```json
// electron-intern-tablet/config.json
{
  "apiUrl": "http://localhost:3001",  // oder IP des Servers
  "refreshInterval": 5000
}
```

### Größe der Setup-Dateien

**Normale Größen:**
- Backend All-in-One: **350-400 MB** (enthält Node.js Runtime + Electron)
- Tablet x64: **140-160 MB**
- Tablet ia32: **130-150 MB**

**Zu groß?**
- `node_modules` in `files` excludiert? ✅
- `dist`, `test`, `docs` excludiert? ✅
- Nur notwendige Dateien in `files` Array? ✅

---

## Schnell-Referenz

### Kompletter Release-Prozess (Checkliste)

```bash
# 1. Version erhöhen
# ✏️ Editiere: backend/package.json, frontend/package.json, electron-intern-tablet/package.json

# 2. Version_1.x.x.md erstellen
# ✏️ Dokumentiere alle Änderungen

# 3. Frontend bauen
cd frontend
npm run build

# 4. Backend All-in-One bauen (als Admin)
cd ../backend
npm run build:allinone

# 5. Tablet-App bauen
cd ../electron-intern-tablet
npm run build

# 6. Git commit & tag
git add .
git commit -m "Release v1.x.x"
git tag -a v1.x.x -m "Release v1.x.x"
git push origin v1.x.x
git push origin master

# 7. GitHub Release erstellen + Assets hochladen
# Via Web-Interface oder gh CLI

# 8. Auto-Update testen
# Alte Version starten -> sollte Update erkennen

# ✅ Fertig!
```

---

## Weitere Ressourcen

- **electron-builder Dokumentation:** https://www.electron.build/
- **electron-updater Dokumentation:** https://www.electron.build/auto-update
- **GitHub Releases API:** https://docs.github.com/en/rest/releases

---

**Erstellt:** 3. Februar 2026  
**Version:** 1.0  
**Autor:** Werkstatt-Terminplaner Team
