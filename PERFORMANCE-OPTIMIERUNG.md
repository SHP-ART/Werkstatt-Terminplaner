# Performance-Optimierung Report

Folgende Maßnahmen wurden durchgeführt, um die Performance des Backends zu verbessern und die Systemlast zu verringern:

## 1. Datenbank-Optimierungen (SQLite)

### WAL Mode (Write-Ahead Logging)
- **Maßnahme**: Aktivierung von `PRAGMA journal_mode = WAL;` und `PRAGMA synchronous = NORMAL;`.
- **Effekt**: 
  - Erheblich bessere Nebenläufigkeit (Lesen blockiert Schreiben nicht und umgekehrt).
  - Schnellere Schreiboperationen durch optimiertes Sync-Verhalten.

### Indizierung
- **Maßnahme**: Hinzufügen von fehlenden Indizes auf häufig genutzten Spalten:
  - `kunden(name)`: Beschleunigt Kundensuche.
  - `kunden(kennzeichen)`: Beschleunigt Fahrzeugsuche.
  - `termine(geloescht_am)`: Beschleunigt das Filtern aktiver Termine (Standard-Abfrage).
- **Effekt**: Reduzierung der CPU-Last bei Suchanfragen und Listen-Ansichten.

## 2. Server-Konfiguration

### GZIP Komprimierung
- **Maßnahme**: Installation und Aktivierung des `compression` Middleware-Pakets.
- **Effekt**: Reduzierung der übertragenen Datenmenge (JSON-Antworten) um bis zu 70-80%, was die Netzwerklast senkt und die Ladezeiten im Frontend verbessert.

### Body Parser Limit
- **Maßnahme**: Reduzierung des Limits von 50MB auf 10MB.
- **Effekt**: Schutz vor übermäßigem Speicherverbrauch bei großen Requests (DoS-Schutz).

## 3. Code-Optimierungen (Caching)

### In-Memory Caching für Stammdaten
- **Maßnahme**: Implementierung eines Caches (TTL: 1 Minute) für:
  - `MitarbeiterModel.getAll()`
  - `LehrlingeModel.getAll()`
  - `MitarbeiterModel.getAktive()`
  - `LehrlingeModel.getAktive()`
- **Effekt**: 
  - Diese Daten werden sehr häufig abgerufen (z.B. bei jeder Termin-Berechnung und Auslastungs-Anzeige).
  - Der Cache verhindert hunderte unnötige Datenbank-Abfragen pro Minute.
  - Reduziert die I/O-Last auf der Festplatte/SD-Karte.

## Empfohlene nächste Schritte

- **Frontend-Caching**: Implementierung von Caching im Frontend (Service Worker oder LocalStorage) für statische Daten.
- **Log-Rotation**: Überprüfung der Log-Dateien, um sicherzustellen, dass sie nicht unkontrolliert wachsen.
- **Monitoring**: Beobachtung der CPU- und RAM-Auslastung nach dem Neustart.
