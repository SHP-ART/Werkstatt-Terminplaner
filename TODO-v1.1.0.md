# TODO für Version 1.1.0

## ✅ Feature 1: Schwebende Termine Übersicht in Planung & Zuweisung [ERLEDIGT]

### Beschreibung
Eine neue Übersicht in "🏗️ Planung & Zuweisung (Beta)" die alle schwebenden Termine anzeigt. Die Balkenlänge soll die geschätzte Zeit visuell darstellen.

### Implementierte Funktionen
- [x] Neuen Bereich "Schwebende Termine" oberhalb der "Nicht zugeordnet"-Sektion hinzugefügt
- [x] Schwebende Termine als Balken darstellen (Länge = geschätzte Zeit via CSS custom property)
- [x] Farbkodierung nach Dringlichkeit (hoch=rot, mittel=orange, normal=blau, niedrig=grün)
- [x] Tooltip mit Details (Kunde, Kennzeichen, Arbeit, geschätzte Zeit, Abholzeit)
- [x] Drag & Drop von schwebenden Terminen auf die Mitarbeiter-Timeline
- [x] Bei Drop: Schwebend-Status automatisch aufheben (warSchwebend Flag + setSchwebend API)
- [x] Sortierung nach: Datum, Dauer, Kunde, Dringlichkeit (via Select-Dropdown)

### Technische Umsetzung
- `loadAuslastungDragDrop()` erweitert um `renderSchwebendeTermine()` Aufruf
- HTML: Neuer Bereich `.schwebende-panel` mit Container und Sortierungs-Controls
- CSS: Balken-Darstellung mit proportionaler Breite, Hover-Effekte, Tooltips
- JavaScript: `renderSchwebendeTermine()`, `createSchwebenderTerminBar()`, `sortSchwebendeTermineArray()`, `getTerminDringlichkeit()`
- UI-Update: Schwebende Bar wird beim Drop aus Panel entfernt

---

## Feature 2: Ersatzauto-Rückgabe bei Abholzeit planen

### Beschreibung
Ersatzautos sollen automatisch zur Abholzeit des Kunden wieder verfügbar werden. Das System plant die Rückgabe basierend auf der Abholzeit des Termins.

### Aufgaben
- [ ] Ersatzauto-Verfügbarkeit bis `abholung_zeit` des Termins blockieren
- [ ] Neue Übersicht "Ersatzauto-Verfügbarkeit" erstellen
- [ ] Anzeige: Welches Ersatzauto ist wann belegt
- [ ] Warnung bei Doppelbuchung (Ersatzauto noch nicht zurück)
- [ ] Kalender-Ansicht für Ersatzauto-Belegung
- [ ] Bei Termin-Erstellung: Prüfen ob Ersatzauto zur gewünschten Zeit verfügbar
- [ ] Benachrichtigung wenn Ersatzauto zurückgegeben werden soll

### Technische Umsetzung
- Neue Tabelle oder Feld für Ersatzauto-Buchungen
- `ersatzauto_von_zeit` und `ersatzauto_bis_zeit` in Terminen nutzen
- API-Endpunkt für Ersatzauto-Verfügbarkeit: `GET /api/ersatzautos/verfuegbarkeit?datum=YYYY-MM-DD`
- Frontend: Neue Komponente für Ersatzauto-Übersicht
- Validierung bei Termin-Speicherung

### Datenbank-Änderungen
```sql
-- Neue Spalten falls nötig
ALTER TABLE termine ADD COLUMN ersatzauto_id INTEGER;
ALTER TABLE termine ADD COLUMN ersatzauto_von_zeit TEXT;
-- ersatzauto_bis_zeit existiert bereits als ersatzauto_bis_datum + ersatzauto_bis_zeit

-- Neue Tabelle für Ersatzautos
CREATE TABLE IF NOT EXISTS ersatzautos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kennzeichen TEXT UNIQUE NOT NULL,
  bezeichnung TEXT,
  aktiv INTEGER DEFAULT 1,
  erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

---

## Bug 1: Schwebender Termin wird beim Drop auf falsches Datum gespeichert

### Beschreibung
Wenn ein schwebender Termin per Drag & Drop auf einen anderen Tag (nicht das ursprüngliche `datum`) in der Timeline platziert wird, wird nur die `startzeit` aktualisiert, aber das `datum` bleibt unverändert. Der Termin erscheint dann am falschen Tag.

### Erwartetes Verhalten
Beim Einfügen eines schwebenden Termins auf einem späteren Datum soll:
1. Das `datum`-Feld auf das Ziel-Datum aktualisiert werden
2. Die `startzeit` entsprechend der Drop-Position gesetzt werden
3. Der `ist_schwebend`-Status auf 0 gesetzt werden

### Aufgaben
- [ ] Prüfen, welches Datum beim Drop übergeben wird (Frontend → API)
- [ ] `loadAuslastungDragDrop()` anpassen: Datum aus Drop-Ziel ermitteln
- [ ] API-Aufruf erweitern: `datum` zusätzlich zur `startzeit` mitschicken
- [ ] Backend-Update validieren: `datum` wird korrekt gespeichert
- [ ] Testen: Schwebenden Termin auf Tag+1, Tag+7 etc. verschieben

### Technische Analyse
Die Termine-Tabelle hat bereits die nötigen Felder:
- `datum` (DATE) - Termin-Datum → **muss beim Drop aktualisiert werden**
- `startzeit` (TEXT) - Startzeit im Format "HH:MM" → wird bereits gesetzt
- `ist_schwebend` (INTEGER) - 0/1 → wird bereits auf 0 gesetzt

**Kein neues Datenbankfeld nötig** - das `datum`-Feld existiert bereits, es muss nur korrekt beim Drop-Event aktualisiert werden.

### Betroffene Dateien
- `frontend/src/components/app.js` (Drag & Drop Logik)
- `backend/src/controllers/termineController.js` (Update-Endpoint)
- `backend/src/models/termineModel.js` (Update-Query)

---

## Bug 2: Datum wird beim Termin-Anlegen nicht übernommen

### Beschreibung
Wenn ein neuer Termin erstellt wird und ein bestimmtes Datum ausgewählt wird, wird das Datum nicht korrekt gespeichert. Der Termin erscheint dann am falschen Tag (vermutlich heutiges Datum oder ein Standardwert).

### Erwartetes Verhalten
Das im Formular ausgewählte Datum soll:
1. Korrekt an die API übergeben werden
2. In der Datenbank gespeichert werden
3. Der Termin soll am ausgewählten Tag erscheinen

### Aufgaben
- [ ] Prüfen, ob das Datum-Feld im Formular korrekt ausgelesen wird
- [ ] Prüfen, ob das Datum beim API-Aufruf (`POST /api/termine`) mitgeschickt wird
- [ ] Prüfen, ob das Datum-Format korrekt ist (YYYY-MM-DD erwartet)
- [ ] Backend: Validieren ob `datum` korrekt in die DB geschrieben wird
- [ ] Console-Log / Debug: Werte vor dem Speichern prüfen

### Mögliche Ursachen
1. **Tab-Wechsel Reset**: In `handleTabChange()` (Zeile 1746) wird `resetTerminForm()` ohne Parameter aufgerufen → setzt Datum auf heute zurück
2. Datum-Feld ist versteckt (`opacity: 0`) und wird über Kalender-Klicks befüllt → `selectKalenderDatum()` muss korrekt funktionieren
3. Falsches Datumsformat (z.B. DD.MM.YYYY statt YYYY-MM-DD)
4. Datum wird überschrieben durch Standardwert bei `setTodayDate()`
5. Feldname stimmt nicht überein (z.B. `date` vs `datum`)

### Betroffene Dateien
- `frontend/src/components/app.js`:
  - `handleTerminSubmit()` - Zeile 3267: liest `document.getElementById('datum').value`
  - `selectKalenderDatum()` - Zeile 13647: setzt Datum im versteckten Input
  - `resetTerminForm()` - Zeile 872: ruft `setTodayDate(true)` auf
  - `handleTabChange()` - Zeile 1746: ruft `resetTerminForm()` auf
- `backend/src/controllers/termineController.js` (Create-Endpoint)
- `backend/src/models/termineModel.js` (Insert-Query)

### Debug-Logs vorhanden
In `handleTerminSubmit()` (Zeile 3267-3268):
```javascript
console.log('[DEBUG] handleTerminSubmit - Datum aus Formular:', datumValue);
```
In `showTerminVorschau()` (Zeile 3353):
```javascript
console.log('[DEBUG] showTerminVorschau - termin.datum:', termin.datum);
```

---

## Bug 3: Backup-Erstellung verwendet falsches Datum/Zeit

### Beschreibung
Beim Erstellen eines Backups wird nicht das aktuelle Datum und die aktuelle Uhrzeit verwendet. Das Backup erhält möglicherweise einen falschen Zeitstempel.

### Erwartetes Verhalten
Ein neues Backup soll:
1. Den aktuellen Zeitstempel (Datum + Uhrzeit) im Dateinamen haben
2. Die korrekte Erstellungszeit in der Backup-Liste anzeigen
3. Format z.B.: `backup_2026-01-08_14-30-00.db`

### Aufgaben
- [ ] Prüfen, wie der Backup-Dateiname generiert wird
- [ ] Prüfen, ob `new Date()` korrekt verwendet wird
- [ ] Zeitzone-Probleme prüfen (UTC vs. lokale Zeit)
- [ ] Backend: Backup-Erstellungslogik überprüfen

### Betroffene Dateien
- `backend/src/controllers/` oder `backend/src/routes/` - Backup-Endpoint
- Evtl. Frontend falls Zeitstempel dort generiert wird

---

## Zeitplan
- **Start**: Nach Release 1.0.16
- **Ziel-Release**: Version 1.1.0

## Priorität
1. ~~Bug 1 (Schwebender Termin Datum)~~ - ✅ Erledigt
2. Bug 2 (Datum beim Anlegen) - **Kritisch**
3. Bug 3 (Backup Datum/Zeit) - Mittel
4. Feature 1 (Schwebende Termine Übersicht) - Hohe Priorität
5. Feature 2 (Ersatzautos) - Mittlere Priorität

---

## ✅ Erledigte Verbesserungen

### Bug 1: Schwebender Termin Datum beim Drop (erledigt)
- **Problem**: Beim Verschieben eines schwebenden Termins auf einen anderen Tag wurde nur die Startzeit aktualisiert, nicht das Datum
- **Lösung**:
  - `moveTerminToMitarbeiterWithTime()`: Liest jetzt das Ziel-Datum aus dem Planungs-Datumsfeld
  - `moveArbeitBlockToMitarbeiter()`: Gleiche Anpassung für einzelne Arbeitsblöcke
  - `savePlanungAenderungen()`: Sendet das `datum`-Feld an die API
  - Beide Fälle (Termin-weite und Arbeits-spezifische Änderungen) werden abgedeckt

### "Jetzt"-Balken in Timeline-Ansichten (erledigt)
- **Problem**: Der "Jetzt"-Balken blieb stehen und wurde nicht aktualisiert
- **Lösung**:
  - `pixelPerHour` von 80 auf 100 korrigiert (Planungs-Tab)
  - Automatische Aktualisierung alle 60 Sekunden eingebaut
  - Für beide Tabs implementiert: 🏗️ Planung & Zuweisung + 📈 Auslastungsanzeige
  - Interval wird beim Tab-Wechsel sauber gestoppt (kein Memory Leak)
