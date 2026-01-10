# Installer EXE Kompilieren - Anleitung

Diese Anleitung beschreibt, wie die Installer-EXE für den Werkstatt Terminplaner erstellt wird.

---

## 📋 Voraussetzungen

- Node.js (v18 oder höher)
- npm installiert
- Windows-System für EXE-Erstellung (oder Cross-Compilation-Setup)

---

## 🔢 Schritt 1: Versionsnummer aktualisieren

**WICHTIG:** Vor jedem Build müssen die Versionsnummern in **beiden** `package.json` Dateien aktualisiert werden!

### Dateien die aktualisiert werden müssen:

| Datei | Pfad |
|-------|------|
| Backend | `backend/package.json` |
| Frontend | `frontend/package.json` |

### Versionsnummer ändern:

1. **Backend** `backend/package.json`:
```json
{
  "name": "werkstatt-terminplaner-backend",
  "version": "X.X.X",   // ← HIER ÄNDERN
  ...
}
```

2. **Frontend** `frontend/package.json`:
```json
{
  "name": "werkstatt-terminplaner-frontend", 
  "version": "X.X.X",   // ← HIER ÄNDERN
  ...
}
```

> ⚠️ **Beide Dateien müssen die GLEICHE Versionsnummer haben!**

---

## 📝 Schritt 2: Version-Dokumentation erstellen

Für jede neue Version **MUSS** eine Versions-Dokumentation erstellt werden.

### Dateiname-Format:
```
Version_X.X.X.md
```

### Beispiele:
- `Version_1.1.4.md`
- `Version_1.1.5.md`
- `Version_1.2.0.md`

### Speicherort:
Im **Root-Verzeichnis** des Projekts: `/Werkstatt-Terminplaner/Version_X.X.X.md`

### Inhalt der Version-Datei:

```markdown
# Version X.X.X

**Veröffentlichungsdatum:** [Datum]

## Neue Features

### Feature: [Feature-Name]
- Beschreibung der Funktion
- Weitere Details

## Verbesserungen

### Verbesserung: [Name]
- Was wurde verbessert

## Bugfixes

### Fix: [Bug-Name]
- Was wurde behoben

## Änderungen

### Backend
- Beschreibung der Backend-Änderungen

### Frontend  
- Beschreibung der Frontend-Änderungen
```

---

## 🔨 Schritt 3: Build ausführen

### In das Backend-Verzeichnis wechseln:
```bash
cd backend
```

### Dependencies installieren (falls noch nicht geschehen):
```bash
npm install
```

### Build-Befehle:

| Befehl | Beschreibung | Output-Ordner |
|--------|--------------|---------------|
| `npm run build:allinone` | **Empfohlen** - Vollständiger Installer mit NSIS | `dist-allinone/` |
| `npm run build:exe` | Standard portable Build | `dist/` |
| `npm run release` | Build + GitHub Release (automatisch) | `dist-allinone/` |
| `npm run release:draft` | Build + GitHub Draft Release | `dist-allinone/` |

### Empfohlener Build-Befehl:
```bash
npm run build:allinone
```

---

## 📦 Schritt 4: Build-Ergebnis

Nach erfolgreichem Build findest du die Dateien unter:

```
backend/dist-allinone/
├── Werkstatt-Terminplaner-Setup-X.X.X.exe     ← Installer
├── Werkstatt-Terminplaner-Setup-X.X.X.exe.blockmap
└── builder-effective-config.yaml
```

Der Installer-Name enthält automatisch die Versionsnummer aus der `package.json`.

---

## 🔄 Update-Funktion (Auto-Update)

### ⚠️ WICHTIG: Korrekte Dateinamen für Updates

Der Auto-Updater funktioniert **NUR** wenn die Dateinamen exakt stimmen!

### Dateiname-Format (durch electron-builder festgelegt):

```
Werkstatt-Terminplaner-Setup-X.X.X.exe
```

**Beispiele für korrekte Dateinamen:**
- `Werkstatt-Terminplaner-Setup-1.1.4.exe` ✅
- `Werkstatt-Terminplaner-Setup-1.1.5.exe` ✅

**FALSCHE Dateinamen (Update funktioniert NICHT):**
- `Werkstatt Terminplaner Setup 1.1.5.exe` ❌ (Leerzeichen statt Bindestriche)
- `WerkstattTerminplaner-1.1.5.exe` ❌ (Falsches Format)
- `Setup-1.1.5.exe` ❌ (Name fehlt)

### Benötigte Dateien für GitHub Release:

| Datei | Beschreibung | Pflicht |
|-------|-------------|---------|
| `Werkstatt-Terminplaner-Setup-X.X.X.exe` | Installer | ✅ JA |
| `Werkstatt-Terminplaner-Setup-X.X.X.exe.blockmap` | Delta-Update Info | ✅ JA |
| `latest.yml` | Versions-Info für Auto-Updater | ✅ JA |

> ⚠️ **Alle 3 Dateien müssen hochgeladen werden!** Die `latest.yml` wird automatisch beim Build generiert.

### GitHub Release Schritt-für-Schritt:

#### Option A: Automatisch mit npm (Empfohlen)

```bash
cd backend

# GitHub Token setzen (einmalig pro Terminal-Session)
export GH_TOKEN=dein_github_personal_access_token

# Release erstellen und automatisch hochladen
npm run release
```

#### Option B: Manuell auf GitHub

1. **Build erstellen:**
   ```bash
   cd backend
   npm run build:allinone
   ```

2. **Auf GitHub gehen:** https://github.com/shp-art/Werkstatt-Terminplaner/releases

3. **"Draft a new release" klicken**

4. **Tag erstellen:**
   - Tag: `v1.1.5` (mit `v` davor!)
   - Target: `main`

5. **Release Title:** `Version 1.1.5`

6. **Diese 3 Dateien aus `backend/dist-allinone/` hochladen:**
   - `Werkstatt-Terminplaner-Setup-1.1.5.exe`
   - `Werkstatt-Terminplaner-Setup-1.1.5.exe.blockmap`
   - `latest.yml`

7. **"Publish release" klicken** (NICHT als Draft speichern!)

### latest.yml Inhalt (Beispiel):

```yaml
version: 1.1.5
files:
  - url: Werkstatt-Terminplaner-Setup-1.1.5.exe
    sha512: [automatisch generierter Hash]
    size: [Dateigröße in Bytes]
path: Werkstatt-Terminplaner-Setup-1.1.5.exe
sha512: [automatisch generierter Hash]
releaseDate: '2026-01-10T12:00:00.000Z'
```

> Die `latest.yml` wird automatisch von electron-builder generiert. **NICHT manuell erstellen!**

### Update-Ablauf beim Benutzer:

1. App startet → prüft automatisch auf Updates
2. Vergleicht lokale Version mit `latest.yml` auf GitHub
3. Falls neue Version: Download der EXE im Hintergrund
4. Benutzer wird informiert → Klick auf "Jetzt installieren"
5. App schließt → Installer läuft → App startet neu

### Häufige Update-Fehler:

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Update wird nicht gefunden | `latest.yml` fehlt | Datei hochladen |
| Download schlägt fehl | Falscher Dateiname in `latest.yml` | Neu builden, alle 3 Dateien hochladen |
| Update startet nicht | Release ist noch "Draft" | Release veröffentlichen |
| Alte Version wird installiert | Tag stimmt nicht mit Version überein | Tag `vX.X.X` muss zur `package.json` Version passen |

---

## ✅ Checkliste vor dem Release

- [ ] Versionsnummer in `backend/package.json` aktualisiert
- [ ] Versionsnummer in `frontend/package.json` aktualisiert  
- [ ] Beide Versionsnummern sind identisch
- [ ] `Version_X.X.X.md` Datei erstellt mit allen Änderungen
- [ ] Code getestet (manuell: Kunden, Termine, Auslastung)
- [ ] `npm run build:allinone` erfolgreich ausgeführt
- [ ] Installer getestet (Installation + Start)
- [ ] Git Commit mit Versionsnummer erstellt
- [ ] Git Tag erstellt: `git tag vX.X.X`
- [ ] GitHub Release erstellt (optional für Auto-Update)

---

## 🛠️ Build-Konfigurationen

### Verfügbare Builder-Configs:

| Config-Datei | Verwendung |
|--------------|------------|
| `electron-builder-allinone.json` | **Hauptconfig** - Vollständiger Installer |
| `electron-builder-komplett.json` | Portable Version mit Frontend |
| `electron-builder-server.json` | Nur Server ohne Frontend |

### NSIS-Installer Optionen (allinone):

- OneClick Installation: **Nein** (Benutzer kann Pfad wählen)
- Desktop-Verknüpfung: **Ja**
- Startmenü-Eintrag: **Ja**
- Deinstallation löscht App-Daten: **Nein** (Datenbank bleibt erhalten)

---

## 🐛 Häufige Probleme

### Problem: Build schlägt fehl
```bash
# Dependencies neu installieren
rm -rf node_modules
npm install
```

### Problem: Version stimmt nicht
- Prüfe **beide** `package.json` Dateien
- Cache leeren: `rm -rf dist-allinone`

### Problem: Auto-Update funktioniert nicht
- GitHub Release muss **veröffentlicht** sein (nicht Draft)
- Tag muss mit `v` beginnen (z.B. `v1.1.5`)
- EXE und blockmap-Datei müssen im Release sein

---

## 📚 Weitere Dokumentation

- [AUTO-UPDATE.md](AUTO-UPDATE.md) - Details zur Update-Funktion
- [RELEASE-NOTES.md](RELEASE-NOTES.md) - Alle Versionen im Überblick
- [README.md](README.md) - Projekt-Übersicht
