# Changelog

All notable changes to this project will be documented in this file.

## [1.4.0] - 2026-01-28

### Added
- Neue Hilfsfunktion `getEffektiveArbeitszeit(termin)` für zentrale Arbeitszeitberechnung
- Unterstützung für manuell eingegebene Arbeitszeiten (`arbeitszeiten_details`) in allen Zeitberechnungen

### Changed
- `start.bat` angepasst für Electron All-in-One Start (statt separate Server)
- `berechneEndzeit()` nutzt jetzt `arbeitszeiten_details` mit höherer Priorität als `geschaetzte_zeit`
- `berechneAuftragFortschritt()` berücksichtigt jetzt die korrekte Arbeitszeit aus `arbeitszeiten_details`
- `berechneRestzeit()` berücksichtigt jetzt die korrekte Arbeitszeit aus `arbeitszeiten_details`
- DATENBANK.md aktualisiert mit fehlenden KI-Feldern (Schema Version 11)

### Fixed
- **Bug-Fix**: "Fertig ca." bei Intern-Ansicht zeigte falsches Feld (`geschaetzte_zeit` statt `arbeitszeiten_details`)
- Intern-Tab zeigt jetzt korrekt die manuell eingegebene Arbeitszeit als Basis für Endzeit-Berechnung

## [1.3.0] - 2026-01-21

### Added
- Local AI mode with heuristic suggestions and daily time-estimation training.
- Smart Scheduling and Anomaly Detection toggles in settings.
- AI time estimate alias endpoint: `POST /api/ai/estimate-time`.
- Settings endpoints for KI mode, realtime, smart scheduling, and anomaly detection.

### Changed
- KI planning now supports local mode with heuristic scheduling when enabled.
- Settings payloads expose KI mode and realtime toggles.

### Fixed
- N/A

## [1.2.1] - 2026-01-21

- Baseline release notes tracked in `Version_1.2.1.md`.
