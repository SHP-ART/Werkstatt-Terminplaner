# Auto-Update Mechanismus

Der Werkstatt-Terminplaner unterstützt automatische Updates über GitHub Releases.

## Funktionsweise

1. **Automatische Prüfung**: Beim Start der App wird automatisch geprüft, ob eine neue Version auf GitHub verfügbar ist
2. **Manuelle Prüfung**: Im "Update"-Tab kann jederzeit manuell nach Updates gesucht werden
3. **Download**: Verfügbare Updates können direkt in der App heruntergeladen werden
4. **Installation**: Mit einem Klick wird das Update installiert und die App neu gestartet

## Neues Release veröffentlichen

### Voraussetzungen

1. GitHub Personal Access Token mit `repo` Berechtigung
2. Token als Umgebungsvariable setzen:
   ```bash
   # macOS/Linux
   export GH_TOKEN=dein_github_token
   
   # Windows (PowerShell)
   $env:GH_TOKEN = "dein_github_token"
   
   # Windows (CMD)
   set GH_TOKEN=dein_github_token
   ```

### Release-Workflow

#### 1. Version erhöhen

In `backend/package.json` die Version anpassen:
```json
{
  "version": "1.0.4"
}
```

#### 2. Änderungen committen

```bash
git add -A
git commit -m "Release v1.0.4"
git tag v1.0.4
git push && git push --tags
```

#### 3. Release bauen und veröffentlichen

```bash
cd backend

# Direkt veröffentlichen (Release wird automatisch erstellt)
npm run release

# Oder als Draft veröffentlichen (zum manuellen Prüfen)
npm run release:draft
```

### Manueller Release

Alternativ kann man auch manuell vorgehen:

1. `npm run build:allinone` ausführen
2. Auf GitHub ein neues Release erstellen
3. Die Dateien aus `backend/dist-allinone/` hochladen:
   - `Werkstatt Terminplaner Setup X.X.X.exe` (Installer)
   - `Werkstatt Terminplaner Setup X.X.X.exe.blockmap` (für Delta-Updates)
   - `latest.yml` (wird automatisch generiert)

## Update-Dateien

Der electron-builder generiert automatisch:

| Datei | Beschreibung |
|-------|-------------|
| `*.exe` | Der Windows Installer |
| `*.exe.blockmap` | Ermöglicht Delta-Updates (nur geänderte Teile) |
| `latest.yml` | Enthält Versionsinformationen für den Auto-Updater |

## Konfiguration

Die Update-Konfiguration befindet sich in `backend/electron-builder-allinone.json`:

```json
{
  "publish": {
    "provider": "github",
    "owner": "shp-art",
    "repo": "Werkstatt-Terminplaner",
    "releaseType": "release"
  }
}
```

### Optionen

- `releaseType`: `"release"` (nur stabile), `"prerelease"` (auch Beta), `"draft"` (auch Entwürfe)

## Troubleshooting

### "Updates nur in der installierten Version verfügbar"
- Im Entwicklungsmodus sind Updates deaktiviert
- Nur die installierte .exe prüft auf Updates

### Update-Prüfung schlägt fehl
- Internetverbindung prüfen
- GitHub-Repository muss öffentlich sein ODER Token hinterlegt sein
- Prüfen ob Releases auf GitHub existieren

### Update wird nicht angezeigt
- Die Version im Release muss höher sein als die installierte
- Die `latest.yml` muss im Release vorhanden sein

## UI-Übersicht

Im Server-Fenster gibt es einen "Update"-Tab mit:

- **Aktuelle Version**: Zeigt die installierte Version
- **Status**: Zeigt den Update-Status (Aktuell, Update verfügbar, etc.)
- **Auf Updates prüfen**: Manuelle Update-Prüfung
- **Update herunterladen**: Lädt ein verfügbares Update
- **Update installieren**: Installiert und startet neu

Wenn ein Update verfügbar ist, wird der Tab-Button grün hervorgehoben.
