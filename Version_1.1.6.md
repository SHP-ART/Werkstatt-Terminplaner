# Version 1.1.6 - Priorität für schwebende Termine

**Release-Datum:** 10. Januar 2025

## 🎯 Neue Funktion: Priorität für wartende Aktionen / schwebende Termine

### Beschreibung
Schwebende Termine (wartende Aktionen) können jetzt mit einer Priorität versehen werden. Dies ermöglicht eine bessere Übersicht und Planung der anstehenden Arbeiten.

### Features
- **Drei Prioritätsstufen:**
  - 🔴 **Hoch** - Dringende Aufträge, die Vorrang haben
  - 🟡 **Mittel** (Standard) - Normale Priorität
  - 🟢 **Niedrig** - Kann warten, keine Eile

### UI-Änderungen
- **Formular "Wartende Aktion erstellen":** Neue Radio-Button-Auswahl für die Priorität mit farblich gestalteten Optionen
- **Wartende Aktionen Liste:** Prioritäts-Badge wird in jeder Karte angezeigt
- **Schwebende Termine Balken:** Prioritäts-Emoji wird im Header des Balkens angezeigt
- **Sortierung:** Neue Sortier-Option "Nach Priorität" im Dropdown

### Technische Änderungen
- **Datenbank:** Neue Spalte `schwebend_prioritaet` in der Termine-Tabelle (automatische Migration)
- **Backend:** termineModel.js create() und update() erweitert
- **Frontend:** app.js und style.css angepasst

## Installation
Bei bestehendem System wird die neue Datenbank-Spalte beim ersten Start automatisch hinzugefügt. Bestehende wartende Aktionen erhalten automatisch die Priorität "mittel".
