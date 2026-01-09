# Version 1.1.4

**Veröffentlichungsdatum:** 9. Januar 2026

## Neue Features

### Feature: Schwebende Termine einplanen
- **Drag & Drop**: Schwebende Termine werden automatisch eingeplant wenn sie auf eine Mitarbeiter-Timeline gezogen werden
- **Button "📅 Einplanen"**: Alternativ kann man per Klick einen schwebenden Termin sofort einplanen
- Nach dem Einplanen wird der Termin dem aktuellen Datum zugewiesen

### Feature: Abwesende Mitarbeiter/Lehrlinge in Zeitleiste
- **Tages-Zeitleiste**: Abwesende werden mit 🏥 Badge und rotem Hintergrund markiert
- **Planung & Zuweisung**: Abwesende Mitarbeiter/Lehrlinge haben:
  - Roten Hintergrund mit Schraffur-Muster
  - Badge "🏥 Abwesend" neben dem Namen
  - Kapazitätsanzeige zeigt "0/0 min (abwesend)"
  - **Drop ist blockiert** - man kann keine Termine zuweisen
- Gründe für Abwesenheit: Urlaub, Krank, Berufsschule

### Feature: Erweiterte Info bei "Nicht zugeordnet" Terminen
- **Bringzeit** 🚗↓ wird in der Kachel angezeigt (wenn vorhanden)
- **Abholzeit** 🚗↑ wird in der Kachel angezeigt (wenn vorhanden)
- **Geplante Arbeitszeit** ⏱️ wird mit Emoji deutlicher dargestellt
- Alle Infos auch im Tooltip erweitert

### Feature: Tages-Termine im Kalender anzeigen
- Bei **Termin bearbeiten**: Wenn ein Datum im Kalender ausgewählt wird, werden alle Termine für diesen Tag angezeigt
- Bei **Neuer Termin**: Ebenso werden alle bereits existierenden Termine für den gewählten Tag angezeigt
- Jeder Termin zeigt: Termin-Nr, Kennzeichen, Kunde, Bringzeit, Abholzeit, Arbeitszeit, Status, Arbeit
- Der aktuell bearbeitete Termin wird blau hervorgehoben
- Hilft Überschneidungen zu vermeiden und freie Zeitfenster zu erkennen

### Feature: Klickbare Termin-Liste in "Termin bearbeiten"
- **Dropdown ersetzt durch Liste**: Statt eines Dropdowns werden alle Termine des Tages als klickbare Kacheln angezeigt
- Jede Kachel zeigt: **Termin-Nr**, **Kennzeichen**, **Kundenname**, **Status**, **Bringzeit**, **Abholzeit**, **Arbeitszeit**, **Arbeitsbeschreibung**
- **Klick öffnet Termin**: Ein Klick auf eine Kachel lädt den Termin direkt in das Bearbeitungsformular
- **Aktiver Termin** wird farblich hervorgehoben (blauer Rand)
- Bessere Übersicht als im alten Dropdown

### Verbesserung: Planung & Zuweisung Layout
- **Reihenfolge geändert**: "📋 Nicht zugeordnet" kommt jetzt vor "⏸️ Schwebende Termine"
- **Keine Scrollbars mehr**: Beide Bereiche passen sich automatisch an ihren Inhalt an

### Verbesserung: Kalender-Performance
- **Sofortiges Rendering**: Kalender werden sofort mit allen Tagen angezeigt
- **Auslastung im Hintergrund**: Auslastungsfarben werden asynchron nachgeladen
- **Kein Blocking mehr**: Kein "Lade Auslastung..." mehr, Kalender ist sofort nutzbar
- Gilt für: Such-Kalender und Edit-Kalender in "Termin bearbeiten"

### Verbesserung: Auslastungsanzeige entfernt
- **"Auslastung für gewähltes Datum" Box** im Bearbeitungsformular wurde entfernt
- Redundant, da Termine bereits in der klickbaren Liste angezeigt werden
- Weniger Ablenkung beim Bearbeiten

## Änderungen

### Backend
- `termineModel.js`: `ist_schwebend` kann jetzt über die normale Update-Route geändert werden

### Frontend
- `app.js`: 
  - Abwesenheitsprüfung in `loadAuslastungDragDrop()` für Planung & Zuweisung
  - Abwesenheitsprüfung in `loadZeitleiste()` für Tages-Zeitleiste
  - `renderZeitleiste()` unterstützt jetzt 'abwesend' rowStyle
  - Drop-Zonen werden für abwesende Personen nicht aktiviert
  - Schwebende Termine werden beim Speichern automatisch eingeplant
  - `renderNichtZugeordnetRow()` zeigt Bring/Abholzeit und Arbeitszeit an
  - `loadEditTermine()` rendert jetzt klickbare Liste statt Dropdown
  - `loadTerminZumBearbeitenById()` neu für direktes Laden per Termin-ID
  - `fillEditTerminForm()` extrahierte Funktion für Formular-Befüllung inkl. Kalender-Rendering
  - `renderEditSuchKalender()` optimiert: Sofortiges Rendering, Auslastung im Hintergrund
  - `loadEditSuchKalenderAuslastung()` neu für asynchrones Auslastungs-Update
  - `renderEditAuslastungKalender()` optimiert: Sofortiges Rendering, Auslastung im Hintergrund
  - `loadEditKalenderAuslastung()` neu für asynchrones Auslastungs-Update
  - `handleSubTabChange()` ist jetzt async für bessere Tab-Initialisierung
  - `loadMonatAuslastung()` initialisiert Cache automatisch wenn nicht vorhanden
- `index.html`:
  - `#editTerminAuswahl` Dropdown ersetzt durch `#editTerminListe` Container
  - `#editTerminAuslastungAnzeige` Box im Formular ausgeblendet (redundant)
- `style.css`: 
  - CSS für `.timeline-row.abwesend` und `.abwesend-track`
  - CSS für `.zeitleiste-row.abwesend`
  - CSS für `.abwesend-badge`
  - CSS für `.btn-einplanen` Button
  - CSS für `.zeitleiste-block-zeiten` (Bring/Abholzeit)
  - CSS für `.edit-termin-item` klickbare Liste

## Bugfixes
- **Berufsschul-Wochen**: Können jetzt korrekt gespeichert werden (Controller-Fix aus 1.1.3)
- **Kalender leer**: Kalender werden jetzt sofort gerendert statt auf API-Antworten zu warten
- **toggleEditAbholungDetails**: Falscher Funktionsname in fillEditTerminForm korrigiert
- **TermineService.getByDatum**: Korrigiert zu TermineService.getAll(datum)

## Migration
Keine Datenbank-Migration erforderlich.

## Kompatibilität
- Vollständig abwärtskompatibel mit v1.1.x
- SQLite-Datenbank unverändert
