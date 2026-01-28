# Release-Build Anleitung - Version 1.4.0

## Problem
Der Build-Prozess von electron-builder benötigt Administrator-Rechte auf Windows, um symbolische Links im Code-Signing-Cache zu erstellen.

## Lösung - Build mit Admin-Rechten

### Option 1: Batch-Skript (Empfohlen)
1. Öffne den Windows Explorer
2. Navigiere zu: `C:\Users\Sven\Documents\Github\Terminplaner\Werkstatt-Terminplaner`
3. Rechtsklick auf `build-release-admin.bat`
4. Wähle "Als Administrator ausführen"
5. Warte ca. 3-5 Minuten auf den Build-Abschluss

### Option 2: PowerShell Admin-Terminal
1. Öffne PowerShell als Administrator (Win + X -> "Windows PowerShell (Administrator)")
2. Führe aus:
   ```powershell
   cd C:\Users\Sven\Documents\Github\Terminplaner\Werkstatt-Terminplaner\backend
   $env:CI = "true"
   npm run build:allinone
   ```

### Option 3: Developer Mode aktivieren (einmalig)
Aktiviere den Windows Developer Mode, um Symlink-Rechte zu erhalten:
1. Windows-Einstellungen öffnen (Win + I)
2. "Update & Sicherheit" -> "Für Entwickler"
3. "Entwicklermodus" aktivieren
4. Neustart
5. Danach kann der Build ohne Admin-Rechte ausgeführt werden

## Nach dem erfolgreichen Build

### Dateien prüfen
Der Build erstellt:
- `backend/dist-allinone/Werkstatt-Terminplaner-Setup-1.4.0.exe` (~370 MB)
- `backend/dist-allinone/latest.yml` (Update-Metadaten)
- `backend/dist-allinone/Werkstatt-Terminplaner-Setup-1.4.0.exe.blockmap` (Update-Optimierung)

### GitHub Release erstellen

#### 1. Tag erstellen
```bash
git tag -a v1.4.0 -m "Release v1.4.0 - KI-Service Integration"
git push origin v1.4.0
```

#### 2. Release auf GitHub erstellen
1. Gehe zu: https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/new
2. Wähle Tag: `v1.4.0`
3. Release-Titel: `Version 1.4.0`
4. Beschreibung (Beispiel):
   ```markdown
   ## Werkstatt Terminplaner v1.4.0
   
   ### Bugfixes
   - 🐛 "Fertig ca." in Intern-Ansicht zeigt jetzt korrekte Endzeit
   - ⏱️ Arbeitszeitberechnung berücksichtigt jetzt manuell eingegebene Zeiten
   - 🚀 `start.bat` repariert für Electron All-in-One Start
   
   ### Neue Features
   - ✨ Neue Funktion `getEffektiveArbeitszeit()` für zentrale Arbeitszeitberechnung
   - 📊 Unterstützung für `arbeitszeiten_details` in allen Zeitberechnungen
   
   ### Verbesserungen
   - `berechneEndzeit()` nutzt jetzt `arbeitszeiten_details` mit höherer Priorität
   - `berechneAuftragFortschritt()` berücksichtigt korrekte Arbeitszeit
   - `berechneRestzeit()` berücksichtigt korrekte Arbeitszeit
   - DATENBANK.md aktualisiert (Schema Version 11)
   
   ### Installation
   1. Lade `Werkstatt-Terminplaner-Setup-1.4.0.exe` herunter
   2. Führe den Installer aus
   3. Folge den Anweisungen
   
   ### Update
   Wenn du bereits eine frühere Version installiert hast, wird das Update automatisch erkannt und installiert.
   ```

5. Assets hochladen:
   - **Werkstatt-Terminplaner-Setup-1.4.0.exe** (PFLICHT für Auto-Update)
   - **latest.yml** (PFLICHT für Auto-Update)
   - Optional: **Werkstatt-Terminplaner-Setup-1.4.0.exe.blockmap**

6. Als "Latest release" markieren
7. "Publish release" klicken

### Auto-Update prüfen
1. Öffne eine ältere Version der App (z.B. 1.3.0)
2. Die App sollte automatisch das Update erkennen
3. Nach dem Neustart wird Version 1.4.0 installiert

## Troubleshooting

### Build schlägt weiterhin fehl
- Prüfe, ob Antiviren-Software den Prozess blockiert
- Lösche den Cache: `Remove-Item -Path "$env:LOCALAPPDATA\electron-builder\Cache" -Recurse -Force`
- Stelle sicher, dass keine anderen Electron-Prozesse laufen

### Update wird nicht gefunden
- Prüfe, dass `latest.yml` korrekt auf GitHub hochgeladen wurde
- Kontrolliere die URL in `latest.yml`: Dateiname muss exakt mit dem hochgeladenen Asset übereinstimmen
- Stelle sicher, dass das Release als "Latest release" markiert ist

### GitHub API Rate Limit
Wenn electron-builder beim Veröffentlichen einen Fehler meldet:
```bash
# Setze GitHub Token
$env:GH_TOKEN = "dein_github_token"
npm run release
```

Token erstellen: https://github.com/settings/tokens (Berechtigung: `repo`)

## Aktuelle Konfiguration

### Version
- Backend: 1.4.0
- Frontend: (synchron mit Backend)
- Tag: v1.4.0

### Electron-Builder Config
- Datei: `backend/electron-builder-allinone.json`
- Output: `backend/dist-allinone/`
- Publisher: GitHub (SHP-ART/Werkstatt-Terminplaner)
- Auto-Update: Aktiviert via electron-updater

### Repository
- GitHub: SHP-ART/Werkstatt-Terminplaner
- Branch: master
- Letzter Commit: 795c1c8 (23 Commits ahead)
