# Fix: Tablet-Einstellungen gehen bei Installation verloren

## Problem (GELÖST)

❌ **Vorher:** Bei jeder Neuinstallation der Tablet-Software wurden die Einstellungen (config.json) gelöscht.

**Ursache:** Die Einstellungsdatei wurde im Programmverzeichnis gespeichert, das bei Updates/Neuinstallationen überschrieben wird:
```
C:\Program Files\Werkstatt Intern\config.json  ← Wird gelöscht!
```

## Lösung

✅ **Jetzt:** Einstellungen werden im persistenten userData-Verzeichnis gespeichert:

```
C:\Users\USERNAME\AppData\Roaming\werkstatt-intern-tablet\config.json  ← Bleibt erhalten!
```

Dieses Verzeichnis wird von Windows/Electron verwaltet und **bleibt bei Updates erhalten**.

## Was wurde geändert?

### Datei: `electron-intern-tablet/main.js`

**Vorher:**
```javascript
function getConfigPath() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'config.json');
  }
  return path.join(__dirname, 'config.json');
}
```

**Nachher:**
```javascript
function getConfigPath() {
  // Im Production: Verwende userData (persistent über Updates)
  if (app.isPackaged) {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'config.json');
  }
  return path.join(__dirname, 'config.json');
}
```

## Vorteile

1. ✅ **Einstellungen bleiben erhalten** bei Updates
2. ✅ **Einstellungen bleiben erhalten** bei Neuinstallationen
3. ✅ **Pro-Benutzer-Konfiguration** möglich
4. ✅ **Standard Windows-Verzeichnis** für App-Daten
5. ✅ **Automatisches Backup** via Windows-Backup-Tools

## Migration bestehender Installationen

Wenn bereits Tablets mit der alten Version installiert sind:

### Option 1: Automatische Migration (empfohlen)
Die Einstellungen werden beim ersten Start der neuen Version automatisch ins neue Verzeichnis kopiert, falls noch nicht vorhanden.

### Option 2: Manuelle Migration
Falls nötig, kannst du die alte config.json manuell kopieren:

**Alter Pfad:**
```
C:\Program Files\Werkstatt Intern\config.json
```

**Neuer Pfad:**
```
C:\Users\USERNAME\AppData\Roaming\werkstatt-intern-tablet\config.json
```

## Testen

So prüfst du, ob das Problem behoben ist:

1. **Installiere die Tablet-App** (neue Version)
2. **Konfiguriere Einstellungen:**
   - Backend-URL
   - Refresh-Intervall
   - Display-Zeiten
3. **Notiere die Einstellungen**
4. **Deinstalliere die App** komplett
5. **Installiere die App neu**
6. **Prüfe:** Einstellungen sollten noch da sein! ✅

## Wo sind meine Einstellungen?

### Entwicklungsmodus (npm start)
```
<projektverzeichnis>/electron-intern-tablet/config.json
```

### Production (installierte App)
```
C:\Users\<USERNAME>\AppData\Roaming\werkstatt-intern-tablet\config.json
```

Du kannst das Verzeichnis öffnen:
1. Windows-Taste + R
2. Eingeben: `%APPDATA%\werkstatt-intern-tablet`
3. Enter

## Einstellungsformat

Die `config.json` enthält:

```json
{
  "backendUrl": "http://192.168.1.100:3001",
  "fullscreen": true,
  "kiosk": false,
  "refreshInterval": 30,
  "autostart": true,
  "displayOffTime": "18:10",
  "displayOnTime": "07:30"
}
```

## Was passiert beim ersten Start?

1. **Neue Installation:** Standard-Einstellungen werden erstellt
2. **Update:** Alte Einstellungen werden beibehalten
3. **Keine config.json vorhanden:** Automatisch erstellt mit Defaults

## Backup

Empfehlung: Sichere die Einstellungen regelmäßig:

```batch
REM Windows Batch-Skript
copy "%APPDATA%\werkstatt-intern-tablet\config.json" "C:\Backup\tablet-config-backup.json"
```

## Troubleshooting

### Problem: Einstellungen werden trotzdem nicht gespeichert

**Lösung 1:** Prüfe Schreibrechte
```powershell
# PowerShell - Prüfe ob Verzeichnis existiert und beschreibbar ist
Test-Path "$env:APPDATA\werkstatt-intern-tablet"
```

**Lösung 2:** Erstelle Verzeichnis manuell
```powershell
# PowerShell - Erstelle Verzeichnis
New-Item -ItemType Directory -Force -Path "$env:APPDATA\werkstatt-intern-tablet"
```

**Lösung 3:** Prüfe Antivirus/Sicherheitssoftware
- Manche Antivirus-Programme blockieren Zugriff auf AppData
- Füge Ausnahme hinzu für: `werkstatt-intern-tablet.exe`

### Problem: Ich finde meine alten Einstellungen nicht

Die alten Einstellungen sind möglicherweise noch hier:
```
C:\Program Files\Werkstatt Intern\config.json
```

Kopiere sie einfach nach:
```
C:\Users\<DEIN_USERNAME>\AppData\Roaming\werkstatt-intern-tablet\config.json
```

## Zusammenfassung

✅ **Das Problem ist gelöst!**

- Einstellungen werden jetzt im userData-Verzeichnis gespeichert
- Überleben Updates und Neuinstallationen
- Standard Windows-Praxis
- Automatisch beim ersten Start erstellt

## Weitere Informationen

Siehe auch:
- [TABLET-REMOTE-UPDATE.md](TABLET-REMOTE-UPDATE.md) - Komplettes Update-System
- [electron-intern-tablet/README.md](electron-intern-tablet/README.md) - Tablet-App Dokumentation

## Version

Dieser Fix ist ab **Version 1.6.0** der Tablet-App verfügbar.
