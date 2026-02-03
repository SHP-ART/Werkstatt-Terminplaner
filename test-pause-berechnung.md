# Test: Pausenberechnung in Timeline-Ansicht

## Problem (BEHOBEN)

Wenn Termine über die Mittagspause von Mitarbeitern/Lehrlingen gelegt wurden, wurde die Pausenzeit nicht korrekt berücksichtigt.

### Beispiel-Szenario:

**Mitarbeiter:** Max Mustermann  
**Arbeitszeit:** 08:00-17:00 Uhr  
**Mittagspause:** 12:00-12:30 Uhr (30 Minuten)  

**Termin:** Bremsen wechseln  
- Geschätzte Dauer: 120 Minuten (2 Stunden reine Arbeitszeit)
- Startzeit: 11:00 Uhr

### Alte Berechnung (FALSCH):
```
Teil 1: 11:00-12:00 (60 min)
Teil 2: 12:30-13:00 (30 min) ❌
Gesamt sichtbar: 90 min
FEHLER: 30 Minuten fehlen!
```

### Neue Berechnung (KORREKT):
```
Teil 1: 11:00-12:00 (60 min)
Teil 2: 12:30-13:30 (60 min) ✅
Gesamt sichtbar: 120 min (Arbeitszeit)
Gesamtdauer inkl. Pause: 150 min (2,5 Stunden)
```

## Änderungen

### Datei: `frontend/src/components/app.js`
**Funktion:** `createTimelineTerminWithPause()`

**Vorher (Zeile ~20145):**
```javascript
// Teil 2: Nach der Pause
const teil2Dauer = endMinutes - pauseEndMinuten;  // ❌ FALSCH
```

**Nachher:**
```javascript
// Teil 2: Nach der Pause
// WICHTIG: Die restliche Arbeitsdauer wird NACH der Pause fortgesetzt
// Die Pausenzeit verlängert also die Gesamtdauer des Termins
const teil2Dauer = dauer - teil1Dauer;  // ✅ KORREKT
```

## Testfälle

### Testfall 1: Termin über Mittagspause
- **Startzeit:** 11:00
- **Dauer:** 120 min
- **Pause:** 12:00-12:30
- **Erwartet:** Teil1 (11:00-12:00, 60min) + Teil2 (12:30-13:30, 60min)

### Testfall 2: Langer Termin ab Arbeitsbeginn
- **Startzeit:** 08:00
- **Dauer:** 300 min (5 Stunden)
- **Pause:** 12:00-12:30
- **Erwartet:** Teil1 (08:00-12:00, 240min) + Teil2 (12:30-13:30, 60min)

### Testfall 3: Termin VOR der Pause
- **Startzeit:** 09:00
- **Dauer:** 120 min
- **Pause:** 12:00-12:30
- **Erwartet:** Keine Aufteilung (09:00-11:00, 120min)

### Testfall 4: Termin NACH der Pause
- **Startzeit:** 13:00
- **Dauer:** 120 min
- **Pause:** 12:00-12:30
- **Erwartet:** Keine Aufteilung (13:00-15:00, 120min)

## Auswirkungen

### Vorteile:
1. ✅ Korrekte visuelle Darstellung in der Timeline
2. ✅ Richtige Endzeit-Berechnung für Termine über Pausen
3. ✅ Bessere Kapazitätsplanung (Termine blockieren korrekt die Zeitslots)
4. ✅ Keine "überzeichneten" Pausen mehr bei langen Terminen

### Kapazitätsberechnung:
Die Backend-Kapazitätsberechnung war bereits korrekt, da sie auf `arbeitszeiten_details` basiert und die tatsächliche Arbeitszeit erfasst. Die Änderung betrifft nur die Frontend-Visualisierung in der "🏗️ Planung & Zuweisung (Beta)" Ansicht.

## Commit-Nachricht

```
Fix: Pausenzeit-Berücksichtigung in Timeline-Darstellung

Problem:
- Wenn Termine über Mittagspausen gelegt wurden, fehlten Minuten in der Darstellung
- Beispiel: 120min-Termin von 11:00-13:00 mit Pause 12:00-12:30 
  zeigte nur 90min statt 120min Arbeitszeit

Lösung:
- createTimelineTerminWithPause() berechnet Teil2-Dauer nun korrekt
- teil2Dauer = verbleibende Arbeitszeit (nicht bis Terminende minus Pause)
- Pausenzeit verlängert die Gesamtdauer des Termins automatisch

Datei: frontend/src/components/app.js (Zeile 20145)
```

## Manuelle Tests

Nach Deployment durchführen:

1. **In 🏗️ Planung & Zuweisung:**
   - Termin mit 120 min Dauer auf 11:00 Uhr legen (Mitarbeiter mit Pause 12:00-12:30)
   - Prüfen: Timeline zeigt zwei Blöcke (11:00-12:00 und 12:30-13:30)
   - Kapazitätsanzeige sollte 120 min (+ Nebenzeit) zeigen

2. **Langer Termin ab Arbeitsbeginn:**
   - Termin mit 300 min Dauer auf 08:00 Uhr legen
   - Prüfen: Teil1 endet um 12:00, Teil2 beginnt um 12:30

3. **Termine außerhalb der Pause:**
   - Termin 09:00-11:00: Sollte NICHT aufgeteilt werden
   - Termin 13:00-15:00: Sollte NICHT aufgeteilt werden
