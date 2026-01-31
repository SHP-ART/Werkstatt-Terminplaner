# Werkstatt Intern - Tablet App

Eigenständige Electron-App für die Team-Übersicht auf Tablets im Vollbild-Modus.

## Features

- 👷 Mitarbeiter-Übersicht mit aktuellem Auftrag
- 🎓 Lehrlinge-Übersicht mit Berufsschul-Erkennung
- ⏱️ Echtzeit-Fortschrittsanzeige
- 🔄 Auto-Refresh alle 30 Sekunden (konfigurierbar)
- 📺 Vollbild-Modus für Tablets
- ⚙️ Einstellungen direkt in der App änderbar
- 📁 **Externe config.json** neben der .exe
- 🚀 **Autostart** bei Windows-Anmeldung

## Voraussetzungen

- Node.js 18+ installiert
- Das Werkstatt-Backend muss laufen und erreichbar sein

## Installation

```bash
# In das Verzeichnis wechseln
cd electron-intern-tablet

# Abhängigkeiten installieren
npm install
```

## Entwicklung

```bash
# App im Entwicklungsmodus starten
npm start

# Mit DevTools
npm start -- --dev
```

## Build für Windows

```bash
# Portable .exe erstellen (keine Installation nötig)
npm run build:portable

# Installer .exe erstellen
npm run build:win
```

Die fertigen Dateien befinden sich dann im `dist/` Ordner:
- `WerkstattIntern-Portable.exe` - Portable Version (direkt ausführbar)
- `Werkstatt Intern Setup X.X.X.exe` - Installer

## Konfiguration

### config.json (externe Datei)

Die Konfiguration wird in einer **config.json** neben der .exe gespeichert:

```
C:\Werkstatt\
├── WerkstattIntern-Portable.exe
└── config.json    ← Diese Datei bearbeiten
```

Inhalt der **config.json**:

```json
{
  "backendUrl": "http://192.168.1.100:3000",
  "fullscreen": true,
  "kiosk": false,
  "refreshInterval": 30,
  "autostart": true
}
```

| Option | Beschreibung |
|--------|--------------|
| `backendUrl` | URL des Werkstatt-Backends (IP:Port) |
| `fullscreen` | `true` = Vollbild beim Start |
| `kiosk` | `true` = Kiosk-Modus (kein Taskbar, kein Alt+Tab) |
| `refreshInterval` | Auto-Refresh in Sekunden |
| `autostart` | `true` = Startet automatisch bei Windows-Anmeldung |

### Einstellungen in der App ändern

1. Klicke auf ⚙️ (Einstellungen-Button)
2. Ändere die gewünschten Optionen
3. Klicke "Speichern"

Die Änderungen werden in der `config.json` gespeichert.

### Autostart aktivieren

**Option 1: In der App**
1. Öffne Einstellungen (⚙️)
2. Aktiviere "Autostart bei Windows-Anmeldung"
3. Speichern

**Option 2: In config.json**
```json
{
  "autostart": true
}
```

Die App wird dann bei jedem Windows-Start automatisch geöffnet.

## Tastenkürzel

- **F5** - Manuell aktualisieren
- **F11** - Vollbild ein/aus
- **Escape** - Vollbild beenden

## Troubleshooting

### "Fehler beim Laden der Daten"

1. Prüfe ob das Backend läuft
2. Prüfe die Backend-URL in den Einstellungen
3. Stelle sicher, dass die Firewall die Verbindung erlaubt

### App startet nicht

1. Prüfe ob Node.js installiert ist: `node --version`
2. Führe `npm install` erneut aus
3. Lösche `node_modules/` und `package-lock.json`, dann `npm install`

## Für Tablets empfohlen

- Windows Tablet mit mindestens 10" Display
- Auflösung: mindestens 1280x800
- Kiosk-Modus aktivieren für dedizierte Anzeige
