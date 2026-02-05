# Backup-Speicherort

## Produktiv-Installation (gepackte App)

Backups werden in einem **persistenten Benutzerverzeichnis** gespeichert, das bei Updates **NICHT gelöscht** wird:

### Windows
```
%APPDATA%\Werkstatt-Terminplaner\backups\
```
Vollständiger Pfad:
```
C:\Users\<Benutzername>\AppData\Roaming\Werkstatt-Terminplaner\backups\
```

### Datenbank-Speicherort (Produktiv)
```
%APPDATA%\Werkstatt-Terminplaner\database\werkstatt.db
```

## Development-Modus

Backups werden im Projektverzeichnis gespeichert:
```
backend/backups/
backend/database/werkstatt.db
```

## Wichtige Hinweise

✅ **Backups bleiben bei Updates erhalten**
- Das `%APPDATA%` Verzeichnis wird bei Neuinstallationen/Updates nicht gelöscht
- Alle automatischen und manuellen Backups bleiben sicher gespeichert

✅ **Automatische Backups**
- Beim Server-Start (täglich max. 1 Backup)
- Vor Datenbank-Migrationen
- Vor Backup-Restore (Sicherheits-Backup)

✅ **Manuelle Backups**
- Über Frontend: 🛡️ Backup & Sicherheit
- Werden ebenfalls im persistenten Verzeichnis gespeichert

## Backup-Dateien finden

### Über Windows Explorer
1. Drücke `Windows + R`
2. Gib ein: `%APPDATA%\Werkstatt-Terminplaner\backups`
3. Drücke Enter

### Über das Frontend
- Gehe zu: 🛡️ Backup & Sicherheit
- Alle verfügbaren Backups werden automatisch angezeigt
- Zeigt Datum, Uhrzeit und Größe

## Backup-Verwaltung

- **Automatische Bereinigung:** Älteste Backups werden gelöscht (max. 10 Backups)
- **Manuell löschen:** Über Frontend oder direkt im Backup-Ordner
- **Export:** Backups können aus dem Ordner kopiert und extern gesichert werden
