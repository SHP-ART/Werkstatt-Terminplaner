# TODO für Version 1.1.0

## Feature 1: Schwebende Termine Übersicht in Planung & Zuweisung

### Beschreibung
Eine neue Übersicht in "🏗️ Planung & Zuweisung (Beta)" die alle schwebenden Termine anzeigt. Die Balkenlänge soll die geschätzte Zeit visuell darstellen.

### Aufgaben
- [ ] Neuen Bereich "Schwebende Termine" oberhalb oder seitlich der Timeline hinzufügen
- [ ] Schwebende Termine als Balken darstellen (Länge = geschätzte Zeit)
- [ ] Farbkodierung nach Dringlichkeit oder Arbeit-Typ
- [ ] Tooltip mit Details (Kunde, Arbeit, geschätzte Zeit, Abholzeit)
- [ ] Drag & Drop von schwebenden Terminen auf die Mitarbeiter-Timeline
- [ ] Bei Drop: Schwebend-Status automatisch aufheben
- [ ] Sortierung nach: Datum, Dauer, Kunde

### Technische Umsetzung
- `loadAuslastungDragDrop()` erweitern
- Neuer Bereich im HTML für schwebende Termine
- CSS für Balken-Darstellung mit proportionaler Breite
- Drag-Events für schwebende Termine implementieren

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

## Zeitplan
- **Start**: Nach Release 1.0.16
- **Ziel-Release**: Version 1.1.0

## Priorität
1. Feature 1 (Schwebende Termine) - Hohe Priorität
2. Feature 2 (Ersatzautos) - Mittlere Priorität
